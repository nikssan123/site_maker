/*
 * TODO: tests for when a test framework is added —
 *  - runToolLoop honors maxSteps and aggregates usage across turns
 *  - resolveSafeRelPath rejects '..', absolute, NUL, drive letters, leading '/' or '\'
 *  - patch_file rejects malformed diffs without writing
 *  - rollback_last_change resets ctx.hasMutated and refreshes ctx.files
 *  - orchestrator skips project.files write when !hasMutated
 *  - planner-without-mutate: planner has no file tools (invariant by absence)
 *  - route picks new path when plan.executionBrief != null, legacy when null
 */
import { getCodeClient } from '../aiClient';
import { logTokens } from '../tokenAccountingService';
import { writeProjectFiles } from '../../lib/fileWriter';
import { writeAdminTokenFile } from '../../lib/adminToken';
import { buildFileTree } from '../../lib/fileTree';
import { buildProject, runProject, stopProject } from '../appRunner';
import { autoFix } from '../fixerService';
import { restoreProjectSnapshot } from '../projectSnapshotService';
import { prisma } from '../../index';
import { publishEvent, clearSessionEvents } from '../eventBus';
import {
  GEN_FIXING_FRIENDLY,
  GEN_STEP_LABELS,
  ITERATE_AI_HINTS,
  ITERATE_FINISHING,
  ITERATE_LAUNCH_PREVIEW,
  ITERATE_READING_REQUEST,
  ITERATE_SAVING_BUILD,
  ITERATE_VERIFY_BUILD,
} from '../../lib/generationFriendly';
import { createAgentContext } from './context';
import { buildAgentTools } from './tools';
import type { Attachment } from './attachments';

export interface ExecutionBrief {
  userRequest: string;
  approvedPlan: string[];
  constraints: string[];
  expectedOutcome: string;
  avoidChanging: string[];
}

const AGENT_SYSTEM = `You are the execution agent for an existing generated full-stack web project (React + TypeScript on the frontend, Express + Prisma optional on the backend). The user has already approved a plan; your job is to apply that plan with surgical, minimal edits and to verify the result builds.

You have a sandboxed file workspace under the project root and the following tools:
- list_files({ glob? }) — paths only.
- search_files({ query, glob?, maxMatches? }) — find code by substring or /regex/.
- read_file({ path }) — read a file (truncated at 64 KB).
- patch_file({ path, diff }) — apply a unified diff (preferred for edits).
- write_file({ path, content }) — full-file write (use only for new files or when patch is impractical).
- delete_file({ path }).
- run_build({}) — runs the project build; returns success and a build log.
- get_build_errors({}) — re-reads the last build result.
- rollback_last_change({}) — restores the project to the pre-iteration snapshot.
- run_node_script({ code }) — execute a small Node.js script inside the project root. Use ONLY for live DB mutations (e.g. updating a Prisma row's imageUrl). The script has access to the project's installed packages (including @prisma/client). Output is captured (stdout + stderr) and truncated.

Photo attachments:
- The execution brief may include "attachments" — images the user uploaded in chat. Each has { url, filename, mimeType }. The url is already publicly served by the preview runtime.
- For static-image edits (logo, hero, header, banner, etc.), use patch_file/write_file to swap the relevant <img src=...> or background-image to the attachment url.
- For DB-backed images (catalog products, blog posts, etc.), prefer run_node_script to UPDATE the right row(s) via prisma — do not just edit the seed file, since the live DB is already populated.
- Match attachments to the user's request. If unclear, pick the most likely target from the brief.

Operating rules:
1. Start by reading the execution brief. Then use list_files / search_files / read_file to locate the exact files you need. Do not edit blind.
2. Prefer patch_file over write_file. Keep edits as small as possible. Do not rename or move files unless the brief demands it.
3. Honor the brief's avoidChanging list. Do not modify files outside the spirit of the request.
4. After your edits are done, call run_build. If it fails, read the log, fix the failures, and run_build again. You may iterate up to ~25 tool calls total.
5. If the build cannot be made to pass, or if you realize you have broken something irrecoverable, call rollback_last_change once and then stop.
6. When you finish, output a short final message in plain text:
   - One sentence summary of what changed (in English).
   - A bullet list of files touched.
   No code blocks, no JSON.

Constraints:
- All user-visible new strings in this codebase must be Bulgarian; do NOT translate existing Bulgarian strings to English.
- Never write outside the project sandbox; tool calls with absolute paths or "../" will be rejected.
- Never invent files that don't exist — read first.
- Do not run any tool other than the ones listed above.
- Do not produce a plan; the plan is already approved. Execute it.`;

const PLAN_METADATA_CAP = 4_000;

export async function runIterationAgent(input: {
  sessionId: string;
  userId: string;
  projectId: string;
  planId: string;
  snapshotBeforeId: string;
  executionBrief: ExecutionBrief;
  attachments?: Attachment[];
  logId?: string;
  /** True when this iteration is one of the user's free credits (FREE_ITERATION_LIMIT per project). */
  isFree?: boolean;
}): Promise<void> {
  const { sessionId, userId, projectId, planId, snapshotBeforeId, executionBrief, logId } = input;
  const attachments = input.attachments ?? [];
  const isFree = input.isFree === true;

  await clearSessionEvents(sessionId);

  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId },
    include: { plan: true, project: true },
  });
  if (!session?.project) {
    await publishEvent(sessionId, { type: 'fatal', message: 'Проектът не е намерен.' });
    return;
  }

  const project = session.project;
  const planData = (session.plan?.data ?? {}) as Record<string, unknown>;
  const currentFiles = (project.files as Record<string, string>) ?? {};
  const filePaths = Object.keys(currentFiles);

  const failIteration = async (message: string, errorLog?: string) => {
    try {
      const restored = await restoreProjectSnapshot(snapshotBeforeId);
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
      console.error('[iterate-agent] snapshot rollback failed:', e);
    }
    await prisma.iterationPlan
      .update({
        where: { id: planId },
        data: {
          status: 'failed',
          failedAt: new Date(),
          errorLog: (errorLog || message).slice(0, 50_000),
        },
      })
      .catch(() => {});
    await publishEvent(sessionId, { type: 'fatal', message });
  };

  await stopProject(project.id);
  await publishEvent(sessionId, { type: 'user_progress', message: ITERATE_READING_REQUEST });

  const ctx = createAgentContext({
    projectId: project.id,
    userId,
    sessionId,
    snapshotBeforeId,
    files: currentFiles,
  });

  const planMetadataJson = JSON.stringify(planData).slice(0, PLAN_METADATA_CAP);
  const briefForAgent = { ...executionBrief, attachments };
  const userMessage = [
    '## Execution brief',
    '```json',
    JSON.stringify(briefForAgent, null, 2),
    '```',
    ...(attachments.length > 0
      ? [
          '',
          '## Attachments (already uploaded; reference these URLs directly)',
          ...attachments.map(
            (a, i) => `${i + 1}. ${a.filename} (${a.mimeType}) → ${a.url}`,
          ),
        ]
      : []),
    '',
    '## App plan metadata',
    '```json',
    planMetadataJson,
    '```',
    '',
    '## File tree',
    '```',
    buildFileTree(filePaths, 600),
    '```',
  ].join('\n');

  let hintIdx = 0;
  const hintTimer = setInterval(() => {
    publishEvent(sessionId, {
      type: 'user_progress',
      message: ITERATE_AI_HINTS[hintIdx % ITERATE_AI_HINTS.length]!,
    }).catch(() => {});
    hintIdx++;
  }, 12_000);

  const ai = getCodeClient();
  const maxOutputTokens = parseInt(process.env.CLAUDE_MAX_OUTPUT_TOKENS ?? '8192', 10);

  let loopError: string | undefined;
  let loopResult: Awaited<ReturnType<typeof ai.runToolLoop>> | null = null;
  try {
    loopResult = await ai.runToolLoop(
      [{ role: 'user', content: userMessage }],
      AGENT_SYSTEM,
      buildAgentTools(ctx),
      {
        maxTokens: maxOutputTokens,
        maxSteps: 25,
        cacheSystem: true,
        onStep: ({ index, toolUses }) => {
          console.log(
            `[iterate-agent] step ${index}: ${toolUses.map((t) => t.name).join(', ')}`,
          );
        },
      },
    );
  } catch (e) {
    loopError = e instanceof Error ? e.message : String(e);
  } finally {
    clearInterval(hintTimer);
  }

  if (loopResult) {
    await logTokens({
      userId,
      projectId: project.id,
      provider: loopResult.provider,
      model: loopResult.model,
      endpoint: 'iterate.agent',
      usage: loopResult.usage,
      isFree,
    });
  }

  if (!loopResult || loopError) {
    await failIteration(
      'ИИ върна невалиден отговор. Моля, опитайте пак.',
      loopError ?? 'tool loop failed',
    );
    return;
  }

  if (!ctx.hasMutated) {
    await failIteration(
      'Моделът не направи промени. Моля, уточнете заявката.',
      `Final text: ${loopResult.finalText.slice(0, 500)}`,
    );
    return;
  }

  // Persist the final file map to the DB once.
  await prisma.project
    .update({
      where: { id: project.id },
      data: { files: ctx.files, status: 'building' },
    })
    .catch(() => {});

  try {
    await writeAdminTokenFile(project.id);
  } catch (e) {
    console.error('[iterate-agent] writeAdminTokenFile failed:', e);
  }

  await publishEvent(sessionId, { type: 'user_progress', message: ITERATE_SAVING_BUILD });
  await publishEvent(sessionId, { step: 4, label: GEN_STEP_LABELS[4], status: 'running' });
  await publishEvent(sessionId, { type: 'user_progress', message: ITERATE_VERIFY_BUILD });

  // Re-bake VITE_ public env vars before final build (mirrors legacy iterator).
  const buildEnv = (project as unknown as { buildEnv?: unknown }).buildEnv;
  if (buildEnv && typeof buildEnv === 'object' && !Array.isArray(buildEnv)) {
    const envLines = Object.entries(buildEnv as Record<string, string>)
      .filter(([k]) => k.startsWith('VITE_'))
      .map(([k, v]) => `${k}=${v}`);
    if (envLines.length > 0) {
      await writeProjectFiles(project.id, { '.env.production': envLines.join('\n') });
    }
  }

  // Final verification: even if the agent ran a successful build, run one more
  // to make sure the on-disk state (including the freshly baked env) compiles.
  let finalBuild = await buildProject(project.id);
  if (!finalBuild.success) {
    const fixResult = await autoFix({
      projectId: project.id,
      files: ctx.files,
      failedStep: 'build',
      errorLog: finalBuild.log,
      onAttempt: async (attempt, error) => {
        await publishEvent(sessionId, { type: 'user_progress', message: GEN_FIXING_FRIENDLY(attempt) });
        await publishEvent(sessionId, { type: 'fix_attempt', attempt, error });
      },
    });
    if (!fixResult.success) {
      await failIteration(
        'Неуспех при поправка на компилацията. Върнах предишната работеща версия.',
        fixResult.log,
      );
      return;
    }
    finalBuild = fixResult;
  }

  await publishEvent(sessionId, { step: 4, label: GEN_STEP_LABELS[4], status: 'done' });
  await publishEvent(sessionId, { step: 5, label: GEN_STEP_LABELS[5], status: 'running' });
  await publishEvent(sessionId, { type: 'user_progress', message: ITERATE_LAUNCH_PREVIEW });
  const runResult = await runProject(project.id);

  if (!runResult.success) {
    await failIteration(
      'Приложението не стартира след промяната. Върнах предишната работеща версия.',
      runResult.log,
    );
    return;
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { status: 'running', runPort: runResult.port },
  });

  await publishEvent(sessionId, { step: 5, label: GEN_STEP_LABELS[5], status: 'done' });
  await publishEvent(sessionId, { type: 'user_progress', message: ITERATE_FINISHING });
  await publishEvent(sessionId, {
    type: 'preview_updated',
    port: runResult.port,
    projectId: project.id,
  });

  await prisma.iterationPlan
    .update({
      where: { id: planId },
      data: { status: 'applied', appliedAt: new Date() },
    })
    .catch(() => {});

  if (logId) {
    const description = executionBrief.userRequest.trim().slice(0, 4000);
    if (description) {
      prisma.iterationLog
        .update({ where: { id: logId }, data: { description } })
        .catch(() => {});
    }
  }
}
