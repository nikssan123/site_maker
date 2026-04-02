/**
 * Code models often wrap JSON in markdown fences or prefix with chatter.
 * They sometimes emit raw source instead of {"files":{...}} — extractors return null then.
 */

function stripMarkdownFence(s: string): string {
  let t = s.trim();
  if (!t.startsWith('```')) return t;
  t = t.replace(/^```(?:json)?\s*/i, '');
  const end = t.lastIndexOf('```');
  if (end !== -1) t = t.slice(0, end);
  return t.trim();
}

/** Strip leading ``` blocks repeatedly (handles nested or partial wraps). */
function stripLeadingFences(s: string): string {
  let t = s.trim();
  let prev = '';
  while (t !== prev && t.startsWith('```')) {
    prev = t;
    t = stripMarkdownFence(t);
  }
  return t;
}

/** Balanced `{...}` from s[start] where start points at '{'. String-aware. */
function extractBalancedObjectFrom(s: string, start: number): string | null {
  if (start < 0 || start >= s.length || s[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function extractBalancedObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  return extractBalancedObjectFrom(s, start);
}

/** Every markdown ```...``` segment — try parse inside each. */
function tryParseFromFenceBlocks(s: string): Record<string, string> | null {
  const re = /```(?:json)?\s*([\s\S]*?)```/gi;
  let best: Record<string, string> | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const inner = m[1]?.trim();
    if (!inner) continue;
    let files = tryParseToFiles(inner);
    if (files && (!best || Object.keys(files).length > Object.keys(best).length)) best = files;
    const balanced = extractBalancedObject(inner);
    if (balanced) {
      files = tryParseToFiles(balanced);
      if (files && (!best || Object.keys(files).length > Object.keys(best).length)) best = files;
    }
  }
  return best;
}

/** Max `{` starts to try — raw TS/TSX can contain many braces; cap keeps this bounded. */
const MAX_BRACE_START_ATTEMPTS = 400;

/** Try many '{' positions as JSON object starts; keep the largest valid `files` map. */
function tryParseFromAllBalancedObjects(s: string): Record<string, string> | null {
  let best: Record<string, string> | null = null;
  let braceHits = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{') continue;
    if (++braceHits > MAX_BRACE_START_ATTEMPTS) break;
    const balanced = extractBalancedObjectFrom(s, i);
    if (!balanced) continue;
    const files = tryParseToFiles(balanced);
    if (files && (!best || Object.keys(files).length > Object.keys(best).length)) best = files;
  }
  return best;
}

function normalizeFilesField(files: unknown): Record<string, string> | null {
  if (files == null || typeof files !== 'object' || Array.isArray(files)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(files as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
    else return null;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function tryParseToFiles(text: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const f = (parsed as { files?: unknown }).files;
      return normalizeFilesField(f);
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Parse model output into a files map for code generation / fix loops. */
export function extractFilesFromCodegenResponse(raw: string): Record<string, string> | null {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);

  let files = tryParseToFiles(s);
  if (files) return files;

  files = tryParseFromFenceBlocks(s);
  if (files) return files;

  const stripped = stripLeadingFences(s);
  if (stripped !== s) {
    files = tryParseToFiles(stripped);
    if (files) return files;
    files = tryParseFromFenceBlocks(stripped);
    if (files) return files;
  }

  const fenced = stripMarkdownFence(s);
  files = tryParseToFiles(fenced);
  if (files) return files;

  files = tryParseFromAllBalancedObjects(fenced);
  if (files) return files;

  files = tryParseFromAllBalancedObjects(s);
  if (files) return files;

  const balanced = extractBalancedObject(fenced);
  if (balanced) {
    files = tryParseToFiles(balanced);
    if (files) return files;
  }

  return null;
}
