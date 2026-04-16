const MOJIBAKE_RE = /[ÐÑ][\x80-\xBF]/;

export function fixMojibake(value: string): string {
  if (!value || !MOJIBAKE_RE.test(value)) return value;
  try {
    const bytes = Uint8Array.from(value, (ch) => ch.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return decoded.includes('\uFFFD') ? value : decoded;
  } catch {
    return value;
  }
}

