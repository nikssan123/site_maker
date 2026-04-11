import path from 'path';
import fs from 'fs';
import http from 'http';
import express from 'express';
import cors from 'cors';

import { createProxyMiddleware } from 'http-proxy-middleware';
import {
  BASE_DIR,
  install,
  build,
  run,
  stop,
  startPersistent,
  stopPersistent,
  assignedPorts,
  isFullStack,
  isProcessAlive,
  hasPreviewableFiles,
} from './runner';
import { EDIT_OVERLAY_SCRIPT } from './editOverlayScript';
import { assertAdminApiWriteAllowed, normalizeSubPathToUrlPath } from './adminApiGate';

/**
 * Inject the edit-mode overlay script into an HTML page.
 * The token is embedded as a JS global so the IIFE can read it.
 */
function injectEditOverlay(html: string, token: string): string {
  const safeToken = JSON.stringify(token); // escapes any special chars; token is UUID:timestamp:hex so safe
  const tag = `<script>window.__editToken=${safeToken};\n${EDIT_OVERLAY_SCRIPT}</script>`;
  return html.replace(/<\/body>/i, `${tag}</body>`);
}

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL;

function sendPageViewBeacon(
  projectId: string,
  path: string,
  referrer: string | undefined,
  userAgent: string | undefined,
  ip: string | undefined,
) {
  if (!BACKEND_URL) return;
  fetch(`${BACKEND_URL}/api/analytics/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, path, referrer, userAgent, ip }),
  }).catch(() => {}); // fire-and-forget
}

/** HTML navigations only: not API calls, not static assets, not non-GET. */
function shouldSendPageViewBeacon(method: string, urlPath: string): boolean {
  if (String(method).toUpperCase() !== 'GET') return false;
  const noQuery = urlPath.split('?')[0] ?? '/';
  const p = noQuery.startsWith('/') ? noQuery : `/${noQuery}`;
  if (/^\/api(\/|$)/i.test(p)) return false;
  if (/\.(js|css|map|ico|png|jpg|jpeg|gif|svg|woff2?|ttf|eot|json)$/i.test(p)) return false;
  return true;
}

/** In-memory port map is lost on restart; dedupe concurrent auto-starts for the same project. */
const previewStartLocks = new Map<string, Promise<void>>();

const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL;
const MAX_PREVIEW_FIX_ATTEMPTS = 3;

/**
 * Ask the backend to auto-fix a crashing server.js via Claude, then retry run().
 * Returns the final run result (success or last failure).
 */
async function fixAndRetryRun(
  projectId: string,
  initialErrorLog: string,
): Promise<{ success: boolean; log: string; port: number }> {
  if (!BACKEND_INTERNAL_URL) {
    console.log('[preview-fix] no BACKEND_INTERNAL_URL — cannot auto-fix');
    return { success: false, log: initialErrorLog, port: 0 };
  }

  let errorLog = initialErrorLog;
  for (let attempt = 1; attempt <= MAX_PREVIEW_FIX_ATTEMPTS; attempt++) {
    console.log(`[preview-fix] ${projectId} attempt ${attempt}/${MAX_PREVIEW_FIX_ATTEMPTS}`);
    try {
      const resp = await fetch(`${BACKEND_INTERNAL_URL}/api/internal/fix-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, errorLog }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.log(`[preview-fix] backend returned ${resp.status}: ${text.slice(0, 200)}`);
        return { success: false, log: errorLog, port: 0 };
      }

      const data = (await resp.json()) as { success: boolean; log: string; port?: number };
      console.log(`[preview-fix] backend fix result: success=${data.success} log=${data.log?.slice(0, 200)}`);

      if (data.success) {
        return { success: true, log: data.log, port: data.port ?? 0 };
      }

      errorLog = data.log || errorLog;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[preview-fix] ${projectId} attempt ${attempt} failed: ${msg}`);
    }
  }

  return { success: false, log: errorLog, port: 0 };
}

/** Avoid proxying to a child that is not accepting yet (nginx would 504 after default 60s). */
function waitForHttpReady(port: number, maxMs: number): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  return new Promise((resolve) => {
    const poll = () => {
      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/',
          method: 'GET',
          timeout: 2500,
        },
        (res) => {
          res.resume();
          resolve(true);
        },
      );
      req.on('error', () => {
        setTimeout(poll, 250);
      });
      req.on('timeout', () => {
        req.destroy();
        if (Date.now() >= deadline) resolve(false);
        else setTimeout(poll, 250);
      });
      req.end();
    };
    poll();
  });
}

const app = express();
app.use(express.json());
app.use(cors());

app.use((req, _res, next) => {
  console.log(`[app-runner] ${req.method} ${req.originalUrl}`);
  next();
});

app.post('/install', (req, res) => {
  const { projectId } = req.body as { projectId: string };
  const result = install(projectId);
  res.json(result);
});

app.post('/build', (req, res) => {
  const { projectId } = req.body as { projectId: string };
  const result = build(projectId);
  res.json(result);
});

app.post('/run', async (req, res) => {
  const { projectId } = req.body as { projectId: string };
  const result = await run(projectId);
  res.json(result);
});

app.post('/stop', (req, res) => {
  const { projectId } = req.body as { projectId: string };
  stop(projectId);
  res.json({ stopped: true });
});

/** Serve a file from the project's dist directory, with SPA fallback for non-asset routes. */
function serveStatic(projectId: string, subPath: string, req: express.Request, res: express.Response): void {
  const distDir = path.resolve(path.join(BASE_DIR, projectId, 'dist'));
  const filePath = path.resolve(path.join(distDir, subPath));

  // Path-traversal guard
  const relative = path.relative(distDir, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.status(400).send('Bad request');
    return;
  }

  // Analytics beacon for HTML navigations only (not assets / API)
  const reqPath = ('/' + subPath).replace(/\/+/g, '/');
  if (shouldSendPageViewBeacon(req.method, reqPath)) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ?? req.socket.remoteAddress;
    sendPageViewBeacon(projectId, reqPath, req.headers.referer, req.headers['user-agent'], ip);
  }

  // Resolve the target file
  let targetFile: string;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    targetFile = filePath;
  } else if (path.extname(subPath)) {
    // Asset that doesn't exist → 404
    res.status(404).send('Not found');
    return;
  } else {
    // SPA route → serve index.html
    targetFile = path.join(distDir, 'index.html');
  }

  // Edit mode: inject overlay script into HTML responses
  const editToken = req.query['__edit'] as string | undefined;
  if (editToken && targetFile.endsWith('index.html') && fs.existsSync(targetFile)) {
    const html = fs.readFileSync(targetFile, 'utf8');
    res.type('html').send(injectEditOverlay(html, editToken));
    return;
  }

  res.sendFile(targetFile);
}

// Reverse-proxy the preview through nginx (/preview-app/:id → here).
// For frontend-only SPAs: serve dist/ statically (no process needed).
// For full-stack apps: proxy to the running node process.
app.use('/preview/:projectId', async (req, res, next) => {
  const t0 = Date.now();
  try {
    const { projectId } = req.params;
    const subPath = (req.url ?? '/').replace(/^\//, '');

    // Serve user-uploaded images stored in projects/:id/uploads/
    if (subPath.startsWith('uploads/')) {
      const filename = subPath.slice('uploads/'.length).split('?')[0];
      // Path-traversal guard: no slashes or dots beyond a single extension
      if (!filename || filename.includes('/') || filename.includes('..')) {
        res.status(400).send('Bad request');
        return;
      }
      const uploadsDir = path.resolve(path.join(BASE_DIR, projectId, 'uploads'));
      const filePath = path.resolve(path.join(uploadsDir, filename));
      if (!filePath.startsWith(uploadsDir + path.sep)) { res.status(400).send('Bad request'); return; }
      if (!fs.existsSync(filePath)) { res.status(404).send('Not found'); return; }
      res.sendFile(filePath);
      return;
    }

    const pathOnly = normalizeSubPathToUrlPath(subPath);
    if (!(await assertAdminApiWriteAllowed(projectId, req.method, pathOnly, req, res))) return;

    const fullStack = isFullStack(projectId);
    let hasPort = assignedPorts.has(projectId);
    const dirExists = fs.existsSync(path.join(BASE_DIR, projectId));
    const distExists = fs.existsSync(path.join(BASE_DIR, projectId, 'dist', 'index.html'));
    const alive = hasPort && fullStack ? isProcessAlive(projectId) : true;

    console.log(
      `[preview] ▶ ${req.method} ${req.originalUrl} | project=${projectId} subPath="${subPath}" ` +
      `fullStack=${fullStack} hasPort=${hasPort} alive=${alive} dirExists=${dirExists} distExists=${distExists}`,
    );

    // Full-stack process died but port is still in map — clear it so autostart can kick in
    if (fullStack && hasPort && !alive) {
      console.log(`[preview] stale port for ${projectId} — process is dead, clearing and will autostart`);
      stop(projectId);
      assignedPorts.delete(projectId);
      hasPort = false;
    }

    // Static SPA: serve directly from dist/ if it exists and no process is running
    if (!fullStack && !hasPort) {
      if (distExists) {
        console.log(`[preview] serving static dist for ${projectId}`);
        serveStatic(projectId, subPath, req, res);
        return;
      }
      console.log(`[preview] ✗ 404 — no dist yet for ${projectId}`);
      res.status(404).send(
        'No preview for this project yet — finish a successful build first, or the project files are missing on this server.',
      );
      return;
    }

    // Full-stack app (or SPA whose process somehow got started): auto-start if needed then proxy
    let justAutostarted = false;
    if (!assignedPorts.has(projectId)) {
      if (!hasPreviewableFiles(projectId)) {
        console.log(`[preview] ✗ 404 — no previewable files for ${projectId}`);
        res.status(404).send(
          'No preview for this project yet — finish a successful build first, or the project files are missing on this server.',
        );
        return;
      }

      console.log(`[preview] autostarting ${projectId}…`);
      let lock = previewStartLocks.get(projectId);
      if (!lock) {
        lock = (async () => {
          if (assignedPorts.has(projectId)) return;
          const result = await run(projectId);
          console.log(`[preview] run result for ${projectId}: success=${result.success} port=${result.port} log=${result.log.slice(0, 300)}`);
          if (!result.success) {
            console.error(`[preview autostart] ${projectId}: ${result.log}`);
            console.log(`[preview] attempting auto-fix via backend for ${projectId}…`);
            const fixResult = await fixAndRetryRun(projectId, result.log);
            if (fixResult.success && fixResult.port > 0) {
              assignedPorts.set(projectId, fixResult.port);
              console.log(`[preview] auto-fix succeeded for ${projectId}, port=${fixResult.port}`);
            } else {
              console.error(`[preview] auto-fix failed for ${projectId}: ${fixResult.log.slice(0, 300)}`);
            }
          }
        })().finally(() => {
          previewStartLocks.delete(projectId);
        });
        previewStartLocks.set(projectId, lock);
      }

      await lock;
      justAutostarted = true;

      if (!assignedPorts.has(projectId)) {
        console.log(`[preview] ✗ 503 — no port after autostart + fix for ${projectId}`);
        res.status(503).send('Preview could not be started. Auto-fix was attempted but failed. Check app-runner logs.');
        return;
      }
    }

    const port = assignedPorts.get(projectId)!;
    console.log(`[preview] port=${port} justAutostarted=${justAutostarted} fullStack=${fullStack}`);

    // Edit mode for full-stack apps: serve dist/index.html with overlay injected.
    // Only intercept root HTML requests, not assets or API calls.
    const editToken = req.query['__edit'] as string | undefined;
    if (editToken && fullStack) {
      const isApiOrAsset = /\.(js|css|map|ico|png|jpg|jpeg|gif|svg|woff2?|ttf|eot|json)$/i.test(subPath)
        || subPath.startsWith('api/');
      if (!isApiOrAsset) {
        const distIndex = path.join(BASE_DIR, projectId, 'dist', 'index.html');
        if (fs.existsSync(distIndex)) {
          const html = fs.readFileSync(distIndex, 'utf8');
          res.type('html').send(injectEditOverlay(html, editToken));
          return;
        }
      }
    }

    if (fullStack && port > 0) {
      // Always verify the port is accepting before proxying.
      // Short timeout for already-running apps (returns immediately if up);
      // long timeout when we just started (including after a rebuild cycle).
      const readyTimeout = justAutostarted ? 90_000 : 8_000;
      const ok = await waitForHttpReady(port, readyTimeout);
      console.log(`[preview] HTTP ready=${ok} timeout=${readyTimeout}ms elapsed=${Date.now() - t0}ms`);
      if (!ok) {
        res
          .status(503)
          .send(
            'Preview server did not become ready in time. Check app-runner logs and the generated server.js for this project.',
          );
        return;
      }
    }

    // Analytics beacon for HTML navigations only (not assets / API)
    const reqPath = req.url?.split('?')[0] ?? '/';
    if (shouldSendPageViewBeacon(req.method, reqPath)) {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ?? req.socket.remoteAddress;
      sendPageViewBeacon(projectId, reqPath, req.headers.referer, req.headers['user-agent'], ip);
    }

    console.log(`[preview] proxying to http://127.0.0.1:${port} (${Date.now() - t0}ms)`);
    createProxyMiddleware({
      target: `http://127.0.0.1:${port}`,
      changeOrigin: true,
      timeout: 300_000,
      on: {
        proxyReq: (proxyReq, req) => {
          // express.json() already consumed the body stream. Re-stream it so the
          // target server (the user's Node.js app) actually receives the body.
          const expReq = req as unknown as express.Request;
          const contentType = (expReq.headers['content-type'] ?? '').toLowerCase();
          if (contentType.includes('application/json') && expReq.body !== undefined) {
            const bodyData = JSON.stringify(expReq.body);
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        },
        proxyRes: (proxyRes) => {
          console.log(`[preview] ◀ proxy response ${proxyRes.statusCode} for ${projectId} (${Date.now() - t0}ms)`);
        },
        error: (err) => {
          console.error(`[preview] ✗ proxy error for ${projectId}: ${(err as Error).message}`);
        },
      },
    })(req, res, next);
  } catch (err) {
    console.error(`[preview] ✗ unhandled error:`, err);
    next(err);
  }
});

// Persistent hosting — start/stop under PM2 for full-stack apps
app.post('/start-persistent', (req, res) => {
  const { projectId, envVars } = req.body as { projectId: string; envVars?: Record<string, string> };
  const result = startPersistent(projectId, envVars ?? {});
  res.json(result);
});

app.post('/stop-persistent', (req, res) => {
  const { projectId } = req.body as { projectId: string };
  stopPersistent(projectId);
  res.json({ stopped: true });
});

// Ensure preview is running (start it if not). Returns the active port.
app.post('/ensure-running', async (req, res) => {
  const { projectId } = req.body as { projectId: string };
  if (assignedPorts.has(projectId)) {
    return res.json({ success: true, port: assignedPorts.get(projectId) });
  }
  if (!hasPreviewableFiles(projectId)) {
    return res.json({ success: false, log: 'No previewable files', port: undefined });
  }
  const result = await run(projectId);
  return res.json(result);
});

// Custom domain routing: resolves verified custom domains (e.g. app.mysite.com) to project IDs
// via the backend internal API, then serves the project exactly like /preview/:projectId.
const domainCache = new Map<string, { projectId: string; expires: number }>();
const DOMAIN_CACHE_TTL_MS = 60_000;

/** Hostnames for the main AppMaker app — never custom-domain projects (nginx should route these to the frontend). */
const MAIN_APP_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

app.use('/hosted/', async (req, res, next) => {
  try {
    const host = ((req.headers['x-forwarded-host'] as string) ?? '')
      .toLowerCase()
      .split(':')[0]
      .trim();
    if (!host) return res.status(400).send('No host header');

    if (MAIN_APP_HOSTS.has(host)) {
      return res.status(404).send(
        'Wrong route: open the main app at http://localhost/ (or http://127.0.0.1/) — not the custom-domain proxy. Reload nginx config if you still see this.',
      );
    }

    // Check in-memory cache to avoid a DB round-trip on every request
    const cached = domainCache.get(host);
    const projectId = cached && cached.expires > Date.now()
      ? cached.projectId
      : await (async () => {
          const backendUrl = process.env.BACKEND_INTERNAL_URL;
          if (!backendUrl) return null;
          try {
            const url = `${backendUrl}/api/internal/resolve-domain?host=${encodeURIComponent(host)}`;
            const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!r.ok) return null;
            const id = (await r.json() as { projectId: string }).projectId;
            domainCache.set(host, { projectId: id, expires: Date.now() + DOMAIN_CACHE_TTL_MS });
            return id;
          } catch {
            return null;
          }
        })();

    if (!projectId) return res.status(404).send('Domain not found or not verified');

    // Reuse the same static-serve + proxy logic as /preview/:projectId
    const subPath = (req.url ?? '/').replace(/^\//, '');

    const pathOnlyHosted = normalizeSubPathToUrlPath(subPath);
    if (!(await assertAdminApiWriteAllowed(projectId, req.method, pathOnlyHosted, req, res))) return;

    if (!isFullStack(projectId) && !assignedPorts.has(projectId)) {
      const distIndex = path.join(BASE_DIR, projectId, 'dist', 'index.html');
      if (fs.existsSync(distIndex)) {
        serveStatic(projectId, subPath, req, res);
        return;
      }
      return res.status(503).send('App not ready');
    }

    if (!assignedPorts.has(projectId)) {
      if (!hasPreviewableFiles(projectId)) return res.status(503).send('App not ready');
      const result = await run(projectId);
      if (!result.success || !assignedPorts.has(projectId)) {
        return res.status(503).send('App could not be started');
      }
    }

    const port = assignedPorts.get(projectId)!;
    const reqPath = req.url?.split('?')[0] ?? '/';
    if (shouldSendPageViewBeacon(req.method, reqPath)) {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ?? req.socket.remoteAddress;
      sendPageViewBeacon(projectId, reqPath, req.headers.referer, req.headers['user-agent'], ip);
    }

    createProxyMiddleware({
      target: `http://127.0.0.1:${port}`,
      changeOrigin: true,
      on: {
        proxyReq: (proxyReq, req) => {
          const expReq = req as unknown as express.Request;
          const contentType = (expReq.headers['content-type'] ?? '').toLowerCase();
          if (contentType.includes('application/json') && expReq.body !== undefined) {
            const bodyData = JSON.stringify(expReq.body);
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        },
      },
    })(req, res, next);
  } catch (err) {
    next(err);
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT ?? 4001;
app.listen(PORT, () => console.log(`App runner on port ${PORT}`));
