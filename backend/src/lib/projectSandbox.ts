import path from 'path';

export const BASE_DIR = process.env.GENERATED_APPS_DIR ?? '/generated-apps';

export const MAX_READ_BYTES = 64 * 1024;
export const MAX_SEARCH_SNIPPET = 120;
export const MAX_BUILD_LOG = 6 * 1024;
export const MAX_LIST_PATHS = 800;
export const MAX_SEARCH_MATCHES = 80;

export function resolveSafeRelPath(rel: string): string | null {
  if (typeof rel !== 'string') return null;
  if (rel.length === 0 || rel.length > 512) return null;
  if (rel.includes('\0')) return null;
  if (path.isAbsolute(rel)) return null;
  if (/^[\\/]/.test(rel)) return null;
  if (/^[a-zA-Z]:/.test(rel)) return null;

  const norm = path.posix.normalize(rel.replace(/\\/g, '/'));
  if (norm === '.' || norm === '..') return null;
  if (norm.startsWith('../') || norm.startsWith('..\\')) return null;
  if (norm.includes('/../')) return null;

  return norm.startsWith('./') ? norm.slice(2) : norm;
}

export function resolveSafeAbsPath(projectId: string, rel: string): string {
  const safeRel = resolveSafeRelPath(rel);
  if (!safeRel) throw new Error(`Unsafe path: ${rel}`);
  const projectRoot = path.resolve(path.join(BASE_DIR, projectId));
  const abs = path.resolve(path.join(projectRoot, safeRel));
  const rootWithSep = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
  if (abs !== projectRoot && !abs.startsWith(rootWithSep)) {
    throw new Error(`Path escapes sandbox: ${rel}`);
  }
  return abs;
}
