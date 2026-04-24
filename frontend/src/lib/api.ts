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
    if (res.status === 401 && token && !path.startsWith('/auth/')) {
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

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<{ ok: true }>('POST', '/auth/change-password', body),
  requestPasswordChange: (body: { currentPassword: string; newPassword: string }) =>
    request<{ pending: true; email: string }>('POST', '/auth/request-password-change', body),
  confirmPasswordChange: (body: { code: string }) =>
    request<{ ok: true }>('POST', '/auth/confirm-password-change', body),
  requestEmailChange: (body: { newEmail: string; password: string }) =>
    request<{ pending: true; newEmail: string }>('POST', '/auth/request-email-change', body),
  confirmEmailChange: (body: { code: string }) =>
    request<{
      token: string;
      user: { id: string; email: string; isAdmin: boolean; freeProjectUsed: boolean; createdAt: string };
    }>('POST', '/auth/confirm-email-change', body),
  deleteAccount: (body: { password: string }) =>
    request<{ ok: true }>('POST', '/auth/delete-account', body),

  getCatalogModels: (projectId: string) =>
    request<{ appType: string | null; models: Array<{ name: string; fields: Array<{ name: string; type: string }> | null }> }>('GET', `/preview/${projectId}/catalog-models`),

  uploadImage: (projectId: string, dataUrl: string, filename: string) =>
    request<{ url: string }>('POST', `/preview/${projectId}/upload-image`, { data: dataUrl, filename }),

  replaceLogo: (projectId: string, dataUrl: string, filename: string) =>
    request<{ ok: boolean; autoPlaced: boolean; logoUrl: string }>('POST', `/preview/${projectId}/replace-logo`, { data: dataUrl, filename }),

  replaceHeroBg: (projectId: string, dataUrl: string, filename: string) =>
    request<{ ok: boolean; autoPlaced: boolean; imageUrl: string }>('POST', `/preview/${projectId}/replace-hero-bg`, { data: dataUrl, filename }),

  getEditToken: (projectId: string) =>
    request<{ token: string }>('GET', `/preview/${projectId}/edit-token`),

  getAdminToken: (projectId: string) =>
    request<{ token: string }>('GET', `/preview/${projectId}/admin-token`),

  inspectEditTarget: (
    projectId: string,
    target:
      | { kind: 'text'; anchor: string }
      | { kind: 'image'; anchor: string }
      | { kind: 'icon'; sourcePathD: string; width?: number; height?: number },
  ) =>
    request<{ classification: 'editable' | 'dynamic' | 'unknown' }>(
      'POST',
      `/preview/${projectId}/edit-target/inspect`,
      { target },
    ),

  patchContent: (projectId: string, body: { token: string; original: string; replacement: string }) =>
    request<{ ok: boolean }>('PATCH', `/preview/${projectId}/content`, body),

  patchIcon: (
    projectId: string,
    body: {
      token: string;
      sourcePathD: string;
      newIconName?: string;
      uploadedUrl?: string;
      width?: number;
      height?: number;
    },
  ) => request<{ ok: boolean }>('PATCH', `/preview/${projectId}/icon`, body),

  deleteElement: (
    projectId: string,
    body: { token: string; kind: 'text' | 'image' | 'icon'; anchor: string },
  ) => request<{ ok: boolean }>('PATCH', `/preview/${projectId}/delete-element`, body),

  patchContentBatch: (
    projectId: string,
    body: {
      token: string;
      ops: Array<
        | { op: 'content'; original: string; replacement: string }
        | {
            op: 'textStyle';
            original: string;
            replacement: string;
            style: {
              bold?: boolean;
              italic?: boolean;
              fontSize?: string;
              fontFamily?: string;
              color?: string;
            };
          }
        | {
            op: 'icon';
            sourcePathD: string;
            newIconName?: string;
            uploadedUrl?: string;
            width?: number;
            height?: number;
          }
        | { op: 'delete'; kind: 'text' | 'image' | 'icon'; anchor: string }
      >;
    },
  ) => request<{ ok: boolean; applied: number }>('PATCH', `/preview/${projectId}/content-batch`, body),

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
      platformFromEmail: string;
      verified: boolean;
      provider: 'resend';
    }>('GET', `/email/settings/${projectId}`),
  emailSettingsPut: (projectId: string, body: { fromName?: string; fromEmail: string; domainId?: string | null }) =>
    request<{ projectId: string; fromName: string | null; fromEmail: string; platformFromEmail: string; domainId: string | null; verified: boolean; provider: 'resend' }>(
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

  // Improvement-plan subscription (€20/mo) + token top-ups. Raw token counts are NOT exposed
  // in responses to the improvement-plan UI — only a `pct` meter and a grants summary.
  iterationPlanCheckout: () =>
    request<{ url: string }>('POST', '/billing/iteration-plan-checkout'),
  iterationPlanCancel: () =>
    request<{ cancelAt: string | null }>('POST', '/billing/iteration-plan-cancel'),
  tokenTopupCheckout: () =>
    request<{ url: string }>('POST', '/billing/token-topup-checkout'),
  iterationPlanStatus: () =>
    request<{
      status: 'active' | 'past_due' | 'canceled' | 'none' | string;
      cancelAtPeriodEnd: boolean;
      periodStart: string;
      periodEnd: string;
      hasActiveSub: boolean;
      pct: number;
      grants: Array<{
        id: string;
        reason: 'migration' | 'admin_grant' | 'topup_purchase' | string;
        note: string | null;
        createdAt: string;
        expiresAt: string | null;
      }>;
    }>('GET', '/billing/iteration-plan'),

  listInvoices: () =>
    request<{
      invoices: Array<{
        id: string;
        number: string | null;
        status: string;
        amount: number;
        currency: string;
        date: number;
        description: string | null;
        hostedInvoiceUrl: string | null;
        invoicePdf: string | null;
      }>;
    }>('GET', '/billing/invoices'),

  listSubscriptions: () =>
    request<{
      subscriptions: Array<{
        id: string;
        kind: 'improvement_plan' | 'hosting' | 'other';
        label: string;
        status: string;
        cancelAtPeriodEnd: boolean;
        currentPeriodStart: number | null;
        currentPeriodEnd: number | null;
        amount: number | null;
        currency: string | null;
        interval: 'day' | 'week' | 'month' | 'year' | null;
        projectId: string | null;
      }>;
    }>('GET', '/billing/subscriptions'),

  adminGrantTokens: (
    userId: string,
    body: { tokens: number; reason?: 'admin_grant' | 'topup_purchase' | 'migration'; note?: string; expiresAt?: string | null },
  ) => request<{ ok: true; grantId: string }>('POST', `/admin/users/${userId}/token-grants`, body),
  adminUserTokenUsage: (userId: string) =>
    request<{
      user: {
        id: string;
        email: string;
        iterationSubStatus: string | null;
        iterationSubCurrentPeriodStart: string | null;
        iterationSubCurrentPeriodEnd: string | null;
      };
      byEndpoint: Array<{ endpoint: string; inputTokens: number; outputTokens: number; costCents: number }>;
      grants: Array<{
        id: string;
        reason: string;
        tokens: number;
        note: string | null;
        createdAt: string;
        expiresAt: string | null;
      }>;
      recentLogs: Array<{
        id: string;
        endpoint: string;
        provider: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
        costMicros: number;
        createdAt: string;
      }>;
    }>('GET', `/admin/users/${userId}/token-usage`),

  createSupportTicket: (body: { name: string; contactEmail: string; contactPhone: string; description: string }) =>
    request<{ id: string; createdAt: string }>('POST', '/support/tickets', body),
  adminSupportTicketsList: (opts?: { status?: 'open' | 'resolved' | 'all'; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (opts?.status && opts.status !== 'all') qs.set('status', opts.status);
    if (opts?.page) qs.set('page', String(opts.page));
    if (opts?.limit) qs.set('limit', String(opts.limit));
    const q = qs.toString();
    return request<{
      tickets: Array<{
        id: string;
        userId: string | null;
        userEmail: string;
        name: string;
        contactEmail: string;
        contactPhone: string;
        description: string;
        status: string;
        createdAt: string;
        updatedAt: string;
      }>;
      total: number;
      page: number;
      limit: number;
      openCount: number;
    }>('GET', `/admin/support-tickets${q ? `?${q}` : ''}`);
  },
  adminSupportTicketUpdate: (id: string, status: 'open' | 'resolved') =>
    request<{ id: string; status: string }>('PATCH', `/admin/support-tickets/${id}`, { status }),

  setHostedSubdomain: (projectId: string, slug: string) =>
    request<{
      customDomain: string | null;
      customDomainVerifiedAt: string | null;
      domainKind: 'first_party_subdomain' | 'custom_domain' | null;
      firstPartyRootDomain: string | null;
      firstPartySlug: string | null;
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
