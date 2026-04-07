import { extractFilesFromCodegenResponse } from '../lib/extractCodegenJson';
import { getChatClient, getCodeClient, ChatMessage } from './aiClient';
import {
  ITERATOR_SYSTEM,
  buildIteratorPrompt,
  CODE_GEN_JSON_REPAIR_SYSTEM,
  CODE_GEN_JSON_REPAIR_USER,
} from '../lib/prompts';
import { BG_CODEGEN_RETRY } from '../lib/localePrompt';
import { writeProjectFiles } from '../lib/fileWriter';
import { writeAdminTokenFile } from '../lib/adminToken';
import { installDeps, buildProject, runProject, stopProject } from './appRunner';
import { autoFix } from './fixerService';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { publishEvent, clearSessionEvents } from './eventBus';
import {
  GEN_FIXING_FRIENDLY,
  GEN_STEP_LABELS,
  ITERATE_AI_HINTS,
  ITERATE_FINISHING,
  ITERATE_LAUNCH_PREVIEW,
  ITERATE_READING_REQUEST,
  ITERATE_SAVING_BUILD,
  ITERATE_VERIFY_BUILD,
  GEN_JSON_REPAIR_INITIAL,
} from '../lib/generationFriendly';

function isSafeExtraFile(p: string): boolean {
  return (
    /^src\/(components|lib|pages)\/.+\.(ts|tsx)$/.test(p) ||
    /^src\/styles\/.+\.(ts|tsx)$/.test(p) ||
    /^src\/theme\.ts$/.test(p)
  );
}

function isHighRiskGlobalFile(p: string): boolean {
  return (
    p === 'src/theme.ts' ||
    p === 'src/App.tsx' ||
    p === 'src/main.tsx' ||
    p === 'vite.config.ts' ||
    p === 'index.html'
  );
}

export async function runIteration(
  sessionId: string,
  userId: string,
  changeRequest: string,
  opts?: { spec?: string; targetFiles?: string[]; explorerContextNotes?: string; logId?: string },
): Promise<void> {
  await clearSessionEvents(sessionId);

  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId },
    include: { plan: true, project: true },
  });

  if (!session?.project) throw new AppError(400, 'No project found for this session');
  if (!session.plan) throw new AppError(400, 'No plan found for this session');

  const project = session.project;
  const planData = session.plan.data as Record<string, unknown>;
  const currentFiles = project.files as Record<string, string>;
  const allFilePaths = Object.keys(currentFiles);

  await stopProject(project.id);

  await publishEvent(sessionId, { type: 'user_progress', message: ITERATE_READING_REQUEST });

  // If the UI already clarified requirements, it can send a spec to execute directly.
  // Otherwise, we do a quick internal refinement.
  let refinedSpec = (opts?.spec ?? '').trim();
  if (!refinedSpec) {
    refinedSpec = changeRequest;
    try {
      const chatAi = getChatClient();
      const refinementSystem = `You are a senior full-stack engineer writing a precise implementation brief for another engineer (Claude) who will edit the code.

Given the app plan, the list of existing files, and the user's change request, write a detailed technical specification covering:
1. Which files to edit and exactly what to change in each (component names, function names, prop names, SQL columns, API routes — be specific)
2. Any new files to create and their purpose
3. Data flow: if the change touches both frontend and backend, describe both ends
4. Edge cases or constraints to preserve (loading states, error handling, existing styles)
5. What NOT to change (to avoid regressions)

Rules:
- Be specific and concrete — no vague phrases like "update the component"
- Reference exact file names from the provided list
- Keep it under 200 words total
- English only
- No preamble, no sign-off — just the spec`;
      const refinementUserMsg = `App plan: ${JSON.stringify(planData)}\n\nFiles: ${Object.keys(currentFiles).join(', ')}\n\nUser request: ${changeRequest}`;
      refinedSpec = await chatAi.complete(
        [{ role: 'user', content: refinementUserMsg }],
        refinementSystem,
        { maxTokens: 350 },
      );
    } catch {
      refinedSpec = changeRequest;
    }
  }

  // Human-facing text from the client (summary + plan bullets), not the English technical spec
  if (opts?.logId) {
    const desc = changeRequest.trim().slice(0, 4000);
    if (desc) {
      prisma.iterationLog
        .update({
          where: { id: opts.logId },
          data: { description: desc },
        })
        .catch(() => {});
    }
  }

  // Determine which existing files to provide as context (scoped subset).
  let scopedFiles: string[] | null = null;
  if (opts?.targetFiles && Array.isArray(opts.targetFiles) && opts.targetFiles.length > 0) {
    const allowed = new Set(allFilePaths);
    scopedFiles = Array.from(new Set(opts.targetFiles)).filter((p) => allowed.has(p)).slice(0, 8);
  }

  if (!scopedFiles || scopedFiles.length === 0) {
    try {
      const { scopeIteration } = await import('./iterateScopeService');
      const scoped = await scopeIteration({
        plan: planData,
        filePaths: allFilePaths,
        refinedSpec,
        maxFiles: 8,
      });
      scopedFiles = scoped.targetFiles;
    } catch {
      scopedFiles = allFilePaths.slice(0, 6);
    }
  }

  const subsetFiles: Record<string, string> = {};
  for (const p of scopedFiles) {
    if (typeof currentFiles[p] === 'string') subsetFiles[p] = currentFiles[p]!;
  }

  // Phase 2: Claude executes the refined spec
  const ai = getCodeClient();
  const extra = (opts?.explorerContextNotes ?? '').trim();
  const prompt = buildIteratorPrompt(planData, subsetFiles, refinedSpec, extra ? { explorerContextNotes: extra } : undefined);
  const iterMaxTokens = parseInt(process.env.CLAUDE_MAX_OUTPUT_TOKENS ?? '8192', 10);
  let idx = 0;
  const hintTimer = setInterval(() => {
    publishEvent(sessionId, {
      type: 'user_progress',
      message: ITERATE_AI_HINTS[idx % ITERATE_AI_HINTS.length]!,
    }).catch(() => {});
    idx++;
  }, 12000);

  let raw: string;
  let rawRetry = '';
  try {
    raw = await ai.complete([{ role: 'user', content: prompt }], ITERATOR_SYSTEM, { maxTokens: iterMaxTokens });
  } finally {
    clearInterval(hintTimer);
  }

  let changedFiles = extractFilesFromCodegenResponse(raw);

  // One retry: tell Claude its output was rejected and ask for pure JSON
  if (!changedFiles) {
    try {
      const retryMessages: ChatMessage[] = [
        { role: 'user', content: prompt },
        { role: 'assistant', content: raw },
        { role: 'user', content: BG_CODEGEN_RETRY },
      ];
      rawRetry = await ai.complete(retryMessages, ITERATOR_SYSTEM, { maxTokens: iterMaxTokens });
      changedFiles = extractFilesFromCodegenResponse(rawRetry);
      if (!changedFiles) raw = rawRetry;
    } catch {
      /* ignore retry failure */
    }
  }

  // Third pass: strict JSON repair (same pipeline as initial codegen) — fixes fences, prose, minor escaping issues
  if (!changedFiles || Object.keys(changedFiles).length === 0) {
    const repairCap = parseInt(process.env.CODE_GEN_REPAIR_INPUT_CHARS ?? '120000', 10);
    const repairBody = `# First model output\n${raw.slice(0, repairCap)}\n\n---\n\n# Second model output\n${rawRetry.slice(0, repairCap)}`;
    const repairUser = `${CODE_GEN_JSON_REPAIR_USER}\n\n${repairBody}`;
    const repairMaxTokens = Math.max(
      iterMaxTokens,
      parseInt(process.env.CODE_GEN_MAX_TOKENS ?? '16384', 10),
    );
    try {
      await publishEvent(sessionId, { type: 'user_progress', message: GEN_JSON_REPAIR_INITIAL });
      const rawRepair = await ai.complete(
        [{ role: 'user', content: repairUser }],
        CODE_GEN_JSON_REPAIR_SYSTEM,
        { maxTokens: repairMaxTokens },
      );
      changedFiles = extractFilesFromCodegenResponse(rawRepair);
    } catch {
      /* ignore */
    }
  }

  if (!changedFiles || Object.keys(changedFiles).length === 0) {
    await publishEvent(sessionId, {
      type: 'fatal',
      message: 'ИИ върна невалиден отговор (очаква се JSON {"files":{...}})',
    });
    return;
  }

  // Safety: prevent broad/unscoped changes to reduce layout/copy regressions.
  const changedPaths = Object.keys(changedFiles).sort();
  const allowed = new Set(scopedFiles);
  const illegal = changedPaths.filter((p) => !allowed.has(p) && !isSafeExtraFile(p));
  const MAX_CHANGED = 10;
  if (changedPaths.length > MAX_CHANGED || illegal.length > 0) {
    await publishEvent(sessionId, {
      type: 'fatal',
      message:
        'Промяната изглежда твърде широка или засяга неподходящи файлове. ' +
        'Моля, уточнете по-точно какво да се промени и къде, за да го приложим без да развалим дизайна.',
    });
    return;
  }

  // Extra guardrail: block edits to high-risk global files unless they were explicitly in the scoped set.
  const riskyTouched = changedPaths.filter((p) => isHighRiskGlobalFile(p) && !allowed.has(p));
  if (riskyTouched.length > 0) {
    await publishEvent(sessionId, {
      type: 'fatal',
      message:
        'Промяната засяга глобални файлове (тема/основен вход), което е рисково и често разваля дизайна. ' +
        'Моля, уточнете какво точно трябва да се промени глобално, или ограничете промяната до конкретен екран.',
    });
    return;
  }

  const mergedFiles = { ...currentFiles, ...changedFiles };
  await writeProjectFiles(project.id, changedFiles);
  try {
    await writeAdminTokenFile(project.id);
  } catch (e) {
    console.error('[iterate] writeAdminTokenFile failed:', e);
  }
  await prisma.project.update({
    where: { id: project.id },
    data: { files: mergedFiles, status: 'building' },
  });

  await publishEvent(sessionId, { type: 'user_progress', message: ITERATE_SAVING_BUILD });
  await publishEvent(sessionId, { step: 4, label: GEN_STEP_LABELS[4], status: 'running' });
  await publishEvent(sessionId, { type: 'user_progress', message: ITERATE_VERIFY_BUILD });

  // Re-write VITE_ public env vars before rebuild so they're baked into the new bundle
  const buildEnv = (project as any).buildEnv as unknown;
  if (buildEnv && typeof buildEnv === 'object' && !Array.isArray(buildEnv)) {
    const envLines = Object.entries(buildEnv as Record<string, string>)
      .filter(([k]) => k.startsWith('VITE_'))
      .map(([k, v]) => `${k}=${v}`);
    if (envLines.length > 0) {
      await writeProjectFiles(project.id, { '.env.production': envLines.join('\n') });
    }
  }

  let buildResult = await buildProject(project.id);

  if (!buildResult.success) {
    const fixResult = await autoFix({
      projectId: project.id,
      files: mergedFiles,
      failedStep: 'build',
      errorLog: buildResult.log,
      onAttempt: async (attempt, error) => {
        await publishEvent(sessionId, { type: 'user_progress', message: GEN_FIXING_FRIENDLY(attempt) });
        await publishEvent(sessionId, { type: 'fix_attempt', attempt, error });
      },
    });

    if (!fixResult.success) {
      await publishEvent(sessionId, { type: 'fatal', message: 'Неуспех при поправка на компилацията' });
      return;
    }
    buildResult = fixResult;
  }

  await publishEvent(sessionId, { step: 4, label: GEN_STEP_LABELS[4], status: 'done' });
  await publishEvent(sessionId, { step: 5, label: GEN_STEP_LABELS[5], status: 'running' });
  await publishEvent(sessionId, { type: 'user_progress', message: ITERATE_LAUNCH_PREVIEW });
  const runResult = await runProject(project.id);

  if (!runResult.success) {
    await publishEvent(sessionId, { type: 'fatal', message: 'Приложението не стартира след промяната' });
    return;
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { status: 'running', runPort: runResult.port },
  });

  await publishEvent(sessionId, { step: 5, label: GEN_STEP_LABELS[5], status: 'done' });
  await publishEvent(sessionId, { type: 'user_progress', message: ITERATE_FINISHING });
  await publishEvent(sessionId, { type: 'preview_updated', port: runResult.port, projectId: project.id });

  await prisma.message.create({ data: { sessionId, role: 'user', content: changeRequest } });
  await prisma.message.create({
    data: { sessionId, role: 'assistant', content: 'Промените са приложени успешно.' },
  });
}
