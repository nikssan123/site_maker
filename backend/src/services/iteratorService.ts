import { extractFilesFromCodegenResponse } from '../lib/extractCodegenJson';
import { getChatClient, getCodeClient } from './aiClient';
import { ITERATOR_SYSTEM, buildIteratorPrompt } from '../lib/prompts';
import { writeProjectFiles } from '../lib/fileWriter';
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
} from '../lib/generationFriendly';

export async function runIteration(
  sessionId: string,
  userId: string,
  changeRequest: string,
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

  await stopProject(project.id);

  await publishEvent(sessionId, { type: 'user_progress', message: ITERATE_READING_REQUEST });

  // Phase 1: OpenAI refines the change request into a precise technical spec
  let refinedSpec = changeRequest;
  try {
    const chatAi = getChatClient();
    const refinementSystem = `You are a technical requirements analyst for a React web app.
Given the user's informal change request and the current app context,
output a single precise technical specification (2-3 sentences max) describing
exactly what code changes to make. No explanations, just the spec.`;
    const refinementUserMsg = JSON.stringify({
      plan: planData,
      files: Object.keys(currentFiles),
      changeRequest,
    });
    refinedSpec = await chatAi.complete(
      [{ role: 'user', content: refinementUserMsg }],
      refinementSystem,
      { maxTokens: 256 },
    );
    if (refinedSpec) {
      await publishEvent(sessionId, { type: 'user_progress', message: `Ще приложа: ${refinedSpec}` });
    }
  } catch {
    refinedSpec = changeRequest;
  }

  // Phase 2: Claude executes the refined spec
  const ai = getCodeClient();
  const prompt = buildIteratorPrompt(planData, currentFiles, refinedSpec);
  let idx = 0;
  const hintTimer = setInterval(() => {
    publishEvent(sessionId, {
      type: 'user_progress',
      message: ITERATE_AI_HINTS[idx % ITERATE_AI_HINTS.length]!,
    }).catch(() => {});
    idx++;
  }, 12000);

  let raw: string;
  try {
    raw = await ai.complete([{ role: 'user', content: prompt }], ITERATOR_SYSTEM);
  } finally {
    clearInterval(hintTimer);
  }

  let changedFiles = extractFilesFromCodegenResponse(raw);
  if (!changedFiles) {
    try {
      const parsed = JSON.parse(raw.trim()) as { files?: Record<string, unknown> };
      if (parsed.files && typeof parsed.files === 'object' && !Array.isArray(parsed.files)) {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed.files)) {
          if (typeof v === 'string') out[k] = v;
        }
        changedFiles = Object.keys(out).length > 0 ? out : null;
      }
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

  const mergedFiles = { ...currentFiles, ...changedFiles };
  await writeProjectFiles(project.id, changedFiles);
  await prisma.project.update({
    where: { id: project.id },
    data: { files: mergedFiles, status: 'building' },
  });

  await publishEvent(sessionId, { type: 'user_progress', message: ITERATE_SAVING_BUILD });
  await publishEvent(sessionId, { step: 4, label: GEN_STEP_LABELS[4], status: 'running' });
  await publishEvent(sessionId, { type: 'user_progress', message: ITERATE_VERIFY_BUILD });

  // Re-write VITE_ public env vars before rebuild so they're baked into the new bundle
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
