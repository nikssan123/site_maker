import { execSync, execFileSync, spawn, ChildProcess } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';

export const BASE_DIR = process.env.GENERATED_APPS_DIR ?? '/generated-apps';

/**
 * pnpm content-addressable store. Must live on the same filesystem as generated-apps
 * so hard links work (no data duplication across projects). Defaults to a hidden directory
 * inside the generated-apps volume itself.
 */
const PNPM_STORE_DIR = process.env.PNPM_STORE_DIR ?? '/generated-apps/.pnpm-store';


// Track running processes: projectId → child process
const runningProcesses = new Map<string, ChildProcess>();
// Track assigned ports (exported for preview proxy)
export const assignedPorts = new Map<string, number>();
let nextPort = 4100;

/** Returns true if the child process for this project is still alive. */
export function isProcessAlive(projectId: string): boolean {
  const proc = runningProcesses.get(projectId);
  if (!proc) return false;
  return proc.exitCode === null && !proc.killed;
}

/** Poll HTTP until a response arrives or deadline expires. */
function waitForPort(port: number, maxMs: number): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  return new Promise((resolve) => {
    const poll = () => {
      if (Date.now() >= deadline) { resolve(false); return; }
      const r = http.request({ hostname: '127.0.0.1', port, path: '/', method: 'GET', timeout: 2000 }, (res) => {
        res.resume();
        resolve(true);
      });
      r.on('error', () => setTimeout(poll, 300));
      r.on('timeout', () => { r.destroy(); setTimeout(poll, 300); });
      r.end();
    };
    poll();
  });
}

function getProjectDir(projectId: string): string {
  return path.join(BASE_DIR, projectId);
}

/** Public URL path prefix for Vite preview (must match nginx /preview-app/… and end with /). */
export function previewBase(projectId: string): string {
  return `/preview-app/${projectId}/`;
}

function allocatePort(projectId: string): number {
  if (assignedPorts.has(projectId)) return assignedPorts.get(projectId)!;
  const port = nextPort++;
  assignedPorts.set(projectId, port);
  return port;
}

export function isFullStack(projectId: string): boolean {
  return fs.existsSync(path.join(getProjectDir(projectId), 'server.js'));
}

/** True if this project has been built and can be previewed (files on disk). */
export function hasPreviewableFiles(projectId: string): boolean {
  const dir = getProjectDir(projectId);
  if (!fs.existsSync(dir)) return false;
  if (isFullStack(projectId)) return true;
  return fs.existsSync(path.join(dir, 'dist', 'index.html'));
}

/** Any path-absolute /assets/… that isn’t already under …/preview-app/<id>/… */
const ROOT_ASSETS_RE = /(?<![\w/])\/assets\//;

/** dist must be built with --base /preview-app/<id>/ so HTML + chunks request assets under the iframe path, not /assets/… */
function viteDistNeedsPreviewBaseRebuild(projectId: string, dir: string): boolean {
  const expected = previewBase(projectId);
  const indexPath = path.join(dir, 'dist', 'index.html');
  if (!fs.existsSync(indexPath)) return false;

  const html = fs.readFileSync(indexPath, 'utf8');
  if (ROOT_ASSETS_RE.test(html)) return true;
  if (/(?:src|href)=["']\.\/assets\//.test(html)) return true;
  if (!html.includes(`${expected}assets/`)) return true;

  const assetsDir = path.join(dir, 'dist', 'assets');
  if (!fs.existsSync(assetsDir)) return false;

  for (const name of fs.readdirSync(assetsDir)) {
    if (!name.endsWith('.js')) continue;
    const content = fs.readFileSync(path.join(assetsDir, name), 'utf8');
    if (ROOT_ASSETS_RE.test(content)) return true;
    if (content.includes('"./assets/') || content.includes("'./assets/")) return true;
  }
  return false;
}

function ensureViteDistPreviewBase(projectId: string, dir: string): void {
  if (!viteDistNeedsPreviewBaseRebuild(projectId, dir)) return;
  const base = previewBase(projectId);
  execFileSync('pnpm', ['run', 'build', '--', '--base', base], {
    cwd: dir,
    timeout: 120_000,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}


/**
 * Some builds still emit root-absolute /assets/… in chunks (or cached dist). Rewrite on disk so the
 * browser never requests http://localhost/assets/… from inside the iframe.
 *
 * Uses several literal patterns plus a delimiter rule for minified output, then repeats until stable.
 */
function rewriteViteDistRootAssets(projectId: string, dir: string): void {
  const root = previewBase(projectId).replace(/\/$/, '');
  const dist = path.join(dir, 'dist');
  if (!fs.existsSync(dist)) return;

  const unicodeRoot = root.replace(/^\//, '').split('/').join('\\u002f');

  const rewriteTextOnce = (t: string): string => {
    let s = t;
    s = s.replaceAll('"/assets/', `"${root}/assets/`);
    s = s.replaceAll("'/assets/", `'${root}/assets/`);
    s = s.replace(/`\/assets\//g, `\`${root}/assets/`);
    s = s.replaceAll('import("/assets/', `import("${root}/assets/`);
    s = s.replaceAll("import('/assets/", `import('${root}/assets/`);
    s = s.replace(/import\(`\/assets\//g, `import(\`${root}/assets/`);
    s = s.replaceAll('from"/assets/', `from"${root}/assets/`);
    s = s.replaceAll("from'/assets/", `from'${root}/assets/`);
    s = s.replaceAll('"./assets/', `"${root}/assets/`);
    s = s.replaceAll("'./assets/", `'${root}/assets/`);
    s = s.replace(/url\(\/assets\//g, `url(${root}/assets/`);
    s = s.replace(/url\("\/assets\//g, `url("${root}/assets/`);
    s = s.replace(/url\('\/assets\//g, `url('${root}/assets/`);
    s = s.replace(/new URL\("\/assets\//g, `new URL("${root}/assets/`);
    s = s.replace(/new URL\('\/assets\//g, `new URL('${root}/assets/`);
    // Rollup/Vite may escape "/" as \u002f inside strings
    if (unicodeRoot.length > 0) {
      s = s.replace(/"\\u002fassets\\u002f/g, `"\\u002f${unicodeRoot}\\u002fassets\\u002f`);
      s = s.replace(/'\\u002fassets\\u002f/g, `'\\u002f${unicodeRoot}\\u002fassets\\u002f`);
    }
    // Catch minified paths: /assets/ not preceded by a letter, digit, _, or / (avoids …/uuid/assets/ and URLs)
    s = s.replace(/(?<![\w/])\/assets\//g, `${root}/assets/`);

    // Rewrite absolute API calls so they route through the preview proxy.
    // Generated code uses fetch("/api/...") but those go to the main app's nginx root.
    // After rewrite: fetch("/preview-app/{id}/api/...") → proxied correctly to the generated Express server.
    s = s.replaceAll('"/api/', `"${root}/api/`);
    s = s.replaceAll("'/api/", `'${root}/api/`);
    s = s.replace(/`\/api\//g, `\`${root}/api/`);

    return s;
  };

  const rewriteText = (t: string): string => {
    let s = t;
    for (let i = 0; i < 16; i++) {
      const n = rewriteTextOnce(s);
      if (n === s) break;
      s = n;
    }
    return s;
  };

  const walk = (p: string): void => {
    for (const n of fs.readdirSync(p)) {
      const fp = path.join(p, n);
      if (fs.statSync(fp).isDirectory()) walk(fp);
      else if (/\.(js|mjs|html|css|svg|json)$/.test(n)) {
        const before = fs.readFileSync(fp, 'utf8');
        const after = rewriteText(before);
        if (after !== before) fs.writeFileSync(fp, after);
      }
    }
  };

  walk(dist);
}

/**
 * Compile native addons for packages in the pnpm virtual store.
 * `pnpm rebuild` doesn't reliably reach transitive deps — run node-gyp rebuild
 * directly inside each matching package directory instead.
 */
function rebuildNativeAddons(projectDir: string): void {
  const pnpmDir = path.join(projectDir, 'node_modules', '.pnpm');
  if (!fs.existsSync(pnpmDir)) return;

  const NATIVE_PACKAGES = ['better-sqlite3'];

  for (const pkgName of NATIVE_PACKAGES) {
    const storeEntry = fs.readdirSync(pnpmDir).find((d) => d.startsWith(`${pkgName}@`));
    if (!storeEntry) continue;

    const pkgDir = path.join(pnpmDir, storeEntry, 'node_modules', pkgName);
    if (!fs.existsSync(pkgDir)) continue;

    console.log(`[runner] node-gyp rebuild in ${pkgDir}`);
    // node-pre-gyp is better-sqlite3's build tool; fall back to node-gyp
    let rebuilt = false;
    const nodePreGyp = path.join(pkgDir, 'node_modules', '.bin', 'node-pre-gyp');
    if (fs.existsSync(nodePreGyp)) {
      try {
        execFileSync(nodePreGyp, ['rebuild'], { cwd: pkgDir, timeout: 120_000, encoding: 'utf8', stdio: 'pipe' });
        rebuilt = true;
      } catch { /* fall through to node-gyp */ }
    }
    if (!rebuilt) {
      execFileSync('node-gyp', ['rebuild'], { cwd: pkgDir, timeout: 120_000, encoding: 'utf8', stdio: 'pipe' });
    }
  }
}

export function install(projectId: string): { success: boolean; log: string } {
  const dir = getProjectDir(projectId);
  try {
    // Force native addons to always compile from source — prevents pnpm from
    // reusing a prebuilt binary from the store that was compiled for the wrong platform.
    const npmrc = path.join(dir, '.npmrc');
    const npmrcExtra = 'better-sqlite3_build_from_source=true\n';
    const existing = fs.existsSync(npmrc) ? fs.readFileSync(npmrc, 'utf8') : '';
    if (!existing.includes('better-sqlite3_build_from_source')) {
      fs.writeFileSync(npmrc, existing + npmrcExtra);
    }

    let log = execFileSync(
      'pnpm',
      ['install', '--store-dir', PNPM_STORE_DIR, '--no-lockfile', '--prefer-offline'],
      {
        cwd: dir,
        timeout: 180_000,
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );

    // Rebuild native addons (e.g. better-sqlite3) after install.
    // Prebuilt binaries in the pnpm store may be for the wrong platform.
    try {
      rebuildNativeAddons(dir);
    } catch (rebuildErr: any) {
      console.log(`[runner] native addon rebuild warning: ${(rebuildErr.stderr ?? rebuildErr.message ?? '').slice(0, 300)}`);
    }

    return { success: true, log };
  } catch (err: any) {
    return { success: false, log: err.stderr ?? err.message ?? String(err) };
  }
}

export function build(projectId: string): { success: boolean; log: string } {
  const dir = getProjectDir(projectId);
  try {
    // Always build with the preview base path so assets resolve correctly when served
    // under /preview-app/{id}/ — applies to both SPAs and full-stack apps.
    // import.meta.env.BASE_URL will equal /preview-app/{id}/ in the built bundle,
    // which makes BrowserRouter basename and API fetch calls work correctly.
    const npmArgs = ['run', 'build', '--', '--base', previewBase(projectId)];
    const log = execFileSync('pnpm', npmArgs, {
      cwd: dir,
      timeout: 120_000,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    // Safety net: rewrite any root-absolute /assets/ that slipped through
    rewriteViteDistRootAssets(projectId, dir);
    return { success: true, log };
  } catch (err: any) {
    return { success: false, log: err.stderr ?? err.stdout ?? err.message ?? String(err) };
  }
}

export async function run(projectId: string): Promise<{ success: boolean; log: string; port: number }> {
  const dir = getProjectDir(projectId);
  if (!fs.existsSync(dir)) {
    return { success: false, log: `Project directory not found: ${dir}`, port: 0 };
  }

  if (!isFullStack(projectId)) {
    try {
      ensureViteDistPreviewBase(projectId, dir);
      rewriteViteDistRootAssets(projectId, dir);
    } catch (err: any) {
      const msg = err.stderr?.toString?.() ?? err.stdout?.toString?.() ?? err.message ?? String(err);
      return { success: false, log: `Preview prep failed: ${msg}`, port: 0 };
    }
    return { success: true, log: 'static', port: 0 };
  }

  // Full-stack: also ensure the frontend was built with the preview base path.
  // If not (e.g. project was generated before this fix), rebuild the frontend.
  try {
    ensureViteDistPreviewBase(projectId, dir);
    rewriteViteDistRootAssets(projectId, dir);
  } catch (err: any) {
    console.warn(`[runner] preview base rebuild for full-stack ${projectId} failed: ${(err.message ?? '').slice(0, 300)}`);
  }

  stop(projectId);
  const port = allocatePort(projectId);

  try {
    const child: ChildProcess = spawn('node', ['server.js'], {
      cwd: dir,
      detached: false,
      stdio: 'pipe',
      env: { ...process.env, PORT: String(port) },
    });

    let stderrBuf = '';
    child.stderr?.on('data', (d) => {
      stderrBuf += d.toString();
      if (stderrBuf.length > 50_000) stderrBuf = stderrBuf.slice(-40_000);
    });
    let stdoutBuf = '';
    child.stdout?.on('data', (d) => {
      stdoutBuf += d.toString();
      if (stdoutBuf.length > 50_000) stdoutBuf = stdoutBuf.slice(-40_000);
    });

    runningProcesses.set(projectId, child);

    child.on('exit', (code, signal) => {
      console.log(`[runner] server.js for ${projectId} exited (code=${code} signal=${signal})`);
      if (stderrBuf) console.log(`[runner] stderr: ${stderrBuf.slice(0, 1000)}`);
      runningProcesses.delete(projectId);
      assignedPorts.delete(projectId);
    });

    // Wait up to 15s for the HTTP server to accept a connection
    const ready = await waitForPort(port, 15_000);

    if (child.exitCode !== null) {
      runningProcesses.delete(projectId);
      const log = stderrBuf || stdoutBuf || `Process exited with code ${child.exitCode}`;
      console.log(`[runner] server.js for ${projectId} crashed: ${log.slice(0, 500)}`);

      // Native addon bindings missing — rebuild and retry once
      if (log.includes('Could not locate the bindings file') || log.includes('bindings.js')) {
        console.log(`[runner] native bindings error detected for ${projectId}, rebuilding…`);
        try {
          rebuildNativeAddons(dir);
        } catch (rebuildErr: any) {
          console.log(`[runner] rebuild failed: ${(rebuildErr.stderr ?? rebuildErr.message ?? '').slice(0, 300)}`);
          assignedPorts.delete(projectId);
          return { success: false, log, port: 0 };
        }
        // Retry run after rebuild
        return run(projectId);
      }

      assignedPorts.delete(projectId);
      return { success: false, log, port: 0 };
    }

    if (!ready) {
      const log = stderrBuf || stdoutBuf || 'server.js did not start accepting HTTP within 15s';
      console.log(`[runner] server.js for ${projectId} not ready: ${log.slice(0, 500)}`);
      stop(projectId);
      assignedPorts.delete(projectId);
      return { success: false, log, port: 0 };
    }

    console.log(`[runner] server.js for ${projectId} started on port ${port} (pid=${child.pid})`);
    return { success: true, log: 'App running', port };
  } catch (err: any) {
    assignedPorts.delete(projectId);
    runningProcesses.delete(projectId);
    return { success: false, log: err.message ?? String(err), port: 0 };
  }
}

export function stop(projectId: string): void {
  const proc = runningProcesses.get(projectId);
  if (proc) {
    try { proc.kill('SIGTERM'); } catch {}
    runningProcesses.delete(projectId);
  }
}

/**
 * Start a full-stack app under PM2 for persistent hosting.
 * PM2 auto-restarts on crash and resurrects from /generated-apps/.pm2 on container boot.
 * For SPA projects (no server.js) this is a no-op — they're served statically.
 */
export function startPersistent(
  projectId: string,
  envVars: Record<string, string>,
): { success: boolean; log: string; port: number } {
  const dir = getProjectDir(projectId);
  if (!fs.existsSync(dir)) {
    return { success: false, log: `Project dir not found: ${dir}`, port: 0 };
  }

  if (!isFullStack(projectId)) {
    // SPAs are served statically — no persistent process needed
    return { success: true, log: 'static, no process needed', port: 0 };
  }

  // Stop any existing plain-spawn or PM2 instance first
  stop(projectId);
  try { execFileSync('pm2', ['delete', projectId], { encoding: 'utf8', stdio: 'pipe' }); } catch {}

  const port = allocatePort(projectId);
  const cfgPath = path.join(dir, '.pm2.config.js');

  try {
    const cfg = {
      apps: [{
        name: projectId,
        script: 'server.js',
        cwd: dir,
        env: { ...envVars, PORT: String(port) },
        restart_delay: 3000,
        max_restarts: 10,
      }],
    };
    fs.writeFileSync(cfgPath, `module.exports = ${JSON.stringify(cfg, null, 2)}`);
    fs.chmodSync(cfgPath, 0o600);
    execFileSync('pm2', ['start', cfgPath], { encoding: 'utf8', stdio: 'pipe' });
    execFileSync('pm2', ['save'], { encoding: 'utf8', stdio: 'pipe' });
    return { success: true, log: 'persistent start', port };
  } catch (err: any) {
    assignedPorts.delete(projectId);
    return { success: false, log: err.stderr ?? err.message ?? String(err), port: 0 };
  } finally {
    // Delete config after PM2 has loaded it — env vars no longer on disk
    try { fs.unlinkSync(cfgPath); } catch {}
  }
}

/** Remove a project from PM2 (called when hosting is cancelled). */
export function stopPersistent(projectId: string): void {
  try { execFileSync('pm2', ['delete', projectId], { encoding: 'utf8', stdio: 'pipe' }); } catch {}
  try { execFileSync('pm2', ['save'], { encoding: 'utf8', stdio: 'pipe' }); } catch {}
  stop(projectId);
}
