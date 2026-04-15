import { z } from 'zod';
import { getIterateAssistClient } from './aiClient';

export type IterateScopeResult = {
  summaryBg: string;
  targetFiles: string[];
  nonGoalsBg: string[];
};

const SCOPE_SCHEMA = z.object({
  summaryBg: z.string().min(1),
  targetFiles: z.array(z.string().min(1)).min(1),
  nonGoalsBg: z.array(z.string().min(1)).default([]),
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

export async function scopeIteration(params: {
  plan: Record<string, unknown>;
  filePaths: string[];
  refinedSpec: string;
  maxFiles?: number;
}): Promise<IterateScopeResult> {
  const maxFiles = params.maxFiles ?? 8;
  const system = `
You are a senior engineer helping scope a change safely.

Input:
- App plan (JSON)
- Project file paths (strings)
- A refined technical spec (English)

Task:
- Choose the smallest set of existing files that must be edited to implement the spec well.
- Avoid broad refactors. Prefer editing 1-6 files.
- Keep UI stable. Do not include global/theme files unless absolutely required by the spec.

Output ONLY valid JSON (no markdown), shape:
{
  "summaryBg": "<Bulgarian, 1–2 short sentences: what the site visitor will see or do after the change — concrete, no file paths, no jargon>",
  "targetFiles": ["<existing file path>", ...],
  "nonGoalsBg": ["<Bulgarian short non-goal>", ...]
}

Rules:
- targetFiles MUST be chosen ONLY from the provided file paths.
- Max targetFiles: ${maxFiles}
- If the implementation may add a new file, choose the smallest set of existing files that need to change to wire that new file in.
- If the app plan includes multiple languages, or the spec changes user-visible text/labels/navigation, include the relevant existing locale/i18n/translation files when they are present.
- nonGoalsBg: 2-5 items, Bulgarian, focused on preventing regressions (layout, copy language, unrelated features).
`;

  const user = JSON.stringify({
    plan: params.plan,
    filePaths: params.filePaths,
    refinedSpec: params.refinedSpec,
  });

  const ai = getIterateAssistClient();
  const raw = await ai.complete([{ role: 'user', content: user }], system, { maxTokens: 900 });
  const parsed = safeParseJson(raw);
  const res = parsed ? SCOPE_SCHEMA.safeParse(parsed) : null;
  if (!res?.success) {
    // Conservative fallback: pick a small set of common entrypoints.
    const fallback = params.filePaths.filter((p) =>
      /src\/(App|main)\.(tsx?|jsx?)$|src\/pages\/|src\/components\//.test(p),
    ).slice(0, Math.min(4, params.filePaths.length));
    return {
      summaryBg: 'Ще приложа промяната внимателно, без да засягам останалия дизайн.',
      targetFiles: fallback.length > 0 ? fallback : params.filePaths.slice(0, 1),
      nonGoalsBg: [
        'Без промени по цялостния дизайн/цветова схема, освен ако не е нужно',
        'Без добавяне на нови функции извън заявката',
        'Всички потребителски текстове остават на български',
      ],
    };
  }

  // Enforce constraints.
  const unique = Array.from(new Set(res.data.targetFiles));
  const allowed = new Set(params.filePaths);
  const filtered = unique.filter((p) => allowed.has(p)).slice(0, maxFiles);
  if (filtered.length === 0) {
    throw new Error('Scope selection returned no valid target files');
  }
  return {
    summaryBg: res.data.summaryBg.trim(),
    targetFiles: filtered,
    nonGoalsBg: (res.data.nonGoalsBg ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 6),
  };
}
