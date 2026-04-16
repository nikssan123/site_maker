import { randomBytes } from 'crypto';
import * as dns from 'dns/promises';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** e.g. sites.fornaxelit.com — CNAME target is `${projectId}.${HOSTING_SITES_HOST}` */
export function getHostingSitesHost(): string {
  return (process.env.HOSTING_SITES_HOST ?? '').trim().toLowerCase();
}

export function hostingSitesConfigured(): boolean {
  return getHostingSitesHost().length > 0;
}

export function cnameTargetForProject(projectId: string): string | null {
  if (!UUID_RE.test(projectId)) return null;
  const host = getHostingSitesHost();
  if (!host) return null;
  return `${projectId.toLowerCase()}.${host}`;
}

export function challengeTxtName(hostname: string): string {
  const h = normalizeHostname(hostname);
  return `_appmaker-challenge.${h}`;
}

export function challengeTxtExpectedValue(token: string): string {
  return `appmaker-verify=${token}`;
}

/** Lowercase hostname, strip protocol, path, port. */
export function normalizeHostname(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  const slash = s.indexOf('/');
  if (slash !== -1) s = s.slice(0, slash);
  const at = s.indexOf('@');
  if (at !== -1) s = s.slice(at + 1);
  const colon = s.indexOf(':');
  if (colon !== -1) s = s.slice(0, colon);
  return s.replace(/\.$/, '');
}

/**
 * Accepts hostnames like www.brand.com (no IP literals).
 * Rejects obviously invalid / internal-only abuse patterns.
 */
export function validateUserHostname(hostname: string): { ok: true; hostname: string } | { ok: false; error: string } {
  const h = normalizeHostname(hostname);
  if (!h) return { ok: false, error: 'Enter a domain name' };
  if (h.length > 253) return { ok: false, error: 'Domain name is too long' };
  if (/\s/.test(h)) return { ok: false, error: 'Invalid domain name' };
  if (!/^[a-z0-9.-]+$/.test(h)) return { ok: false, error: 'Use letters, numbers, dots, and hyphens only' };
  const labels = h.split('.');
  if (labels.length < 2) return { ok: false, error: 'Include a domain and extension (e.g. www.yoursite.com)' };
  for (const label of labels) {
    if (!label.length || label.length > 63) return { ok: false, error: 'Invalid domain name' };
    if (label.startsWith('-') || label.endsWith('-')) return { ok: false, error: 'Invalid domain name' };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return { ok: false, error: 'Use a domain name, not an IP address' };
  return { ok: true, hostname: h };
}

export function newVerificationToken(): string {
  return randomBytes(20).toString('hex');
}

async function resolveTxtFlat(fqdn: string): Promise<string[]> {
  try {
    const rows = await dns.resolveTxt(fqdn);
    return rows.flat().map((s) => s.trim());
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') return [];
    throw e;
  }
}

async function resolveCnameFlat(fqdn: string): Promise<string[]> {
  try {
    const rows = await dns.resolveCname(fqdn);
    return rows.map((s) => s.toLowerCase().replace(/\.$/, ''));
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') return [];
    throw e;
  }
}

async function resolve4Flat(fqdn: string): Promise<string[]> {
  try {
    return await dns.resolve4(fqdn);
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') return [];
    throw e;
  }
}

async function resolve6Flat(fqdn: string): Promise<string[]> {
  try {
    return await dns.resolve6(fqdn);
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') return [];
    throw e;
  }
}

/** Follow CNAME chain (limited depth) and collect all seen targets. */
async function cnameChain(host: string, maxDepth = 8): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  let current = host.toLowerCase().replace(/\.$/, '');
  for (let i = 0; i < maxDepth; i++) {
    if (seen.has(current)) break;
    seen.add(current);
    const next = await resolveCnameFlat(current);
    if (next.length === 0) break;
    for (const n of next) out.push(n);
    current = next[0];
  }
  return out;
}

export async function verifyTxtChallenge(hostname: string, token: string): Promise<boolean> {
  const name = challengeTxtName(hostname);
  const want = challengeTxtExpectedValue(token);
  const records = await resolveTxtFlat(name);
  return records.some((r) => r === want || r.includes(want));
}

export async function verifyCnamePointsToProject(
  hostname: string,
  projectId: string,
): Promise<boolean> {
  const expected = cnameTargetForProject(projectId);
  if (!expected) return false;
  const host = normalizeHostname(hostname);

  const chain = await cnameChain(host);
  if (chain.some((t) => t === expected || t.endsWith(`.${expected}`))) return true;

  // Fallback for apex domains / CNAME-flattened records (e.g. Cloudflare at @):
  // a CNAME at the apex is invalid in DNS, so Cloudflare serves flattened A/AAAA.
  // Treat the host as verified when its resolved IPs overlap with the expected
  // target's IPs — that means it's pointed at our hosting edge even though the
  // CNAME chain isn't visible in public DNS.
  const [hostA, targetA, hostAAAA, targetAAAA] = await Promise.all([
    resolve4Flat(host),
    resolve4Flat(expected),
    resolve6Flat(host),
    resolve6Flat(expected),
  ]);
  const ipv4Match = targetA.length > 0 && hostA.some((ip) => targetA.includes(ip));
  const ipv6Match = targetAAAA.length > 0 && hostAAAA.some((ip) => targetAAAA.includes(ip));
  return ipv4Match || ipv6Match;
}
