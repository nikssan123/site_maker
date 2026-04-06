import { createHmac } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { projectPath } from './fileWriter';

/** Deterministic per-project token for app-runner to validate catalog/API writes (HMAC, no DB column). */
export function deriveAdminToken(projectId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return createHmac('sha256', secret)
    .update(`admin-token:${projectId}`)
    .digest('hex')
    .slice(0, 32);
}

/** Write token file so app-runner can read without calling backend (new builds). */
export async function writeAdminTokenFile(projectId: string): Promise<void> {
  const dir = projectPath(projectId);
  const token = deriveAdminToken(projectId);
  const filePath = path.join(dir, '.admin-token');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, token, { encoding: 'utf8', mode: 0o600 });
}
