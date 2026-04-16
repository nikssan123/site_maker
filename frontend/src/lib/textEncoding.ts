const MOJIBAKE_RE = /[ÐÑ][\x80-\xBF]/;
const UNICODE_ESCAPE_RE = /\\u[0-9a-fA-F]{4}/;

function decodeUnicodeEscapes(value: string): string {
  if (!UNICODE_ESCAPE_RE.test(value)) return value;
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

export function normalizeDisplayText(value: string): string {
  if (!value) return value;
  let out = value;
  try {
    out = decodeUnicodeEscapes(out);
  } catch {
    /* ignore */
  }
  if (!MOJIBAKE_RE.test(out)) return out;
  try {
    const bytes = Uint8Array.from(out, (ch) => ch.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return decoded.includes('\uFFFD') ? out : decoded;
  } catch {
    return out;
  }
}

export function fixMojibake(value: string): string {
  return normalizeDisplayText(value);
}
