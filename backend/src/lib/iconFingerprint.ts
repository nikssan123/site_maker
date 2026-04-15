import fs from 'fs';
import path from 'path';

/**
 * Maps a rendered <path d="..."> value back to its @mui/icons-material name.
 *
 * MUI compiles each icon to a file like
 *   node_modules/@mui/icons-material/<IconName>.js
 * whose body contains the pattern `createSvgIcon(_jsx("path", { d: "..." })...`.
 * We regex-extract the d-attribute from each icon's compiled JS and build
 * a Map keyed by the d-value.
 *
 * Cached per-project directory until the mtime of the icons-material dir changes.
 */
interface CacheEntry {
  mtimeMs: number;
  map: Map<string, string>;
}

const cache = new Map<string, CacheEntry>();

function iconsDir(projectDir: string): string {
  return path.join(projectDir, 'node_modules', '@mui', 'icons-material');
}

export function getIconFingerprints(projectDir: string): Map<string, string> {
  const dir = iconsDir(projectDir);
  if (!fs.existsSync(dir)) return new Map();

  let mtimeMs = 0;
  try { mtimeMs = fs.statSync(dir).mtimeMs; } catch { /* ignore */ }

  const existing = cache.get(projectDir);
  if (existing && existing.mtimeMs === mtimeMs) return existing.map;

  const map = new Map<string, string>();
  let entries: string[] = [];
  try { entries = fs.readdirSync(dir); } catch { return map; }

  // Match the first `d:"..."` occurrence inside the file. The icon JS is compiled
  // MUI output — `_jsx("path",{d:"M…Z"})` — so the first d: is always the icon path.
  // Some multi-path icons have multiple d:"…"; we capture only the first, which
  // is still a stable, unique-enough fingerprint for lookup.
  const dRegex = /d\s*:\s*"((?:[^"\\]|\\.)*)"/;

  for (const file of entries) {
    if (!file.endsWith('.js') || file === 'index.js' || file.startsWith('utils')) continue;
    const iconName = file.replace(/\.js$/, '');
    let src: string;
    try { src = fs.readFileSync(path.join(dir, file), 'utf8'); } catch { continue; }
    const m = dRegex.exec(src);
    if (!m) continue;
    const d = m[1];
    if (!map.has(d)) map.set(d, iconName);
  }

  cache.set(projectDir, { mtimeMs, map });
  return map;
}

export function resolveIconName(projectDir: string, pathD: string): string | null {
  const map = getIconFingerprints(projectDir);
  return map.get(pathD) ?? null;
}

export function invalidateIconFingerprints(projectDir: string): void {
  cache.delete(projectDir);
}
