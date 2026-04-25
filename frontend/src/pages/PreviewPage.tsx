import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, Button, Tooltip,
  IconButton, Stack, CircularProgress, Paper, Alert,
  Dialog, DialogTitle, DialogContent, Divider, Snackbar, Backdrop,
  Drawer, useMediaQuery, useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RefreshIcon from '@mui/icons-material/Refresh';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import BarChartIcon from '@mui/icons-material/BarChart';
import PaymentsIcon from '@mui/icons-material/Payments';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import StorefrontIcon from '@mui/icons-material/Storefront';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import DescriptionIcon from '@mui/icons-material/Description';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import SettingsIcon from '@mui/icons-material/Settings';
import ImportantDevicesIcon from '@mui/icons-material/ImportantDevices';
import CloudIcon from '@mui/icons-material/Cloud';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import AppLogo from '../components/AppLogo';
import PreviewFrame, { type PreviewFrameHandle } from '../components/PreviewFrame';
import AdminWorkspace, { type AdminWorkspaceMode } from '../components/AdminWorkspace';
import IterationBar, { type IterationAttachment } from '../components/IterationBar';
import IterationPlanCard from '../components/IterationPlanCard';
import ProjectCheckout from '../components/UpgradeGate';
import PaymentsSetupDialog from '../components/PaymentsSetupDialog';
import SupportDialog from '../components/SupportDialog';
import MessageBubble from '../components/MessageBubble';
import HistoryPanel, { type HistoryItem } from '../components/HistoryPanel';
import EditDialog, { type EditTarget, type EditEvent } from '../components/EditDialog';
import HostingDialog from '../components/HostingDialog';
import type { TextStylePatch } from '../components/EditDialog';

import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useProjectStore } from '../store/project';
import { useIterationPlanStore } from '../store/iterationPlan';
import { Joyride } from 'react-joyride';
import { usePreviewTour } from '../hooks/usePreviewTour';

const DRAWER_WIDTH = 400;

interface PendingIterationPlan {
  planId: string;
  summary: string;
  planBulletsBg: string[];
  spec: string;
  targetFiles: string[];
  explorerContextNotes?: string;
  attachments?: IterationAttachment[];
}

interface ProjectSnapshotEntry {
  id: string;
  source: string;
  reason: string | null;
  status: string;
  createdAt: string;
}

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

function snapshotSourceKey(source: string): string {
  if (source === 'iteration') return 'preview.snapshotSourceIteration';
  if (source === 'admin_import') return 'preview.snapshotSourceAdminImport';
  if (source === 'manual_restore') return 'preview.snapshotSourceManualRestore';
  if (source === 'repair') return 'preview.snapshotSourceRepair';
  return 'preview.snapshotSourceDefault';
}

type IterationHistoryEntry = { id: string; title: string | null; description: string | null; createdAt: string };
type TFn = (key: string, options?: Record<string, unknown>) => string;

function mapIterationHistory(entries: IterationHistoryEntry[], t: TFn): HistoryItem[] {
  return entries.map((entry) => {
    const titleRaw = entry.title?.trim() ?? '';
    const descRaw = entry.description?.trim() ?? '';
    const titleBad = titleRaw && looksLikeInternalIterationSpec(titleRaw);
    const descBad = descRaw && looksLikeInternalIterationSpec(descRaw);
    return {
      id: entry.id,
      title: titleBad || !titleRaw ? t('preview.historyUntitled') : titleRaw,
      description: !descBad && descRaw ? descRaw : null,
      createdAt: entry.createdAt,
    };
  });
}

function mapSnapshotHistory(entries: ProjectSnapshotEntry[], t: TFn): HistoryItem[] {
  return entries.map((snapshot) => ({
    id: snapshot.id,
    title: t(snapshotSourceKey(snapshot.source)),
    description: snapshot.reason?.trim() || null,
    createdAt: snapshot.createdAt,
  }));
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
        px: { xs: 1, md: 0.5 },
        py: { xs: 0.75, md: 1.25 },
        minWidth: { xs: 56, md: 'auto' },
        minHeight: 44,
        width: { md: '100%' },
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
  const pvTheme = useTheme();
  const pvMobile = useMediaQuery(pvTheme.breakpoints.down('md'));
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutReason, setCheckoutReason] = useState('');
  const [clarifyingIteration, setClarifyingIteration] = useState(false);
  const [iterating, setIterating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [downloadPreparingOpen, setDownloadPreparingOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(() => !window.matchMedia('(max-width:899.95px)').matches);
  const [drawerMode, setDrawerMode] = useState<'improvements' | AdminWorkspaceMode>('improvements');
  const [iterateChat, setIterateChat] = useState<Array<{ role: 'user' | 'assistant'; content: string; attachments?: IterationAttachment[] }>>([]);
  const [pendingIterationPlan, setPendingIterationPlan] = useState<PendingIterationPlan | null>(null);
  const [iterationHistory, setIterationHistory] = useState<Array<{ id: string; title: string | null; description: string | null; createdAt: string }>>([]);
  const [snapshotHistory, setSnapshotHistory] = useState<ProjectSnapshotEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [restoringSnapshotId, setRestoringSnapshotId] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
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
  const tour = usePreviewTour();

  const [paymentsConfigured, setPaymentsConfigured] = useState(true);
  const [planNeedsPayments, setPlanNeedsPayments] = useState(false);
  const [planAppType, setPlanAppType] = useState<string | null>(null);
  const [planHasContactForm, setPlanHasContactForm] = useState(false);

  const [editToken, setEditToken] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editDynamicError, setEditDynamicError] = useState(false);
  const [editError, setEditError] = useState<{ message: string; severity: 'error' | 'warning' } | null>(null);
  const [editDialogTarget, setEditDialogTarget] = useState<EditTarget | null>(null);
  const [editDialogBusy, setEditDialogBusy] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<Array<
    | { op: 'content'; original: string; replacement: string }
    | { op: 'textStyle'; original: string; replacement: string; style: TextStylePatch }
    | { op: 'icon'; sourcePathD: string; width: number; height: number; newIconName?: string; uploadedUrl?: string }
    | { op: 'delete'; kind: 'text' | 'image' | 'icon'; anchor: string }
  >>([]);
  const [unsavedPromptOpen, setUnsavedPromptOpen] = useState(false);
  const previewFrameRef = useRef<PreviewFrameHandle>(null);
  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<{ dataUrl: string; name: string } | null>(null);
  const [heroBgDialogOpen, setHeroBgDialogOpen] = useState(false);
  const [heroBgUploading, setHeroBgUploading] = useState(false);
  const [heroBgPreview, setHeroBgPreview] = useState<string | null>(null);
  const [heroBgFile, setHeroBgFile] = useState<{ dataUrl: string; name: string } | null>(null);
  const [snackMsg, setSnackMsg] = useState<string | null>(null);
  const [hostingDialogOpen, setHostingDialogOpen] = useState(false);
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
    store.setHostingStatus(p.hostingStatus ?? (p.paid ? (p.hosted ? 'active' : 'expired') : 'not_activated'), p.hostingFreeUntil ?? null);
    store.setCustomDomain(p.customDomain ?? null);
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
        await loadProject().catch(() => { });
        const st = useProjectStore.getState();
        const okPaid = searchParams.get('paid') !== 'true' || st.projectPaid;
        const okHosted = searchParams.get('hosted') !== 'true' || st.projectHosted;
        // Iteration credits aren't stored in the store currently; loadProject refresh is still useful.
        if (okPaid && okHosted) return;
        await new Promise((r) => setTimeout(r, 1000));
      }
    };

    if (wantsRefresh) {
      pollForBillingUpdate().catch(() => { });
    } else {
      loadProject().catch(() => { });
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
      setEditError({ message: e.message ?? t('errors.generic'), severity: 'error' });
    }
  };

  const exitEditMode = () => {
    if (pendingEdits.length > 0) {
      setUnsavedPromptOpen(true);
      return;
    }
    setEditToken(null);
  };

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

  const MAX_LOGO_BYTES = 7 * 1024 * 1024;

  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setSnackMsg(t('logo.fileTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setLogoPreview(dataUrl);
      setLogoFile({ dataUrl, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = async () => {
    if (!logoFile || !projectId) return;
    setLogoUploading(true);
    try {
      const result = await api.replaceLogo(projectId, logoFile.dataUrl, logoFile.name);
      await pollUntilRunning(projectId);
      setRefreshKey((k) => k + 1);
      await loadProject();
      setLogoDialogOpen(false);
      setLogoPreview(null);
      setLogoFile(null);
      setSnackMsg(result.autoPlaced ? t('logo.success') : t('logo.successManual'));
    } catch {
      setSnackMsg(t('logo.error'));
    } finally {
      setLogoUploading(false);
    }
  };

  const handleHeroBgFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setSnackMsg(t('heroBg.fileTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setHeroBgPreview(dataUrl);
      setHeroBgFile({ dataUrl, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleHeroBgUpload = async () => {
    if (!heroBgFile || !projectId) return;
    setHeroBgUploading(true);
    try {
      const result = await api.replaceHeroBg(projectId, heroBgFile.dataUrl, heroBgFile.name);
      await pollUntilRunning(projectId);
      setRefreshKey((k) => k + 1);
      await loadProject();
      setHeroBgDialogOpen(false);
      setHeroBgPreview(null);
      setHeroBgFile(null);
      setSnackMsg(result.autoPlaced ? t('heroBg.success') : t('heroBg.successManual'));
    } catch {
      setSnackMsg(t('heroBg.error'));
    } finally {
      setHeroBgUploading(false);
    }
  };

  const showDynamicContentNotice = useCallback(() => {
    setEditDialogTarget(null);
    setEditDynamicError(true);
  }, []);

  const handleEditSelect = useCallback(async (target: EditTarget) => {
    if (!projectId) return;
    if (target.kind === 'text' || target.kind === 'image') {
      try {
        const result = await api.inspectEditTarget(projectId, target);
        if (result.classification === 'dynamic') {
          showDynamicContentNotice();
          return;
        }
      } catch {
        // Non-fatal: keep the existing edit flow and let save-time validation decide.
      }
    }
    setEditDialogTarget(target);
  }, [projectId, showDynamicContentNotice]);

  // Listen for click-selects from the in-iframe overlay and route them to the EditDialog.
  useEffect(() => {
    if (!editToken) return;
    const handler = (e: MessageEvent) => {
      if (!e.data) return;
      if (e.data.type === 'EDIT_SELECT' && e.data.target) {
        void handleEditSelect(e.data.target as EditTarget);
        return;
      }
      if (e.data.type === 'EDIT_DYNAMIC_BLOCKED') {
        showDynamicContentNotice();
        return;
      }
      if (e.data.type === 'EDIT_ESCAPE') {
        setEditDialogTarget(null);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [editToken, handleEditSelect, showDynamicContentNotice]);

  const reportEditError = (err: any) => {
    const msg: string = err?.message ?? '';
    const status: number | undefined = err?.status;
    if (err?.code === 'dynamic_content') {
      setEditDynamicError(true);
    } else {
      const userFacing = status === 404 || status === 422;
      setEditError({
        message: userFacing && msg ? msg : t('editMode.patchFailed'),
        severity: status === 422 ? 'warning' : 'error',
      });
    }
  };

  // Handle a save from the EditDialog: translate into a batch op, upload any file
  // first, apply an optimistic DOM change in the iframe, and queue the op.
  const handleEditEvent = async (event: EditEvent) => {
    if (!projectId || !editToken) return;
    const post = (msg: unknown) => previewFrameRef.current?.postToIframe(msg);

    try {
      setEditDialogBusy(true);

      if (event.kind === 'text') {
        setPendingEdits((prev) => [
          ...prev,
          event.style && Object.keys(event.style).length > 0
            ? { op: 'textStyle', original: event.anchor, replacement: event.replacement, style: event.style }
            : { op: 'content', original: event.anchor, replacement: event.replacement },
        ]);
        post({ op: 'replace-text', anchor: event.anchor, replacement: event.replacement, style: event.style });
        setEditDialogTarget(null);
        return;
      }

      if (event.kind === 'image-url') {
        setPendingEdits((prev) => [
          ...prev,
          { op: 'content', original: event.anchor, replacement: event.replacement },
        ]);
        post({ op: 'replace-image', anchor: event.anchor, replacement: event.replacement });
        setEditDialogTarget(null);
        return;
      }

      if (event.kind === 'image-file') {
        const { url } = await api.uploadImage(projectId, event.dataUrl, event.filename);
        setPendingEdits((prev) => [
          ...prev,
          { op: 'content', original: event.anchor, replacement: url },
        ]);
        post({ op: 'replace-image', anchor: event.anchor, replacement: url });
        setEditDialogTarget(null);
        return;
      }

      if (event.kind === 'icon-library') {
        setPendingEdits((prev) => [
          ...prev,
          {
            op: 'icon',
            sourcePathD: event.sourcePathD,
            width: event.width,
            height: event.height,
            newIconName: event.name,
          },
        ]);
        post({ op: 'replace-icon-preview', sourcePathD: event.sourcePathD });
        setEditDialogTarget(null);
        return;
      }

      if (event.kind === 'icon-file') {
        const { url } = await api.uploadImage(projectId, event.dataUrl, event.filename);
        setPendingEdits((prev) => [
          ...prev,
          {
            op: 'icon',
            sourcePathD: event.sourcePathD,
            width: event.width,
            height: event.height,
            uploadedUrl: url,
          },
        ]);
        post({
          op: 'replace-icon-image',
          sourcePathD: event.sourcePathD,
          url,
          width: event.width,
          height: event.height,
        });
        setEditDialogTarget(null);
        return;
      }

      if (event.kind === 'delete') {
        const { target } = event;
        if (target.kind === 'icon') {
          setPendingEdits((prev) => [
            ...prev,
            { op: 'delete', kind: 'icon', anchor: target.sourcePathD },
          ]);
          post({ op: 'delete-icon', sourcePathD: target.sourcePathD });
        } else if (target.kind === 'image') {
          setPendingEdits((prev) => [
            ...prev,
            { op: 'delete', kind: 'image', anchor: target.anchor },
          ]);
          post({ op: 'delete-image', anchor: target.anchor });
        } else {
          setPendingEdits((prev) => [
            ...prev,
            { op: 'delete', kind: 'text', anchor: target.anchor },
          ]);
          post({ op: 'delete-text', anchor: target.anchor });
        }
        setEditDialogTarget(null);
        return;
      }
    } catch (err) {
      reportEditError(err);
    } finally {
      setEditDialogBusy(false);
    }
  };

  const applyPendingEdits = async (thenExit: boolean) => {
    if (!projectId || !editToken || pendingEdits.length === 0) {
      if (thenExit) setEditToken(null);
      return;
    }
    setEditSaving(true);
    const ops = pendingEdits;
    try {
      const MAX_RETRIES = 3;
      for (let attempt = 0; ; attempt++) {
        try {
          await api.patchContentBatch(projectId, { token: editToken, ops });
          break;
        } catch (retryErr: any) {
          const busy = retryErr.status === 409 && /rebuild|in progress/i.test(retryErr.message ?? '');
          if (busy && attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }
          throw retryErr;
        }
      }
      await pollUntilRunning(projectId);
      setRefreshKey((k) => k + 1);
      await loadProject();
      setPendingEdits([]);
      if (thenExit) setEditToken(null);
    } catch (err) {
      reportEditError(err);
      // On failure the iframe will reload with the unchanged source; roll back optimistic state.
      setRefreshKey((k) => k + 1);
      setPendingEdits([]);
    } finally {
      setEditSaving(false);
    }
  };

  const discardPendingEdits = (thenExit: boolean) => {
    if (pendingEdits.length > 0) setRefreshKey((k) => k + 1);
    setPendingEdits([]);
    if (thenExit) setEditToken(null);
  };

  const workspaceMode = drawerMode === 'improvements' ? null : drawerMode;
  const workspaceOpen = workspaceMode !== null;

  const handleDownload = async () => {
    if (!store.projectPaid && !store.allowUnpaidDownload) {
      setCheckoutReason(t('preview.downloadLockedReason'));
      setCheckoutOpen(true);
      return;
    }
    setDownloadPreparingOpen(true);
    try {
      await api.download(`/preview/${projectId}/download`, `project-${projectId}.zip`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('preview.downloadFailed');
      setEditError({ message: msg, severity: 'error' });
    } finally {
      setDownloadPreparingOpen(false);
    }
  };

  // After a Stripe redirect back with plan_active or topup flags, refresh the iteration plan
  // so the IterationBar percent meter reflects the new quota without a full reload.
  useEffect(() => {
    const planActive = searchParams.get('plan_active');
    const topup = searchParams.get('topup');
    if (planActive || topup) {
      void useIterationPlanStore.getState().refresh();
    }
  }, [searchParams]);

  const fetchHistory = useCallback(() => {
    if (!projectId) return;
    api
      .get<Array<{ id: string; title: string | null; description: string | null; createdAt: string }>>(
        `/preview/${projectId}/iteration-history`,
      )
      .then(setIterationHistory)
      .catch(() => { });
  }, [projectId]);

  const fetchSnapshots = useCallback(() => {
    if (!projectId) return;
    api
      .get<ProjectSnapshotEntry[]>(`/preview/${projectId}/snapshots`)
      .then(setSnapshotHistory)
      .catch(() => { });
  }, [projectId]);

  // Load iteration history when the improvements drawer is visible (initial mount + switching back from other panels).
  useEffect(() => {
    if (!projectId || !drawerOpen || drawerMode !== 'improvements') return;
    fetchHistory();
    fetchSnapshots();
  }, [projectId, drawerOpen, drawerMode, fetchHistory, fetchSnapshots]);

  const restoreSnapshot = async (snapshotId: string) => {
    if (!projectId || restoringSnapshotId) return;
    setRestoringSnapshotId(snapshotId);
    store.setGenerationFriendlyMessage(t('preview.snapshotRestoringMessage'));
    try {
      const result = await api.post<{ ok: true; port: number | null }>(
        `/preview/${projectId}/snapshots/${snapshotId}/restore`,
      );
      if (typeof result.port === 'number') store.setRunPort(result.port);
      setRefreshKey((k) => k + 1);
      await loadProject();
      fetchSnapshots();
      fetchHistory();
      setIterateChat((prev) => [...prev, { role: 'assistant', content: t('preview.snapshotRestored') }]);
    } catch (err: any) {
      setEditError({ message: err?.message ?? t('preview.snapshotRestoreFailed'), severity: 'error' });
    } finally {
      store.setGenerationFriendlyMessage('');
      setRestoringSnapshotId(null);
    }
  };

  const executeIteration = (snapshot: {
    planId?: string;
    summary: string;
    planBulletsBg: string[];
    spec: string;
    targetFiles: string[];
    explorerContextNotes?: string;
    attachments?: IterationAttachment[];
  }) => {
    if (!store.sessionId) return;

    setPendingIterationPlan(null);
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
        planId: snapshot.planId,
        spec: snapshot.spec,
        targetFiles: snapshot.targetFiles,
        explorerContextNotes: snapshot.explorerContextNotes,
        attachments: snapshot.attachments,
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
          loadProject().catch(() => { });
          useIterationPlanStore.getState().refresh().catch(() => { });
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
      },
    );
  };

  const handleIterate = async (message: string, attachments: IterationAttachment[] = []) => {
    if (!store.sessionId) return;
    const text = message.trim();
    if ((!text && attachments.length === 0) || clarifyingIteration || iterating) return;

    const effectiveText =
      text || (attachments.length > 0 ? t('preview.attachmentImplicitMessage', { defaultValue: 'Used the attached photo(s).' }) : '');

    setPendingIterationPlan(null);
    setIterateChat((prev) => [
      ...prev,
      { role: 'user', content: effectiveText, attachments: attachments.length > 0 ? attachments : undefined },
    ]);
    setClarifyingIteration(true);

    try {
      const res = await api.post<
        | { kind: 'question'; message: string }
        | {
          kind: 'ready';
          planId: string;
          summary: string;
          planBulletsBg: string[];
          spec: string;
          targetFiles: string[];
          nonGoals: string[];
          explorerContextNotes?: string;
          attachments?: IterationAttachment[];
        }
      >(
        '/iterate/clarify',
        {
          sessionId: store.sessionId,
          messages: [...iterateChat, { role: 'user', content: effectiveText }],
          attachments,
        },
      );

      if (res.kind === 'question') {
        setIterateChat((prev) => [...prev, { role: 'assistant', content: res.message }]);
        return;
      }

      const summaryText = res.summary?.trim() ?? '';
      const planBulletsBg = Array.isArray(res.planBulletsBg)
        ? res.planBulletsBg.map((s) => s.trim()).filter(Boolean)
        : [];

      if (summaryText) {
        setIterateChat((prev) => [...prev, { role: 'assistant', content: summaryText }]);
      }

      setPendingIterationPlan({
        planId: res.planId,
        summary: summaryText,
        planBulletsBg,
        spec: res.spec,
        targetFiles: res.targetFiles ?? [],
        explorerContextNotes: res.explorerContextNotes,
        attachments: res.attachments ?? attachments,
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
    } finally {
      setClarifyingIteration(false);
    }
  };

  if (!projectId) return null;

  const { projectPaid, allowUnpaidDownload, projectHosted, hostingStatus, hostingFreeUntil, customDomain } = store;

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Joyride
        steps={tour.steps}
        stepIndex={tour.stepIndex}
        run={tour.run}
        onEvent={tour.handleCallback}
        continuous
        options={{
          primaryColor: '#6366f1',
          backgroundColor: '#1e293b',
          textColor: '#f1f5f9',
          arrowColor: '#1e293b',
          zIndex: 1400,
          showProgress: true,
          skipScroll: true,
          buttons: ['back', 'skip', 'primary'],
        }}
        locale={{
          back: t('tour.back'),
          close: t('tour.finish'),
          last: t('tour.finish'),
          next: t('tour.next'),
          skip: t('tour.skip'),
        }}
        styles={{
          tooltip: {
            borderRadius: 14,
            padding: '20px 22px 16px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          },
          tooltipTitle: {
            fontSize: 15,
            fontWeight: 700,
            marginBottom: 4,
          },
          tooltipContent: {
            fontSize: 13,
            lineHeight: 1.6,
            padding: '8px 0 0',
          },
          tooltipFooter: {
            marginTop: 12,
          },
          buttonPrimary: {
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            padding: '6px 18px',
          },
          buttonBack: {
            fontSize: 13,
            fontWeight: 600,
            color: '#94a3b8',
            marginRight: 8,
          },
          buttonSkip: {
            fontSize: 12,
            fontWeight: 600,
            color: '#64748b',
          },
          overlay: {
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
          },
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
          <AppLogo size="small" />
          <Box sx={{ mx: 1, width: '1px', height: 20, bgcolor: 'divider' }} />
          <Typography variant="subtitle1" fontWeight={700}>
            {t('preview.title')}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Tooltip title={previewDevice === 'desktop' ? t('preview.switchToMobile') : t('preview.switchToDesktop')}>
            <span>
              <IconButton
                size="small"
                onClick={() => setPreviewDevice((mode) => (mode === 'desktop' ? 'mobile' : 'desktop'))}
                aria-label={previewDevice === 'desktop' ? t('preview.switchToMobile') : t('preview.switchToDesktop')}
                sx={{
                  borderRadius: 1.5,
                  color: previewDevice === 'mobile' ? 'primary.main' : 'text.secondary',
                  bgcolor: previewDevice === 'mobile' ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: previewDevice === 'mobile' ? 'action.selected' : 'action.hover' },
                }}
              >
                <ImportantDevicesIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t('tour.replayTooltip')}>
            <span>
              <IconButton size="small" onClick={tour.replay}>
                <HelpOutlineIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t('settings.title')}>
            <span>
              <IconButton
                size="small"
                onClick={() => navigate('/settings')}
              >
                <SettingsIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

        </Toolbar>
      </AppBar>

      {/* ── Body ── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, overflow: 'hidden' }}>

        {/* ── Left (desktop) / Bottom (mobile): action strip ── */}
        <Box
          data-tour="preview-action-strip"
          sx={{
            width: { xs: '100%', md: 68 },
            flexShrink: 0,
            display: 'flex',
            flexDirection: { xs: 'row', md: 'column' },
            borderRight: { md: '1px solid' },
            borderTop: { xs: '1px solid', md: 'none' },
            borderColor: 'divider',
            bgcolor: 'background.paper',
            py: { xs: 0.5, md: 1 },
            px: 0.75,
            gap: 0.25,
            order: { xs: 3, md: 0 },
            overflowX: { xs: 'auto', md: 'visible' },
            overflowY: { xs: 'hidden', md: 'visible' },
            position: { xs: 'sticky', md: 'static' },
            bottom: { xs: 0, md: 'auto' },
            zIndex: { xs: 10, md: 'auto' },
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

          <Tooltip title={t('admin.title')} placement="right">
            <Box data-tour="action-data-panel">
              <ActionButton
                icon={<AdminPanelSettingsIcon fontSize="inherit" />}
                label={t('admin.title')}
                onClick={() => {
                  setEditDynamicError(false);
                  if (workspaceOpen) setDrawerMode('improvements');
                  else { setDrawerMode('dashboard'); setDrawerOpen(false); }
                }}
                active={workspaceOpen}
                pulsing={editDynamicError}
                color="#34d399"
              />
            </Box>
          </Tooltip>

          {planHasContactForm && (
            <Tooltip title={t('adminWorkspace.nav.inquiriesSubtitle')} placement="right">
              <Box data-tour="action-inquiries">
                <ActionButton
                  icon={<MailOutlineIcon fontSize="inherit" />}
                  label={t('adminWorkspace.nav.inquiriesTitle')}
                  onClick={() => {
                    if (workspaceMode === 'inquiries') setDrawerMode('improvements');
                    else { setDrawerMode('inquiries'); setDrawerOpen(false); }
                  }}
                  active={workspaceMode === 'inquiries'}
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



          <Tooltip
            title={t(`hostingPanel.status.${hostingStatus === 'not_activated' ? 'notActivatedTitle' : hostingStatus === 'trial' ? 'trialTitle' : hostingStatus === 'active' ? 'activeTitle' : 'expiredTitle'}`)}
            placement="right"
          >
            <Box data-tour="action-hosting">
              <ActionButton
                icon={<CloudIcon fontSize="inherit" />}
                label={t('hostingPanel.actionLabel')}
                onClick={() => setHostingDialogOpen(true)}
                color={
                  hostingStatus === 'active'
                    ? '#10b981'
                    : hostingStatus === 'trial'
                    ? '#f59e0b'
                    : hostingStatus === 'expired'
                    ? '#ef4444'
                    : '#94a3b8'
                }
              />
            </Box>
          </Tooltip>

          <Tooltip title={t('payments.setupTooltip')} placement="right">
            <Box data-tour="action-payments">
              <ActionButton
                icon={<PaymentsIcon fontSize="inherit" />}
                label={t('payments.setupCta')}
                onClick={() => setPaymentsOpen(true)}
                color="#f59e0b"
              />
            </Box>
          </Tooltip>

          <Tooltip title={t('preview.download')} placement="right">
            <Box data-tour="action-download">
              <ActionButton
                icon={<DownloadIcon fontSize="inherit" />}
                label={t('preview.download')}
                onClick={handleDownload}
                color="#f5a97f"
              />
            </Box>
          </Tooltip>

          <Tooltip title={t('files.title')} placement="right">
            <Box data-tour="action-files">
              <ActionButton
                icon={<DescriptionIcon fontSize="inherit" />}
                label={t('files.title')}
                onClick={() => navigate(`/files/${projectId}`)}
                color="#7dd3fc"
              />
            </Box>
          </Tooltip>

          <Tooltip title={t('preview.refresh')} placement="right">
            <Box data-tour="action-refresh">
              <ActionButton
                icon={<RefreshIcon fontSize="inherit" />}
                label={t('preview.refresh')}
                onClick={() => setRefreshKey((k) => k + 1)}
              />
            </Box>
          </Tooltip>

          <Box sx={{ flex: 1 }} />

          <Tooltip title={t('sidebar.support')} placement="right">
            <Box>
              <ActionButton
                icon={<SupportAgentIcon fontSize="inherit" />}
                label={t('preview.support')}
                onClick={() => setSupportOpen(true)}
                color="#94a3b8"
              />
            </Box>
          </Tooltip>
        </Box>

        {/* ── Center: preview frame ── */}
        <Box
          data-tour="preview-frame"
          sx={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}
        >
          {workspaceOpen ? (
            <AdminWorkspace
              mode={workspaceMode}
              projectId={projectId}
              planAppType={planAppType}
              planHasContactForm={planHasContactForm}
              projectPaid={projectPaid}
              runPort={store.runPort ?? null}
              adminApiToken={adminApiToken}
              onModeChange={setDrawerMode}
              onBackToPreview={() => setDrawerMode('improvements')}
              onRefreshPreview={() => setRefreshKey((k) => k + 1)}
              onOpenLogoUpload={() => setLogoDialogOpen(true)}
              onOpenHeroUpload={() => setHeroBgDialogOpen(true)}
            />
          ) : (
            <>
              {projectHosted && customDomain && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: { xs: 1.5, md: 2 },
                    py: 0.85,
                    borderBottom: '1px solid',
                    borderColor: 'rgba(16,185,129,0.25)',
                    background: 'linear-gradient(90deg, rgba(16,185,129,0.14), rgba(16,185,129,0.04))',
                    flexShrink: 0,
                    flexWrap: 'wrap',
                  }}
                >
                  <CloudIcon sx={{ fontSize: 16, color: '#34d399', flexShrink: 0 }} />
                  <Typography variant="caption" sx={{ color: '#a7f3d0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>
                    {t('hostingPanel.liveAt')}
                  </Typography>
                  <Box
                    component="a"
                    href={`https://${customDomain}`}
                    target="_blank"
                    rel="noreferrer"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#fff',
                      textDecoration: 'none',
                      px: 1,
                      py: 0.25,
                      borderRadius: 1,
                      bgcolor: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(16,185,129,0.25)',
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: { xs: '100%', sm: 360 },
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(16,185,129,0.45)' },
                    }}
                  >
                    {customDomain}
                  </Box>
                  <Box sx={{ flex: 1 }} />
                  <Tooltip title={t('hostingPanel.copy')}>
                    <IconButton
                      size="small"
                      onClick={() => {
                        navigator.clipboard?.writeText(`https://${customDomain}`);
                        setSnackMsg(t('hostingPanel.copied'));
                      }}
                      sx={{ color: '#a7f3d0' }}
                    >
                      <ContentCopyIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                  <Button
                    size="small"
                    href={`https://${customDomain}`}
                    target="_blank"
                    rel="noreferrer"
                    startIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                    sx={{
                      color: '#0f172a',
                      bgcolor: '#34d399',
                      fontWeight: 700,
                      textTransform: 'none',
                      px: 1.25,
                      py: 0.25,
                      minHeight: 0,
                      '&:hover': { bgcolor: '#10b981' },
                    }}
                  >
                    {t('hostingPanel.openSite')}
                  </Button>
                </Box>
              )}
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
                  display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1,
                  background: 'rgba(245,169,127,0.12)', borderBottom: '1px solid rgba(245,169,127,0.3)',
                  flexShrink: 0,
                }}>
                  <EditIcon sx={{ fontSize: 14, color: '#f5a97f' }} />
                  <Typography variant="caption" sx={{ color: '#f5a97f', fontWeight: 600, flex: 1 }}>
                    {editSaving
                      ? t('editMode.saving')
                      : pendingEdits.length > 0
                        ? t('editMode.pendingCount', { count: pendingEdits.length })
                        : t('editMode.active')}
                  </Typography>
                  {editSaving && <CircularProgress size={12} sx={{ color: '#f5a97f' }} />}
                  {pendingEdits.length > 0 && !editSaving && (
                    <>
                      <Button
                        size="small"
                        onClick={() => discardPendingEdits(false)}
                        sx={{ fontSize: 12, color: '#f5a97f', py: 0.4, px: 1, textTransform: 'none' }}
                      >
                        {t('editMode.discard')}
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<CheckCircleRoundedIcon sx={{ fontSize: '16px !important' }} />}
                        onClick={() => applyPendingEdits(false)}
                        sx={{
                          fontSize: 12.5, py: 0.6, px: 1.75, textTransform: 'none',
                          minHeight: 30, borderRadius: 1.5, letterSpacing: 0.2,
                          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                          color: '#fff', fontWeight: 700,
                          boxShadow: '0 4px 14px rgba(99,102,241,0.45)',
                          '&:hover': {
                            background: 'linear-gradient(135deg, #5458e5, #7c3aed)',
                            boxShadow: '0 6px 18px rgba(99,102,241,0.6)',
                          },
                        }}
                      >
                        {t('editMode.applyAll')}
                      </Button>
                    </>
                  )}
                  <Button size="small" sx={{ fontSize: 12, color: '#f5a97f', py: 0.4, px: 1 }} onClick={exitEditMode}>
                    {t('editMode.exit')}
                  </Button>
                </Box>
              )}
              <Box
                sx={{
                  flex: 1,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: previewDevice === 'mobile' ? 'center' : 'stretch',
                  justifyContent: 'center',
                  p: previewDevice === 'mobile' ? { xs: 1, md: 2 } : 0,
                  bgcolor: previewDevice === 'mobile' ? 'rgba(15,23,42,0.04)' : 'transparent',
                }}
              >
                {store.runPort != null ? (
                  <Box
                    sx={{
                      width: previewDevice === 'mobile' ? 'min(440px, 100%)' : '100%',
                      height: previewDevice === 'mobile' ? 'min(920px, 100%)' : '100%',
                      maxHeight: '100%',
                      flexShrink: 0,
                      borderRadius: previewDevice === 'mobile' ? '28px' : 0,
                      border: previewDevice === 'mobile' ? '8px solid #111827' : 0,
                      bgcolor: previewDevice === 'mobile' ? '#111827' : 'transparent',
                      boxShadow: previewDevice === 'mobile'
                        ? '0 28px 80px rgba(15,23,42,0.28), 0 0 0 1px rgba(255,255,255,0.08)'
                        : 'none',
                      overflow: 'hidden',
                    }}
                  >
                    <PreviewFrame ref={previewFrameRef} key={refreshKey} projectId={projectId} port={store.runPort ?? 0} editToken={editToken} />
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <CircularProgress />
                  </Box>
                )}
              </Box>
            </>
          )}
        </Box>

        {/* ── Right drawer (collapsible on desktop, overlay on mobile) ── */}
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            width: drawerOpen && !workspaceOpen ? DRAWER_WIDTH : 0,
            flexShrink: 0,
            overflow: 'hidden',
            transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            flexDirection: 'column',
            borderLeft: drawerOpen && !workspaceOpen ? '1px solid' : 'none',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ width: DRAWER_WIDTH, display: 'flex', flexDirection: 'column', height: '100%' }}>


            <Box sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
              <AutoFixHighIcon sx={{ fontSize: 15, color: 'primary.main' }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: 13, flex: 1 }}>
                {t('iteration.barLabel')}
              </Typography>
              <IconButton size="small" onClick={() => setDrawerOpen(false)} sx={{ mr: -0.5 }}>
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Box>

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
                  <MessageBubble key={idx} role={m.role} content={m.content} attachments={m.attachments} />
                ))}

                {clarifyingIteration && (
                  <MessageBubble
                    role="assistant"
                    content={t('preview.improvementsThinking', {
                      defaultValue: 'Reviewing your request and preparing the improvement plan…',
                    })}
                  />
                )}

                {pendingIterationPlan && (
                  <IterationPlanCard
                    summary={pendingIterationPlan.summary}
                    planBulletsBg={pendingIterationPlan.planBulletsBg}
                    loading={iterating}
                    onConfirm={() => executeIteration(pendingIterationPlan)}
                    onEdit={() => setPendingIterationPlan(null)}
                    showUnlockHint={false}
                  />
                )}

                {iterating && (
                  <MessageBubble
                    role="assistant"
                    content={store.generationFriendlyMessage || t('preview.applyingChanges')}
                  />
                )}

                {/* History section */}
                {iterationHistory.length > 0 && (
                  <HistoryPanel
                    variant="improvement"
                    label={t('preview.historyLabel', { n: iterationHistory.length })}
                    defaultOpen={historyOpen}
                    onToggleOpen={(next) => {
                      if (next) fetchHistory();
                      setHistoryOpen(next);
                    }}
                    items={mapIterationHistory(iterationHistory, t)}
                  />
                )}

                {snapshotHistory.length > 0 && (
                  <HistoryPanel
                    variant="snapshot"
                    label={t('preview.savedVersionsLabel', { n: snapshotHistory.length })}
                    defaultOpen={snapshotsOpen}
                    onToggleOpen={(next) => {
                      if (next) fetchSnapshots();
                      setSnapshotsOpen(next);
                    }}
                    items={mapSnapshotHistory(snapshotHistory, t)}
                    restoringId={restoringSnapshotId}
                    restoreDisabled={Boolean(restoringSnapshotId) || iterating || clarifyingIteration}
                    onRestore={restoreSnapshot}
                    restoreLabel={t('preview.snapshotRestore')}
                    restoringLabel={t('preview.snapshotRestoring')}
                  />
                )}
              </Box>

              {/* Pinned iteration input */}
              <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
                <IterationBar
                  onSubmit={handleIterate}
                  loading={clarifyingIteration || iterating}
                  projectId={projectId}
                  loadingLabel={
                    clarifyingIteration
                      ? t('preview.improvementsThinking', {
                        defaultValue: 'Reviewing your request and preparing the improvement plan…',
                      })
                      : t('preview.applyingChanges')
                  }
                />
              </Box>
            </>
          </Box>
        </Box>
        {pvMobile && (
          <Drawer
            anchor="right"
            open={drawerOpen && !workspaceOpen}
            onClose={() => setDrawerOpen(false)}
            PaperProps={{ sx: { width: '85vw', maxWidth: DRAWER_WIDTH, bgcolor: 'background.paper', backgroundImage: 'none' } }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
                <AutoFixHighIcon sx={{ fontSize: 15, color: 'primary.main' }} />
                <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: 13, flex: 1 }}>
                  {t('iteration.barLabel')}
                </Typography>
                <IconButton size="small" onClick={() => setDrawerOpen(false)}><ChevronRightIcon fontSize="small" /></IconButton>
              </Box>
              <Box sx={{ flex: 1, overflow: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {iterateChat.length === 0 && (
                  <MessageBubble role="assistant" content={t('preview.improvementsHint')} />
                )}
                {iterateChat.map((msg, i) => (
                  <MessageBubble key={i} role={msg.role} content={msg.content} attachments={msg.attachments} />
                ))}
                {clarifyingIteration && (
                  <MessageBubble
                    role="assistant"
                    content={t('preview.improvementsThinking', {
                      defaultValue: 'Reviewing your request and preparing the improvement plan…',
                    })}
                  />
                )}
                {pendingIterationPlan && (
                  <IterationPlanCard
                    summary={pendingIterationPlan.summary}
                    planBulletsBg={pendingIterationPlan.planBulletsBg}
                    loading={iterating}
                    onConfirm={() => executeIteration(pendingIterationPlan)}
                    onEdit={() => setPendingIterationPlan(null)}
                    showUnlockHint={false}
                  />
                )}
                {iterating && (
                  <MessageBubble
                    role="assistant"
                    content={store.generationFriendlyMessage || t('preview.applyingChanges')}
                  />
                )}
                {iterationHistory.length > 0 && (
                  <HistoryPanel
                    variant="improvement"
                    label={t('preview.historyLabel', { n: iterationHistory.length })}
                    defaultOpen={historyOpen}
                    onToggleOpen={(next) => {
                      if (next) fetchHistory();
                      setHistoryOpen(next);
                    }}
                    items={mapIterationHistory(iterationHistory, t)}
                  />
                )}

                {snapshotHistory.length > 0 && (
                  <HistoryPanel
                    variant="snapshot"
                    label={t('preview.savedVersionsLabel', { n: snapshotHistory.length })}
                    defaultOpen={snapshotsOpen}
                    onToggleOpen={(next) => {
                      if (next) fetchSnapshots();
                      setSnapshotsOpen(next);
                    }}
                    items={mapSnapshotHistory(snapshotHistory, t)}
                    restoringId={restoringSnapshotId}
                    restoreDisabled={Boolean(restoringSnapshotId) || iterating || clarifyingIteration}
                    onRestore={restoreSnapshot}
                    restoreLabel={t('preview.snapshotRestore')}
                    restoringLabel={t('preview.snapshotRestoring')}
                  />
                )}
              </Box>
              <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
                <IterationBar
                  onSubmit={handleIterate}
                  loading={clarifyingIteration || iterating}
                  projectId={projectId}
                  loadingLabel={
                    clarifyingIteration
                      ? t('preview.improvementsThinking', {
                        defaultValue: 'Reviewing your request and preparing the improvement plan…',
                      })
                      : t('preview.applyingChanges')
                  }
                />
              </Box>
            </Box>
          </Drawer>
        )}

      </Box>

      {/* ── Dialogs ── */}
      <Dialog
        open={downloadPreparingOpen}
        onClose={() => { }}
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

      <HostingDialog
        open={hostingDialogOpen}
        onClose={() => setHostingDialogOpen(false)}
        projectId={projectId}
        status={hostingStatus}
        hostingFreeUntil={hostingFreeUntil}
        hosted={projectHosted}
        paid={projectPaid}
        onUpdated={loadProject}
      />

      <SupportDialog open={supportOpen} onClose={() => setSupportOpen(false)} />

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
                setDrawerOpen(false);
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

      <EditDialog
        target={editDialogTarget}
        busy={editDialogBusy}
        onClose={() => setEditDialogTarget(null)}
        onSave={handleEditEvent}
      />

      <Dialog
        open={unsavedPromptOpen}
        onClose={() => setUnsavedPromptOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, bgcolor: '#18181b', color: '#f4f4f5', border: '1px solid #27272a' } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>{t('editMode.unsavedTitle')}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: '#a1a1aa' }}>
            {t('editMode.unsavedBody', { count: pendingEdits.length })}
          </Typography>
          <Stack direction="row" gap={1} sx={{ mt: 3, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button
              onClick={() => setUnsavedPromptOpen(false)}
              sx={{ color: '#a1a1aa', textTransform: 'none', fontWeight: 600 }}
            >
              {t('editMode.unsavedKeep')}
            </Button>
            <Button
              onClick={() => { setUnsavedPromptOpen(false); discardPendingEdits(true); }}
              sx={{
                textTransform: 'none', fontWeight: 600, color: '#f87171',
                border: '1px solid rgba(239,68,68,0.35)', borderRadius: 2, px: 2,
                '&:hover': { bgcolor: 'rgba(239,68,68,0.08)' },
              }}
            >
              {t('editMode.unsavedDiscard')}
            </Button>
            <Button
              onClick={() => { setUnsavedPromptOpen(false); applyPendingEdits(true); }}
              sx={{
                textTransform: 'none', fontWeight: 700, color: '#fff', px: 3, borderRadius: 2,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                '&:hover': { background: 'linear-gradient(135deg, #5458e5, #7c3aed)' },
              }}
            >
              {t('editMode.unsavedApply')}
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>

      {/* Generic edit / preview error — replaces browser alert() */}
      <Snackbar
        open={editError !== null}
        autoHideDuration={8000}
        onClose={(_, reason) => {
          if (reason === 'clickaway') return;
          setEditError(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: 2 }}
      >
        <Alert
          severity={editError?.severity ?? 'error'}
          variant="filled"
          onClose={() => setEditError(null)}
          sx={{ alignItems: 'center', maxWidth: 520 }}
        >
          {editError?.message}
        </Alert>
      </Snackbar>

      {/* Logo upload dialog */}
      <Dialog
        open={logoDialogOpen}
        onClose={() => !logoUploading && setLogoDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16 }}>{t('logo.dialogTitle')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <Typography variant="body2" color="text.secondary">{t('logo.dialogHint')}</Typography>

          <Button variant="outlined" component="label" disabled={logoUploading}>
            {t('logo.selectFile')}
            <input type="file" hidden accept="image/*" onChange={handleLogoFileSelect} />
          </Button>

          {logoPreview && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>{t('logo.preview')}</Typography>
              <Box
                component="img"
                src={logoPreview}
                alt="Logo preview"
                sx={{ maxHeight: 80, maxWidth: '100%', objectFit: 'contain', borderRadius: 1, border: '1px solid', borderColor: 'divider', p: 1 }}
              />
            </Box>
          )}
        </DialogContent>
        <Box sx={{ px: 3, pb: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button size="small" onClick={() => setLogoDialogOpen(false)} disabled={logoUploading}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleLogoUpload}
            disabled={!logoFile || logoUploading}
            startIcon={logoUploading ? <CircularProgress size={14} /> : undefined}
          >
            {logoUploading ? t('logo.uploading') : t('common.save')}
          </Button>
        </Box>
      </Dialog>

      {/* Hero background upload dialog */}
      <Dialog
        open={heroBgDialogOpen}
        onClose={() => !heroBgUploading && setHeroBgDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16 }}>{t('heroBg.dialogTitle')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <Typography variant="body2" color="text.secondary">{t('heroBg.dialogHint')}</Typography>

          <Button variant="outlined" component="label" disabled={heroBgUploading}>
            {t('heroBg.selectFile')}
            <input type="file" hidden accept="image/*" onChange={handleHeroBgFileSelect} />
          </Button>

          {heroBgPreview && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>{t('heroBg.preview')}</Typography>
              <Box
                component="img"
                src={heroBgPreview}
                alt="Background preview"
                sx={{ maxHeight: 120, maxWidth: '100%', objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
              />
            </Box>
          )}
        </DialogContent>
        <Box sx={{ px: 3, pb: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button size="small" onClick={() => setHeroBgDialogOpen(false)} disabled={heroBgUploading}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleHeroBgUpload}
            disabled={!heroBgFile || heroBgUploading}
            startIcon={heroBgUploading ? <CircularProgress size={14} /> : undefined}
          >
            {heroBgUploading ? t('heroBg.uploading') : t('common.save')}
          </Button>
        </Box>
      </Dialog>

      {/* General snackbar for feedback messages */}
      <Snackbar
        open={Boolean(snackMsg)}
        autoHideDuration={6000}
        onClose={() => setSnackMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={snackMsg}
      />
    </Box>
  );
}
