import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import { BASE_DIR } from './runner';

const adminTokenMem = new Map<string, { token: string; expires: number }>();
const ADMIN_TOKEN_CACHE_MS = 5 * 60 * 1000;

function adminTokenFile(projectId: string): string {
  return path.join(BASE_DIR, projectId, '.admin-token');
}

/** subPath from Express (no leading slash), e.g. api/products/1 */
export function normalizeSubPathToUrlPath(subPath: string): string {
  const noQuery = subPath.split('?')[0] ?? '';
  const trimmed = noQuery.replace(/^\/+/, '');
  return '/' + trimmed;
}

export function isApiPutOrDelete(method: string, pathOnly: string): boolean {
  const m = method.toUpperCase();
  if (m !== 'PUT' && m !== 'DELETE') return false;
  return pathOnly.startsWith('/api/') || pathOnly === '/api';
}

async function resolveExpectedAdminToken(projectId: string): Promise<string | null> {
  const now = Date.now();
  const cached = adminTokenMem.get(projectId);
  if (cached && cached.expires > now) return cached.token;

  const file = adminTokenFile(projectId);
  try {
    if (fs.existsSync(file)) {
      const t = fs.readFileSync(file, 'utf8').trim();
      if (t) {
        adminTokenMem.set(projectId, { token: t, expires: now + ADMIN_TOKEN_CACHE_MS });
        return t;
      }
    }
  } catch {
    /* ignore */
  }

  const base = process.env.BACKEND_INTERNAL_URL;
  if (!base) return null;

  try {
    const r = await fetch(`${base}/api/internal/admin-token/${encodeURIComponent(projectId)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { token?: string };
    if (!data.token) return null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, data.token, { encoding: 'utf8', mode: 0o600 });
    } catch {
      /* ignore disk write */
    }
    adminTokenMem.set(projectId, { token: data.token, expires: now + ADMIN_TOKEN_CACHE_MS });
    return data.token;
  } catch {
    return null;
  }
}

/**
 * Blocks PUT/DELETE under /api/* unless X-Admin-Token matches derived token.
 * If token cannot be resolved, allows the request (graceful degradation).
 */
export async function assertAdminApiWriteAllowed(
  projectId: string,
  method: string,
  pathOnly: string,
  req: Request,
  res: Response,
): Promise<boolean> {
  if (!isApiPutOrDelete(method, pathOnly)) return true;

  const expected = await resolveExpectedAdminToken(projectId);
  if (!expected) return true;

  const header = (req.headers['x-admin-token'] as string | undefined)?.trim() ?? '';
  if (!header || header !== expected) {
    res.status(403).type('text/plain').send('Forbidden: missing or invalid X-Admin-Token for API write');
    return false;
  }
  return true;
}
