import { getChatClient, getCodeClient, getIterateCodeClient, type ToolSchema } from './aiClient';
import { logTokens } from './tokenAccountingService';
import { ITERATOR_SYSTEM, buildIteratorPrompt } from '../lib/prompts';
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
} from '../lib/generationFriendly';

/** Forced tool — model emits only the files that need to change for the requested improvement. */
const ITERATE_TOOL: ToolSchema<{ files: Record<string, string> }> = {
  name: 'emit_changed_files',
  description:
    'Emit ONLY the files that need to change to apply the requested improvement. Each key is a project-relative path, each value is the full new file contents.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'object',
        description: 'Map from project-relative file path to full new file contents.',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['files'],
  },
};

function normalizeFilesPayload(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = (input as { files?: unknown }).files;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

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
    /** True when this iteration is one of the user's free credits (FREE_ITERATION_LIMIT per project). */
    isFree?: boolean;
  },
): Promise<void> {
  const isFree = opts?.isFree === true;
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
        isFree,
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
    scopedFiles = Array.from(new Set(opts.targetFiles)).filter((p) => allowed.has(p)).slice(0, 12);
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
        isFree,
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
    scopedFiles = Array.from(new Set([...(scopedFiles ?? []), ...localizationFiles])).slice(0, 16);
  }

  // Always include core wiring files as read-only context so the model doesn't break
  // imports/routes/themes it can't see. They become part of the allowed-edit set too,
  // which is fine — touching them is sometimes required (e.g. registering a new route).
  const CORE_CONTEXT_FILES = ['src/App.tsx', 'src/main.tsx', 'src/theme.ts', 'package.json'];
  const allowedSet = new Set(allFilePaths);
  for (const corePath of CORE_CONTEXT_FILES) {
    if (allowedSet.has(corePath) && !scopedFiles.includes(corePath)) {
      scopedFiles.push(corePath);
    }
  }
  scopedFiles = scopedFiles.slice(0, 18);

  const subsetFiles: Record<string, string> = {};
  for (const p of scopedFiles) {
    if (typeof currentFiles[p] === 'string') subsetFiles[p] = currentFiles[p]!;
  }

  // Phase 2: Claude executes the refined spec.
  // Primary: Sonnet (fast, cheap, plenty good for targeted edits).
  // Retry on failure: Opus (higher quality, slower) — last-ditch attempt before rolling back.
  const fastAi = getIterateCodeClient();
  const slowAi = getCodeClient();
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

  let changedFiles: Record<string, string> | null = null;
  let lastIterError: string | undefined;
  try {
    try {
      const codegenResult = await fastAi.completeStructured(
        [{ role: 'user', content: prompt }],
        ITERATOR_SYSTEM,
        ITERATE_TOOL,
        { maxTokens: iterMaxTokens },
      );
      changedFiles = normalizeFilesPayload(codegenResult.input);
      await logTokens({
        userId,
        projectId: project.id,
        provider: codegenResult.provider,
        model: codegenResult.model,
        endpoint: 'iterate.codegen',
        usage: codegenResult.usage,
        isFree,
      });
    } catch (e) {
      lastIterError = e instanceof Error ? e.message : String(e);
    }

    // Retry once on failure with the higher-quality Opus model.
    if (!changedFiles) {
      try {
        const retryResult = await slowAi.completeStructured(
          [{ role: 'user', content: prompt }],
          ITERATOR_SYSTEM,
          ITERATE_TOOL,
          { maxTokens: iterMaxTokens },
        );
        changedFiles = normalizeFilesPayload(retryResult.input);
        await logTokens({
          userId,
          projectId: project.id,
          provider: retryResult.provider,
          model: retryResult.model,
          endpoint: 'iterate.codegen',
          usage: retryResult.usage,
          isFree,
        });
      } catch (e) {
        lastIterError = e instanceof Error ? e.message : String(e);
      }
    }
  } finally {
    clearInterval(hintTimer);
  }

  if (!changedFiles) {
    await failIteration(
      'ИИ върна невалиден отговор. Моля, опитайте пак.',
      lastIterError,
    );
    return;
  }

  // Safety: prevent broad/unscoped changes to reduce layout/copy regressions.
  // We FILTER illegal paths instead of rejecting the whole change — the model often emits
  // one or two stray files alongside legitimate edits, and rejecting the whole batch wastes
  // a full turn. Risky-global edits that weren't in scope are still filtered.
  const allChangedPaths = Object.keys(changedFiles).sort();
  const allowed = new Set(scopedFiles);
  const illegalPaths: string[] = [];
  const droppedRiskyPaths: string[] = [];
  const acceptedFiles: Record<string, string> = {};
  for (const p of allChangedPaths) {
    const inScope = allowed.has(p);
    if (!inScope && isHighRiskGlobalFile(p)) {
      droppedRiskyPaths.push(p);
      continue;
    }
    const allowedExtra =
      inScope ||
      isSafeFrontendExtraFile(p) ||
      isAllowedGuardedExtraFile(p, refinedSpec, scopedFiles);
    if (!allowedExtra) {
      illegalPaths.push(p);
      continue;
    }
    acceptedFiles[p] = changedFiles[p]!;
  }

  const acceptedPaths = Object.keys(acceptedFiles).sort();
  const MAX_CHANGED = shouldAugmentWithLocalizationFiles(planData, `${changeRequest}\n${refinedSpec}`) ? 22 : 15;
  if (acceptedPaths.length === 0) {
    await failIteration(
      'Промяната засяга само неподходящи файлове и беше блокирана. Моля, уточнете заявката.',
      `Illegal paths: ${illegalPaths.join(', ')}\nDropped risky: ${droppedRiskyPaths.join(', ')}`,
    );
    return;
  }
  if (acceptedPaths.length > MAX_CHANGED) {
    await failIteration(
      'Промяната изглежда твърде широка. Моля, уточнете заявката, за да я приложим без да развалим дизайна.',
      `Accepted paths: ${acceptedPaths.join(', ')}`,
    );
    return;
  }

  if (illegalPaths.length > 0 || droppedRiskyPaths.length > 0) {
    console.warn(
      `[iterate] dropped ${illegalPaths.length + droppedRiskyPaths.length} unsafe paths: ` +
        `illegal=${illegalPaths.join(',')} risky=${droppedRiskyPaths.join(',')}`,
    );
    await publishEvent(sessionId, {
      type: 'user_progress',
      message: `Пропуснах ${illegalPaths.length + droppedRiskyPaths.length} файл(а), които не са свързани с промяната.`,
    });
  }

  changedFiles = acceptedFiles;
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
