import { getCodeClient, type ToolSchema } from './aiClient';
import { FIX_SYSTEM, buildFixPrompt } from '../lib/prompts';
import { writeProjectFiles } from '../lib/fileWriter';
import { installDeps, buildProject, runProject, RunnerResult } from './appRunner';
import { prisma } from '../index';

const MAX_ATTEMPTS = parseInt(process.env.MAX_FIX_ATTEMPTS ?? '3', 10);
const FIX_MAX_OUTPUT_TOKENS_BUILD = parseInt(process.env.FIX_MAX_OUTPUT_TOKENS ?? '2048', 10);
const FIX_MAX_OUTPUT_TOKENS_RUN = parseInt(process.env.FIX_MAX_OUTPUT_TOKENS_RUN ?? '8192', 10);
const FIX_ERROR_LOG_MAX = 3000;
const FIX_FILE_CONTENT_MAX = 6000;

/** Same shape as the codegen tool — emits only the files that need to change. */
const FIX_TOOL: ToolSchema<{ files: Record<string, string> }> = {
  name: 'emit_fixed_files',
  description:
    'Emit the files that need to change to fix the build/run failure. Each key is a project-relative path, each value is the full new file contents.',
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

function isImportResolutionError(log: string): boolean {
  return /failed to resolve import|could not resolve|module not found/i.test(log);
}

export interface FixContext {
  projectId: string;
  files: Record<string, string>;
  failedStep: 'build' | 'run';
  errorLog: string;
  onAttempt: (attempt: number, error: string) => void | Promise<void>;
}

export async function autoFix(ctx: FixContext): Promise<RunnerResult> {
  let { files } = ctx;
  let attempt = 0;

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    await ctx.onAttempt(attempt, ctx.errorLog);

    console.log(`[autofix] project=${ctx.projectId} attempt=${attempt}/${MAX_ATTEMPTS} step=${ctx.failedStep} — asking Claude to fix`);
    const ai = getCodeClient();

    // For run errors only send backend files (server.js, package.json) — no need
    // to send the entire frontend to fix a Node.js crash.
    const relevantFiles = ctx.failedStep === 'run'
      ? Object.fromEntries(
          Object.entries(files).filter(([p]) =>
            p === 'server.js' || p === 'package.json' || p.endsWith('.js'),
          ),
        )
      : files;

    // Truncate individual files so we don't blow up the context window
    const truncatedFiles = Object.fromEntries(
      Object.entries(relevantFiles).map(([p, content]) => [
        p,
        content.length > FIX_FILE_CONTENT_MAX
          ? content.slice(0, FIX_FILE_CONTENT_MAX) + '\n// … truncated'
          : content,
      ]),
    );

    const truncatedLog = ctx.errorLog.length > FIX_ERROR_LOG_MAX
      ? ctx.errorLog.slice(0, FIX_ERROR_LOG_MAX) + '\n… truncated'
      : ctx.errorLog;

    const prompt = buildFixPrompt(truncatedLog, truncatedFiles, ctx.failedStep);

    let fixedFiles: Record<string, string> | null;
    try {
      const result = await ai.completeStructured(
        [{ role: 'user', content: prompt }],
        FIX_SYSTEM,
        FIX_TOOL,
        { maxTokens: ctx.failedStep === 'run' ? FIX_MAX_OUTPUT_TOKENS_RUN : FIX_MAX_OUTPUT_TOKENS_BUILD },
      );
      fixedFiles = normalizeFilesPayload(result.input);
    } catch (e) {
      console.log(`[autofix] project=${ctx.projectId} attempt=${attempt} — tool call failed: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    if (!fixedFiles) {
      console.log(`[autofix] project=${ctx.projectId} attempt=${attempt} — Claude returned no files, skipping`);
      continue;
    }

    console.log(`[autofix] project=${ctx.projectId} attempt=${attempt} — Claude fixed ${Object.keys(fixedFiles).join(', ')}`);
    files = { ...files, ...fixedFiles };
    await writeProjectFiles(ctx.projectId, fixedFiles);

    await prisma.project.update({
      where: { id: ctx.projectId },
      data: { files, fixAttempts: attempt },
    });

    // Re-install deps if package.json was modified OR the error was a missing import
    // (the package may be listed in package.json but not installed due to stale lockfile)
    const needsReinstall =
      !!fixedFiles['package.json'] ||
      (ctx.failedStep === 'build' && isImportResolutionError(ctx.errorLog));

    if (needsReinstall) {
      console.log(`[autofix] project=${ctx.projectId} attempt=${attempt} — re-installing deps (package.json changed: ${!!fixedFiles['package.json']}, resolve error: ${isImportResolutionError(ctx.errorLog)})`);
      const installResult = await installDeps(ctx.projectId);
      if (!installResult.success) {
        ctx.errorLog = installResult.log;
        continue;
      }
    }

    const result =
      ctx.failedStep === 'build'
        ? await buildProject(ctx.projectId)
        : await runProject(ctx.projectId);

    if (result.success) return result;
    ctx.errorLog = result.log;
  }

  return { success: false, log: ctx.errorLog };
}
