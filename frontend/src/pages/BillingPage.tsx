import { useEffect, useMemo, useState } from 'react';
import {
  Box, Container, Typography, Button, Paper, Stack,
  AppBar, Toolbar, Alert, LinearProgress, Chip, Divider,
  CircularProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudIcon from '@mui/icons-material/Cloud';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import PricingTable from '../components/PricingTable';
import AppLogo from '../components/AppLogo';
import Seo from '../components/Seo';
import { useIterationPlanStore } from '../store/iterationPlan';

function pctColor(pct: number): 'primary' | 'warning' | 'error' {
  if (pct >= 90) return 'error';
  if (pct >= 70) return 'warning';
  return 'primary';
}

export default function BillingPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [topupLoading, setTopupLoading] = useState(false);
  const [flashError, setFlashError] = useState<string | null>(null);

  const plan = useIterationPlanStore();
  const success = searchParams.get('success') === 'true';
  const planActive = searchParams.get('plan_active') === 'true';
  const topup = searchParams.get('topup') === 'true';

  useEffect(() => {
    void plan.refresh();
    // Intentionally refresh once on mount; `refresh` is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatDate = (iso: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(i18n.language || undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const statusChip = useMemo(() => {
    if (plan.status === 'active') {
      const label = plan.cancelAtPeriodEnd
        ? t('billing.planStatusCancelsSoon')
        : t('billing.planStatusActive');
      return <Chip size="small" color={plan.cancelAtPeriodEnd ? 'warning' : 'success'} label={label} />;
    }
    if (plan.status === 'past_due') {
      return <Chip size="small" color="error" label={t('billing.planStatusPastDue')} />;
    }
    if (plan.status === 'canceled') {
      return <Chip size="small" label={t('billing.planStatusCanceled')} />;
    }
    return <Chip size="small" variant="outlined" label={t('billing.planStatusNone')} />;
  }, [plan.status, plan.cancelAtPeriodEnd, t]);

  const handleManage = async () => {
    setLoading(true);
    try {
      const { url } = await api.post<{ url: string }>('/billing/portal');
      window.location.href = url;
    } catch (err) {
      setFlashError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const { url } = await api.iterationPlanCheckout();
      if (url) window.location.href = url;
    } catch (err) {
      setFlashError(err instanceof Error ? err.message : String(err));
      setSubscribing(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await api.iterationPlanCancel();
      await plan.refresh();
    } catch (err) {
      setFlashError(err instanceof Error ? err.message : String(err));
    } finally {
      setCancelling(false);
    }
  };

  const handleTopup = async () => {
    setTopupLoading(true);
    try {
      const { url } = await api.tokenTopupCheckout();
      if (url) window.location.href = url;
    } catch (err) {
      setFlashError(err instanceof Error ? err.message : String(err));
      setTopupLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Seo title={t('seo.billingTitle')} description={t('seo.billingDesc')} path="/billing" noindex />
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/chat')} color="inherit" size="small">
            {t('billing.backBuilder')}
          </Button>
          <Box sx={{ flex: 1 }} />
          <AppLogo size="small" />
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ pt: 5 }}>
        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {t('billing.successPay')}
          </Alert>
        )}
        {planActive && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {t('billing.planActivated')}
          </Alert>
        )}
        {topup && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {t('billing.topupApplied')}
          </Alert>
        )}
        {flashError && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setFlashError(null)}>
            {flashError}
          </Alert>
        )}

        <Typography variant="h4" fontWeight={700} mb={1}>{t('billing.title')}</Typography>
        <Typography variant="body2" color="text.secondary" mb={4}>
          {t('billing.subtitle')}
        </Typography>

        {/* Improvement plan — percent meter only, never raw tokens. */}
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={2} mb={plan.hasActiveSub ? 2 : 0}>
            <Box>
              <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                <AutoFixHighIcon color="primary" fontSize="small" />
                <Typography variant="subtitle1" fontWeight={600}>
                  {t('billing.improveTitle')}
                </Typography>
                {statusChip}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {t('billing.improveDesc')}
              </Typography>
            </Box>
            <Stack direction="row" gap={1} flexWrap="wrap">
              {!plan.hasActiveSub && (
                <Button
                  variant="contained"
                  onClick={handleSubscribe}
                  disabled={subscribing || plan.loading}
                  startIcon={subscribing ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : null}
                  sx={{ flexShrink: 0, background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}
                >
                  {t('billing.subscribeCta')}
                </Button>
              )}
              {plan.hasActiveSub && !plan.cancelAtPeriodEnd && (
                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={handleCancel}
                  disabled={cancelling}
                  sx={{ flexShrink: 0 }}
                >
                  {cancelling ? t('billing.cancelling') : t('billing.planCancelAtEnd')}
                </Button>
              )}
              {plan.hasActiveSub && (
                <Button
                  variant="outlined"
                  onClick={handleTopup}
                  disabled={topupLoading}
                  sx={{ flexShrink: 0 }}
                >
                  {topupLoading ? '…' : t('iteration.buyTopup')}
                </Button>
              )}
            </Stack>
          </Stack>

          {plan.hasActiveSub && (
            <>
              <Divider sx={{ my: 2 }} />
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="caption" color="text.secondary">
                  {t('iteration.usagePct', { pct: plan.pct })}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('iteration.resetOn', { date: formatDate(plan.periodEnd) })}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={plan.pct}
                color={pctColor(plan.pct)}
                sx={{ borderRadius: 1, height: 6, bgcolor: 'rgba(255,255,255,0.07)' }}
              />
              {plan.grants.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 0.75, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 }}>
                    {t('billing.grantsHeading')}
                  </Typography>
                  <Stack gap={0.5}>
                    {plan.grants.slice(0, 5).map((g) => (
                      <Stack key={g.id} direction="row" justifyContent="space-between">
                        <Typography variant="caption">
                          {g.reason === 'topup_purchase'
                            ? t('billing.grantTopup')
                            : g.reason === 'admin_grant'
                              ? t('billing.grantAdmin')
                              : t('billing.grantMigration')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(g.createdAt)}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              )}
            </>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mb: 4 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={2}>
            <Box>
              <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                <CloudIcon color="secondary" fontSize="small" />
                <Typography variant="subtitle1" fontWeight={600}>{t('billing.hostingTitle')}</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {t('billing.hostingDesc')}
              </Typography>
            </Box>
            <Button variant="outlined" onClick={handleManage} disabled={loading} sx={{ flexShrink: 0 }}>
              {loading ? t('billing.loadingManage') : t('billing.manage')}
            </Button>
          </Stack>
        </Paper>

        <PricingTable />
      </Container>
    </Box>
  );
}
