import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, IconButton, Typography, Paper, Button,
  Stepper, Step, StepLabel, Stack, Alert, CircularProgress,
  Chip, List, ListItem, ListItemIcon, ListItemText, Link, Divider, Box,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PaymentsIcon from '@mui/icons-material/Payments';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import CheckIcon from '@mui/icons-material/Check';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

type Step = 'intro' | 'create-account' | 'connect' | 'success' | 'error';

const STEP_LABELS_KEYS = ['payments.stepIntro', 'payments.stepAccount', 'payments.stepConnect', 'payments.stepDone'];
const STEP_ORDER: Exclude<Step, 'error'>[] = ['intro', 'create-account', 'connect', 'success'];

function activeStepIndex(step: Step): number {
  const s = step === 'error' ? 'connect' : step;
  return STEP_ORDER.indexOf(s as Exclude<Step, 'error'>);
}

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** Pass 'connected' or 'error' when returning from Stripe OAuth redirect. */
  oauthResult?: 'connected' | 'error' | null;
  oauthError?: string | null;
}

export default function PaymentsSetupDialog({ open, onClose, projectId, oauthResult, oauthError }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('intro');
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [connectLoading, setConnectLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (oauthResult === 'connected') {
      api.get<{ paymentsEnabled: boolean; stripeAccountId: string | null }>(
        `/project-payments/status/${projectId}`,
      ).then((s) => {
        setStripeAccountId(s.stripeAccountId);
        setStep('success');
      }).catch(() => setStep('success'));
      return;
    }

    if (oauthResult === 'error') {
      setErrorMsg(
        oauthError === 'access_denied'
          ? t('payments.errorDenied')
          : t('payments.errorGeneric'),
      );
      setStep('error');
      return;
    }

    // Check if already connected
    api.get<{ paymentsEnabled: boolean; stripeAccountId: string | null }>(
      `/project-payments/status/${projectId}`,
    ).then((s) => {
      if (s.paymentsEnabled) {
        setStripeAccountId(s.stripeAccountId);
        setStep('success');
      } else {
        setStep('intro');
      }
    }).catch(() => setStep('intro'));
  }, [open, projectId, oauthResult, oauthError]);

  const handleConnect = async () => {
    setConnectLoading(true);
    try {
      const { url } = await api.get<{ url: string }>(
        `/project-payments/oauth/url?projectId=${projectId}`,
      );
      window.location.href = url;
    } catch (err: any) {
      setErrorMsg(err.message ?? t('payments.errorGeneric'));
      setStep('error');
      setConnectLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await api.post(`/project-payments/disconnect/${projectId}`);
    } catch {
      // non-fatal
    } finally {
      setStripeAccountId(null);
      setStep('intro');
      setDisconnecting(false);
    }
  };

  const handleClose = () => {
    setErrorMsg('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth
      PaperProps={{ sx: { borderRadius: 3, bgcolor: 'background.paper' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <PaymentsIcon color="primary" fontSize="small" />
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>{t('payments.pageTitle')}</Typography>
        <IconButton onClick={handleClose} size="small" sx={{ color: 'text.secondary' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 0 }}>
        {/* Stepper */}
        <Box sx={{ mb: 2 }}>
          <Stepper activeStep={activeStepIndex(step)} alternativeLabel>
            {STEP_LABELS_KEYS.map((key, i) => (
              <Step key={key} completed={activeStepIndex(step) > i}>
                <StepLabel error={step === 'error' && i === 2}>
                  <Typography variant="caption">{t(key)}</Typography>
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        <Divider sx={{ mb: 2.5 }} />

        {/* ── INTRO ── */}
        {step === 'intro' && (
          <Stack spacing={2.5} alignItems="center" textAlign="center">
            <Box sx={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PaymentsIcon sx={{ fontSize: 28, color: '#fff' }} />
            </Box>
            <Typography variant="h6" fontWeight={700}>{t('payments.introTitle')}</Typography>
            <List dense sx={{ width: '100%', textAlign: 'left' }}>
              {(['introPoint1', 'introPoint2', 'introPoint3'] as const).map((key) => (
                <ListItem key={key} sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckIcon sx={{ fontSize: 18, color: 'success.main' }} />
                  </ListItemIcon>
                  <ListItemText primary={<Typography variant="body2">{t(`payments.${key}`)}</Typography>} />
                </ListItem>
              ))}
            </List>
            <Button variant="contained" fullWidth onClick={() => setStep('create-account')}
              sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}>
              {t('payments.introNext')}
            </Button>
          </Stack>
        )}

        {/* ── CREATE ACCOUNT ── */}
        {step === 'create-account' && (
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={700}>{t('payments.createTitle')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('payments.createBody')}</Typography>
            <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
              <List dense disablePadding>
                {(['createStep1', 'createStep2', 'createStep3'] as const).map((key, i) => (
                  <ListItem key={key} sx={{ px: 0, alignItems: 'flex-start' }}>
                    <ListItemIcon sx={{ minWidth: 36, mt: 0.25 }}>
                      <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{i + 1}</Typography>
                      </Box>
                    </ListItemIcon>
                    <ListItemText primary={<Typography variant="body2">{t(`payments.${key}`)}</Typography>} />
                  </ListItem>
                ))}
              </List>
            </Paper>
            <Button variant="outlined" fullWidth endIcon={<OpenInNewIcon fontSize="small" />}
              component={Link} href="https://dashboard.stripe.com/register" target="_blank" rel="noopener noreferrer">
              {t('payments.createOpenStripe')}
            </Button>
            <Button variant="contained" fullWidth onClick={() => setStep('connect')}
              sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}>
              {t('payments.createNext')}
            </Button>
          </Stack>
        )}

        {/* ── CONNECT ── */}
        {step === 'connect' && (
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={700}>{t('payments.connectTitle')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('payments.connectBody')}</Typography>
            <Alert severity="info" icon={false} sx={{ borderRadius: 2 }}>
              <Typography variant="body2">{t('payments.connectSafeNote')}</Typography>
            </Alert>
            <Button variant="contained" fullWidth onClick={handleConnect} disabled={connectLoading}
              startIcon={connectLoading ? <CircularProgress size={16} color="inherit" /> : <PaymentsIcon />}
              sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}>
              {connectLoading ? t('payments.connecting') : t('payments.connectButton')}
            </Button>
          </Stack>
        )}

        {/* ── SUCCESS ── */}
        {step === 'success' && (
          <Stack spacing={2} alignItems="center" textAlign="center">
            <CheckCircleIcon sx={{ fontSize: 56, color: 'success.main' }} />
            <Typography variant="h6" fontWeight={700}>{t('payments.successTitle')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('payments.successBody')}</Typography>
            {stripeAccountId && (
              <Chip label={`${t('payments.connectedAccount')}: ${stripeAccountId}`}
                color="success" variant="outlined" size="small"
                sx={{ fontFamily: 'monospace', fontSize: 11 }} />
            )}
            <Button variant="contained" fullWidth onClick={handleClose}
              sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}>
              {t('payments.backToProject')}
            </Button>
            <Button variant="outlined" fullWidth color="error" onClick={handleDisconnect} disabled={disconnecting}
              startIcon={disconnecting ? <CircularProgress size={14} color="inherit" /> : <LinkOffIcon fontSize="small" />}
              sx={{ borderColor: 'rgba(239,68,68,0.4)', '&:hover': { borderColor: 'error.main' } }}>
              {disconnecting ? t('payments.disconnecting') : t('payments.disconnect')}
            </Button>
          </Stack>
        )}

        {/* ── ERROR ── */}
        {step === 'error' && (
          <Stack spacing={2} alignItems="center" textAlign="center">
            <ErrorOutlineIcon sx={{ fontSize: 56, color: 'error.main' }} />
            <Typography variant="h6" fontWeight={700}>{t('payments.errorTitle')}</Typography>
            <Alert severity="error" sx={{ width: '100%', borderRadius: 2, textAlign: 'left' }}>
              {errorMsg || t('payments.errorGeneric')}
            </Alert>
            <Button variant="contained" fullWidth onClick={() => { setErrorMsg(''); setStep('connect'); }}
              sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}>
              {t('payments.retryButton')}
            </Button>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
