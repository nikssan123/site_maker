import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, Button, Tooltip,
  IconButton, Stack, CircularProgress, Paper, Alert,
  Dialog, DialogTitle, DialogContent, Divider, Snackbar,
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
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EditIcon from '@mui/icons-material/Edit';
import StorefrontIcon from '@mui/icons-material/Storefront';

import PreviewFrame from '../components/PreviewFrame';
import CatalogPanel from '../components/CatalogPanel';
import IterationBar from '../components/IterationBar';
import ProjectCheckout from '../components/UpgradeGate';
import PaymentsSetupDialog from '../components/PaymentsSetupDialog';

import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useProjectStore } from '../store/project';
import ConnectDomainPanel from '../components/ConnectDomainPanel';

const DRAWER_WIDTH = 400;

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
  const [drawerMode, setDrawerMode] = useState<'improvements' | 'catalog'>('improvements');
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

  const [paymentsConfigured, setPaymentsConfigured] = useState(true);
  const [planNeedsPayments, setPlanNeedsPayments] = useState(false);

  const [editToken, setEditToken] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editDynamicError, setEditDynamicError] = useState(false);

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
  };

  useEffect(() => {
    loadProject().catch(() => {});
    if (
      searchParams.get('paid') === 'true' ||
      searchParams.get('hosted') === 'true' ||
      searchParams.get('iteration_paid') === 'true'
    ) {
      loadProject().catch(() => {});
    }
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
    }
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
        if (msg.toLowerCase().includes('not found')) {
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

  const handleBuyIteration = async (pack: boolean) => {
    if (!projectId) return;
    try {
      const { url } = await api.post<{ url: string }>('/billing/iteration-checkout', { projectId, pack });
      window.location.href = url;
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleIterate = async (message: string) => {
    if (!store.sessionId) return;
    setIterating(true);
    useProjectStore.setState({ fixAttempts: [] });
    store.setGenerationFriendlyMessage(t('preview.applyingChanges'));

    store.generationSteps.forEach((s) =>
      store.updateStep({ step: s.step, label: s.label, status: 'pending' }),
    );

    api.streamEvents(
      '/iterate',
      { sessionId: store.sessionId, message },
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
        }
        if (event.type === 'fatal') {
          store.setGenerationFriendlyMessage('');
          alert(t('preview.iterationFailed', { msg: event.message }));
        }
      },
      () => {
        store.setGenerationFriendlyMessage('');
        setIterating(false);
      },
    );
  };

  if (!projectId) return null;

  const { projectPaid, allowUnpaidDownload, projectHosted } = store;

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>

      {/* ── Top bar ── */}
      <AppBar position="static" color="transparent" elevation={0}
        sx={{ borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Toolbar sx={{ minHeight: '48px !important', gap: 1 }}>
          <IconButton onClick={() => navigate(store.sessionId ? `/chat/${store.sessionId}` : '/chat')} size="small">
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <AutoAwesomeIcon color="primary" sx={{ fontSize: 18 }} />
          <Typography variant="subtitle1" fontWeight={700}>
            {t('preview.title')}
          </Typography>

        </Toolbar>
      </AppBar>

      {/* ── Body ── */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left: action strip ── */}
        <Box
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
            <Box>
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
            <Box>
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

          {projectHosted ? (
            <Tooltip title={t('preview.hosted')} placement="right">
              <Box>
                <ActionButton
                  icon={<CloudDoneIcon fontSize="inherit" />}
                  label={t('preview.hosted')}
                  onClick={() => {}}
                  active
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

          <Divider sx={{ my: 0.5 }} />

          <Tooltip title={t('common.analytics')} placement="right">
            <Box>
              <ActionButton
                icon={<BarChartIcon fontSize="inherit" />}
                label={t('common.analytics')}
                onClick={() => navigate(`/analytics/${projectId}`)}
              />
            </Box>
          </Tooltip>

          <Tooltip title={t('payments.setupTooltip')} placement="right">
            <Box>
              <ActionButton
                icon={<PaymentsIcon fontSize="inherit" />}
                label={t('payments.setupCta')}
                onClick={() => setPaymentsOpen(true)}
              />
            </Box>
          </Tooltip>

          <Tooltip title={editDynamicError ? t('editMode.useCatalogTooltip') : t('catalog.tooltip')} placement="right">
            <Box>
              <ActionButton
                icon={<StorefrontIcon fontSize="inherit" />}
                label={t('catalog.label')}
                onClick={() => {
                  setEditDynamicError(false);
                  if (drawerOpen && drawerMode === 'catalog') {
                    setDrawerOpen(false);
                  } else {
                    setDrawerMode('catalog');
                    setDrawerOpen(true);
                  }
                }}
                active={drawerOpen && drawerMode === 'catalog'}
                pulsing={editDynamicError}
                color="#34d399"
              />
            </Box>
          </Tooltip>

          <Divider sx={{ my: 0.5 }} />

          <Tooltip title={editToken ? t('editMode.exit') : t('editMode.enter')} placement="right">
            <Box>
              <ActionButton
                icon={<EditIcon fontSize="inherit" />}
                label={t('editMode.label')}
                onClick={editToken ? exitEditMode : enterEditMode}
                active={!!editToken}
                color="#f5a97f"
              />
            </Box>
          </Tooltip>

          <Divider sx={{ my: 0.5 }} />

          <Tooltip title={t('preview.refresh')} placement="right">
            <Box>
              <ActionButton
                icon={<RefreshIcon fontSize="inherit" />}
                label={t('preview.refresh')}
                onClick={() => setRefreshKey((k) => k + 1)}
              />
            </Box>
          </Tooltip>
        </Box>

        {/* ── Center: preview frame ── */}
        <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
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
              ) : (
                <AutoFixHighIcon sx={{ fontSize: 15, color: 'primary.main' }} />
              )}
              <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: 13, flex: 1 }}>
                {drawerMode === 'catalog' ? t('catalog.label') : t('iteration.barLabel')}
              </Typography>
              <IconButton size="small" onClick={() => setDrawerOpen(false)} sx={{ mr: -0.5 }}>
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Box>

            {/* Catalog mode */}
            {drawerMode === 'catalog' && (
              <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <CatalogPanel projectId={projectId} runPort={store.runPort ?? null} />
              </Box>
            )}

            {/* Improvements mode */}
            {drawerMode === 'improvements' && (
              <>
                {/* Scrollable middle */}
                <Box sx={{ flex: 1, overflow: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {allowUnpaidDownload && !projectPaid && (
                    <Alert severity="warning" sx={{ py: 0.5, fontSize: 12 }}>
                      {t('preview.testModeAlert')}
                    </Alert>
                  )}

                  {iterating && (
                    <Box sx={{
                      display: 'flex', alignItems: 'flex-start', gap: 1.25, px: 1.5, py: 1.25,
                      background: 'rgba(99,102,241,0.08)', borderRadius: 2, border: '1px solid rgba(99,102,241,0.2)',
                    }}>
                      <CircularProgress size={13} sx={{ color: 'primary.main', flexShrink: 0, mt: 0.3 }} />
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.5 }}>
                        {store.generationFriendlyMessage || t('preview.applyingChanges')}
                      </Typography>
                    </Box>
                  )}

                  {projectPaid && projectHosted && (
                    <ConnectDomainPanel projectId={projectId} onUpdated={() => loadProject().catch(() => {})} />
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
                setDrawerMode('catalog');
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
