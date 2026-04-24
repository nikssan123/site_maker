import { useEffect, useState } from 'react';
import {
  AppBar, Alert, Box, Button, Chip, Container, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, Link, Paper, Skeleton, Stack,
  TextField, Toolbar, Tooltip, Typography, alpha,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LockResetIcon from '@mui/icons-material/LockReset';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import LanguageIcon from '@mui/icons-material/Language';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CloudIcon from '@mui/icons-material/Cloud';
import SubscriptionsIcon from '@mui/icons-material/Subscriptions';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';
import AppLogo from '../components/AppLogo';
import Seo from '../components/Seo';
import LanguageSwitcher from '../components/LanguageSwitcher';
import SupportDialog from '../components/SupportDialog';

function SectionCard({
  icon, title, hint, children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2.5, sm: 3 },
        mb: 2.5,
        borderColor: 'rgba(255,255,255,0.08)',
        bgcolor: 'rgba(255,255,255,0.02)',
      }}
    >
      <Stack direction="row" alignItems="center" gap={1.25} mb={0.5}>
        <Box
          sx={{
            width: 32, height: 32, borderRadius: 1.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.35))',
            color: '#c7d2fe',
          }}
        >
          {icon}
        </Box>
        <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
      </Stack>
      {hint && (
        <Typography variant="body2" color="text.secondary" mb={2}>
          {hint}
        </Typography>
      )}
      {children}
    </Paper>
  );
}

type Invoice = {
  id: string;
  number: string | null;
  status: string;
  amount: number;
  currency: string;
  date: number;
  description: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
};

type Subscription = {
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
};

function formatMoney(cents: number, currency: string | null | undefined, locale: string): string {
  const code = (currency ?? 'eur').toUpperCase();
  const value = (cents / 100).toFixed(2);
  if (code === 'EUR') return `${value} €`;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(cents / 100);
  } catch {
    return `${value} ${code}`;
  }
}

function formatDate(unixSeconds: number, locale: string): string {
  try {
    return new Date(unixSeconds * 1000).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
  }
}

function subscriptionStatusTone(status: string): 'success' | 'warning' | 'error' | 'default' {
  if (status === 'active' || status === 'trialing') return 'success';
  if (status === 'past_due' || status === 'incomplete') return 'warning';
  if (status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired') return 'error';
  return 'default';
}

function invoiceStatusTone(status: string): 'success' | 'warning' | 'error' | 'default' {
  if (status === 'paid') return 'success';
  if (status === 'open' || status === 'draft') return 'warning';
  if (status === 'uncollectible' || status === 'void') return 'error';
  return 'default';
}

function BillingSection({
  onOpenPortal,
  portalBusy,
  portalError,
  onGoToBilling,
}: {
  onOpenPortal: () => void;
  portalBusy: boolean;
  portalError: string;
  onGoToBilling: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [subsRes, invRes] = await Promise.all([api.listSubscriptions(), api.listInvoices()]);
      setSubs(subsRes.subscriptions);
      setInvoices(invRes.invoices);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings.billingLoadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subIcon = (kind: Subscription['kind']) => {
    if (kind === 'improvement_plan') return <AutoFixHighIcon sx={{ fontSize: 18 }} />;
    if (kind === 'hosting') return <CloudIcon sx={{ fontSize: 18 }} />;
    return <SubscriptionsIcon sx={{ fontSize: 18 }} />;
  };

  const subAccent = (kind: Subscription['kind']) => {
    if (kind === 'improvement_plan') return '#a855f7';
    if (kind === 'hosting') return '#10b981';
    return '#94a3b8';
  };

  const renderSubscription = (s: Subscription) => {
    const accent = subAccent(s.kind);
    const intervalLabel =
      s.interval === 'year'
        ? t('settings.billingSubscriptionPerYear', {
            amount: s.amount != null ? formatMoney(s.amount, s.currency, locale) : '—',
          })
        : s.interval === 'month'
          ? t('settings.billingSubscriptionPerMonth', {
              amount: s.amount != null ? formatMoney(s.amount, s.currency, locale) : '—',
            })
          : null;
    const statusKey = `settings.billingSubscriptionStatus.${s.status}`;
    const statusLabel = t(statusKey, { defaultValue: s.status });
    const statusTone = subscriptionStatusTone(s.status);
    const renewalText =
      s.currentPeriodEnd != null
        ? s.cancelAtPeriodEnd
          ? t('settings.billingSubscriptionCancelsOn', { date: formatDate(s.currentPeriodEnd, locale) })
          : t('settings.billingSubscriptionRenewsOn', { date: formatDate(s.currentPeriodEnd, locale) })
        : null;

    return (
      <Box
        key={s.id}
        sx={{
          p: 1.5,
          borderRadius: 2,
          border: '1px solid',
          borderColor: alpha(accent, 0.28),
          bgcolor: alpha(accent, 0.06),
          display: 'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1.75,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(accent, 0.18),
            color: accent,
            flexShrink: 0,
          }}
        >
          {subIcon(s.kind)}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {s.label}
            </Typography>
            <Chip
              label={statusLabel}
              size="small"
              color={statusTone === 'default' ? undefined : statusTone}
              variant={statusTone === 'default' ? 'outlined' : 'filled'}
              sx={{ height: 20, fontSize: 11, fontWeight: 700, '& .MuiChip-label': { px: 1 } }}
            />
            {s.cancelAtPeriodEnd && (
              <Chip
                label={t('settings.billingSubscriptionStatus.canceled')}
                size="small"
                color="warning"
                variant="outlined"
                sx={{ height: 20, fontSize: 11, '& .MuiChip-label': { px: 1 } }}
              />
            )}
          </Stack>
          {(intervalLabel || renewalText) && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              {[intervalLabel, renewalText].filter(Boolean).join(' · ')}
            </Typography>
          )}
        </Box>
      </Box>
    );
  };

  const renderInvoice = (inv: Invoice) => {
    const tone = invoiceStatusTone(inv.status);
    const statusKey = `settings.billingInvoiceStatus.${inv.status}`;
    const statusLabel = t(statusKey, { defaultValue: inv.status });

    return (
      <Box
        key={inv.id}
        sx={{
          p: 1.25,
          borderRadius: 2,
          border: '1px solid rgba(255,255,255,0.07)',
          bgcolor: 'rgba(255,255,255,0.02)',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {inv.number ?? inv.id.slice(-8).toUpperCase()}
            </Typography>
            <Chip
              label={statusLabel}
              size="small"
              color={tone === 'default' ? undefined : tone}
              variant={tone === 'default' ? 'outlined' : 'filled'}
              sx={{ height: 20, fontSize: 11, fontWeight: 700, '& .MuiChip-label': { px: 1 } }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            {formatDate(inv.date, locale)}
            {inv.description ? ` · ${inv.description}` : ''}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {formatMoney(inv.amount, inv.currency, locale)}
        </Typography>
        <Stack direction="row" gap={0.25} sx={{ flexShrink: 0 }}>
          {inv.hostedInvoiceUrl && (
            <Tooltip title={t('settings.billingInvoiceView')}>
              <IconButton
                size="small"
                component={Link}
                href={inv.hostedInvoiceUrl}
                target="_blank"
                rel="noreferrer"
                sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
              >
                <OpenInNewIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          {inv.invoicePdf && (
            <Tooltip title={t('settings.billingInvoicePdf')}>
              <IconButton
                size="small"
                component={Link}
                href={inv.invoicePdf}
                target="_blank"
                rel="noreferrer"
                sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
              >
                <PictureAsPdfIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Box>
    );
  };

  return (
    <>
      {/* Action row + refresh */}
      {portalError && <Alert severity="error" sx={{ mb: 2 }}>{portalError}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Subscriptions */}
      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.7, fontSize: 11, fontWeight: 700 }}>
          {t('settings.billingSubscriptionsHeading')}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={t('settings.billingRefresh')}>
          <span>
            <IconButton size="small" onClick={load} disabled={loading} sx={{ color: 'text.secondary' }}>
              <RefreshIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Stack gap={1} sx={{ mb: 2.5 }}>
        {loading && !subs && (
          <>
            <Skeleton variant="rounded" height={62} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
            <Skeleton variant="rounded" height={62} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
          </>
        )}
        {!loading && subs && subs.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('settings.billingSubscriptionsEmpty')}
          </Typography>
        )}
        {subs && subs.map(renderSubscription)}
      </Stack>

      {/* Invoices */}
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.7, fontSize: 11, fontWeight: 700, display: 'block', mb: 1 }}
      >
        {t('settings.billingInvoicesHeading')}
      </Typography>
      <Stack gap={0.75} sx={{ mb: 2 }}>
        {loading && !invoices && (
          <>
            <Skeleton variant="rounded" height={56} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
            <Skeleton variant="rounded" height={56} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
          </>
        )}
        {!loading && invoices && invoices.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('settings.billingInvoicesEmpty')}
          </Typography>
        )}
        {invoices && invoices.map(renderInvoice)}
      </Stack>

      {/* Action buttons (preserved from old design) */}
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
        <Button variant="contained" onClick={onOpenPortal} disabled={portalBusy} startIcon={<CreditCardIcon fontSize="small" />}>
          {portalBusy ? t('settings.openingPortal') : t('settings.openPortal')}
        </Button>
        <Button variant="outlined" onClick={onGoToBilling} startIcon={<ReceiptLongIcon fontSize="small" />}>
          {t('settings.goToBilling')}
        </Button>
      </Stack>
    </>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout = useAuthStore((s) => s.logout);

  // --- Password ---
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwStage, setPwStage] = useState<'idle' | 'sent'>('idle');
  const [pwCode, setPwCode] = useState('');
  const [pwSentTo, setPwSentTo] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const handleRequestPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(''); setPwSuccess(false);
    if (pwNew !== pwConfirm) { setPwError(t('settings.passwordMismatch')); return; }
    setPwBusy(true);
    try {
      const res = await api.requestPasswordChange({ currentPassword: pwCurrent, newPassword: pwNew });
      setPwSentTo(res.email);
      setPwStage('sent');
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : 'Error');
    } finally {
      setPwBusy(false);
    }
  };

  const handleConfirmPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwBusy(true);
    try {
      await api.confirmPasswordChange({ code: pwCode });
      setPwSuccess(true);
      setPwStage('idle');
      setPwCurrent(''); setPwNew(''); setPwConfirm(''); setPwCode(''); setPwSentTo('');
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : 'Error');
    } finally {
      setPwBusy(false);
    }
  };

  // --- Email change ---
  const [emNewEmail, setEmNewEmail] = useState('');
  const [emPassword, setEmPassword] = useState('');
  const [emStage, setEmStage] = useState<'idle' | 'sent'>('idle');
  const [emCode, setEmCode] = useState('');
  const [emBusy, setEmBusy] = useState(false);
  const [emError, setEmError] = useState('');
  const [emSuccess, setEmSuccess] = useState(false);
  const [emSentTo, setEmSentTo] = useState('');

  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmError(''); setEmSuccess(false);
    setEmBusy(true);
    try {
      const res = await api.requestEmailChange({ newEmail: emNewEmail, password: emPassword });
      setEmSentTo(res.newEmail);
      setEmStage('sent');
      setEmPassword('');
    } catch (err: unknown) {
      setEmError(err instanceof Error ? err.message : 'Error');
    } finally {
      setEmBusy(false);
    }
  };

  const handleConfirmEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmError('');
    setEmBusy(true);
    try {
      const res = await api.confirmEmailChange({ code: emCode });
      setAuth(res.token, res.user);
      setEmSuccess(true);
      setEmStage('idle');
      setEmNewEmail(''); setEmCode(''); setEmSentTo('');
    } catch (err: unknown) {
      setEmError(err instanceof Error ? err.message : 'Error');
    } finally {
      setEmBusy(false);
    }
  };

  // --- Billing portal ---
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState('');

  const handleOpenPortal = async () => {
    setPortalError('');
    setPortalBusy(true);
    try {
      const { url } = await api.post<{ url: string }>('/billing/portal');
      window.location.href = url;
    } catch (err: unknown) {
      setPortalError(err instanceof Error ? err.message : 'Error');
      setPortalBusy(false);
    }
  };

  // --- Support ---
  const [supportOpen, setSupportOpen] = useState(false);

  // --- Delete ---
  const [delOpen, setDelOpen] = useState(false);
  const [delPassword, setDelPassword] = useState('');
  const [delConfirmText, setDelConfirmText] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState('');

  const canDelete = delPassword.length > 0 && delConfirmText.trim().toLowerCase() === 'delete' ||
    delPassword.length > 0 && delConfirmText.trim().toLowerCase() === 'изтрий';

  const handleDelete = async () => {
    setDelError('');
    setDelBusy(true);
    try {
      await api.deleteAccount({ password: delPassword });
      logout();
      navigate('/');
    } catch (err: unknown) {
      setDelError(err instanceof Error ? err.message : 'Error');
      setDelBusy(false);
    }
  };

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Seo title={t('seo.settingsTitle')} description={t('seo.settingsDesc')} path="/settings" noindex />
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/chat')} color="inherit" size="small">
            {t('settings.backBuilder')}
          </Button>
          <Box sx={{ flex: 1 }} />
          <AppLogo size="small" />
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ pt: 5, pb: 8 }}>
        <Typography variant="h4" fontWeight={700} mb={0.5}>{t('settings.title')}</Typography>
        <Typography variant="body2" color="text.secondary" mb={4}>
          {t('settings.subtitle')}
        </Typography>

        <SectionCard
          icon={<AccountCircleIcon fontSize="small" />}
          title={t('settings.sectionAccount')}
          hint={t('settings.sectionAccountHint')}
        >
          <Stack gap={1.5}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 }}>
                {t('settings.emailLabel')}
              </Typography>
              <Typography variant="body1" fontWeight={600}>{user?.email ?? '—'}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 }}>
                {t('settings.memberSince')}
              </Typography>
              <Typography variant="body1" fontWeight={600}>{memberSince}</Typography>
            </Box>
          </Stack>
        </SectionCard>

        <SectionCard
          icon={<LockResetIcon fontSize="small" />}
          title={t('settings.sectionPassword')}
          hint={t('settings.sectionPasswordHint')}
        >
          {pwStage === 'idle' && (
            <form onSubmit={handleRequestPasswordChange}>
              <Stack gap={2}>
                {pwError && <Alert severity="error">{pwError}</Alert>}
                {pwSuccess && <Alert severity="success">{t('settings.passwordSuccess')}</Alert>}
                <TextField
                  label={t('settings.currentPassword')}
                  type="password"
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  required
                  fullWidth
                  autoComplete="current-password"
                />
                <TextField
                  label={t('settings.newPassword')}
                  type="password"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  required
                  fullWidth
                  autoComplete="new-password"
                  helperText={t('auth.passwordHint')}
                />
                <TextField
                  label={t('settings.confirmPassword')}
                  type="password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  required
                  fullWidth
                  autoComplete="new-password"
                />
                <Box>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={pwBusy || pwCurrent.length === 0 || pwNew.length < 8}
                  >
                    {pwBusy ? t('settings.sending') : t('settings.sendCode')}
                  </Button>
                </Box>
              </Stack>
            </form>
          )}

          {pwStage === 'sent' && (
            <form onSubmit={handleConfirmPasswordChange}>
              <Stack gap={2}>
                {pwError && <Alert severity="error">{pwError}</Alert>}
                <Alert severity="info">
                  {t('settings.codeSent', { email: pwSentTo })}
                </Alert>
                <TextField
                  label={t('settings.verificationCode')}
                  value={pwCode}
                  onChange={(e) => setPwCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  fullWidth
                  inputProps={{ inputMode: 'numeric', maxLength: 6 }}
                />
                <Stack direction="row" gap={1}>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={pwBusy || pwCode.length !== 6}
                  >
                    {pwBusy ? t('settings.confirming') : t('settings.confirmChange')}
                  </Button>
                  <Button
                    type="button"
                    color="inherit"
                    onClick={() => { setPwStage('idle'); setPwCode(''); setPwError(''); setPwSentTo(''); }}
                  >
                    {t('settings.cancelChange')}
                  </Button>
                </Stack>
              </Stack>
            </form>
          )}
        </SectionCard>

        <SectionCard
          icon={<AlternateEmailIcon fontSize="small" />}
          title={t('settings.sectionEmail')}
          hint={t('settings.sectionEmailHint')}
        >
          {emError && <Alert severity="error" sx={{ mb: 2 }}>{emError}</Alert>}
          {emSuccess && <Alert severity="success" sx={{ mb: 2 }}>{t('settings.emailSuccess')}</Alert>}

          {emStage === 'idle' && (
            <form onSubmit={handleRequestEmailChange}>
              <Stack gap={2}>
                <TextField
                  label={t('settings.newEmail')}
                  type="email"
                  value={emNewEmail}
                  onChange={(e) => setEmNewEmail(e.target.value)}
                  required
                  fullWidth
                  autoComplete="email"
                />
                <TextField
                  label={t('settings.yourPassword')}
                  type="password"
                  value={emPassword}
                  onChange={(e) => setEmPassword(e.target.value)}
                  required
                  fullWidth
                  autoComplete="current-password"
                />
                <Box>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={emBusy || emNewEmail.length === 0 || emPassword.length === 0}
                  >
                    {emBusy ? t('settings.sending') : t('settings.sendCode')}
                  </Button>
                </Box>
              </Stack>
            </form>
          )}

          {emStage === 'sent' && (
            <form onSubmit={handleConfirmEmailChange}>
              <Stack gap={2}>
                <Alert severity="info">
                  {t('settings.codeSent', { email: emSentTo })}
                </Alert>
                <TextField
                  label={t('settings.verificationCode')}
                  value={emCode}
                  onChange={(e) => setEmCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  fullWidth
                  inputProps={{ inputMode: 'numeric', maxLength: 6 }}
                />
                <Stack direction="row" gap={1}>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={emBusy || emCode.length !== 6}
                  >
                    {emBusy ? t('settings.confirming') : t('settings.confirmChange')}
                  </Button>
                  <Button
                    type="button"
                    color="inherit"
                    onClick={() => { setEmStage('idle'); setEmCode(''); setEmError(''); setEmSentTo(''); }}
                  >
                    {t('settings.cancelChange')}
                  </Button>
                </Stack>
              </Stack>
            </form>
          )}
        </SectionCard>

        <SectionCard
          icon={<CreditCardIcon fontSize="small" />}
          title={t('settings.sectionBilling')}
          hint={t('settings.sectionBillingHint')}
        >
          <BillingSection
            onOpenPortal={handleOpenPortal}
            portalBusy={portalBusy}
            portalError={portalError}
            onGoToBilling={() => navigate('/billing')}
          />
        </SectionCard>

        <SectionCard
          icon={<LanguageIcon fontSize="small" />}
          title={t('settings.sectionLanguage')}
          hint={t('settings.sectionLanguageHint')}
        >
          <LanguageSwitcher size="medium" />
        </SectionCard>

        <SectionCard
          icon={<HelpOutlineIcon fontSize="small" />}
          title={t('settings.sectionSupport')}
          hint={t('settings.sectionSupportHint')}
        >
          <Typography variant="body2" color="text.secondary" mb={1.5}>
            {t('settings.supportBody')}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<HelpOutlineIcon fontSize="small" />}
            onClick={() => setSupportOpen(true)}
          >
            {t('settings.contactSupport')}
          </Button>
        </SectionCard>

        <SectionCard
          icon={<WarningAmberIcon fontSize="small" />}
          title={t('settings.sectionDanger')}
          hint={t('settings.sectionDangerHint')}
        >
          <Button
            variant="outlined"
            color="error"
            onClick={() => { setDelOpen(true); setDelError(''); setDelPassword(''); setDelConfirmText(''); }}
          >
            {t('settings.deleteAccount')}
          </Button>
        </SectionCard>
      </Container>

      <Dialog
        open={delOpen}
        onClose={() => !delBusy && setDelOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { bgcolor: '#141414', border: '1px solid', borderColor: 'error.dark' } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>{t('settings.deleteDialogTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {t('settings.deleteDialogBody')}
          </Typography>
          {delError && <Alert severity="error" sx={{ mb: 2 }}>{delError}</Alert>}
          <Stack gap={2}>
            <TextField
              label={t('settings.currentPassword')}
              type="password"
              value={delPassword}
              onChange={(e) => setDelPassword(e.target.value)}
              fullWidth
              autoComplete="current-password"
            />
            <TextField
              label={t('settings.typeToConfirm')}
              value={delConfirmText}
              onChange={(e) => setDelConfirmText(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDelOpen(false)} disabled={delBusy} color="inherit">
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={delBusy || !canDelete}
          >
            {delBusy ? t('settings.deleting') : t('settings.confirmDelete')}
          </Button>
        </DialogActions>
      </Dialog>

      <SupportDialog open={supportOpen} onClose={() => setSupportOpen(false)} />
    </Box>
  );
}
