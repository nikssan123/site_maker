import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, IconButton, Typography, Paper, Button,
  Stepper, Step, StepLabel, Stack, Alert, CircularProgress,
  Chip, List, ListItem, ListItemIcon, ListItemText, Link, Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PaymentsIcon from '@mui/icons-material/Payments';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import CheckIcon from '@mui/icons-material/Check';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import AppLogo from '../components/AppLogo';

type Step = 'intro' | 'create-account' | 'connect' | 'success' | 'error';

const STEP_LABELS_KEYS = ['payments.stepIntro', 'payments.stepAccount', 'payments.stepConnect', 'payments.stepDone'];
const STEP_ORDER: Exclude<Step, 'error'>[] = ['intro', 'create-account', 'connect', 'success'];

function activeStepIndex(step: Step): number {
  const s = step === 'error' ? 'connect' : step;
  return STEP_ORDER.indexOf(s as Exclude<Step, 'error'>);
}

export default function PaymentsSetupPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<Step>('intro');
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [connectLoading, setConnectLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!projectId) return;

    // Handle return from Stripe OAuth
    if (searchParams.get('connected') === 'true') {
      api.get<{ paymentsEnabled: boolean; stripeAccountId: string | null }>(
        `/project-payments/status/${projectId}`,
      ).then((s) => {
        setStripeAccountId(s.stripeAccountId);
        setStep('success');
      }).catch(() => setStep('success'));
      return;
    }

    const oauthError = searchParams.get('error');
    if (oauthError) {
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
      }
    }).catch(() => {});
  }, [projectId]);

  const handleConnect = async () => {
    if (!projectId) return;
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
    if (!projectId) return;
    setDisconnecting(true);
    try {
      await api.post(`/project-payments/disconnect/${projectId}`);
      setStripeAccountId(null);
      setStep('intro');
    } catch {
      // Non-fatal — reset anyway
      setStripeAccountId(null);
      setStep('intro');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar>
          <IconButton onClick={() => navigate(`/preview/${projectId}`)} size="small" sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <AppLogo size="small" />
          <Divider orientation="vertical" flexItem sx={{ mx: 1.5 }} />
          <PaymentsIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6" fontWeight={700}>{t('payments.pageTitle')}</Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', p: 3 }}>
        <Box sx={{ width: '100%', maxWidth: 560 }}>
          <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
            {/* Stepper */}
            <Box sx={{ px: 3, pt: 3, pb: 2 }}>
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

            <Divider />

            <Box sx={{ p: 3 }}>
              {/* ── INTRO ── */}
              {step === 'intro' && (
                <Stack spacing={3} alignItems="center" textAlign="center">
                  <Box sx={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <PaymentsIcon sx={{ fontSize: 32, color: '#fff' }} />
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
                  <Button variant="contained" fullWidth size="large" onClick={() => setStep('create-account')}
                    sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}>
                    {t('payments.introNext')}
                  </Button>
                </Stack>
              )}

              {/* ── CREATE ACCOUNT ── */}
              {step === 'create-account' && (
                <Stack spacing={2.5}>
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
                  <Button
                    variant="outlined"
                    fullWidth
                    endIcon={<OpenInNewIcon fontSize="small" />}
                    component={Link}
                    href="https://dashboard.stripe.com/register"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('payments.createOpenStripe')}
                  </Button>
                  <Button variant="contained" fullWidth size="large" onClick={() => setStep('connect')}
                    sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}>
                    {t('payments.createNext')}
                  </Button>
                </Stack>
              )}

              {/* ── CONNECT ── */}
              {step === 'connect' && (
                <Stack spacing={2.5}>
                  <Typography variant="h6" fontWeight={700}>{t('payments.connectTitle')}</Typography>
                  <Typography variant="body2" color="text.secondary">{t('payments.connectBody')}</Typography>
                  <Alert severity="info" icon={false} sx={{ borderRadius: 2 }}>
                    <Typography variant="body2">{t('payments.connectSafeNote')}</Typography>
                  </Alert>
                  <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    onClick={handleConnect}
                    disabled={connectLoading}
                    startIcon={connectLoading ? <CircularProgress size={16} color="inherit" /> : <PaymentsIcon />}
                    sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}
                  >
                    {connectLoading ? t('payments.connecting') : t('payments.connectButton')}
                  </Button>
                </Stack>
              )}

              {/* ── SUCCESS ── */}
              {step === 'success' && (
                <Stack spacing={2.5} alignItems="center" textAlign="center">
                  <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main' }} />
                  <Typography variant="h6" fontWeight={700}>{t('payments.successTitle')}</Typography>
                  <Typography variant="body2" color="text.secondary">{t('payments.successBody')}</Typography>
                  {stripeAccountId && (
                    <Chip
                      label={`${t('payments.connectedAccount')}: ${stripeAccountId}`}
                      color="success"
                      variant="outlined"
                      size="small"
                      sx={{ fontFamily: 'monospace', fontSize: 11 }}
                    />
                  )}
                  <Button variant="contained" fullWidth size="large"
                    onClick={() => navigate(`/preview/${projectId}`)}
                    sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}>
                    {t('payments.backToProject')}
                  </Button>
                  <Button
                    variant="outlined"
                    fullWidth
                    color="error"
                    startIcon={disconnecting ? <CircularProgress size={14} color="inherit" /> : <LinkOffIcon fontSize="small" />}
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    sx={{ borderColor: 'rgba(239,68,68,0.4)', '&:hover': { borderColor: 'error.main' } }}
                  >
                    {disconnecting ? t('payments.disconnecting') : t('payments.disconnect')}
                  </Button>
                </Stack>
              )}

              {/* ── ERROR ── */}
              {step === 'error' && (
                <Stack spacing={2.5} alignItems="center" textAlign="center">
                  <ErrorOutlineIcon sx={{ fontSize: 64, color: 'error.main' }} />
                  <Typography variant="h6" fontWeight={700}>{t('payments.errorTitle')}</Typography>
                  <Alert severity="error" sx={{ width: '100%', borderRadius: 2, textAlign: 'left' }}>
                    {errorMsg || t('payments.errorGeneric')}
                  </Alert>
                  <Button variant="contained" fullWidth size="large"
                    onClick={() => { setErrorMsg(''); setStep('connect'); }}
                    sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}>
                    {t('payments.retryButton')}
                  </Button>
                </Stack>
              )}
            </Box>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
