import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  Stack,
  Paper,
  Fade,
  Alert,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useTranslation } from 'react-i18next';
import { EDIT_OVERLAY_SCRIPT } from '../lib/editOverlay';

interface Props {
  projectId: string;
  port: number;
  editToken?: string | null;
}

const WARN_AFTER_MS = 35_000;

const PREVIEW_USE_HOST_PORT =
  import.meta.env.VITE_PREVIEW_USE_HOST_PORT === 'true';
const PREVIEW_HOST_OVERRIDE = (
  import.meta.env.VITE_PREVIEW_HOST as string | undefined
)?.trim();

function directPreviewOrigin(port: number): string {
  const h =
    PREVIEW_HOST_OVERRIDE ||
    (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
  const proto =
    typeof window !== 'undefined' ? window.location.protocol : 'http:';
  return `${proto}//${h}:${port}/`;
}

/**
 * Embedded preview: either same-origin `/preview-app/:id/` or direct `http(s)://host:runPort/` when
 * `VITE_PREVIEW_USE_HOST_PORT` is set (Docker publishes 4100–4199 so `/assets/…` resolves on the preview origin).
 */
export default function PreviewFrame({ projectId, port, editToken }: Props) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const previewUrl = useMemo(() => {
    if (PREVIEW_USE_HOST_PORT && port > 0) return directPreviewOrigin(port);
    return `/preview-app/${projectId}/`;
  }, [projectId, port]);

  const [phase, setPhase] = useState<'checking' | 'framing' | 'ready' | 'error'>('checking');
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [softHint, setSoftHint] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState(0);

  const waitingRef = useRef(true);
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  /** Inject the overlay script once into the iframe (idempotent). */
  const injectOverlay = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const win = iframe.contentWindow as any;
    if (!win) return;
    if (!win.__editOverlayInjected) {
      // The IIFE inside EDIT_OVERLAY_SCRIPT sets win.__editOverlayInjected = true itself.
      // Do NOT pre-set it here — the script checks this flag as its own guard.
      const doc = iframe.contentDocument;
      if (doc?.body) {
        const script = doc.createElement('script');
        script.textContent = EDIT_OVERLAY_SCRIPT;
        doc.body.appendChild(script); // IIFE runs synchronously, sets __editOverlayInjected
      }
    }
    win.__editActive = true;
  }, []);

  /** Activate or deactivate the overlay without reloading the iframe. */
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const win = iframe.contentWindow as any;
    if (editToken) {
      injectOverlay();
    } else {
      win.__editActive = false;
      // Clean up any overlay remnants (IDs defined in EDIT_OVERLAY_SCRIPT).
      iframe.contentDocument?.getElementById('__edit-overlay-card')?.remove();
      iframe.contentDocument?.getElementById('__edit-overlay-backdrop')?.remove();
    }
  }, [editToken, injectOverlay]);

  const clearWarnTimer = () => {
    if (warnTimerRef.current) {
      clearTimeout(warnTimerRef.current);
      warnTimerRef.current = null;
    }
  };

  const retry = useCallback(() => {
    clearWarnTimer();
    waitingRef.current = true;
    setPhase('checking');
    setErrorTitle(null);
    setErrorHint(null);
    setSoftHint(null);
    setFrameKey((k) => k + 1);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    waitingRef.current = true;
    setPhase('checking');
    setErrorTitle(null);
    setErrorHint(null);
    setSoftHint(null);
    clearWarnTimer();

    const ac = new AbortController();

    if (PREVIEW_USE_HOST_PORT && port > 0) {
      // Poll with no-cors (cross-port fetch) until the server responds or we time out.
      const MAX_ATTEMPTS = 20;
      const INTERVAL_MS = 600;
      let attempt = 0;

      const poll = () => {
        if (!mountedRef.current || ac.signal.aborted) return;
        fetch(previewUrl, { method: 'GET', mode: 'no-cors', signal: ac.signal })
          .then(() => {
            // Opaque response (status 0) means the server responded — we're ready.
            if (!mountedRef.current || ac.signal.aborted) return;
            setPhase('framing');
            warnTimerRef.current = setTimeout(() => {
              if (mountedRef.current && waitingRef.current) {
                setSoftHint(t('previewFrame.stillLoading'));
              }
            }, WARN_AFTER_MS);
          })
          .catch((e: unknown) => {
            if (!mountedRef.current || ac.signal.aborted) return;
            if (e instanceof Error && e.name === 'AbortError') return;
            attempt += 1;
            if (attempt >= MAX_ATTEMPTS) {
              setPhase('error');
              setErrorTitle(t('previewFrame.errorCouldNotStart'));
              setErrorHint(t('previewFrame.errorCouldNotStartHint'));
              return;
            }
            setTimeout(poll, INTERVAL_MS);
          });
      };

      poll();
      return () => {
        ac.abort();
        clearWarnTimer();
      };
    }

    fetch(previewUrl, {
      method: 'GET',
      signal: ac.signal,
      credentials: 'include',
      headers: { Accept: 'text/html,application/xhtml+xml' },
    })
      .then((res) => {
        if (!mountedRef.current || ac.signal.aborted) return;

        if (res.status === 404) {
          setPhase('error');
          setErrorTitle(t('previewFrame.errorNotYet'));
          setErrorHint(t('previewFrame.errorNotYetHint'));
          return;
        }
        if (res.status === 503) {
          setPhase('error');
          setErrorTitle(t('previewFrame.errorCouldNotStart'));
          setErrorHint(t('previewFrame.errorCouldNotStartHint'));
          return;
        }
        if (!res.ok) {
          setPhase('error');
          setErrorTitle(t('previewFrame.errorHttp', { status: res.status }));
          setErrorHint(t('previewFrame.errorHttpHint'));
          return;
        }

        setPhase('framing');
        warnTimerRef.current = setTimeout(() => {
          if (mountedRef.current && waitingRef.current) {
            setSoftHint(t('previewFrame.stillLoading'));
          }
        }, WARN_AFTER_MS);
      })
      .catch((e: unknown) => {
        if (!mountedRef.current || ac.signal.aborted) return;
        if (e instanceof Error && e.name === 'AbortError') return;
        const msg = e instanceof Error ? e.message : String(e);
        setPhase('error');
        setErrorTitle(t('previewFrame.errorReach'));
        setErrorHint(msg);
      });

    return () => {
      ac.abort();
      clearWarnTimer();
    };
  }, [projectId, previewUrl, frameKey, port, t]);

  const handleIframeLoad = () => {
    waitingRef.current = false;
    clearWarnTimer();
    setSoftHint(null);
    setPhase('ready');
    // Re-inject overlay after iframe reloads (e.g. after a content rebuild)
    if (editToken) injectOverlay();
  };

  const handleIframeError = () => {
    waitingRef.current = false;
    clearWarnTimer();
    setPhase('error');
    setErrorTitle(t('previewFrame.errorLoad'));
    setErrorHint(t('previewFrame.errorLoadHint'));
  };

  const showOverlay = phase === 'checking' || phase === 'framing';

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', minHeight: 500 }}>
      {phase === 'error' && (
        <Paper
          elevation={0}
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 3,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Stack spacing={2} alignItems="center" maxWidth={420} textAlign="center">
            <Typography variant="h6" fontWeight={700}>
              {errorTitle}
            </Typography>
            {errorHint && (
              <Typography variant="body2" color="text.secondary">
                {errorHint}
              </Typography>
            )}
            <Button variant="contained" startIcon={<RefreshIcon />} onClick={retry}>
              {t('previewFrame.retryPreview')}
            </Button>
          </Stack>
        </Paper>
      )}

      {(phase === 'framing' || phase === 'ready') && (
        <iframe
          ref={iframeRef}
          key={frameKey}
          src={previewUrl}
          title={t('previewFrame.iframeTitle')}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          sandbox="allow-scripts allow-same-origin allow-forms"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: 8,
            background: '#fff',
            opacity: phase === 'ready' ? 1 : 0,
            transition: 'opacity 0.35s ease',
            pointerEvents: phase === 'ready' ? 'auto' : 'none',
          }}
        />
      )}

      <Fade in={showOverlay} timeout={280}>
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            display: showOverlay ? 'flex' : 'none',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            borderRadius: 2,
            background: 'linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.88) 100%)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <CircularProgress size={44} sx={{ color: 'primary.light' }} />
          <Typography variant="body1" color="grey.100" fontWeight={600}>
            {phase === 'checking' ? t('previewFrame.connecting') : t('previewFrame.loadingApp')}
          </Typography>
          <Typography variant="caption" color="grey.400" sx={{ maxWidth: 320, textAlign: 'center', px: 2 }}>
            {t('previewFrame.hintWait')}
          </Typography>
        </Box>
      </Fade>

      {softHint && phase !== 'error' && (
        <Alert
          severity="info"
          sx={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            right: 12,
            zIndex: 4,
            borderRadius: 2,
          }}
        >
          {softHint}
        </Alert>
      )}
    </Box>
  );
}
