import { getCodeClient } from './aiClient';
import { extractFilesFromCodegenResponse } from '../lib/extractCodegenJson';
import { FIX_SYSTEM, buildFixPrompt } from '../lib/prompts';
import { writeProjectFiles } from '../lib/fileWriter';
import { buildProject, runProject, RunnerResult } from './appRunner';
import { prisma } from '../index';

const MAX_ATTEMPTS = parseInt(process.env.MAX_FIX_ATTEMPTS ?? '3', 10);
const FIX_MAX_OUTPUT_TOKENS = parseInt(process.env.FIX_MAX_OUTPUT_TOKENS ?? '2048', 10);
const FIX_ERROR_LOG_MAX = 3000;   // chars of error log sent to Claude
const FIX_FILE_CONTENT_MAX = 6000; // chars per file sent as context

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

    const prompt = buildFixPrompt(truncatedLog, truncatedFiles);
    const raw = await ai.complete(
      [{ role: 'user', content: prompt }],
      FIX_SYSTEM,
      { maxTokens: FIX_MAX_OUTPUT_TOKENS },
    );

    let fixedFiles = extractFilesFromCodegenResponse(raw);
    if (!fixedFiles) {
      try {
        const parsed = JSON.parse(raw.trim()) as { files?: Record<string, unknown> };
        if (parsed.files && typeof parsed.files === 'object' && !Array.isArray(parsed.files)) {
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(parsed.files)) {
            if (typeof v === 'string') out[k] = v;
          }
          fixedFiles = Object.keys(out).length > 0 ? out : null;
        }
      } catch {
        /* ignore */
      }
    }

    if (!fixedFiles || Object.keys(fixedFiles).length === 0) {
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

    const result =
      ctx.failedStep === 'build'
        ? await buildProject(ctx.projectId)
        : await runProject(ctx.projectId);

    if (result.success) return result;
    ctx.errorLog = result.log;
  }

  return { success: false, log: ctx.errorLog };
}
