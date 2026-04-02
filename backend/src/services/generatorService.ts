import { getCodeClient } from './aiClient';
import {
  CODE_GEN_JSON_REPAIR_SYSTEM,
  CODE_GEN_JSON_REPAIR_USER,
  CODE_GEN_RETRY_USER,
  CODE_GEN_SYSTEM,
  buildCodeGenPrompt,
} from '../lib/prompts';
import { extractFilesFromCodegenResponse } from '../lib/extractCodegenJson';
import { writeProjectFiles } from '../lib/fileWriter';
import { installDeps, buildProject, runProject } from './appRunner';
import { autoFix } from './fixerService';
import type { Project } from '@prisma/client';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { withTimeout } from '../lib/withTimeout';
import { publishEvent, clearSessionEvents } from './eventBus';
import {
  GEN_FINISHING_ALMOST,
  GEN_FIXING_FRIENDLY,
  GEN_INITIAL_CODEGEN,
  GEN_INITIAL_RETRY,
  GEN_JSON_REPAIR_INITIAL,
  GEN_JSON_REPAIR_ROTATING,
  GEN_RESUME_CONTINUING,
  GEN_INVALID_JSON_DETAIL,
  GEN_INVALID_JSON_USER_MSG,
  GEN_SSE_CODEGEN_FAIL,
  GEN_SSE_CODEGEN_RETRY_FAIL,
  GEN_SSE_FIX_BUILD_FAIL,
  GEN_SSE_FIX_RUN_FAIL,
  GEN_SSE_INSTALL_FAIL,
  GEN_STEP_LABELS,
  GEN_WORKING_ON_AI_FIRST,
  GEN_WORKING_ON_AI_RETRY,
  GEN_WORKING_ON_STEP,
  GEN_WRAP_UP_STEP,
  genUserMsgBuildFailAfterFix,
  genUserMsgBuildStopped,
  genUserMsgBuildStoppedRetry,
  genUserMsgGenerationFailed,
  genUserMsgInstallFail,
  genUserMsgRunFailAfterFix,
} from '../lib/generationFriendly';

/** Full-stack JSON blobs need a large budget; 8k often truncates mid-object and breaks JSON.parse. */
const CODE_GEN_MAX_TOKENS = parseInt(process.env.CODE_GEN_MAX_TOKENS ?? '32768', 10);
const CODE_GEN_AI_TIMEOUT_MS = parseInt(process.env.CODE_GEN_AI_TIMEOUT_MS ?? '600000', 10);
const CODE_GEN_REPAIR_INPUT_CHARS = parseInt(process.env.CODE_GEN_REPAIR_INPUT_CHARS ?? '120000', 10);
const MAX_MSG = 12_000;

/** One in-flight generation or resume per session (prevents duplicate pipelines). */
const generationPromises = new Map<string, Promise<void>>();

export function isGenerationActive(sessionId: string): boolean {
  return generationPromises.has(sessionId);
}

/** Install, build, run — shared by full generation (after codegen) and resume-from-disk. */
async function runInstallBuildRunTail(
  sessionId: string,
  projectRow: Pick<Project, 'id' | 'buildEnv'>,
  files: Record<string, string>,
  paid: boolean,
): Promise<void> {
  let project = projectRow;

  await writeProjectFiles(project.id, files);

  await publishEvent(sessionId, { step: 3, label: GEN_STEP_LABELS[3], status: 'running' });
  await publishEvent(sessionId, { type: 'user_progress', message: GEN_WORKING_ON_STEP[3]! });

  const installResult = await installDeps(project.id);
  if (!installResult.success) {
    await publishEvent(sessionId, { step: 3, label: GEN_STEP_LABELS[3], status: 'error', detail: installResult.log });
    await failGeneration(sessionId, genUserMsgInstallFail(installResult.log), {
      projectId: project.id,
      errorLog: installResult.log,
      sseMessage: GEN_SSE_INSTALL_FAIL,
    });
    return;
  }

  await publishEvent(sessionId, { step: 3, label: GEN_STEP_LABELS[3], status: 'done' });

  await publishEvent(sessionId, { step: 4, label: GEN_STEP_LABELS[4], status: 'running' });
  await publishEvent(sessionId, { type: 'user_progress', message: GEN_WORKING_ON_STEP[4]! });
  await prisma.project.update({ where: { id: project.id }, data: { status: 'building' } });

  if (project.buildEnv && typeof project.buildEnv === 'object' && !Array.isArray(project.buildEnv)) {
    const envLines = Object.entries(project.buildEnv as Record<string, string>)
      .filter(([k]) => k.startsWith('VITE_'))
      .map(([k, v]) => `${k}=${v}`);
    if (envLines.length > 0) {
      await writeProjectFiles(project.id, { '.env.production': envLines.join('\n') });
    }
  }

  let buildResult = await buildProject(project.id);

  if (!buildResult.success) {
    await publishEvent(sessionId, { step: 4, label: GEN_STEP_LABELS[4], status: 'error', detail: buildResult.log });

    const fixResult = await autoFix({
      projectId: project.id,
      files,
      failedStep: 'build',
      errorLog: buildResult.log,
      onAttempt: async (attempt, error) => {
        await publishEvent(sessionId, { type: 'user_progress', message: GEN_FIXING_FRIENDLY(attempt) });
        await publishEvent(sessionId, { type: 'fix_attempt', attempt, error });
      },
    });

    if (!fixResult.success) {
      await failGeneration(sessionId, genUserMsgBuildFailAfterFix(fixResult.log), {
        projectId: project.id,
        errorLog: fixResult.log,
        sseMessage: GEN_SSE_FIX_BUILD_FAIL,
      });
      return;
    }

    buildResult = fixResult;
  }

  await publishEvent(sessionId, { step: 4, label: GEN_STEP_LABELS[4], status: 'done' });

  await publishEvent(sessionId, { step: 5, label: GEN_STEP_LABELS[5], status: 'running' });
  await publishEvent(sessionId, { type: 'user_progress', message: GEN_WORKING_ON_STEP[5]! });

  let runResult = await runProject(project.id);

  if (!runResult.success) {
    const fixResult = await autoFix({
      projectId: project.id,
      files,
      failedStep: 'run',
      errorLog: runResult.log,
      onAttempt: async (attempt, error) => {
        await publishEvent(sessionId, { type: 'user_progress', message: GEN_FIXING_FRIENDLY(attempt) });
        await publishEvent(sessionId, { type: 'fix_attempt', attempt, error });
      },
    });

    if (!fixResult.success) {
      await failGeneration(sessionId, genUserMsgRunFailAfterFix(fixResult.log), {
        projectId: project.id,
        errorLog: fixResult.log,
        sseMessage: GEN_SSE_FIX_RUN_FAIL,
      });
      return;
    }

    runResult = fixResult;
  }

  project = await prisma.project.update({
    where: { id: project.id },
    data: { status: 'running', runPort: runResult.port, buildLog: buildResult.log, paid },
  });
  await prisma.session.update({ where: { id: sessionId }, data: { status: 'running' } });

  await publishEvent(sessionId, { step: 5, label: GEN_STEP_LABELS[5], status: 'done' });
  await publishEvent(sessionId, { type: 'user_progress', message: GEN_FINISHING_ALMOST });
  await publishEvent(sessionId, { type: 'done', projectId: project.id, port: runResult.port });
}

async function runResumePipelineBody(sessionId: string): Promise<void> {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: { project: true },
  });

  if (session.status !== 'generating') {
    throw new AppError(400, 'Session is not generating', 'cannot_resume');
  }

  const proj = session.project;
  if (!proj) {
    // Still in AI codegen (step 1) — SSE replay + live subscription is enough.
    return;
  }

  const rawFiles = proj.files;
  if (rawFiles == null || typeof rawFiles !== 'object' || Array.isArray(rawFiles)) {
    return;
  }

  const entries = Object.entries(rawFiles as Record<string, unknown>).filter(
    ([, v]) => typeof v === 'string',
  ) as [string, string][];
  if (entries.length === 0) {
    return;
  }

  const files = Object.fromEntries(entries);

  await publishEvent(sessionId, { type: 'user_progress', message: GEN_RESUME_CONTINUING });

  await runInstallBuildRunTail(sessionId, proj, files, proj.paid);
}

async function runWithRotatingUserProgress<T>(
  sessionId: string,
  promise: Promise<T>,
  initialMessage: string,
  rotatingMessages: readonly string[],
  intervalMs = 10000,
): Promise<T> {
  await publishEvent(sessionId, { type: 'user_progress', message: initialMessage });
  let idx = 0;
  const timer = setInterval(() => {
    publishEvent(sessionId, {
      type: 'user_progress',
      message: rotatingMessages[idx % rotatingMessages.length]!,
    }).catch(() => {});
    idx++;
  }, intervalMs);
  try {
    return await promise;
  } finally {
    clearInterval(timer);
  }
}

async function failGeneration(
  sessionId: string,
  userMessage: string,
  opts?: { projectId?: string; errorLog?: string; sseMessage?: string },
): Promise<void> {
  const text = userMessage.length > MAX_MSG ? `${userMessage.slice(0, MAX_MSG)}\n\n…` : userMessage;
  await prisma.message.create({ data: { sessionId, role: 'assistant', content: text } });
  await prisma.session.update({ where: { id: sessionId }, data: { status: 'error' } });
  if (opts?.projectId) {
    await prisma.project.update({
      where: { id: opts.projectId },
      data: {
        status: 'error',
        ...(opts.errorLog ? { errorLog: opts.errorLog.slice(0, 50_000) } : {}),
      },
    });
  }
  await publishEvent(sessionId, {
    type: 'fatal',
    message: opts?.sseMessage ?? text.split('\n')[0]!.slice(0, 500),
  });
}

async function handlePipelineFailure(sessionId: string, err: unknown): Promise<void> {
  if (err instanceof AppError) throw err;
  const msg = err instanceof Error ? err.message : String(err);
  try {
    await failGeneration(sessionId, genUserMsgGenerationFailed(msg), {
      sseMessage: msg.slice(0, 280),
    });
  } catch {
    try {
      await publishEvent(sessionId, { type: 'fatal', message: msg.slice(0, 500) });
    } catch {
      /* ignore */
    }
  }
}

export function runGenerationPipeline(
  sessionId: string,
  _userId: string,
  paid = false,
): Promise<void> {
  if (generationPromises.has(sessionId)) {
    return Promise.reject(
      new AppError(409, 'Generation already in progress', 'generation_in_progress'),
    );
  }
  const promise = (async () => {
    try {
      await clearSessionEvents(sessionId);
      await runGenerationPipelineBody(sessionId, paid);
    } catch (err: unknown) {
      await handlePipelineFailure(sessionId, err);
    }
  })().finally(() => {
    generationPromises.delete(sessionId);
  });
  generationPromises.set(sessionId, promise);
  return promise;
}

/** Continue install → build → run from DB + disk without clearing events or re-running codegen. */
export function runGenerationResume(sessionId: string, _userId: string): Promise<void> {
  if (generationPromises.has(sessionId)) {
    return Promise.resolve();
  }
  const promise = (async () => {
    try {
      await runResumePipelineBody(sessionId);
    } catch (err: unknown) {
      await handlePipelineFailure(sessionId, err);
    }
  })().finally(() => {
    generationPromises.delete(sessionId);
  });
  generationPromises.set(sessionId, promise);
  return promise;
}

async function runGenerationPipelineBody(sessionId: string, paid: boolean): Promise<void> {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { sessionId } });
  if (!plan.locked) throw new AppError(400, 'Plan is not locked yet');

  await prisma.session.update({ where: { id: sessionId }, data: { status: 'generating' } });

  const planData = plan.data as Record<string, unknown>;

  // --- STEP 1: Generate code ---
  await publishEvent(sessionId, { step: 1, label: GEN_STEP_LABELS[1], status: 'running' });

  const ai = getCodeClient();
  const userContent = buildCodeGenPrompt(planData);

  let raw: string;
  try {
    raw = await runWithRotatingUserProgress(
      sessionId,
      withTimeout(
        ai.complete([{ role: 'user', content: userContent }], CODE_GEN_SYSTEM, {
          maxTokens: CODE_GEN_MAX_TOKENS,
        }),
        CODE_GEN_AI_TIMEOUT_MS,
        'AI code generation (attempt 1)',
      ),
      GEN_INITIAL_CODEGEN,
      GEN_WORKING_ON_AI_FIRST,
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await publishEvent(sessionId, { step: 1, label: GEN_STEP_LABELS[1], status: 'error', detail });
    await failGeneration(sessionId, genUserMsgBuildStopped(detail), {
      sseMessage: GEN_SSE_CODEGEN_FAIL,
    });
    return;
  }

  let files = extractFilesFromCodegenResponse(raw);
  let rawRetry = '';

  if (!files) {
    try {
      rawRetry = await runWithRotatingUserProgress(
        sessionId,
        withTimeout(
          ai.complete(
            [{ role: 'user', content: `${userContent}\n\n---\n${CODE_GEN_RETRY_USER}` }],
            CODE_GEN_SYSTEM,
            { maxTokens: CODE_GEN_MAX_TOKENS },
          ),
          CODE_GEN_AI_TIMEOUT_MS,
          'AI code generation (retry)',
        ),
        GEN_INITIAL_RETRY,
        GEN_WORKING_ON_AI_RETRY,
      );
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      await publishEvent(sessionId, { step: 1, label: GEN_STEP_LABELS[1], status: 'error', detail });
      await failGeneration(sessionId, genUserMsgBuildStoppedRetry(detail), {
        sseMessage: GEN_SSE_CODEGEN_RETRY_FAIL,
      });
      return;
    }
    files = extractFilesFromCodegenResponse(rawRetry);
  }

  if (!files) {
    const cap = CODE_GEN_REPAIR_INPUT_CHARS;
    const repairBody = `# First model output\n${raw.slice(0, cap)}\n\n---\n\n# Second model output\n${rawRetry.slice(0, cap)}`;
    const repairUser = `${CODE_GEN_JSON_REPAIR_USER}\n\n${repairBody}`;
    try {
      const rawRepair = await runWithRotatingUserProgress(
        sessionId,
        withTimeout(
          ai.complete([{ role: 'user', content: repairUser }], CODE_GEN_JSON_REPAIR_SYSTEM, {
            maxTokens: CODE_GEN_MAX_TOKENS,
          }),
          CODE_GEN_AI_TIMEOUT_MS,
          'AI code generation (json repair)',
        ),
        GEN_JSON_REPAIR_INITIAL,
        GEN_JSON_REPAIR_ROTATING,
      );
      files = extractFilesFromCodegenResponse(rawRepair);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      await publishEvent(sessionId, { step: 1, label: GEN_STEP_LABELS[1], status: 'error', detail });
      await failGeneration(sessionId, genUserMsgBuildStoppedRetry(detail), {
        sseMessage: GEN_SSE_CODEGEN_RETRY_FAIL,
      });
      return;
    }
  }

  if (!files) {
    await publishEvent(sessionId, {
      step: 1,
      label: GEN_STEP_LABELS[1],
      status: 'error',
      detail: GEN_INVALID_JSON_DETAIL,
    });
    await failGeneration(sessionId, GEN_INVALID_JSON_USER_MSG, {
      sseMessage: GEN_SSE_CODEGEN_FAIL,
    });
    return;
  }

  await publishEvent(sessionId, { step: 1, label: GEN_STEP_LABELS[1], status: 'done' });
  await publishEvent(sessionId, { type: 'user_progress', message: GEN_WRAP_UP_STEP });

  // --- STEP 2: Save files ---
  await publishEvent(sessionId, { step: 2, label: GEN_STEP_LABELS[2], status: 'running' });
  await publishEvent(sessionId, { type: 'user_progress', message: GEN_WORKING_ON_STEP[2]! });

  let project = await prisma.project.upsert({
    where: { sessionId },
    create: { sessionId, files, status: 'generating' },
    update: { files, status: 'generating', buildLog: null, errorLog: null, fixAttempts: 0, runPort: null },
  });
  await writeProjectFiles(project.id, files);

  await publishEvent(sessionId, { step: 2, label: GEN_STEP_LABELS[2], status: 'done' });

  await runInstallBuildRunTail(sessionId, project, files, paid);
}
