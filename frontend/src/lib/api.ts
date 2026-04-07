import { useAuthStore } from '../store/auth';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

function getToken(): string | null {
  try {
    const raw = localStorage.getItem('auth-storage');
    if (!raw) return null;
    return JSON.parse(raw)?.state?.token ?? null;
  } catch {
    return null;
  }
}

function clearSessionAndGoHome() {
  try {
    useAuthStore.getState().logout();
  } catch {
    /* ignore */
  }
  window.location.replace('/');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { error: text?.slice(0, 200) || res.statusText || 'Request failed' };
  }

  if (!res.ok) {
    // Token present but server rejects session (expired secret, user deleted, etc.)
    if (res.status === 401 && token) {
      clearSessionAndGoHome();
    }
    const err = new Error(
      String(data.message ?? data.error ?? 'Request failed'),
    ) as Error & {
      status?: number;
      code?: unknown;
    };
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data as T;
}

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const m = /filename\*?=(?:UTF-8''|")?([^";\n]+)"?/i.exec(header);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1].replace(/"/g, '').trim());
    } catch {
      return m[1].replace(/"/g, '').trim() || fallback;
    }
  }
  return fallback;
}

/** GET binary with Bearer token and save as file (navigation cannot send Authorization). */
async function downloadWithAuth(path: string, fallbackFilename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401 && token) {
    clearSessionAndGoHome();
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      msg = j.error ?? text;
    } catch {
      msg = text?.slice(0, 200) || res.statusText;
    }
    throw new Error(msg || 'Download failed');
  }

  const blob = await res.blob();
  const name = filenameFromContentDisposition(
    res.headers.get('Content-Disposition'),
    fallbackFilename,
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  get: <T>(path: string) => request<T>('GET', path),
  download: (path: string, fallbackFilename: string) => downloadWithAuth(path, fallbackFilename),

  getCatalogModels: (projectId: string) =>
    request<{ appType: string | null; models: Array<{ name: string; fields: Array<{ name: string; type: string }> | null }> }>('GET', `/preview/${projectId}/catalog-models`),

  uploadImage: (projectId: string, dataUrl: string, filename: string) =>
    request<{ url: string }>('POST', `/preview/${projectId}/upload-image`, { data: dataUrl, filename }),

  getEditToken: (projectId: string) =>
    request<{ token: string }>('GET', `/preview/${projectId}/edit-token`),

  getAdminToken: (projectId: string) =>
    request<{ token: string }>('GET', `/preview/${projectId}/admin-token`),

  patchContent: (projectId: string, body: { token: string; original: string; replacement: string }) =>
    request<{ ok: boolean }>('PATCH', `/preview/${projectId}/content`, body),

  // Filesystem editor (paid projects)
  fsTree: (projectId: string, dir?: string) =>
    request<{ dir: string; children: unknown[] }>('GET', `/preview/${projectId}/fs/tree${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`),
  fsReadFile: (projectId: string, path: string) =>
    request<{
      path: string;
      encoding: 'utf8' | 'binary';
      size: number;
      content?: string;
      kind?: 'image';
      mime?: string;
      dataUrl?: string;
    }>('GET', `/preview/${projectId}/fs/file?path=${encodeURIComponent(path)}`),
  fsWriteFile: (projectId: string, body: { path: string; content: string; highRiskAck?: boolean }) =>
    request<{ ok: boolean }>('PUT', `/preview/${projectId}/fs/file`, body),
  fsMkdir: (projectId: string, path: string) =>
    request<{ ok: boolean }>('POST', `/preview/${projectId}/fs/mkdir`, { path }),
  fsRename: (projectId: string, from: string, to: string) =>
    request<{ ok: boolean }>('POST', `/preview/${projectId}/fs/rename`, { from, to }),
  fsDelete: (projectId: string, path: string, opts?: { recursive?: boolean }) => {
    const qs = new URLSearchParams({ path });
    if (opts?.recursive) qs.set('recursive', 'true');
    return request<{ ok: boolean }>('DELETE', `/preview/${projectId}/fs/entry?${qs.toString()}`);
  },

  // Email (platform-level, per-project settings)
  emailDomainsList: (opts?: { projectId?: string }) =>
    request<Array<{
      id: string;
      projectId: string;
      domain: string;
      verified: boolean;
      verifiedAt: string | null;
      dnsRecords: unknown;
      createdAt: string;
    }>>('GET', `/email/domains${opts?.projectId ? `?projectId=${encodeURIComponent(opts.projectId)}` : ''}`),
  emailDomainCreate: (projectId: string, domain: string) =>
    request<{ id: string; domain: string; verified: boolean; dnsRecords: unknown }>('POST', `/email/domains`, { projectId, domain }),
  emailDomainVerify: (domainId: string) =>
    request<{ verified: boolean }>('POST', `/email/domains/${domainId}/verify`),
  emailDomainDelete: (domainId: string) =>
    request<{ ok: boolean }>('DELETE', `/email/domains/${domainId}`),

  emailSettingsGet: (projectId: string) =>
    request<null | {
      projectId: string;
      domainId: string | null;
      domain: string | null;
      fromName: string | null;
      fromEmail: string;
      verified: boolean;
      provider: 'resend';
    }>('GET', `/email/settings/${projectId}`),
  emailSettingsPut: (projectId: string, body: { fromName?: string; fromEmail: string; domainId?: string | null }) =>
    request<{ projectId: string; fromName: string | null; fromEmail: string; domainId: string | null; verified: boolean; provider: 'resend' }>(
      'PUT',
      `/email/settings/${projectId}`,
      body,
    ),

  emailTemplatesGet: (projectId: string) =>
    request<Array<{ id: string; eventType: string; subject: string; htmlBody: string; updatedAt: string }>>('GET', `/email/templates/${projectId}`),
  emailTemplatePut: (projectId: string, eventType: string, body: { subject: string; htmlBody: string }) =>
    request<{ id: string; projectId: string; eventType: string; subject: string; htmlBody: string; updatedAt: string }>(
      'PUT',
      `/email/templates/${projectId}/${encodeURIComponent(eventType)}`,
      body,
    ),

  setHostedSubdomain: (projectId: string, slug: string) =>
    request<{
      customDomain: string | null;
      customDomainVerifiedAt: string | null;
      hostingSitesConfigured: boolean;
      cnameTarget: string | null;
      challengeTxtName: string | null;
      challengeTxtValue: string | null;
    }>('PUT', `/preview/${projectId}/subdomain`, { slug }),

  /**
   * Two-step resilient SSE flow:
   *   1. POST postPath → { sessionId }
   *   2. GET /generate/events/:sessionId — replays history then streams live
   * Reconnects automatically on drop with exponential backoff (up to 20 attempts).
   * onEvent receives already-parsed objects. onDone fires after a terminal event or exhausted retries.
   * Returns { cancel } to permanently stop.
   */
  streamEvents: (
    postPath: string,
    postBody: unknown,
    onEvent: (data: unknown) => void,
    onDone: () => void,
  ): { cancel: () => void } => {
    const token = getToken();
    let cancelled = false;
    let ctrl: AbortController | null = null;
    const MAX_RECONNECT = 20;
    const TERMINAL = new Set(['done', 'fatal', 'preview_updated']);

    const openStream = (sessionId: string, attempt: number) => {
      if (cancelled || attempt >= MAX_RECONNECT) { onDone(); return; }
      ctrl = new AbortController();

      fetch(`${BASE}/generate/events/${sessionId}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: ctrl.signal,
      }).then(async (res) => {
        if (res.status === 401 && token) { clearSessionAndGoHome(); onDone(); return; }
        if (!res.ok || !res.body) { onDone(); return; }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let completed = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const part of parts) {
            if (!part.startsWith('data: ')) continue;
            try {
              const payload = JSON.parse(part.slice(6));
              onEvent(payload);
              if (TERMINAL.has((payload as any)?.type)) completed = true;
            } catch { /* ignore malformed */ }
          }
        }

        if (completed || cancelled) { onDone(); return; }
        // Stream ended without terminal event — reconnect with backoff
        const delay = Math.min(1000 * 2 ** attempt, 15_000);
        setTimeout(() => openStream(sessionId, attempt + 1), delay);
      }).catch(() => {
        if (cancelled) return;
        const delay = Math.min(1000 * 2 ** attempt, 15_000);
        setTimeout(() => openStream(sessionId, attempt + 1), delay);
      });
    };

    // Step 1: POST to kick off the pipeline
    fetch(`${BASE}${postPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(postBody),
    }).then(async (res) => {
      if (res.status === 401 && token) { clearSessionAndGoHome(); onDone(); return; }
      if (res.status === 409) {
        const sid = (postBody as { sessionId?: string }).sessionId;
        if (sid) openStream(sid, 0);
        else {
          onEvent({ type: 'fatal', message: 'Generation already in progress' });
          onDone();
        }
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        let msg = 'Request failed';
        try { msg = (JSON.parse(text) as any).message ?? (JSON.parse(text) as any).error ?? msg; } catch {}
        onEvent({ type: 'fatal', message: msg });
        onDone();
        return;
      }
      const data = await res.json() as { sessionId: string };
      openStream(data.sessionId, 0);
    }).catch(() => { onDone(); });

    return { cancel: () => { cancelled = true; ctrl?.abort(); } };
  },

  /**
   * Subscribe to generation SSE only (replay from DB + live). Use after refresh or when a
   * pipeline may already be running; pair with POST /generate/resume to continue install/build.
   */
  subscribeGenerationEvents: (
    sessionId: string,
    onEvent: (data: unknown) => void,
    onDone: () => void,
  ): { cancel: () => void } => {
    const token = getToken();
    let cancelled = false;
    let ctrl: AbortController | null = null;
    const MAX_RECONNECT = 20;
    const TERMINAL = new Set(['done', 'fatal', 'preview_updated']);

    const openStream = (attempt: number) => {
      if (cancelled || attempt >= MAX_RECONNECT) {
        onDone();
        return;
      }
      ctrl = new AbortController();

      fetch(`${BASE}/generate/events/${sessionId}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: ctrl.signal,
      }).then(async (res) => {
        if (res.status === 401 && token) { clearSessionAndGoHome(); onDone(); return; }
        if (!res.ok || !res.body) { onDone(); return; }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let completed = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const part of parts) {
            if (!part.startsWith('data: ')) continue;
            try {
              const payload = JSON.parse(part.slice(6));
              onEvent(payload);
              if (TERMINAL.has((payload as any)?.type)) completed = true;
            } catch { /* ignore malformed */ }
          }
        }

        if (completed || cancelled) { onDone(); return; }
        const delay = Math.min(1000 * 2 ** attempt, 15_000);
        setTimeout(() => openStream(attempt + 1), delay);
      }).catch(() => {
        if (cancelled) return;
        const delay = Math.min(1000 * 2 ** attempt, 15_000);
        setTimeout(() => openStream(attempt + 1), delay);
      });
    };

    openStream(0);
    return { cancel: () => { cancelled = true; ctrl?.abort(); } };
  },

  // Legacy SSE streaming (POST + read body as SSE) — kept for any direct callers
  stream: (path: string, body: unknown, onEvent: (data: string) => void, onDone: () => void) => {
    const token = getToken();
    const ctrl = new AbortController();

    fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    }).then(async (res) => {
      if (res.status === 401 && token) {
        clearSessionAndGoHome();
        onDone();
        return;
      }
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) { onDone(); break; }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          if (part.startsWith('data: ')) {
            onEvent(part.slice(6));
          }
        }
      }
    }).catch(() => onDone());

    return ctrl;
  },
};
