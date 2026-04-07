import { z } from 'zod';
import { getChatClient } from './aiClient';

export type IterateExploreResult = {
  targetFiles: string[];
  contextNotes: string;
};

type ToolState = {
  opened: Array<{ path: string; content: string }>;
  denied: string[];
};

const ACTION_SCHEMA = z.object({
  done: z.boolean().default(false),
  // Files to open next (from provided file paths).
  open: z.array(z.string().min(1)).default([]),
  // Optional: final set of target files (must be subset of provided file paths).
  targetFiles: z.array(z.string().min(1)).optional(),
});

function safeParseJson(raw: string): unknown | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function buildTreeString(paths: string[], maxLines: number): string {
  // Simple indented tree for LLM readability; capped by maxLines.
  const root: any = {};
  for (const p of paths) {
    const parts = p.split('/').filter(Boolean);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      cur[part] = cur[part] ?? (i === parts.length - 1 ? null : {});
      cur = cur[part] ?? {};
    }
  }
  const lines: string[] = [];
  const walk = (node: any, prefix: string) => {
    const keys = Object.keys(node).sort();
    for (const k of keys) {
      if (lines.length >= maxLines) return;
      const child = node[k];
      lines.push(`${prefix}${k}${child === null ? '' : '/'}`);
      if (child && typeof child === 'object') walk(child, `${prefix}  `);
      if (lines.length >= maxLines) return;
    }
  };
  walk(root, '');
  return lines.join('\n');
}

export async function exploreIterationFiles(params: {
  plan: Record<string, unknown>;
  refinedSpec: string;
  filePaths: string[];
  fileContents: Record<string, string>;
  maxOpens?: number;
  maxTurns?: number;
}): Promise<IterateExploreResult> {
  const maxTurns = params.maxTurns ?? 4;
  const maxOpens = params.maxOpens ?? 6;

  const allowed = new Set(params.filePaths);
  const tree = buildTreeString(params.filePaths, 800);

  const system = `
You are a senior engineer doing "cursor-style" exploration before implementing a change.

You will be given:
- App plan (JSON)
- Refined spec (English)
- File tree (indented)

You can request to OPEN files by returning JSON.

Loop:
- Each turn, return ONLY JSON with this shape:
  {
    "done": boolean,
    "open": ["path/to/file", ...],
    "targetFiles": ["path/to/file", ...] // optional when done=true
  }

Rules:
- You MUST choose paths ONLY from the provided file tree.
- Keep it minimal: open at most ${maxOpens} files total.
- Prefer reading key entrypoints/components that determine behavior, not broad refactors.
- When done, provide a minimal targetFiles list (1-8 files).
- Do not include node_modules, dist, or lockfiles.
`;

  const ai = getChatClient();
  const state: ToolState = { opened: [], denied: [] };
  let suggestedTargets: string[] | null = null;

  for (let turn = 0; turn < maxTurns; turn++) {
    const openedList = state.opened.map((o) => `- ${o.path}`).join('\n');
    const openedBodies = state.opened
      .map((o) => `// ${o.path}\n${o.content}`)
      .join('\n\n---\n\n');

    const user = [
      `Plan: ${JSON.stringify(params.plan)}`,
      `Refined spec: ${params.refinedSpec}`,
      `\nFile tree:\n${tree}`,
      `\nAlready opened (${state.opened.length}/${maxOpens}):\n${openedList || '(none)'}`,
      state.denied.length ? `\nDenied:\n${state.denied.map((d) => `- ${d}`).join('\n')}` : '',
      state.opened.length ? `\nOpened file contents:\n${openedBodies}` : '',
    ].filter(Boolean).join('\n');

    const raw = await ai.complete([{ role: 'user', content: user }], system, { maxTokens: 450 });
    const parsed = safeParseJson(raw);
    const data = parsed ? ACTION_SCHEMA.safeParse(parsed) : null;
    if (!data?.success) break;

    const v = data.data;
    if (v.targetFiles && v.targetFiles.length > 0) {
      const uniq = Array.from(new Set(v.targetFiles)).filter((p) => allowed.has(p)).slice(0, 8);
      if (uniq.length > 0) suggestedTargets = uniq;
    }

    const wantsOpen = Array.from(new Set(v.open)).slice(0, Math.max(0, maxOpens - state.opened.length));
    for (const p of wantsOpen) {
      if (state.opened.length >= maxOpens) break;
      if (!allowed.has(p)) {
        state.denied.push(`${p} (not in file list)`);
        continue;
      }
      if (state.opened.some((o) => o.path === p)) continue;
      const full = params.fileContents[p];
      if (typeof full !== 'string') {
        state.denied.push(`${p} (missing content)`);
        continue;
      }
      // Keep per-file content bounded to avoid runaway prompt size.
      const clipped = full.length > 12000 ? `${full.slice(0, 12000)}\n\n/* … truncated … */` : full;
      state.opened.push({ path: p, content: clipped });
    }

    if (v.done) break;
    if (state.opened.length >= maxOpens) break;
  }

  // If model never suggested targets, fall back to opened files or common entrypoints.
  const fallbackTargets =
    suggestedTargets ??
    (state.opened.length > 0
      ? state.opened.map((o) => o.path).slice(0, 6)
      : params.filePaths.filter((p) => /src\/(App|main)\.(tsx?|jsx?)$|src\/pages\/|src\/components\//.test(p)).slice(0, 4));

  const contextNotes = [
    `Exploration summary (internal):`,
    `- Opened: ${state.opened.map((o) => o.path).join(', ') || '(none)'}`,
    `- Suggested target files: ${fallbackTargets.join(', ') || '(none)'}`,
  ].join('\n');

  return { targetFiles: fallbackTargets, contextNotes };
}

