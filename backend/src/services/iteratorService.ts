import { extractFilesFromCodegenResponse } from '../lib/extractCodegenJson';
import { getChatClient, getCodeClient, ChatMessage } from './aiClient';
import { logTokens } from './tokenAccountingService';
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
import { restoreProjectSnapshot } from './projectSnapshotService';
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

function isSafeFrontendExtraFile(p: string): boolean {
  return (
    /^src\/(components|lib|pages|hooks|utils|features|data|assets)\/.+\.(ts|tsx|js|jsx|css|scss|json|svg)$/.test(p) ||
    /^src\/(styles|locales|i18n|translations|lang)\/.+\.(ts|tsx|js|jsx|css|scss|json|svg)$/.test(p)
  );
}

function normalizePlanLanguages(languages: unknown): string[] {
  const values = Array.isArray(languages) ? languages : [];
  const normalized = Array.from(new Set(
    values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  ));
  return normalized.includes('bg') ? normalized : ['bg', ...normalized];
}

function isLocalizationFilePath(p: string): boolean {
  return /(^|\/)(i18n|locales|translations|lang)(\/|$)/i.test(p);
}

function fileContentLooksLocalizationEntry(content: string): boolean {
  return /useTranslation\(|i18next|react-i18next|changeLanguage\(|t\(|translations?\s*=|locales?\s*=|resources\s*:/i.test(content);
}

function shouldAugmentWithLocalizationFiles(planData: Record<string, unknown>, changeRequest: string): boolean {
  const languages = normalizePlanLanguages(planData.languages);
  if (languages.length > 1) return true;
  return /\b(language|languages|translation|translations|locale|localization|i18n|text|copy|label|labels)\b/i.test(changeRequest);
}

function isAllowedGuardedExtraFile(p: string, refinedSpec: string, scopedFiles: string[]): boolean {
  const normalizedPath = p.replace(/\\/g, '/');
  const spec = refinedSpec.toLowerCase();
  const pathMentioned = spec.includes(normalizedPath.toLowerCase());

  if (/^backend\/src\/.+\.(ts|js)$/.test(normalizedPath)) {
    return pathMentioned;
  }

  if (normalizedPath === 'package.json' || normalizedPath === 'backend/package.json') {
    return pathMentioned;
  }

  return scopedFiles.includes(normalizedPath);
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
  opts?: {
    spec?: string;
    targetFiles?: string[];
    explorerContextNotes?: string;
    logId?: string;
    planId?: string;
    snapshotBeforeId?: string;
  },
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

  const failIteration = async (message: string, errorLog?: string) => {
    if (opts?.snapshotBeforeId) {
      try {
        const restored = await restoreProjectSnapshot(opts.snapshotBeforeId);
        if (restored.status === 'running') {
          const rollbackBuild = await buildProject(restored.projectId);
          if (rollbackBuild.success) {
            const rollbackRun = await runProject(restored.projectId);
            if (rollbackRun.success) {
              await prisma.project.update({
                where: { id: restored.projectId },
                data: { status: 'running', runPort: rollbackRun.port, errorLog: null },
              });
            }
          }
        }
      } catch (e) {
        console.error('[iterate] snapshot rollback failed:', e);
      }
    }
    if (opts?.planId) {
      await prisma.iterationPlan.update({
        where: { id: opts.planId },
        data: {
          status: 'failed',
          failedAt: new Date(),
          errorLog: (errorLog || message).slice(0, 50_000),
        },
      }).catch(() => {});
    }
    await publishEvent(sessionId, { type: 'fatal', message });
  };

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
      const refineResult = await chatAi.completeWithUsage(
        [{ role: 'user', content: refinementUserMsg }],
        refinementSystem,
        { maxTokens: 350 },
      );
      refinedSpec = refineResult.text;
      await logTokens({
        userId,
        projectId: session.project.id,
        provider: refineResult.provider,
        model: refineResult.model,
        endpoint: 'iterate.refine',
        usage: refineResult.usage,
      });
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
        maxFiles: 12,
        userId,
        projectId: project.id,
      });
      scopedFiles = scoped.targetFiles;
    } catch {
      scopedFiles = allFilePaths.slice(0, 6);
    }
  }

  if (shouldAugmentWithLocalizationFiles(planData, `${changeRequest}\n${refinedSpec}`)) {
    const localizationFiles = allFilePaths.filter((path) => {
      if (isLocalizationFilePath(path)) return true;
      const content = currentFiles[path];
      return typeof content === 'string' && fileContentLooksLocalizationEntry(content);
    });
    scopedFiles = Array.from(new Set([...(scopedFiles ?? []), ...localizationFiles])).slice(0, 12);
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
    const codegenResult = await ai.completeWithUsage(
      [{ role: 'user', content: prompt }],
      ITERATOR_SYSTEM,
      { maxTokens: iterMaxTokens },
    );
    raw = codegenResult.text;
    await logTokens({
      userId,
      projectId: project.id,
      provider: codegenResult.provider,
      model: codegenResult.model,
      endpoint: 'iterate.codegen',
      usage: codegenResult.usage,
    });
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
      const retryResult = await ai.completeWithUsage(retryMessages, ITERATOR_SYSTEM, { maxTokens: iterMaxTokens });
      rawRetry = retryResult.text;
      await logTokens({
        userId,
        projectId: project.id,
        provider: retryResult.provider,
        model: retryResult.model,
        endpoint: 'iterate.codegen',
        usage: retryResult.usage,
      });
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
      const repairResult = await ai.completeWithUsage(
        [{ role: 'user', content: repairUser }],
        CODE_GEN_JSON_REPAIR_SYSTEM,
        { maxTokens: repairMaxTokens },
      );
      await logTokens({
        userId,
        projectId: project.id,
        provider: repairResult.provider,
        model: repairResult.model,
        endpoint: 'iterate.repair',
        usage: repairResult.usage,
      });
      changedFiles = extractFilesFromCodegenResponse(repairResult.text);
    } catch {
      /* ignore */
    }
  }

  if (!changedFiles || Object.keys(changedFiles).length === 0) {
    await failIteration('ИИ върна невалиден отговор (очаква се JSON {"files":{...}})');
    return;
  }

  // Safety: prevent broad/unscoped changes to reduce layout/copy regressions.
  const changedPaths = Object.keys(changedFiles).sort();
  const allowed = new Set(scopedFiles);
  const illegal = changedPaths.filter(
    (p) =>
      !allowed.has(p) &&
      !isSafeFrontendExtraFile(p) &&
      !isAllowedGuardedExtraFile(p, refinedSpec, scopedFiles),
  );
  const MAX_CHANGED = shouldAugmentWithLocalizationFiles(planData, `${changeRequest}\n${refinedSpec}`) ? 16 : 10;
  if (changedPaths.length > MAX_CHANGED || illegal.length > 0) {
    await failIteration(
      'Промяната изглежда твърде широка или засяга неподходящи файлове. Моля, уточнете по-точно какво да се промени и къде, за да го приложим без да развалим дизайна.',
      `Changed paths: ${changedPaths.join(', ')}\nIllegal paths: ${illegal.join(', ')}`,
    );
    return;
  }

  // Extra guardrail: block edits to high-risk global files unless they were explicitly in the scoped set.
  const riskyTouched = changedPaths.filter((p) => isHighRiskGlobalFile(p) && !allowed.has(p));
  if (riskyTouched.length > 0) {
    await failIteration(
      'Промяната засяга глобални файлове (тема/основен вход), което е рисково и често разваля дизайна. Моля, уточнете какво точно трябва да се промени глобално, или ограничете промяната до конкретен екран.',
      `Risky paths: ${riskyTouched.join(', ')}`,
    );
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
      await failIteration('Неуспех при поправка на компилацията. Върнах предишната работеща версия.', fixResult.log);
      return;
    }
    buildResult = fixResult;
  }

  await publishEvent(sessionId, { step: 4, label: GEN_STEP_LABELS[4], status: 'done' });
  await publishEvent(sessionId, { step: 5, label: GEN_STEP_LABELS[5], status: 'running' });
  await publishEvent(sessionId, { type: 'user_progress', message: ITERATE_LAUNCH_PREVIEW });
  const runResult = await runProject(project.id);

  if (!runResult.success) {
    await failIteration('Приложението не стартира след промяната. Върнах предишната работеща версия.', runResult.log);
    return;
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { status: 'running', runPort: runResult.port },
  });

  await publishEvent(sessionId, { step: 5, label: GEN_STEP_LABELS[5], status: 'done' });
  await publishEvent(sessionId, { type: 'user_progress', message: ITERATE_FINISHING });
  await publishEvent(sessionId, { type: 'preview_updated', port: runResult.port, projectId: project.id });
  if (opts?.planId) {
    await prisma.iterationPlan.update({
      where: { id: opts.planId },
      data: { status: 'applied', appliedAt: new Date() },
    }).catch(() => {});
  }

}
