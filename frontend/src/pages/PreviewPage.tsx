import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, Button, Tooltip,
  IconButton, Stack, CircularProgress, Paper, Alert,
  Dialog, DialogTitle, DialogContent, Divider, Snackbar, Backdrop, Collapse, List, ListItem, ListItemText,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import LockIcon from '@mui/icons-material/Lock';
import CloudIcon from '@mui/icons-material/Cloud';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RefreshIcon from '@mui/icons-material/Refresh';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import BarChartIcon from '@mui/icons-material/BarChart';
import PaymentsIcon from '@mui/icons-material/Payments';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EditIcon from '@mui/icons-material/Edit';
import StorefrontIcon from '@mui/icons-material/Storefront';
import ArticleIcon from '@mui/icons-material/Article';
import DashboardIcon from '@mui/icons-material/Dashboard';
import HistoryIcon from '@mui/icons-material/History';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DescriptionIcon from '@mui/icons-material/Description';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

import PreviewFrame from '../components/PreviewFrame';
import CatalogPanel from '../components/CatalogPanel';
import BookingSlotsPanel from '../components/BookingSlotsPanel';
import InquiriesPanel from '../components/InquiriesPanel';
import BlogPanel from '../components/BlogPanel';
import DashboardPanel from '../components/DashboardPanel';
import IterationBar from '../components/IterationBar';
import ProjectCheckout from '../components/UpgradeGate';
import PaymentsSetupDialog from '../components/PaymentsSetupDialog';
import MessageBubble from '../components/MessageBubble';
import IterationPlanCard from '../components/IterationPlanCard';

import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useProjectStore } from '../store/project';
import HostingPanel from '../components/HostingPanel';
import { Joyride } from 'react-joyride';
import { usePreviewTour } from '../hooks/usePreviewTour';

const DRAWER_WIDTH = 400;

/** What we store in iteration history / session — not the English codegen spec. */
function buildUserFacingIterationLogMessage(
  summary: string,
  planBulletsBg: string[],
  specFallback: string,
): string {
  const lines = [summary.trim(), ...planBulletsBg.map((b) => b.trim()).filter(Boolean)].filter(
    (s) => s.length > 0,
  );
  const text = lines.join('\n');
  if (text.length > 0) return text.slice(0, 4000);
  return specFallback.trim().slice(0, 800);
}

/** Older logs stored the raw internal spec in title/description — hide in the UI. */
function looksLikeInternalIterationSpec(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    /^assumptions:/i.test(t) ||
    /target files \(edit only/i.test(t) ||
    /implement the requested change described by the user/i.test(t) ||
    /keep existing styles and flows unless explicitly requested/i.test(t) ||
    /prefer minimal edits/i.test(t) ||
    /ensure build passes and ui remains consistent/i.test(t)
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  color?: string;
  pulsing?: boolean;
}

function ActionButton({ icon, label, onClick, disabled, active, color, pulsing }: ActionButtonProps) {
  return (
    <Box
      component="button"
      onClick={disabled ? undefined : onClick}
      sx={{
        all: 'unset',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
        px: 0.5,
        py: 1.25,
        width: '100%',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        borderRadius: 1.5,
        transition: 'background 0.15s, color 0.15s',
        color: active || pulsing ? (color ?? 'primary.main') : 'text.secondary',
        position: 'relative',
        '@keyframes actionPulse': {
          '0%, 100%': {
            backgroundColor: 'rgba(52,211,153,0.06)',
            boxShadow: '0 0 0 0 rgba(52,211,153,0)',
          },
          '50%': {
            backgroundColor: 'rgba(52,211,153,0.18)',
            boxShadow: '0 0 0 4px rgba(52,211,153,0.25)',
          },
        },
        animation: pulsing ? 'actionPulse 1.1s ease-in-out infinite' : 'none',
        '&:hover': disabled ? {} : {
          bgcolor: 'action.hover',
          color: color ?? 'primary.main',
        },
      }}
    >
      <Box sx={{ fontSize: 20, display: 'flex', color: 'inherit' }}>{icon}</Box>
      <Typography variant="caption" sx={{ fontSize: 9.5, fontWeight: 600, lineHeight: 1, color: 'inherit', textAlign: 'center' }}>
        {label}
      </Typography>
    </Box>
  );
}

export default function PreviewPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutReason, setCheckoutReason] = useState('');
  const [iterating, setIterating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [downloadPreparingOpen, setDownloadPreparingOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [drawerMode, setDrawerMode] = useState<'improvements' | 'catalog' | 'booking_slots' | 'inquiries' | 'blog' | 'dashboard' | 'hosting'>('improvements');
  const [iterateChat, setIterateChat] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [pendingIterate, setPendingIterate] = useState<null | {
    summary: string;
    planBulletsBg: string[];
    spec: string;
    targetFiles: string[];
    explorerContextNotes?: string;
  }>(null);
  const [iterationHistory, setIterationHistory] = useState<Array<{ id: string; title: string | null; description: string | null; createdAt: string }>>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(
    searchParams.get('payments') === '1' ||
    searchParams.get('connected') === 'true' ||
    Boolean(searchParams.get('error')),
  );
  const paymentsOauthResult = searchParams.get('connected') === 'true'
    ? 'connected' as const
    : searchParams.get('error')
    ? 'error' as const
    : null;
  const paymentsOauthError = searchParams.get('error') ?? null;

  const store = useProjectStore();
  const tour = usePreviewTour(store.projectPaid);

  const [paymentsConfigured, setPaymentsConfigured] = useState(true);
  const [planNeedsPayments, setPlanNeedsPayments] = useState(false);
  const [planAppType, setPlanAppType] = useState<string | null>(null);
  const [planHasContactForm, setPlanHasContactForm] = useState(false);

  const [editToken, setEditToken] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editDynamicError, setEditDynamicError] = useState(false);
  /** For catalog/booking panels: X-Admin-Token on writes to generated /api (app-runner enforces PUT/DELETE). */
  const [adminApiToken, setAdminApiToken] = useState<string | null>(null);

  const loadProject = async () => {
    if (!projectId) return;
    const p = await api.get<any>(`/preview/${projectId}`);
    store.setRunPort(p.runPort);
    store.setProjectId(p.id);
    if (p.sessionId) store.setSessionId(p.sessionId);
    store.setProjectPaid(p.paid);
    store.setAllowUnpaidDownload(p.allowUnpaidDownload === true);
    store.setProjectHosted(p.hosted);
    store.setIterationInfo(p.iterationsTotal ?? 0, p.paidIterationCredits ?? 0, p.freeIterationLimit ?? 2);
    setPaymentsConfigured(p.paymentsEnabled ?? false);
    setPlanNeedsPayments(p.planNeedsPayments ?? false);
    setPlanAppType(p.planAppType ?? null);
    setPlanHasContactForm(p.planHasContactForm === true);

    try {
      const { token } = await api.getAdminToken(projectId);
      setAdminApiToken(token);
    } catch {
      setAdminApiToken(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const wantsRefresh =
      searchParams.get('paid') === 'true' ||
      searchParams.get('hosted') === 'true' ||
      searchParams.get('iteration_paid') === 'true';

    const pollForBillingUpdate = async () => {
      // Webhooks can take a moment; poll briefly so the UI reflects payment without a manual refresh.
      // (Also covers cases where the user returns before the CLI-forwarded webhook lands.)
      for (let i = 0; i < 15 && !cancelled; i++) {
        await loadProject().catch(() => {});
        const st = useProjectStore.getState();
        const okPaid = searchParams.get('paid') !== 'true' || st.projectPaid;
        const okHosted = searchParams.get('hosted') !== 'true' || st.projectHosted;
        // Iteration credits aren't stored in the store currently; loadProject refresh is still useful.
        if (okPaid && okHosted) return;
        await new Promise((r) => setTimeout(r, 1000));
      }
    };

    if (wantsRefresh) {
      pollForBillingUpdate().catch(() => {});
    } else {
      loadProject().catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const enterEditMode = async () => {
    if (!projectId) return;
    try {
      const { token } = await api.getEditToken(projectId);
      setEditToken(token);
    } catch (e: any) {
      alert(e.message ?? t('errors.generic'));
    }
  };

  const exitEditMode = () => setEditToken(null);

  const pollUntilRunning = async (id: string) => {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const p = await api.get<any>(`/preview/${id}`);
      if (p.status === 'running') return;
      if (p.status === 'error') {
        throw new Error(p.errorLog || t('previewFrame.errorCouldNotStartHint'));
      }
    }
    throw new Error(t('previewFrame.errorCouldNotStartHint'));
  };

  useEffect(() => {
    if (!editToken) return;
    const handler = async (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'EDIT_SAVED') return;
      const { patch } = e.data as {
        patch: {
          original: string;
          replacement: string | null;
          isImg: boolean;
          imageDataUrl?: string;
          imageFilename?: string;
        };
      };
      setEditSaving(true);
      try {
        let replacement = patch.replacement ?? '';
        // If the user uploaded a file, send it to the backend first and get back a URL
        if (patch.imageDataUrl) {
          const { url } = await api.uploadImage(projectId!, patch.imageDataUrl, patch.imageFilename ?? 'image.jpg');
          replacement = url;
        }
        await api.patchContent(projectId!, { token: editToken, original: patch.original, replacement });
        await pollUntilRunning(projectId!);
        // Reload the preview iframe after rebuild
        setRefreshKey((k) => k + 1);
        await loadProject();
      } catch (err: any) {
        const msg: string = err.message ?? '';
        const status: number | undefined = err.status;
        // Dynamic content (catalog) or blocked targets (e.g. server.js) should guide user to Catalog.
        if (status === 409 || msg.toLowerCase().includes('not found')) {
          setEditDynamicError(true);
        } else {
          alert(msg || t('errors.generic'));
        }
      } finally {
        setEditSaving(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [editToken]);

  const canDownloadZip = store.projectPaid || store.allowUnpaidDownload;

  const handleDownload = async () => {
    if (!canDownloadZip) {
      setCheckoutReason(t('preview.downloadLockedReason'));
      setCheckoutOpen(true);
      return;
    }
    setDownloadPreparingOpen(true);
    try {
      await api.download(`/preview/${projectId}/download`, `project-${projectId}.zip`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('preview.downloadFailed');
      alert(msg);
    } finally {
      setDownloadPreparingOpen(false);
    }
  };

  const handleHosting = async () => {
    try {
      const { url } = await api.post<{ url: string }>('/billing/hosting-checkout', { projectId });
      window.location.href = url;
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBuyIteration = async (quantity: number) => {
    if (!projectId) return;
    try {
      const { url } = await api.post<{ url: string }>('/billing/iteration-checkout', { projectId, quantity });
      window.location.href = url;
    } catch (err: any) {
      alert(err.message);
    }
  };

  const fetchHistory = useCallback(() => {
    if (!projectId) return;
    api
      .get<Array<{ id: string; title: string | null; description: string | null; createdAt: string }>>(
        `/preview/${projectId}/iteration-history`,
      )
      .then(setIterationHistory)
      .catch(() => {});
  }, [projectId]);

  // Load iteration history when the improvements drawer is visible (initial mount + switching back from other panels).
  useEffect(() => {
    if (!projectId || !drawerOpen || drawerMode !== 'improvements') return;
    fetchHistory();
  }, [projectId, drawerOpen, drawerMode, fetchHistory]);

  const confirmIterationPlan = () => {
    if (!store.sessionId || !pendingIterate) return;
    if (!store.projectPaid && !store.allowUnpaidDownload) {
      setCheckoutReason('');
      setCheckoutOpen(true);
      return;
    }
    const snapshot = pendingIterate;
    setIterating(true);
    useProjectStore.setState({ fixAttempts: [] });
    store.setGenerationFriendlyMessage(t('preview.applyingChanges'));
    store.generationSteps.forEach((s) =>
      store.updateStep({ step: s.step, label: s.label, status: 'pending' }),
    );

    const userFacingMessage = buildUserFacingIterationLogMessage(
      snapshot.summary,
      snapshot.planBulletsBg,
      snapshot.spec,
    );

    api.streamEvents(
      '/iterate',
      {
        sessionId: store.sessionId,
        message: userFacingMessage,
        spec: snapshot.spec,
        targetFiles: snapshot.targetFiles,
        explorerContextNotes: snapshot.explorerContextNotes,
      },
      (event: any) => {
        if (event.step) store.updateStep({ step: event.step, label: event.label, status: event.status });
        if (event.type === 'user_progress' && typeof event.message === 'string') {
          store.setGenerationFriendlyMessage(event.message);
        }
        if (event.type === 'fix_attempt') store.addFixAttempt({ attempt: event.attempt, error: event.error });
        if (event.type === 'preview_updated') {
          store.setRunPort(event.port);
          setRefreshKey((k) => k + 1);
          loadProject().catch(() => {});
          fetchHistory();
          setIterateChat((prev) => [...prev, { role: 'assistant', content: t('preview.changesApplied') }]);
        }
        if (event.type === 'fatal') {
          store.setGenerationFriendlyMessage('');
          setIterateChat((prev) => [...prev, { role: 'assistant', content: t('preview.iterationFailed', { msg: event.message }) }]);
        }
      },
      () => {
        store.setGenerationFriendlyMessage('');
        setIterating(false);
        setPendingIterate(null);
      },
    );
  };

  const handleIterate = async (message: string) => {
    if (!store.sessionId) return;
    const text = message.trim();
    if (!text) return;

    if (pendingIterate) {
      setPendingIterate(null);
    }

    setIterateChat((prev) => [...prev, { role: 'user', content: text }]);

    try {
      const res = await api.post<
        | { kind: 'question'; message: string }
        | {
            kind: 'ready';
            summary: string;
            planBulletsBg: string[];
            spec: string;
            targetFiles: string[];
            nonGoals: string[];
            explorerContextNotes?: string;
          }
      >(
        '/iterate/clarify',
        { sessionId: store.sessionId, messages: [...iterateChat, { role: 'user', content: text }] },
      );

      if (res.kind === 'question') {
        setIterateChat((prev) => [...prev, { role: 'assistant', content: res.message }]);
        return;
      }

      const summaryText = res.summary ?? '';
      const fromApi = Array.isArray(res.planBulletsBg) ? res.planBulletsBg.filter((s) => s.trim()) : [];
      const planBulletsBg =
        fromApi.length > 0
          ? fromApi
          : summaryText
              .split(/(?<=[.!?])\s+/)
              .map((s) => s.trim())
              .filter((s) => s.length > 12);

      setPendingIterate({
        summary: summaryText,
        planBulletsBg,
        spec: res.spec,
        targetFiles: res.targetFiles ?? [],
        explorerContextNotes: res.explorerContextNotes,
      });
      return;
    } catch {
      setIterateChat((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'Можеш ли да уточниш какво точно да се промени и къде? (Ще задам максимум 1 кратък въпрос и после ще го приложа.)',
        },
      ]);
      return;
    }
  };

  if (!projectId) return null;

  const { projectPaid, allowUnpaidDownload, projectHosted } = store;

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Joyride
        steps={tour.steps}
        run={tour.run}
        onEvent={tour.handleCallback}
        continuous
        options={{
          primaryColor: '#6366f1',
          backgroundColor: '#1e293b',
          textColor: '#f1f5f9',
          zIndex: 1400,
          showProgress: true,
          buttons: ['back', 'skip', 'primary'],
        }}
        locale={{
          back: t('tour.back'),
          close: t('tour.finish'),
          last: t('tour.finish'),
          next: t('tour.next'),
          nextWithProgress: t('tour.nextWithProgress', { current: '{current}', total: '{total}' }),
          skip: t('tour.skip'),
        }}
        styles={{
          tooltip: { borderRadius: 12, overflow: 'visible' },
          arrow: { zIndex: 1 },
          buttonBack: { fontWeight: 700 },
          buttonPrimary: { fontWeight: 700 },
          buttonSkip: { fontWeight: 700 },
        }}
      />
      <Backdrop
        open={editSaving}
        sx={{
          zIndex: (theme) => theme.zIndex.modal + 2,
          color: '#fff',
          backgroundColor: 'rgba(2,6,23,0.72)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <Stack spacing={1.25} alignItems="center" sx={{ px: 3 }}>
          <CircularProgress size={42} />
          <Typography variant="subtitle1" fontWeight={800} textAlign="center">
            {t('editMode.saving')}
          </Typography>
          <Typography variant="body2" color="rgba(255,255,255,0.72)" textAlign="center" sx={{ maxWidth: 420 }}>
            {t('preview.refresh')} {/* reusing existing string to avoid adding new i18n keys */}
          </Typography>
        </Stack>
      </Backdrop>

      {/* ── Top bar ── */}
      <AppBar position="static" color="transparent" elevation={0}
        sx={{ borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Toolbar sx={{ minHeight: '48px !important', gap: 1 }}>
          <IconButton
            onClick={() => {
              navigate(store.sessionId ? `/chat/${store.sessionId}` : '/chat');
            }}
            size="small"
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <AutoAwesomeIcon color="primary" sx={{ fontSize: 18 }} />
          <Typography variant="subtitle1" fontWeight={700}>
            {t('preview.title')}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Tooltip title={t('tour.replayTooltip')}>
            <span>
              <IconButton
                size="small"
                onClick={() => {
                  if (store.projectPaid) tour.replayTourB();
                  else tour.replayTourA();
                }}
              >
                <HelpOutlineIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

        </Toolbar>
      </AppBar>

      {/* ── Body ── */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left: action strip ── */}
        <Box
          data-tour="preview-action-strip"
          sx={{
            width: 68,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            py: 1,
            px: 0.75,
            gap: 0.25,
          }}
        >
          <Tooltip title={drawerOpen && drawerMode === 'improvements' ? t('preview.hideImprovements') : t('preview.showImprovements')} placement="right">
            <Box data-tour="action-improvements">
              <ActionButton
                icon={<AutoFixHighIcon fontSize="inherit" />}
                label={t('iteration.barLabel')}
                onClick={() => {
                  if (drawerOpen && drawerMode === 'improvements') {
                    setDrawerOpen(false);
                  } else {
                    setDrawerMode('improvements');
                    setDrawerOpen(true);
                  }
                }}
                active={drawerOpen && drawerMode === 'improvements'}
              />
            </Box>
          </Tooltip>

          <Divider sx={{ my: 0.5 }} />

          <Tooltip title={canDownloadZip ? t('preview.downloadZip') : t('preview.downloadLocked')} placement="right">
            <Box data-tour="action-download">
              <ActionButton
                icon={canDownloadZip ? <DownloadIcon fontSize="inherit" /> : <LockIcon fontSize="inherit" />}
                label={t('preview.download')}
                onClick={handleDownload}
                disabled={iterating}
                color={canDownloadZip ? undefined : '#f87171'}
              />
            </Box>
          </Tooltip>

          <Divider sx={{ my: 0.5 }} />

          <Box data-tour="action-hosting">
          {projectHosted ? (
            <Tooltip title={t('preview.hosted')} placement="right">
              <Box>
                <ActionButton
                  icon={<CloudDoneIcon fontSize="inherit" />}
                  label={t('preview.hosted')}
                  onClick={() => {
                    if (drawerOpen && drawerMode === 'hosting') {
                      setDrawerOpen(false);
                    } else {
                      setDrawerMode('hosting');
                      setDrawerOpen(true);
                    }
                  }}
                  active={drawerOpen && drawerMode === 'hosting'}
                  color="#a855f7"
                />
              </Box>
            </Tooltip>
          ) : (
            <Tooltip title={projectPaid ? t('preview.hostTooltip') : t('preview.unlockTitle')} placement="right">
              <Box>
                <ActionButton
                  icon={<CloudIcon fontSize="inherit" />}
                  label={t('preview.hostCta')}
                  onClick={handleHosting}
                  disabled={!projectPaid}
                />
              </Box>
            </Tooltip>
          )}
          </Box>

          <Divider sx={{ my: 0.5 }} />

          <Tooltip title={t('common.analytics')} placement="right">
            <Box data-tour="action-analytics">
              <ActionButton
                icon={<BarChartIcon fontSize="inherit" />}
                label={t('common.analytics')}
                onClick={() => navigate(`/analytics/${projectId}`)}
              />
            </Box>
          </Tooltip>

          <Tooltip title={t('payments.setupTooltip')} placement="right">
            <Box data-tour="action-payments">
              <ActionButton
                icon={<PaymentsIcon fontSize="inherit" />}
                label={t('payments.setupCta')}
                onClick={() => setPaymentsOpen(true)}
              />
            </Box>
          </Tooltip>

          {planAppType === 'booking' ? (
            <Tooltip title={t('bookingSlots.tooltip')} placement="right">
              <Box>
                <ActionButton
                  icon={<CalendarMonthIcon fontSize="inherit" />}
                  label={t('bookingSlots.label')}
                  onClick={() => {
                    if (drawerOpen && drawerMode === 'booking_slots') setDrawerOpen(false);
                    else { setDrawerMode('booking_slots'); setDrawerOpen(true); }
                  }}
                  active={drawerOpen && drawerMode === 'booking_slots'}
                  color="#34d399"
                />
              </Box>
            </Tooltip>
          ) : planAppType === 'blog' ? (
            <Tooltip title={t('blog.tooltip')} placement="right">
              <Box>
                <ActionButton
                  icon={<ArticleIcon fontSize="inherit" />}
                  label={t('blog.label')}
                  onClick={() => {
                    if (drawerOpen && drawerMode === 'blog') setDrawerOpen(false);
                    else { setDrawerMode('blog'); setDrawerOpen(true); }
                  }}
                  active={drawerOpen && drawerMode === 'blog'}
                  color="#34d399"
                />
              </Box>
            </Tooltip>
          ) : planAppType === 'dashboard' ? (
            <Tooltip title={t('dashboard.tooltip')} placement="right">
              <Box>
                <ActionButton
                  icon={<DashboardIcon fontSize="inherit" />}
                  label={t('dashboard.label')}
                  onClick={() => {
                    if (drawerOpen && drawerMode === 'dashboard') setDrawerOpen(false);
                    else { setDrawerMode('dashboard'); setDrawerOpen(true); }
                  }}
                  active={drawerOpen && drawerMode === 'dashboard'}
                  color="#34d399"
                />
              </Box>
            </Tooltip>
          ) : planHasContactForm ? (
            <Tooltip title={t('inquiries.tooltip')} placement="right">
              <Box>
                <ActionButton
                  icon={<MailOutlineIcon fontSize="inherit" />}
                  label={t('inquiries.label')}
                  onClick={() => {
                    if (drawerOpen && drawerMode === 'inquiries') setDrawerOpen(false);
                    else { setDrawerMode('inquiries'); setDrawerOpen(true); }
                  }}
                  active={drawerOpen && drawerMode === 'inquiries'}
                  color="#34d399"
                />
              </Box>
            </Tooltip>
          ) : planAppType === 'portfolio' || planAppType === 'landing_page' || planAppType === 'saas' ? null : (
            <Tooltip title={editDynamicError ? t('editMode.useCatalogTooltip') : t('catalog.tooltip')} placement="right">
              <Box>
                <ActionButton
                  icon={<StorefrontIcon fontSize="inherit" />}
                  label={t('catalog.label')}
                  onClick={() => {
                    setEditDynamicError(false);
                    if (drawerOpen && drawerMode === 'catalog') setDrawerOpen(false);
                    else { setDrawerMode('catalog'); setDrawerOpen(true); }
                  }}
                  active={drawerOpen && drawerMode === 'catalog'}
                  pulsing={editDynamicError}
                  color="#34d399"
                />
              </Box>
            </Tooltip>
          )}

          <Divider sx={{ my: 0.5 }} />

          <Tooltip title={editToken ? t('editMode.exit') : t('editMode.enter')} placement="right">
            <Box data-tour="action-edit">
              <ActionButton
                icon={<EditIcon fontSize="inherit" />}
                label={t('editMode.label')}
                onClick={editToken ? exitEditMode : enterEditMode}
                active={!!editToken}
                color="#f5a97f"
              />
            </Box>
          </Tooltip>

          {projectPaid && (
            <Tooltip title="Редактирай файловете" placement="right">
              <Box data-tour="action-files">
                <ActionButton
                  icon={<DescriptionIcon fontSize="inherit" />}
                  label="Файлове"
                  onClick={() => navigate(`/files/${projectId}`)}
                  color="#60a5fa"
                />
              </Box>
            </Tooltip>
          )}

          {projectPaid && (
            <Tooltip title="Настройки за имейли" placement="right">
              <Box data-tour="action-email">
                <ActionButton
                  icon={<MailOutlineIcon fontSize="inherit" />}
                  label="Имейл"
                  onClick={() => navigate(`/email/${projectId}`)}
                  color="#34d399"
                />
              </Box>
            </Tooltip>
          )}

          <Divider sx={{ my: 0.5 }} />

          <Tooltip title={t('preview.refresh')} placement="right">
            <Box data-tour="action-refresh">
              <ActionButton
                icon={<RefreshIcon fontSize="inherit" />}
                label={t('preview.refresh')}
                onClick={() => setRefreshKey((k) => k + 1)}
              />
            </Box>
          </Tooltip>
        </Box>

        {/* ── Center: preview frame ── */}
        <Box
          data-tour="preview-frame"
          sx={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}
        >
          {planNeedsPayments && !paymentsConfigured && (
            <Alert
              severity="warning"
              sx={{ borderRadius: 0, flexShrink: 0 }}
              action={
                <Button size="small" color="inherit" onClick={() => setPaymentsOpen(true)}>
                  {t('payments.setupCta')}
                </Button>
              }
            >
              {t('payments.notConfiguredBanner')}
            </Alert>
          )}
          {editToken && (
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.75,
              background: 'rgba(245,169,127,0.12)', borderBottom: '1px solid rgba(245,169,127,0.3)',
              flexShrink: 0,
            }}>
              <EditIcon sx={{ fontSize: 14, color: '#f5a97f' }} />
              <Typography variant="caption" sx={{ color: '#f5a97f', fontWeight: 600, flex: 1 }}>
                {editSaving ? t('editMode.saving') : t('editMode.active')}
              </Typography>
              {editSaving && <CircularProgress size={12} sx={{ color: '#f5a97f' }} />}
              <Button size="small" sx={{ fontSize: 11, color: '#f5a97f', py: 0.25 }} onClick={exitEditMode}>
                {t('editMode.exit')}
              </Button>
            </Box>
          )}
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            {store.runPort != null ? (
              <PreviewFrame key={refreshKey} projectId={projectId} port={store.runPort ?? 0} editToken={editToken} />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <CircularProgress />
              </Box>
            )}
          </Box>
        </Box>

        {/* ── Right drawer (collapsible) ── */}
        <Box
          sx={{
            width: drawerOpen ? DRAWER_WIDTH : 0,
            flexShrink: 0,
            overflow: 'hidden',
            transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column',
            borderLeft: drawerOpen ? '1px solid' : 'none',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          {/* Inner wrapper — fixed width so content doesn't squash during animation */}
          <Box sx={{ width: DRAWER_WIDTH, display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* Panel header */}
            <Box sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
              {drawerMode === 'catalog' ? (
                <StorefrontIcon sx={{ fontSize: 15, color: '#34d399' }} />
              ) : drawerMode === 'booking_slots' ? (
                <CalendarMonthIcon sx={{ fontSize: 15, color: '#34d399' }} />
              ) : drawerMode === 'inquiries' ? (
                <MailOutlineIcon sx={{ fontSize: 15, color: '#34d399' }} />
              ) : drawerMode === 'blog' ? (
                <ArticleIcon sx={{ fontSize: 15, color: '#34d399' }} />
              ) : drawerMode === 'dashboard' ? (
                <DashboardIcon sx={{ fontSize: 15, color: '#34d399' }} />
              ) : drawerMode === 'hosting' ? (
                <CloudDoneIcon sx={{ fontSize: 15, color: '#a855f7' }} />
              ) : (
                <AutoFixHighIcon sx={{ fontSize: 15, color: 'primary.main' }} />
              )}
              <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: 13, flex: 1 }}>
                {drawerMode === 'catalog'
                  ? t('catalog.label')
                  : drawerMode === 'booking_slots'
                  ? t('bookingSlots.label')
                  : drawerMode === 'inquiries'
                  ? t('inquiries.label')
                  : drawerMode === 'blog'
                  ? t('blog.label')
                  : drawerMode === 'dashboard'
                  ? t('dashboard.label')
                  : drawerMode === 'hosting'
                  ? t('preview.hosted')
                  : t('iteration.barLabel')}
              </Typography>
              <IconButton size="small" onClick={() => setDrawerOpen(false)} sx={{ mr: -0.5 }}>
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Box>

            {/* Catalog mode */}
            {drawerMode === 'catalog' && (
              <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <CatalogPanel
                  projectId={projectId}
                  runPort={store.runPort ?? null}
                  adminApiToken={adminApiToken}
                />
              </Box>
            )}

            {/* Booking slots mode */}
            {drawerMode === 'booking_slots' && (
              <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: 1.5 }}>
                <BookingSlotsPanel projectId={projectId} adminApiToken={adminApiToken} />
              </Box>
            )}

            {/* Inquiries mode */}
            {drawerMode === 'inquiries' && (
              <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: 1.5 }}>
                <InquiriesPanel projectId={projectId} />
              </Box>
            )}

            {/* Blog mode */}
            {drawerMode === 'blog' && (
              <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <BlogPanel projectId={projectId} runPort={store.runPort ?? null} />
              </Box>
            )}

            {/* Dashboard mode */}
            {drawerMode === 'dashboard' && (
              <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <DashboardPanel projectId={projectId} runPort={store.runPort ?? null} />
              </Box>
            )}

            {/* Hosting mode */}
            {drawerMode === 'hosting' && (
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                <HostingPanel
                  projectId={projectId}
                  hosted={projectHosted}
                  paid={projectPaid}
                  onUpdated={() => loadProject().catch(() => {})}
                />
              </Box>
            )}

            {/* Improvements mode */}
            {drawerMode === 'improvements' && (
              <>
                {/* Scrollable middle */}
                <Box
                  data-tour="drawer-improvements"
                  sx={{ flex: 1, overflow: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}
                >
                  {allowUnpaidDownload && !projectPaid && (
                    <Alert severity="warning" sx={{ py: 0.5, fontSize: 12 }}>
                      {t('preview.testModeAlert')}
                    </Alert>
                  )}

                  {iterateChat.length === 0 && (
                    <MessageBubble
                      role="assistant"
                      content={t('preview.improvementsHint')}
                    />
                  )}
                  {iterateChat.map((m, idx) => (
                    <MessageBubble key={idx} role={m.role} content={m.content} />
                  ))}

                  {pendingIterate && (
                    <IterationPlanCard
                      summary={pendingIterate.summary}
                      planBulletsBg={pendingIterate.planBulletsBg}
                      loading={iterating}
                      showUnlockHint={!projectPaid && !allowUnpaidDownload}
                      onConfirm={confirmIterationPlan}
                      onEdit={() => setPendingIterate(null)}
                    />
                  )}

                  {iterating && (
                    <MessageBubble
                      role="assistant"
                      content={store.generationFriendlyMessage || t('preview.applyingChanges')}
                    />
                  )}

                  {!projectPaid && (
                    <Paper variant="outlined" sx={{ p: 1.5, borderColor: 'primary.main', borderWidth: 2 }}>
                      <Stack direction="row" alignItems="center" gap={1} mb={1}>
                        <RocketLaunchIcon color="primary" sx={{ fontSize: 17 }} />
                        <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: 13 }}>
                          {t('preview.unlockTitle')}
                        </Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" display="block" mb={1.25}>
                        {t('preview.unlockSubtitle')}
                      </Typography>
                      <Button variant="contained" fullWidth size="small"
                        onClick={() => { setCheckoutReason(''); setCheckoutOpen(true); }}>
                        {t('preview.unlockCta')}
                      </Button>
                    </Paper>
                  )}

                  {/* History section */}
                  {iterationHistory.length > 0 && (
                    <Box sx={{ mt: 0.5 }}>
                      <Box
                        component="button"
                        onClick={() => {
                          if (!historyOpen) fetchHistory();
                          setHistoryOpen((v) => !v);
                        }}
                        sx={{
                          all: 'unset', display: 'flex', alignItems: 'center', gap: 0.75,
                          width: '100%', cursor: 'pointer', py: 0.5, px: 0.5, borderRadius: 1,
                          color: 'text.secondary', '&:hover': { color: 'text.primary' },
                        }}
                      >
                        <HistoryIcon sx={{ fontSize: 14 }} />
                        <Typography variant="caption" fontWeight={600} sx={{ flex: 1, fontSize: 11 }}>
                          {t('preview.historyLabel', { n: iterationHistory.length })}
                        </Typography>
                        <ExpandMoreIcon sx={{ fontSize: 14, transform: historyOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                      </Box>
                      <Collapse in={historyOpen}>
                        <List dense disablePadding sx={{ mt: 0.5 }}>
                          {iterationHistory.map((entry, i) => {
                            const titleRaw = entry.title?.trim() ?? '';
                            const descRaw = entry.description?.trim() ?? '';
                            const titleBad = titleRaw && looksLikeInternalIterationSpec(titleRaw);
                            const descBad = descRaw && looksLikeInternalIterationSpec(descRaw);
                            const displayTitle =
                              titleBad || !titleRaw ? t('preview.historyUntitled') : titleRaw;
                            const displayDesc = !descBad && descRaw ? descRaw : null;
                            return (
                            <Box key={entry.id}>
                              <ListItem sx={{ px: 0.5, py: 0.75, alignItems: 'flex-start' }}>
                                <ListItemText
                                  primary={displayTitle}
                                  secondary={(
                                    <Box component="span" sx={{ display: 'block' }}>
                                      <Typography
                                        component="span"
                                        variant="caption"
                                        sx={{ fontSize: 10, color: 'text.disabled', display: 'block' }}
                                      >
                                        {new Date(entry.createdAt).toLocaleDateString('bg-BG', {
                                          day: '2-digit',
                                          month: 'short',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </Typography>
                                      {displayDesc ? (
                                        <Typography
                                          component="span"
                                          variant="caption"
                                          sx={{
                                            display: 'block',
                                            mt: 0.35,
                                            fontSize: 11,
                                            color: 'text.secondary',
                                            whiteSpace: 'pre-wrap',
                                            lineHeight: 1.35,
                                          }}
                                        >
                                          {displayDesc}
                                        </Typography>
                                      ) : null}
                                    </Box>
                                  )}
                                  primaryTypographyProps={{ variant: 'caption', fontWeight: 600, sx: { lineHeight: 1.3 } }}
                                  slotProps={{ secondary: { component: 'div' } }}
                                />
                              </ListItem>
                              {i < iterationHistory.length - 1 && <Divider sx={{ opacity: 0.4 }} />}
                            </Box>
                            );
                          })}
                        </List>
                      </Collapse>
                    </Box>
                  )}
                </Box>

                {/* Pinned iteration input */}
                <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
                  <IterationBar
                    onSubmit={handleIterate}
                    loading={iterating}
                    onBuyIteration={handleBuyIteration}
                  />
                </Box>
              </>
            )}
          </Box>
        </Box>

      </Box>

      {/* ── Dialogs ── */}
      <Dialog
        open={downloadPreparingOpen}
        onClose={() => {}}
        disableEscapeKeyDown
        aria-labelledby="download-prep-title"
        PaperProps={{ sx: { borderRadius: 2, minWidth: { xs: '100%', sm: 360 } } }}
      >
        <DialogTitle id="download-prep-title" fontWeight={700}>
          {t('preview.downloadPrepTitle')}
        </DialogTitle>
        <DialogContent>
          <Stack alignItems="center" spacing={2.5} sx={{ py: 2, pb: 3 }}>
            <CircularProgress size={48} />
            <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ maxWidth: 320 }}>
              {t('preview.downloadPrepBody')}
            </Typography>
          </Stack>
        </DialogContent>
      </Dialog>

      <ProjectCheckout
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        projectId={projectId}
        reason={checkoutReason}
      />

      <PaymentsSetupDialog
        open={paymentsOpen}
        onClose={() => setPaymentsOpen(false)}
        projectId={projectId}
        oauthResult={paymentsOauthResult}
        oauthError={paymentsOauthError}
      />

      {/* Dynamic-content edit error — points user to Catalog */}
      <Snackbar
        open={editDynamicError}
        autoHideDuration={15_000}
        onClose={(_, reason) => {
          if (reason === 'clickaway') return;
          setEditDynamicError(false);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: 2 }}
      >
        <Alert
          severity="warning"
          variant="filled"
          onClose={() => setEditDynamicError(false)}
          sx={{ alignItems: 'center', maxWidth: 480 }}
          action={
            <Button
              color="inherit"
              size="small"
              startIcon={<StorefrontIcon sx={{ fontSize: 15 }} />}
              onClick={() => {
                setEditDynamicError(false);
                setDrawerMode(
                  planAppType === 'booking' ? 'booking_slots'
                  : planAppType === 'blog' ? 'blog'
                  : planAppType === 'dashboard' ? 'dashboard'
                  : 'catalog',
                );
                setDrawerOpen(true);
              }}
              sx={{ fontWeight: 700, whiteSpace: 'nowrap', ml: 1 }}
            >
              {t('editMode.openCatalog')}
            </Button>
          }
        >
          {t('editMode.dynamicContentError')}
        </Alert>
      </Snackbar>
    </Box>
  );
}
