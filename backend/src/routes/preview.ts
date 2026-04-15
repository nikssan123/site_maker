import { Router } from 'express';
import { z } from 'zod';
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../middleware/requireAuth';
import { streamProjectZip } from '../lib/zipBuilder';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { allowUnpaidProjectDownload } from '../lib/devFlags';
import { ensureRunning, startPersistentHosting, stopProject, buildProject, buildHostedProject, runProject } from '../services/appRunner';
import { encrypt, decrypt } from '../lib/encryption';
import { projectPath } from '../lib/fileWriter';
import { deriveAdminToken, writeAdminTokenFile } from '../lib/adminToken';
import { FREE_ITERATION_LIMIT } from './iterate';
import { isHostingActive } from '../lib/hostingActive';

const EDIT_TOKEN_TTL_MS = 3_600_000; // 1 hour

const FS_SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.vite', 'coverage', '.pnpm', '.next', '.cache']);
const FS_MAX_LIST_ENTRIES = 5000;
const FS_MAX_TEXT_BYTES = 1_500_000; // ~1.5MB
const FS_MAX_READ_BYTES = 3_000_000; // ~3MB hard cap even for binary detection
const FS_MAX_IMAGE_PREVIEW_BYTES = 1_500_000; // base64 preview cap (~1.5MB raw)

type FsTreeNode =
  | { type: 'dir'; name: string; path: string; children: FsTreeNode[] }
  | { type: 'file'; name: string; path: string; size: number };

function normalizeFsPath(raw: string): string {
  const p = String(raw ?? '').replace(/\\/g, '/').trim();
  if (!p) return '';
  return p.replace(/^\/+/, '');
}

function resolveProjectSafePath(projectId: string, relativePath: string): { projectDir: string; absPath: string; rel: string } {
  const projectDir = projectPath(projectId);
  const rel = normalizeFsPath(relativePath);
  if (!rel) throw new AppError(400, 'Missing path');
  if (rel.includes('\0')) throw new AppError(400, 'Invalid path');
  // prevent weird Windows drive/UNC paths sneaking in
  if (/^[a-zA-Z]:\//.test(rel) || rel.startsWith('//')) throw new AppError(400, 'Invalid path');

  const absPath = path.resolve(path.join(projectDir, rel));
  const relative = path.relative(projectDir, absPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new AppError(400, 'Bad request');
  }
  return { projectDir, absPath, rel };
}

function isWithinSkippedDir(relPath: string): boolean {
  const parts = normalizeFsPath(relPath).split('/').filter(Boolean);
  return parts.some((p) => FS_SKIP_DIRS.has(p));
}

function isProbablyBinary(buf: Buffer): boolean {
  // Quick heuristic: NUL byte or high ratio of non-text bytes in first chunk.
  const n = Math.min(buf.length, 8192);
  if (n === 0) return false;
  let weird = 0;
  for (let i = 0; i < n; i++) {
    const b = buf[i];
    if (b === 0) return true;
    // allow common whitespace + printable ASCII; treat other control chars as weird
    if (b < 9 || (b > 13 && b < 32)) weird++;
  }
  return weird / n > 0.02;
}

function imageMimeFromPath(relPath: string): string | null {
  const p = relPath.toLowerCase();
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.gif')) return 'image/gif';
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  if (p.endsWith('.ico')) return 'image/x-icon';
  if (p.endsWith('.avif')) return 'image/avif';
  return null;
}

function ensureParentDir(absPath: string): void {
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
}

async function triggerRebuildAsync(projectId: string, logPrefix: string): Promise<void> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const wasPersistent = isHostingActive(project);

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'building' },
  });

  (async () => {
    try {
      await stopProject(projectId);
      const buildResult = await buildProject(projectId);
      if (!buildResult.success) {
        await prisma.project.update({
          where: { id: projectId },
          data: { status: 'error', errorLog: buildResult.log?.slice(0, 50_000) ?? 'Build failed' },
        });
        return;
      }

      if (wasPersistent) {
        const hostedBuildResult = await buildHostedProject(projectId);
        if (!hostedBuildResult.success) {
          await prisma.project.update({
            where: { id: projectId },
            data: { status: 'error', errorLog: hostedBuildResult.log?.slice(0, 50_000) ?? 'Hosted build failed' },
          });
          return;
        }
      }

      // Persistently hosted projects must be brought back up under pm2 (not a plain spawn),
      // otherwise the hosted subdomain will either collide on the port or split-brain onto
      // a separate process that doesn't see admin writes.
      const envVars: Record<string, string> = wasPersistent && project.runtimeEnv
        ? (JSON.parse(decrypt(project.runtimeEnv)) as Record<string, string>)
        : {};
      const runResult = wasPersistent
        ? await startPersistentHosting(projectId, envVars)
        : await runProject(projectId);
      if (!runResult.success) {
        await prisma.project.update({
          where: { id: projectId },
          data: { status: 'error', errorLog: runResult.log?.slice(0, 50_000) ?? 'Run failed' },
        });
        return;
      }

      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'running', runPort: runResult.port },
      });
    } catch (e) {
      console.error(`[${logPrefix}] rebuild failed for`, projectId, e);
      const msg = e instanceof Error ? e.message : String(e);
      try {
        await prisma.project.update({
          where: { id: projectId },
          data: { status: 'error', errorLog: msg.slice(0, 50_000) },
        });
      } catch {
        /* ignore */
      }
    }
  })();
}

function listFsTree(projectId: string, relDir: string): FsTreeNode[] {
  const { projectDir, absPath, rel } = resolveProjectSafePath(projectId, relDir || '.');
  const baseDir = absPath;
  if (!fs.existsSync(baseDir)) throw new AppError(404, 'Not found');
  if (!fs.statSync(baseDir).isDirectory()) throw new AppError(400, 'Path is not a directory');

  let entriesCount = 0;

  const walk = (dirAbs: string, dirRel: string): FsTreeNode[] => {
    if (entriesCount >= FS_MAX_LIST_ENTRIES) return [];
    const children: FsTreeNode[] = [];
    const names = fs.readdirSync(dirAbs, { withFileTypes: true });

    for (const ent of names) {
      if (entriesCount >= FS_MAX_LIST_ENTRIES) break;
      if (FS_SKIP_DIRS.has(ent.name)) continue;
      const childAbs = path.join(dirAbs, ent.name);
      const childRel = normalizeFsPath(path.join(dirRel, ent.name));
      if (isWithinSkippedDir(childRel)) continue;

      if (ent.isDirectory()) {
        entriesCount++;
        children.push({
          type: 'dir',
          name: ent.name,
          path: childRel,
          children: walk(childAbs, childRel),
        });
      } else if (ent.isFile()) {
        entriesCount++;
        const st = fs.statSync(childAbs);
        children.push({
          type: 'file',
          name: ent.name,
          path: childRel,
          size: st.size,
        });
      }
    }

    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return children;
  };

  // Normalize rel: '.' => ''
  const normRel = rel === '.' ? '' : rel;
  const ok = path.relative(projectDir, baseDir);
  if (ok.startsWith('..')) throw new AppError(400, 'Bad request');

  return walk(baseDir, normRel);
}

function signEditToken(projectId: string): string {
  const expires = Date.now() + EDIT_TOKEN_TTL_MS;
  const payload = `${projectId}:${expires}`;
  const sig = createHmac('sha256', process.env.JWT_SECRET!).update(payload).digest('hex');
  return `${payload}:${sig}`;
}

function verifyEditToken(token: string, projectId: string): void {
  const parts = token.split(':');
  if (parts.length !== 3) throw new AppError(403, 'Invalid token');
  const [tid, expiresStr, sig] = parts;
  if (tid !== projectId) throw new AppError(403, 'Invalid token');
  if (sig.length !== 64) throw new AppError(403, 'Invalid token');
  if (Date.now() > Number(expiresStr)) throw new AppError(403, 'Token expired');
  const expected = createHmac('sha256', process.env.JWT_SECRET!).update(`${tid}:${expiresStr}`).digest('hex');
  if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new AppError(403, 'Invalid token signature');
  }
}

/**
 * Walk all source files in the project, skipping build artifacts and dependencies.
 * Searches the entire project tree so text in data/, locales/, public/, etc. is also found.
 */
function walkSourceFiles(projectDir: string): string[] {
  const SKIP = new Set(['node_modules', 'dist', '.git', '.vite', 'coverage', '.pnpm']);
  const results: string[] = [];
  const stack = [projectDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (/\.(tsx?|jsx?|html|css|json|md)$/i.test(entry.name)) {
        results.push(full);
      }
    }
  }
  return results;
}

function ensureMuiBoxImport(content: string): string {
  if (/import[^;]*\bBox\b[^;]*from\s+['"]@mui\/material['"]/.test(content)) return content;
  const muiImportRegex = /(import\s*\{[^}]*)(}\s*from\s*['"]@mui\/material['"])/;
  if (muiImportRegex.test(content)) {
    return content.replace(muiImportRegex, '$1, Box $2');
  }
  return content;
}

function replaceMarkedLogoSlots(content: string, logoSrc: string): { content: string; count: number } {
  const logoSlotRegex = /\{\/\*\s*APPMAKER_LOGO_SLOT_START\s*\*\/\}[\s\S]*?\{\/\*\s*APPMAKER_LOGO_SLOT_END\s*\*\/\}/g;
  let count = 0;
  const replaced = content.replace(logoSlotRegex, () => {
    count += 1;
    return `{/* APPMAKER_LOGO_SLOT_START */}
<Box data-appmaker-logo-slot="true" sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
  <Box component="img" src="${logoSrc}" alt="Лого" sx={{ height: 36, width: 'auto', maxWidth: '100%', objectFit: 'contain', display: 'block' }} />
</Box>
{/* APPMAKER_LOGO_SLOT_END */}`;
  });
  return { content: count > 0 ? ensureMuiBoxImport(replaced) : content, count };
}

function replaceMarkedHeroBackground(content: string, bgSrc: string): { content: string; replaced: boolean } {
  const heroBgRegex = /(\/\*\s*APPMAKER_HERO_BG_START\s*\*\/)([\s\S]*?)(\/\*\s*APPMAKER_HERO_BG_END\s*\*\/)/;
  if (!heroBgRegex.test(content)) return { content, replaced: false };
  const heroBgBlock = `/* APPMAKER_HERO_BG_START */
backgroundImage: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${bgSrc})',
backgroundSize: 'cover',
backgroundPosition: 'center',
backgroundRepeat: 'no-repeat',
/* APPMAKER_HERO_BG_END */`;
  return {
    content: content.replace(heroBgRegex, heroBgBlock),
    replaced: true,
  };
}

import {
  validateUserHostname,
  newVerificationToken,
  cnameTargetForProject,
  hostingSitesConfigured,
  challengeTxtName,
  challengeTxtExpectedValue,
  verifyTxtChallenge,
  verifyCnamePointsToProject,
} from '../lib/customDomainHosting';

interface AdminField { name: string; type: string; }
interface AdminModel { name: string; fields: AdminField[] | null; }
interface AdminConfig { appType: string | null; models: AdminModel[]; }

function inferFieldType(field: string): string {
  const f = field.toLowerCase();
  if (/url|image|img|photo|pic|avatar|thumbnail|cover|banner|logo|picture|poster/.test(f)) return 'image';
  if (/price|cost|amount|rating|count|stock|qty|quantity|seats|year|mileage|duration|age|weight/.test(f)) return 'number';
  if (/date|createdat|updatedat|birthday|scheduledat/.test(f)) return 'date';
  if (/description|content|notes|bio|body|details|summary|message|text/.test(f)) return 'textarea';
  if (/link|href|website|profile/.test(f)) return 'url';
  return 'text';
}

/** Read __admin_config.json if present, otherwise fall back to regex-parsing server.js. */
function getAdminConfig(projectId: string): AdminConfig {
  const dir = projectPath(projectId);

  // Prefer the structured config written by the generator
  const configFile = path.join(dir, '__admin_config.json');
  if (fs.existsSync(configFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      return {
        appType: typeof raw.appType === 'string' ? raw.appType : null,
        models: Array.isArray(raw.models) ? raw.models : [],
      };
    } catch { /* fall through */ }
  }

  // Legacy fallback: parse server.js for GET /api/<model> routes
  const serverFile = path.join(dir, 'server.js');
  if (!fs.existsSync(serverFile)) return { appType: null, models: [] };
  const content = fs.readFileSync(serverFile, 'utf8');
  const regex = /(?:app|router)\.get\s*\(\s*['"`]\/api\/([a-zA-Z][a-zA-Z0-9_-]*)['"`]/g;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  return { appType: null, models: names.map((name) => ({ name, fields: null })) };
}

function applyContentPatch(projectId: string, original: string, replacement: string): void {
  const projectDir = projectPath(projectId);
  const files = walkSourceFiles(projectDir);
  const normalizePatchText = (text: string): string =>
    text
      .replace(/\u00a0/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const decodeSimpleJsxString = (value: string): string =>
    value
      .replace(/\\n/g, ' ')
      .replace(/\\r/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
  const normalizeRenderedJsxText = (body: string): string =>
    normalizePatchText(
      body
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/\{`([\s\S]*?)`\}/g, (_, value: string) => ` ${value} `)
        .replace(/\{"((?:\\.|[^"])*)"\}/g, (_, value: string) => ` ${decodeSimpleJsxString(value)} `)
        .replace(/\{'((?:\\.|[^'])*)'\}/g, (_, value: string) => ` ${decodeSimpleJsxString(value)} `)
        .replace(/\{[^}]+\}/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' '),
    );
  const canReplaceInlineJsxBody = (body: string): boolean => {
    if (/<(?:Box|Stack|Grid|Container|Paper|Card|section|article|aside|main|header|footer|nav|div|ul|ol|li|table|tbody|thead|tr|td|th|form)\b/i.test(body)) {
      return false;
    }
    if (/\{[^}]*\b(map|filter|reduce|forEach|=>|return|if\s*\(|\?)\b[^}]*\}/.test(body)) {
      return false;
    }
    return true;
  };
  const replacementExpression = `{${JSON.stringify(replacement)}}`;

  // Never patch server.js via edit mode (too easy to break runtime JS strings).
  const serverFile = path.join(projectDir, 'server.js');
  const serverContent = fs.existsSync(serverFile) ? fs.readFileSync(serverFile, 'utf8') : null;
  const serverHasOriginal = Boolean(serverContent && serverContent.includes(original));

  const patchableFiles = files.filter((f) => path.basename(f).toLowerCase() !== 'server.js');

  // Read all patchable files once — avoids double I/O and TOCTOU races.
  const fileContents: Array<{ path: string; content: string }> = patchableFiles.map((f) => ({
    path: f,
    content: fs.readFileSync(f, 'utf8'),
  }));

  // Pass 1 — exact match (prefer JSX/TSX files over JSON/CSS for ambiguous hits)
  const jsxFirst = [...fileContents].sort((a, b) => {
    const aJsx = /\.[jt]sx?$/i.test(a.path) ? 0 : 1;
    const bJsx = /\.[jt]sx?$/i.test(b.path) ? 0 : 1;
    return aJsx - bJsx;
  });
  for (const { path: fp, content } of jsxFirst) {
    if (content.includes(original)) {
      fs.writeFileSync(fp, content.replace(original, replacement), 'utf8');
      return;
    }
  }

  // Pass 2 — whitespace-flexible match (handles JSX indentation / innerText normalisation)
  const norm = normalizePatchText(original);
  if (norm.length > 0) {
    const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flexRegex = new RegExp(escaped.replace(/ /g, '\\s+'));
    for (const { path: fp, content } of jsxFirst) {
      const m = flexRegex.exec(content);
      if (m) {
        fs.writeFileSync(fp, content.replace(m[0], replacement), 'utf8');
        return;
      }
    }
  }

  // Pass 3 — rendered-text JSX match for multiline hero copy split by inline tags or <br/>.
  // When the body contains inline children (<span>, <a>, …), we MUST NOT replace the whole
  // body — that erases those elements and their attributes. Instead, locate the single
  // JSXText segment whose normalized value equals the normalized `original` and replace only
  // that segment. If no single segment accounts for the match, refuse with 422.
  const hasInlineJsxChildren = (body: string): boolean => /<[A-Za-z]/.test(body);
  // Split a JSX body into text segments, skipping over tags and {expressions}. Returns
  // [{ text, start, end }] where start/end are offsets within `body`.
  const splitJsxTextSegments = (body: string): Array<{ text: string; start: number; end: number }> => {
    const segments: Array<{ text: string; start: number; end: number }> = [];
    let i = 0;
    let segStart = 0;
    let braceDepth = 0;
    while (i < body.length) {
      const ch = body[i];
      if (braceDepth === 0 && ch === '<') {
        if (i > segStart) segments.push({ text: body.slice(segStart, i), start: segStart, end: i });
        const tagEnd = body.indexOf('>', i);
        if (tagEnd === -1) { i = body.length; break; }
        i = tagEnd + 1;
        segStart = i;
        continue;
      }
      if (ch === '{') {
        if (braceDepth === 0 && i > segStart) {
          segments.push({ text: body.slice(segStart, i), start: segStart, end: i });
        }
        braceDepth++;
        i++;
        continue;
      }
      if (ch === '}') {
        braceDepth = Math.max(0, braceDepth - 1);
        i++;
        if (braceDepth === 0) segStart = i;
        continue;
      }
      i++;
    }
    if (braceDepth === 0 && segStart < body.length) {
      segments.push({ text: body.slice(segStart), start: segStart, end: body.length });
    }
    return segments;
  };

  for (const { path: fp, content } of jsxFirst) {
    if (!/\.[jt]sx$/i.test(fp)) continue;
    const elementRegex = /<([A-Za-z][\w.]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
    let match: RegExpExecArray | null;
    while ((match = elementRegex.exec(content)) !== null) {
      const full = match[0];
      const body = match[2] ?? '';
      if (!body.trim() || !canReplaceInlineJsxBody(body)) continue;
      if (normalizeRenderedJsxText(body) !== norm) continue;

      const bodyStart = match.index + full.indexOf(body);

      if (!hasInlineJsxChildren(body)) {
        // Pure text body — safe to replace the whole body with a JSX string literal.
        const updated = full.replace(body, replacementExpression);
        fs.writeFileSync(fp, content.slice(0, match.index) + updated + content.slice(match.index + full.length), 'utf8');
        return;
      }

      // Body contains inline children. Find the single JSXText segment whose normalized
      // value equals `norm`. If found, replace only that segment; otherwise refuse.
      const segments = splitJsxTextSegments(body);
      const matchingSegments = segments.filter((s) => normalizePatchText(s.text) === norm);
      if (matchingSegments.length === 1) {
        const seg = matchingSegments[0];
        // Preserve leading/trailing whitespace of the segment so JSX formatting stays intact.
        const leading = seg.text.match(/^\s*/)?.[0] ?? '';
        const trailing = seg.text.match(/\s*$/)?.[0] ?? '';
        const replaced = leading + replacement + trailing;
        const absStart = bodyStart + seg.start;
        const absEnd = bodyStart + seg.end;
        fs.writeFileSync(fp, content.slice(0, absStart) + replaced + content.slice(absEnd), 'utf8');
        return;
      }

      throw new AppError(
        422,
        'This text is split across inline elements (e.g. <span>). Click directly on the specific word you want to change and edit it alone.',
      );
    }
  }

  if (serverHasOriginal) {
    throw new AppError(
      409,
      'Този текст се намира само в server.js и не може да бъде редактиран в Edit Mode (за да не се чупи бекендът). ' +
      'Променете съдържанието през Iteration/чат или преместете данните в отделен JSON/контент файл.',
    );
  }

  throw new AppError(404, 'Original text not found in any source file');
}

const router = Router();

function customDomainPayload(project: {
  id: string;
  customDomain: string | null;
  customDomainVerifiedAt: Date | null;
  domainVerificationToken: string | null;
}) {
  const token = project.domainVerificationToken;
  const firstPartyRoot = firstPartyRootDomain();
  const isFirstPartySubdomain = Boolean(
    firstPartyRoot &&
      project.customDomain &&
      project.domainVerificationToken === null &&
      project.customDomain.endsWith(`.${firstPartyRoot}`),
  );
  const firstPartySlug =
    isFirstPartySubdomain && firstPartyRoot && project.customDomain
      ? project.customDomain.slice(0, -(firstPartyRoot.length + 1))
      : null;
  const cnameTarget = cnameTargetForProject(project.id);
  const pending = Boolean(project.customDomain && token && !project.customDomainVerifiedAt);
  return {
    customDomain: project.customDomain,
    customDomainVerifiedAt: project.customDomainVerifiedAt?.toISOString() ?? null,
    domainKind: isFirstPartySubdomain
      ? ('first_party_subdomain' as const)
      : project.customDomain
        ? ('custom_domain' as const)
        : null,
    firstPartyRootDomain: firstPartyRoot,
    firstPartySlug,
    hostingSitesConfigured: hostingSitesConfigured(),
    cnameTarget,
    challengeTxtName: pending && project.customDomain ? challengeTxtName(project.customDomain) : null,
    challengeTxtValue: pending && token ? challengeTxtExpectedValue(token) : null,
  };
}

function firstPartyRootDomain(): string | null {
  const raw = (process.env.FIRST_PARTY_ROOT_DOMAIN ?? '').trim().toLowerCase();
  return raw.length > 0 ? raw : null;
}

function validateSubdomainSlug(raw: string): { ok: true; slug: string } | { ok: false; error: string } {
  const slug = raw.trim().toLowerCase();
  if (!slug) return { ok: false, error: 'Въведете име (поддомейн)' };
  if (slug.length < 3) return { ok: false, error: 'Името трябва да е поне 3 символа' };
  if (slug.length > 40) return { ok: false, error: 'Името е твърде дълго' };
  if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, error: 'Използвайте само латински букви, цифри и тирета' };
  if (slug.startsWith('-') || slug.endsWith('-')) return { ok: false, error: 'Името не може да започва/завършва с тире' };
  return { ok: true, slug };
}

// First-party subdomain (e.g. mysite.website.com) — hosted projects only
router.put('/:projectId/subdomain', requireAuth, async (req, res, next) => {
  try {
    const root = firstPartyRootDomain();
    if (!root) throw new AppError(400, 'FIRST_PARTY_ROOT_DOMAIN is not configured on the server');

    const projectId = String(req.params.projectId);
    const { slug: rawSlug } = z.object({ slug: z.string() }).parse(req.body);
    const parsed = validateSubdomainSlug(rawSlug);
    if (!parsed.ok) throw new AppError(400, parsed.error);

    const hostname = `${parsed.slug}.${root}`;

    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    if (!isHostingActive(project) || !project.paid) {
      throw new AppError(403, 'Subdomains are available for hosted projects');
    }

    const taken = await prisma.project.findFirst({
      where: { customDomain: hostname, NOT: { id: project.id } },
      select: { id: true },
    });
    if (taken) throw new AppError(409, 'Това име вече е заето');

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        customDomain: hostname,
        customDomainVerifiedAt: new Date(), // our own domain — no DNS verification needed
        domainVerificationToken: null,
      },
    });

    return res.json(customDomainPayload(updated));
  } catch (err) {
    return next(err);
  }
});

// BYO custom domain (hosted projects)
router.get('/:projectId/custom-domain', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    if (!isHostingActive(project) || !project.paid) {
      throw new AppError(403, 'Custom domains are available for hosted projects');
    }
    return res.json(customDomainPayload(project));
  } catch (err) {
    return next(err);
  }
});

router.put('/:projectId/custom-domain', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const { customDomain: raw } = z.object({ customDomain: z.string() }).parse(req.body);
    const parsed = validateUserHostname(raw);
    if (!parsed.ok) throw new AppError(400, parsed.error);

    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    if (!isHostingActive(project) || !project.paid) {
      throw new AppError(403, 'Custom domains are available for hosted projects');
    }

    const taken = await prisma.project.findFirst({
      where: {
        customDomain: parsed.hostname,
        NOT: { id: project.id },
      },
    });
    if (taken) throw new AppError(409, 'That domain is already connected to another project');

    const token =
      project.customDomain === parsed.hostname && project.domainVerificationToken
        ? project.domainVerificationToken
        : newVerificationToken();

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        customDomain: parsed.hostname,
        domainVerificationToken: token,
        customDomainVerifiedAt:
          project.customDomain === parsed.hostname ? project.customDomainVerifiedAt : null,
      },
    });

    return res.json(customDomainPayload(updated));
  } catch (err) {
    return next(err);
  }
});

router.post('/:projectId/custom-domain/verify', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    if (!isHostingActive(project) || !project.paid) {
      throw new AppError(403, 'Custom domains are available for hosted projects');
    }
    if (!project.customDomain || !project.domainVerificationToken) {
      throw new AppError(400, 'Save a domain name first');
    }

    const token = project.domainVerificationToken;
    const host = project.customDomain;

    const txtOk = await verifyTxtChallenge(host, token);
    const needCname = hostingSitesConfigured();
    const cnameOk = needCname ? await verifyCnamePointsToProject(host, project.id) : true;

    if (!txtOk || !cnameOk) {
      return res.status(400).json({
        ok: false,
        txtRecordOk: txtOk,
        cnameOk: needCname ? cnameOk : null,
        message: needCname
          ? 'DNS checks failed. Confirm TXT and CNAME records, then wait a few minutes for propagation.'
          : 'TXT record not found yet. After it verifies, set HOSTING_SITES_HOST on the server and add the CNAME to finish routing.',
      });
    }

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { customDomainVerifiedAt: new Date() },
    });

    return res.json({ ok: true, ...customDomainPayload(updated) });
  } catch (err) {
    return next(err);
  }
});

router.delete('/:projectId/custom-domain', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    if (!isHostingActive(project) || !project.paid) {
      throw new AppError(403, 'Custom domains are available for hosted projects');
    }

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        customDomain: null,
        customDomainVerifiedAt: null,
        domainVerificationToken: null,
      },
    });
    return res.json(customDomainPayload(updated));
  } catch (err) {
    return next(err);
  }
});

/**
 * Save env vars for a project.
 * buildEnv  — public keys (must start with VITE_), baked into the JS bundle at build time.
 * runtimeEnv — secret keys, encrypted before storage, injected into process env only at start time.
 *
 * Secret values are NEVER returned in any response — the frontend can only see which keys are configured.
 */
router.put('/:projectId/env', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const { buildEnv, runtimeEnv } = z
      .object({
        buildEnv: z.record(z.string()).optional(),
        runtimeEnv: z.record(z.string()).optional(),
      })
      .parse(req.body);

    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });

    // Enforce: build-time env keys must be VITE_ prefixed (public values only)
    if (buildEnv) {
      for (const key of Object.keys(buildEnv)) {
        if (!key.startsWith('VITE_')) {
          throw new AppError(
            400,
            `Build env key "${key}" must start with VITE_ — secret keys belong in runtimeEnv`,
          );
        }
      }
    }

    const encryptedRuntime =
      runtimeEnv && Object.keys(runtimeEnv).length > 0
        ? encrypt(JSON.stringify(runtimeEnv))
        : undefined;

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        ...(buildEnv !== undefined ? { buildEnv } : {}),
        ...(encryptedRuntime !== undefined ? { runtimeEnv: encryptedRuntime } : {}),
      },
    });

    // For hosted full-stack apps: restart with new env vars immediately
    if (isHostingActive(updated) && updated.runtimeEnv) {
      const envVars = JSON.parse(decrypt(updated.runtimeEnv)) as Record<string, string>;
      startPersistentHosting(projectId, envVars)
        .then(async (result) => {
          if (result.success && result.port) {
            await prisma.project.update({
              where: { id: project.id },
              data: { runPort: result.port },
            });
          }
        })
        .catch((err) => console.error('[env update] persistent restart failed', err));
    }

    return res.json({
      buildEnvKeys: Object.keys((updated.buildEnv as Record<string, string>) ?? {}),
      runtimeEnvConfigured: Boolean(updated.runtimeEnv),
    });
  } catch (err) {
    return next(err);
  }
});

// Get project status + port for preview
router.get('/:projectId', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });

    const iterationsTotal = await prisma.iterationLog.count({
      where: { projectId: project.id },
    });

    const unpaidDownloadOk = allowUnpaidProjectDownload();

    // Ensure the vite preview process is alive (it dies when app-runner restarts).
    // Update runPort in DB if app-runner assigned a new port.
    let runPort = project.runPort;
    if (project.status === 'running' && runPort) {
      try {
        const runner = await ensureRunning(project.id);
        if (runner.success && runner.port && runner.port !== runPort) {
          runPort = runner.port;
          await prisma.project.update({ where: { id: project.id }, data: { runPort } });
        }
      } catch {
        // non-fatal — frontend will show a retry option
      }
    }

    // Check if the plan requires payments (so frontend can show a "connect Stripe" notice)
    const session = await prisma.session.findUnique({
      where: { id: project.sessionId },
      include: { plan: { select: { data: true } } },
    });
    const planData = (session?.plan?.data as Record<string, unknown> | null) ?? null;
    const planNeedsPayments = planData?.paymentsEnabled === true;
    const planAppType = planData && typeof planData.appType === 'string' ? planData.appType : null;
    const planHasContactForm = (() => {
      const desc = planData && typeof planData.description === 'string' ? planData.description : '';
      const pages = planData && Array.isArray(planData.pages) ? planData.pages : [];
      const features = planData && Array.isArray(planData.features) ? planData.features : [];
      const hay = [desc, ...pages, ...features].filter((x) => typeof x === 'string').join(' ').toLowerCase();
      return /(contact|inquiry|inquiries|message|messages|контакт|запит|запитван)/i.test(hay);
    })();

    return res.json({
      id: project.id,
      sessionId: project.sessionId,
      status: project.status,
      runPort,
      fixAttempts: project.fixAttempts,
      paid: project.paid,
      hosted: isHostingActive(project),
      customDomain: project.customDomain,
      customDomainVerifiedAt: project.customDomainVerifiedAt?.toISOString() ?? null,
      /** Server allows ZIP download without payment (ALLOW_UNPAID_PROJECT_DOWNLOAD=true). */
      allowUnpaidDownload: unpaidDownloadOk,
      iterationsTotal,
      paidIterationCredits: project.paidIterationCredits,
      freeIterationLimit: FREE_ITERATION_LIMIT,
      paymentsEnabled: project.paymentsEnabled ?? false,
      planNeedsPayments,
      planAppType,
      planHasContactForm,
    });
  } catch (err) {
    return next(err);
  }
});

// Upload an image for a project. Accepts base64-encoded data URL in JSON body.
// Saves to projects/:id/uploads/ and returns a URL served by app-runner.
router.post('/:projectId/upload-image', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });

    const { data, filename: originalName } = z.object({
      data: z.string().max(10_000_000), // ~7.5 MB max base64
      filename: z.string().max(255),
    }).parse(req.body);

    const match = data.match(/^data:(image\/[a-z+]+);base64,/);
    if (!match) throw new AppError(400, 'Invalid image data URL');

    const mimeType = match[1];
    const base64 = data.slice(match[0].length);
    const extFromMime: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
      'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif',
    };
    const ext = extFromMime[mimeType] ??
      (originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : 'jpg');

    const safeExt = ext.replace(/[^a-z0-9]/g, '');
    const filename = `${randomUUID()}.${safeExt}`;
    const uploadsDir = path.join(projectPath(projectId), 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(base64, 'base64'));

    return res.json({ url: `/preview-app/${projectId}/uploads/${filename}` });
  } catch (err) {
    return next(err);
  }
});

// Replace the logo in the generated site's navbar with an uploaded image and rebuild
router.post('/:projectId/replace-logo', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });

    const { data, filename: originalName } = z.object({
      data: z.string().max(10_000_000),
      filename: z.string().max(255),
    }).parse(req.body);

    const match = data.match(/^data:(image\/[a-z+]+);base64,/);
    if (!match) throw new AppError(400, 'Invalid image data URL');

    const mimeType = match[1];
    const base64 = data.slice(match[0].length);
    const extFromMime: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
      'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif',
    };
    const ext = extFromMime[mimeType] ??
      (originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : 'png');
    const safeExt = ext.replace(/[^a-z0-9]/g, '');
    const filename = `logo.${safeExt}`;

    // Save logo to public/ so it's served as a static asset by vite/express
    const publicDir = path.join(projectPath(projectId), 'public');
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, filename), Buffer.from(base64, 'base64'));

    const logoSrc = `/${filename}`;

    // Scan source files for the navbar logo and replace it
    const projectDir = projectPath(projectId);
    const files = walkSourceFiles(projectDir);
    const tsxFiles = files.filter((f) => /\.(tsx|jsx)$/i.test(f));

    // Logo in generated sites typically appears as:
    //   <Typography ... component="..." sx={{...}}>SiteName</Typography>
    //   or <IconComponent ... /> next to a Typography inside Toolbar
    // We look for the first Typography-with-text inside a Toolbar/AppBar context.
    // Strategy: find a file containing "Toolbar" and within it the logo Typography pattern.

    const logoImgJsx = `<Box component="img" src="${logoSrc}" alt="Logo" sx={{ height: 36, mr: 1, objectFit: 'contain' }} />`;
    let replaced = false;

    for (const file of tsxFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const marked = replaceMarkedLogoSlots(content, logoSrc);
      if (marked.count > 0) {
        fs.writeFileSync(file, marked.content, 'utf8');
        replaced = true;
      }
    }

    if (replaced) {
      await triggerRebuildAsync(project.id, 'logo-replace');
      return res.json({ ok: true, autoPlaced: true, logoUrl: logoSrc });
    }

    for (const file of tsxFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (!/<Toolbar/i.test(content) && !/<AppBar/i.test(content)) continue;

      // Pattern 1: <Typography ... component="..." ...>SiteName</Typography> inside toolbar area
      // This captures the logo text Typography — usually the first Typography after <Toolbar>
      const logoTypographyRegex = /(<Toolbar[\s\S]*?)(<Typography\b[^>]*?(?:variant=["']h[456]["']|fontWeight|letterSpacing|fontFamily)[\s\S]*?>)([\s\S]*?)(<\/Typography>)/;
      const m = logoTypographyRegex.exec(content);
      if (m) {
        // Replace the Typography content with the logo image + keep the text as well
        const originalTypography = m[2] + m[3] + m[4];
        const replacement = `<Box sx={{ display: 'flex', alignItems: 'center' }}>${logoImgJsx}${m[2]}${m[3]}${m[4]}</Box>`;
        fs.writeFileSync(file, content.replace(originalTypography, replacement), 'utf8');

        // Ensure Box is imported
        const updatedContent = fs.readFileSync(file, 'utf8');
        if (!/import[^;]*\bBox\b[^;]*from\s+['"]@mui\/material/.test(updatedContent)) {
          // Add Box to existing @mui/material import
          const muiImportRegex = /(import\s*\{[^}]*)(}\s*from\s*['"]@mui\/material['"])/;
          const muiMatch = muiImportRegex.exec(updatedContent);
          if (muiMatch) {
            const withBox = updatedContent.replace(muiImportRegex, `$1, Box $2`);
            fs.writeFileSync(file, withBox, 'utf8');
          }
        }
        replaced = true;
        break;
      }

      // Pattern 2: Just an icon before a Typography in the toolbar (e.g. <SomeIcon /> <Typography ...>)
      const iconLogoRegex = /(<Toolbar[\s\S]*?)(<[A-Z]\w*Icon\b[^/]*\/>)(\s*<Typography)/;
      const m2 = iconLogoRegex.exec(content);
      if (m2) {
        // Replace the icon with the logo image
        fs.writeFileSync(file, content.replace(m2[2], logoImgJsx), 'utf8');

        const updatedContent = fs.readFileSync(file, 'utf8');
        if (!/import[^;]*\bBox\b[^;]*from\s+['"]@mui\/material/.test(updatedContent)) {
          const muiImportRegex = /(import\s*\{[^}]*)(}\s*from\s*['"]@mui\/material['"])/;
          const muiMatch = muiImportRegex.exec(updatedContent);
          if (muiMatch) {
            fs.writeFileSync(file, updatedContent.replace(muiImportRegex, `$1, Box $2`), 'utf8');
          }
        }
        replaced = true;
        break;
      }
    }

    if (!replaced) {
      // Fallback: if no pattern matched, still save the file — the user can reference it via iterations
      // Return success but indicate the logo was saved but not auto-placed
      await triggerRebuildAsync(project.id, 'logo-replace');
      return res.json({ ok: true, autoPlaced: false, logoUrl: logoSrc });
    }

    await triggerRebuildAsync(project.id, 'logo-replace');
    return res.json({ ok: true, autoPlaced: true, logoUrl: logoSrc });
  } catch (err) {
    return next(err);
  }
});

// Replace or add a background image to the hero / main section of the generated site
router.post('/:projectId/replace-hero-bg', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });

    const { data, filename: originalName } = z.object({
      data: z.string().max(10_000_000),
      filename: z.string().max(255),
    }).parse(req.body);

    const match = data.match(/^data:(image\/[a-z+]+);base64,/);
    if (!match) throw new AppError(400, 'Invalid image data URL');

    const mimeType = match[1];
    const base64 = data.slice(match[0].length);
    const extFromMime: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
      'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif',
    };
    const ext = extFromMime[mimeType] ??
      (originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : 'jpg');
    const safeExt = ext.replace(/[^a-z0-9]/g, '');
    const filename = `hero-bg.${safeExt}`;

    const publicDir = path.join(projectPath(projectId), 'public');
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, filename), Buffer.from(base64, 'base64'));

    const bgSrc = `/${filename}`;

    const projectDir = projectPath(projectId);
    const files = walkSourceFiles(projectDir);
    const tsxFiles = files.filter((f) => /\.(tsx|jsx)$/i.test(f));

    // Generated hero sections follow a few patterns. We look for the first Box with a large
    // background/gradient that lives in the main page or App component (not the AppBar).
    // Common markers: minHeight: '...vh', background: 'linear-gradient', py: {xs: 8+}
    let replaced = false;

    for (const file of tsxFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const marked = replaceMarkedHeroBackground(content, bgSrc);
      if (marked.replaced) {
        fs.writeFileSync(file, marked.content, 'utf8');
        replaced = true;
        break;
      }
    }

    if (replaced) {
      await triggerRebuildAsync(project.id, 'hero-bg-replace');
      return res.json({ ok: true, autoPlaced: true, imageUrl: bgSrc });
    }

    for (const file of tsxFiles) {
      const content = fs.readFileSync(file, 'utf8');

      // Skip files that are clearly not the main page / hero
      const basename = path.basename(file).toLowerCase();
      if (/theme|server|test|spec/i.test(basename)) continue;

      // Strategy: find a <Box sx={{ ... with hero-like indicators (minHeight with vh, large py, background gradient)
      // then inject backgroundImage into the sx prop.

      // Pattern: <Box ... sx={{ ... background: '..gradient..' ... minHeight: '..vh' ... }}
      // or <Box ... sx={{ ... minHeight: '..vh' ... py: ... }}
      // We match the opening of the sx prop for the hero Box.
      const heroPatterns = [
        // Box with both minHeight vh and background/gradient
        /(<Box\b[^>]*\bsx=\{\{[^}]*?)(minHeight:\s*['"][4-9]\d*vh['"]|minHeight:\s*['"]100vh['"])/,
        // Box with background linear-gradient and large padding
        /(<Box\b[^>]*\bsx=\{\{[^}]*?)(background:\s*['"]linear-gradient[\s\S]*?['"])/,
        // Box component="section" or similar with large padding (py >= 8)
        /(<Box\b[^>]*\bsx=\{\{[^}]*?)(py:\s*\{?\s*(?:xs:\s*)?(?:[89]|1[0-9]|2[0-9]))/,
      ];

      for (const pattern of heroPatterns) {
        const m = pattern.exec(content);
        if (!m) continue;

        // Verify this is above-the-fold hero, not a random section: check it appears
        // in the first ~40% of the file or has hero-like sibling content (h1/h2/variant="h2"/variant="h3")
        const pos = m.index;
        const isNearTop = pos < content.length * 0.45;
        const surroundingChunk = content.slice(Math.max(0, pos - 200), Math.min(content.length, pos + 2000));
        const hasHeroContent = /variant=["']h[12345]["']|<h[12]\b/i.test(surroundingChunk);

        if (!isNearTop && !hasHeroContent) continue;

        // Find the sx={{ opening for this Box to inject backgroundImage
        // We need to locate the sx={{ ... }} block and add backgroundImage property
        const sxStart = content.lastIndexOf('sx={{', pos + m[0].length);
        const actualSxStart = sxStart >= m.index ? sxStart : content.indexOf('sx={{', m.index);
        if (actualSxStart === -1) continue;

        // Insert right after sx={{
        const insertPos = actualSxStart + 'sx={{'.length;

        const bgStyles = ` backgroundImage: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${bgSrc})', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',`;

        const patched = content.slice(0, insertPos) + bgStyles + content.slice(insertPos);
        fs.writeFileSync(file, patched, 'utf8');
        replaced = true;
        break;
      }
      if (replaced) break;
    }

    if (!replaced) {
      await triggerRebuildAsync(project.id, 'hero-bg-replace');
      return res.json({ ok: true, autoPlaced: false, imageUrl: bgSrc });
    }

    await triggerRebuildAsync(project.id, 'hero-bg-replace');
    return res.json({ ok: true, autoPlaced: true, imageUrl: bgSrc });
  } catch (err) {
    return next(err);
  }
});

// Return admin config: appType + typed model fields (from __admin_config.json or regex fallback)
router.get('/:projectId/catalog-models', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    const config = getAdminConfig(projectId);
    return res.json(config);
  } catch (err) {
    return next(err);
  }
});

// Iteration history for the improvements panel
router.get('/:projectId/iteration-history', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    const logs = await prisma.iterationLog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.json(logs);
  } catch (err) {
    return next(err);
  }
});

// Generate a short-lived HMAC edit token for the preview iframe
router.get('/:projectId/edit-token', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    return res.json({ token: signEditToken(projectId) });
  } catch (err) {
    return next(err);
  }
});

// Stable admin token for X-Admin-Token on catalog / generated-app API writes (app-runner enforces PUT/DELETE)
router.get('/:projectId/admin-token', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    return res.json({ token: deriveAdminToken(projectId) });
  } catch (err) {
    return next(err);
  }
});

// Apply an inline content edit (text/image replacement) and trigger a rebuild
router.patch('/:projectId/content', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const { token, original, replacement } = z.object({
      token: z.string(),
      original: z.string().min(1),
      replacement: z.string(),
    }).parse(req.body);

    verifyEditToken(token, projectId);

    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });

    // Reject edits while a rebuild is already in progress to prevent races
    if (project.status === 'building' || project.status === 'generating') {
      throw new AppError(409, 'A rebuild is already in progress. Please wait and try again.');
    }

    applyContentPatch(projectId, original, replacement);

    await triggerRebuildAsync(project.id, 'content-patch');

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Unlocked project filesystem API (paid projects only)

router.get('/:projectId/fs/tree', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const dir = typeof req.query.dir === 'string' ? req.query.dir : '';
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    if (!project.paid) throw new AppError(402, 'Purchase this project to edit files', 'payment_required');

    const children = listFsTree(projectId, dir || '.');
    return res.json({ dir: normalizeFsPath(dir), children });
  } catch (err) {
    return next(err);
  }
});

router.get('/:projectId/fs/file', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const filePath = typeof req.query.path === 'string' ? req.query.path : '';
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    if (!project.paid) throw new AppError(402, 'Purchase this project to edit files', 'payment_required');

    if (isWithinSkippedDir(filePath)) throw new AppError(403, 'This path is not accessible');
    const { absPath, rel } = resolveProjectSafePath(projectId, filePath);
    if (!fs.existsSync(absPath)) throw new AppError(404, 'Not found');
    const st = fs.statSync(absPath);
    if (!st.isFile()) throw new AppError(400, 'Not a file');
    if (st.size > FS_MAX_READ_BYTES) throw new AppError(413, 'File is too large to open in editor');

    const buf = fs.readFileSync(absPath);
    const imgMime = imageMimeFromPath(rel);
    if (imgMime) {
      if (buf.length > FS_MAX_IMAGE_PREVIEW_BYTES) {
        return res.json({ path: rel, encoding: 'binary', kind: 'image', mime: imgMime, size: st.size });
      }
      const b64 = buf.toString('base64');
      const dataUrl = `data:${imgMime};base64,${b64}`;
      return res.json({ path: rel, encoding: 'binary', kind: 'image', mime: imgMime, size: st.size, dataUrl });
    }
    const binary = isProbablyBinary(buf);
    if (binary) {
      return res.json({ path: rel, encoding: 'binary', size: st.size });
    }
    if (buf.length > FS_MAX_TEXT_BYTES) throw new AppError(413, 'File is too large to edit safely');
    const content = buf.toString('utf8');
    return res.json({ path: rel, encoding: 'utf8', size: st.size, content });
  } catch (err) {
    return next(err);
  }
});

router.put('/:projectId/fs/file', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const { path: filePath, content, highRiskAck } = z.object({
      path: z.string().min(1),
      content: z.string(),
      highRiskAck: z.boolean().optional(),
    }).parse(req.body);

    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    if (!project.paid) throw new AppError(402, 'Purchase this project to edit files', 'payment_required');

    if (isWithinSkippedDir(filePath)) throw new AppError(403, 'This path is not accessible');

    const rel = normalizeFsPath(filePath);
    const isServer = rel.toLowerCase().endsWith('server.js') || path.basename(rel).toLowerCase() === 'server.js';
    if (isServer && highRiskAck !== true) {
      throw new AppError(
        400,
        'Editing server.js is high risk and can break the preview/back-end. Confirm the high-risk checkbox to proceed.',
      );
    }

    const { absPath } = resolveProjectSafePath(projectId, rel);
    ensureParentDir(absPath);
    if (content.length > FS_MAX_TEXT_BYTES * 2) throw new AppError(413, 'File is too large to save');
    fs.writeFileSync(absPath, content, 'utf8');

    await triggerRebuildAsync(project.id, 'fs-write');
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.post('/:projectId/fs/mkdir', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const { path: dirPath } = z.object({ path: z.string().min(1) }).parse(req.body);
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    if (!project.paid) throw new AppError(402, 'Purchase this project to edit files', 'payment_required');
    if (isWithinSkippedDir(dirPath)) throw new AppError(403, 'This path is not accessible');

    const { absPath } = resolveProjectSafePath(projectId, dirPath);
    fs.mkdirSync(absPath, { recursive: true });
    await triggerRebuildAsync(project.id, 'fs-mkdir');
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.post('/:projectId/fs/rename', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const { from, to } = z.object({ from: z.string().min(1), to: z.string().min(1) }).parse(req.body);
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    if (!project.paid) throw new AppError(402, 'Purchase this project to edit files', 'payment_required');
    if (isWithinSkippedDir(from) || isWithinSkippedDir(to)) throw new AppError(403, 'This path is not accessible');

    const src = resolveProjectSafePath(projectId, from).absPath;
    const dst = resolveProjectSafePath(projectId, to).absPath;
    if (!fs.existsSync(src)) throw new AppError(404, 'Not found');
    ensureParentDir(dst);
    fs.renameSync(src, dst);

    await triggerRebuildAsync(project.id, 'fs-rename');
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.delete('/:projectId/fs/entry', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const entryPath = typeof req.query.path === 'string' ? req.query.path : '';
    const recursive = String(req.query.recursive ?? '') === 'true';
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    if (!project.paid) throw new AppError(402, 'Purchase this project to edit files', 'payment_required');
    if (isWithinSkippedDir(entryPath)) throw new AppError(403, 'This path is not accessible');

    const { absPath } = resolveProjectSafePath(projectId, entryPath);
    if (!fs.existsSync(absPath)) throw new AppError(404, 'Not found');
    const st = fs.statSync(absPath);
    if (st.isDirectory()) {
      const children = fs.readdirSync(absPath);
      if (children.length > 0 && !recursive) {
        throw new AppError(400, 'Directory is not empty (pass recursive=true to delete)');
      }
      fs.rmSync(absPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(absPath);
    }

    await triggerRebuildAsync(project.id, 'fs-delete');
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// Download as ZIP (requires paid project)
router.get('/:projectId/download', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });

    if (!project.paid && !allowUnpaidProjectDownload()) {
      throw new AppError(402, 'Purchase this project to download it', 'payment_required');
    }

    return streamProjectZip(project.id, res);
  } catch (err) {
    return next(err);
  }
});

export default router;
