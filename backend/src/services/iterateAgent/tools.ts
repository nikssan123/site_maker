import fs from 'fs/promises';
import * as Diff from 'diff';
import { z } from 'zod';
import type { ToolHandler } from '../aiClient';
import { writeProjectFiles } from '../../lib/fileWriter';
import {
  resolveSafeRelPath,
  resolveSafeAbsPath,
  MAX_READ_BYTES,
  MAX_SEARCH_SNIPPET,
  MAX_BUILD_LOG,
  MAX_LIST_PATHS,
  MAX_SEARCH_MATCHES,
} from '../../lib/projectSandbox';
import { buildProject, runProjectScript } from '../appRunner';
import { restoreProjectSnapshot } from '../projectSnapshotService';
import { prisma } from '../../index';
import type { AgentContext } from './context';

const SKIP_GLOB_RE = /(^|\/)(node_modules|dist)(\/|$)|\.lock$/i;

function compileGlob(glob: string): RegExp {
  // Tiny in-house glob: ** => .*, * => [^/]*, ? => . (one char), escape other regex specials.
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i]!;
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i += 2;
      continue;
    }
    if (c === '*') {
      re += '[^/]*';
      i += 1;
      continue;
    }
    if (c === '?') {
      re += '.';
      i += 1;
      continue;
    }
    if (/[.+^${}()|[\]\\]/.test(c)) {
      re += '\\' + c;
      i += 1;
      continue;
    }
    re += c;
    i += 1;
  }
  return new RegExp('^' + re + '$');
}

function matchGlob(path: string, glob: string | undefined): boolean {
  if (!glob) return true;
  try {
    return compileGlob(glob).test(path);
  } catch {
    return false;
  }
}

function compileQuery(query: string): { test: (s: string) => boolean } {
  const m = /^\/(.+)\/([gimsuy]*)$/.exec(query);
  if (m) {
    try {
      const re = new RegExp(m[1]!, m[2]);
      return { test: (s) => re.test(s) };
    } catch {
      return { test: (s) => s.includes(query) };
    }
  }
  return { test: (s) => s.toLowerCase().includes(query.toLowerCase()) };
}

const listSchema = z.object({ glob: z.string().optional() });
const readSchema = z.object({ path: z.string() });
const searchSchema = z.object({
  query: z.string(),
  glob: z.string().optional(),
  maxMatches: z.number().int().min(1).max(MAX_SEARCH_MATCHES).optional(),
});
const writeSchema = z.object({ path: z.string(), content: z.string() });
const patchSchema = z.object({ path: z.string(), diff: z.string() });
const deleteSchema = z.object({ path: z.string() });
const scriptSchema = z.object({
  code: z.string().min(1).max(32_000),
  timeoutMs: z.number().int().min(1_000).max(60_000).optional(),
});
const emptySchema = z.object({}).passthrough();

export function buildAgentTools(ctx: AgentContext): ToolHandler[] {
  return [
    {
      name: 'list_files',
      description:
        'List all project file paths. Optional `glob` (e.g. "src/**/*.tsx") narrows the result. node_modules, dist, and lock files are always excluded.',
      inputSchema: {
        type: 'object',
        properties: {
          glob: { type: 'string', description: 'Optional glob like "src/**/*.tsx".' },
        },
      },
      async handler(input) {
        const parsed = listSchema.safeParse(input);
        if (!parsed.success) return { ok: false, error: 'invalid input' };
        const all = Object.keys(ctx.files).filter((p) => !SKIP_GLOB_RE.test(p));
        const filtered = all.filter((p) => matchGlob(p, parsed.data.glob));
        const truncated = filtered.length > MAX_LIST_PATHS;
        return { ok: true, paths: filtered.slice(0, MAX_LIST_PATHS).sort(), truncated };
      },
    },
    {
      name: 'read_file',
      description:
        'Read a file by project-relative path. Returns up to 64 KB of content; sets `truncated` if the file is larger.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      async handler(input) {
        const parsed = readSchema.safeParse(input);
        if (!parsed.success) return { ok: false, error: 'invalid input' };
        const safe = resolveSafeRelPath(parsed.data.path);
        if (!safe) return { ok: false, error: 'unsafe path' };

        let content = ctx.files[safe];
        if (typeof content !== 'string') {
          try {
            const abs = resolveSafeAbsPath(ctx.projectId, safe);
            content = await fs.readFile(abs, 'utf8');
            ctx.files[safe] = content;
          } catch {
            return { ok: false, error: 'file not found' };
          }
        }

        const bytes = Buffer.byteLength(content, 'utf8');
        if (bytes > MAX_READ_BYTES) {
          return {
            ok: true,
            path: safe,
            content: content.slice(0, MAX_READ_BYTES),
            truncated: true,
            bytes,
          };
        }
        return { ok: true, path: safe, content, truncated: false, bytes };
      },
    },
    {
      name: 'search_files',
      description:
        'Search project files by substring or `/regex/flags`. Returns matching file paths with line numbers and short snippets. Caps total matches.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Substring; or /regex/flags for regex search.',
          },
          glob: { type: 'string' },
          maxMatches: { type: 'integer', minimum: 1, maximum: MAX_SEARCH_MATCHES },
        },
        required: ['query'],
      },
      async handler(input) {
        const parsed = searchSchema.safeParse(input);
        if (!parsed.success) return { ok: false, error: 'invalid input' };
        const limit = parsed.data.maxMatches ?? MAX_SEARCH_MATCHES;
        const matcher = compileQuery(parsed.data.query);
        const matches: { path: string; line: number; snippet: string }[] = [];
        let truncated = false;
        for (const [path, content] of Object.entries(ctx.files)) {
          if (SKIP_GLOB_RE.test(path)) continue;
          if (!matchGlob(path, parsed.data.glob)) continue;
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!;
            if (matcher.test(line)) {
              if (matches.length >= limit) {
                truncated = true;
                break;
              }
              matches.push({
                path,
                line: i + 1,
                snippet: line.trim().slice(0, MAX_SEARCH_SNIPPET),
              });
            }
          }
          if (matches.length >= limit) {
            truncated = true;
            break;
          }
        }
        return { ok: true, matches, truncated };
      },
    },
    {
      name: 'write_file',
      description:
        'Create or fully overwrite a file at `path` with `content`. Use only for new files or when patch_file cannot apply. Path must be inside the project sandbox.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
      async handler(input) {
        const parsed = writeSchema.safeParse(input);
        if (!parsed.success) return { ok: false, error: 'invalid input' };
        const safe = resolveSafeRelPath(parsed.data.path);
        if (!safe) return { ok: false, error: 'unsafe path' };

        await writeProjectFiles(ctx.projectId, { [safe]: parsed.data.content });
        ctx.files[safe] = parsed.data.content;
        ctx.hasMutated = true;
        ctx.mutationCount++;
        return {
          ok: true,
          path: safe,
          bytes: Buffer.byteLength(parsed.data.content, 'utf8'),
        };
      },
    },
    {
      name: 'patch_file',
      description:
        'Apply a unified diff (---/+++/@@ headers) to an existing file. Returns ok:false if the patch does not apply cleanly; in that case re-read the file and retry.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          diff: { type: 'string', description: 'Unified diff to apply.' },
        },
        required: ['path', 'diff'],
      },
      async handler(input) {
        const parsed = patchSchema.safeParse(input);
        if (!parsed.success) return { ok: false, error: 'invalid input' };
        const safe = resolveSafeRelPath(parsed.data.path);
        if (!safe) return { ok: false, error: 'unsafe path' };

        let current = ctx.files[safe];
        if (typeof current !== 'string') {
          try {
            const abs = resolveSafeAbsPath(ctx.projectId, safe);
            current = await fs.readFile(abs, 'utf8');
            ctx.files[safe] = current;
          } catch {
            return { ok: false, error: 'file not found' };
          }
        }

        let result: string | false;
        try {
          result = Diff.applyPatch(current, parsed.data.diff);
        } catch (e) {
          return {
            ok: false,
            error: `patch did not apply: ${String(e instanceof Error ? e.message : e).slice(0, 200)}`,
          };
        }
        if (result === false || typeof result !== 'string') {
          return { ok: false, error: 'patch did not apply' };
        }

        await writeProjectFiles(ctx.projectId, { [safe]: result });
        ctx.files[safe] = result;
        ctx.hasMutated = true;
        ctx.mutationCount++;

        const hunkCount = (parsed.data.diff.match(/^@@ /gm) ?? []).length || 1;
        return { ok: true, path: safe, hunksApplied: hunkCount };
      },
    },
    {
      name: 'delete_file',
      description: 'Delete a file from the project. Path must be inside the sandbox.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      async handler(input) {
        const parsed = deleteSchema.safeParse(input);
        if (!parsed.success) return { ok: false, error: 'invalid input' };
        const safe = resolveSafeRelPath(parsed.data.path);
        if (!safe) return { ok: false, error: 'unsafe path' };

        try {
          const abs = resolveSafeAbsPath(ctx.projectId, safe);
          await fs.unlink(abs).catch(() => {});
        } catch {
          // sandbox guard already rejected; fall through
        }
        delete ctx.files[safe];
        ctx.hasMutated = true;
        ctx.mutationCount++;
        return { ok: true, path: safe };
      },
    },
    {
      name: 'run_build',
      description:
        'Compile the project. Returns success and a compact build log (truncated). Call this after edits and after fixing build errors.',
      inputSchema: { type: 'object', properties: {} },
      async handler(input) {
        emptySchema.parse(input ?? {});
        const result = await buildProject(ctx.projectId);
        const log = (result.log ?? '').slice(0, MAX_BUILD_LOG);
        ctx.lastBuild = { success: result.success, log };
        return { ok: true, success: result.success, log };
      },
    },
    {
      name: 'get_build_errors',
      description: 'Re-read the last build result without re-running the build.',
      inputSchema: { type: 'object', properties: {} },
      async handler(input) {
        emptySchema.parse(input ?? {});
        return { ok: true, lastBuild: ctx.lastBuild };
      },
    },
    {
      name: 'run_node_script',
      description:
        'Execute a one-shot Node.js (CommonJS) script inside the project root. Use ONLY for live DB mutations (typically via the project\'s @prisma/client) — for file edits use patch_file/write_file. The script\'s cwd is the project directory; require() resolves the project\'s installed packages. Anything you log to stdout/stderr is returned. Default timeout 20s.',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'CommonJS source. Wrap async work in (async () => { ... })().' },
          timeoutMs: { type: 'integer', minimum: 1000, maximum: 60_000 },
        },
        required: ['code'],
      },
      async handler(input) {
        const parsed = scriptSchema.safeParse(input);
        if (!parsed.success) return { ok: false, error: 'invalid input' };
        const result = await runProjectScript(ctx.projectId, parsed.data.code, parsed.data.timeoutMs);
        ctx.hasMutated = true;
        ctx.mutationCount++;
        return { ok: true, success: result.success, log: result.log, truncated: result.truncated };
      },
    },
    {
      name: 'rollback_last_change',
      description:
        'Restore the project to the snapshot taken before this iteration started. Use only as a last resort when the build cannot be made to pass.',
      inputSchema: { type: 'object', properties: {} },
      async handler(input) {
        emptySchema.parse(input ?? {});
        await restoreProjectSnapshot(ctx.snapshotBeforeId);
        const fresh = await prisma.project.findUnique({
          where: { id: ctx.projectId },
          select: { files: true },
        });
        const files = (fresh?.files as Record<string, string> | undefined) ?? {};
        ctx.files = { ...files };
        ctx.hasMutated = false;
        ctx.lastBuild = null;
        return { ok: true, restored: true, files: Object.keys(ctx.files).length };
      },
    },
  ];
}
