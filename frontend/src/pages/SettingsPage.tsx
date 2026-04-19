import { useState } from 'react';
import {
  AppBar, Alert, Box, Button, Container, Dialog, DialogActions,
  DialogContent, DialogTitle, Paper, Stack, TextField, Toolbar, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LockResetIcon from '@mui/icons-material/LockReset';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import LanguageIcon from '@mui/icons-material/Language';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
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
          {portalError && <Alert severity="error" sx={{ mb: 2 }}>{portalError}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
            <Button variant="contained" onClick={handleOpenPortal} disabled={portalBusy}>
              {portalBusy ? t('settings.openingPortal') : t('settings.openPortal')}
            </Button>
            <Button variant="outlined" onClick={() => navigate('/billing')}>
              {t('settings.goToBilling')}
            </Button>
          </Stack>
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
