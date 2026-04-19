import { useEffect, useMemo, useState } from 'react';
import {
  Box, TextField, Button, Stack, Typography, LinearProgress, Paper, Chip, CircularProgress,
} from '@mui/material';
import DiamondIcon from '@mui/icons-material/Diamond';
import SendIcon from '@mui/icons-material/Send';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../store/project';
import { useIterationPlanStore } from '../store/iterationPlan';
import { api } from '../lib/api';
import SupportDialog from './SupportDialog';

interface Props {
  onSubmit: (message: string) => void;
  loading: boolean;
  loadingLabel?: string;
}

function pctColor(pct: number): 'primary' | 'warning' | 'error' {
  if (pct >= 90) return 'error';
  if (pct >= 70) return 'warning';
  return 'primary';
}

export default function IterationBar({ onSubmit, loading, loadingLabel }: Props) {
  const { t, i18n } = useTranslation();
  const [value, setValue] = useState('');
  const [supportOpen, setSupportOpen] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [buyingTopup, setBuyingTopup] = useState(false);
  const { iterationsTotal, freeIterationLimit } = useProjectStore();
  const plan = useIterationPlanStore();

  useEffect(() => {
    if (!plan.loaded && !plan.loading) {
      void plan.refresh();
    }
  }, [plan]);

  const freeUsed = Math.min(iterationsTotal, freeIterationLimit);
  const freeRemaining = Math.max(0, freeIterationLimit - freeUsed);
  const stillOnFreeTier = freeRemaining > 0;

  const hasQuota = stillOnFreeTier || (plan.pct < 100 && (plan.hasActiveSub || plan.grants.length > 0));
  const outOfQuota = !stillOnFreeTier && plan.loaded && plan.pct >= 100 && plan.hasActiveSub;
  const needsSubscribe = !stillOnFreeTier && plan.loaded && !plan.hasActiveSub && plan.grants.length === 0;

  const resetLabel = useMemo(() => {
    if (!plan.periodEnd) return '';
    try {
      return new Date(plan.periodEnd).toLocaleDateString(i18n.language || undefined, {
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return '';
    }
  }, [plan.periodEnd, i18n.language]);

  const handleSubmit = () => {
    if (!value.trim() || !hasQuota) return;
    onSubmit(value.trim());
    setValue('');
  };

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const { url } = await api.iterationPlanCheckout();
      if (url) window.location.href = url;
    } catch {
      setSubscribing(false);
    }
  };

  const handleTopup = async () => {
    setBuyingTopup(true);
    try {
      const { url } = await api.tokenTopupCheckout();
      if (url) window.location.href = url;
    } catch {
      setBuyingTopup(false);
    }
  };

  return (
    <>
      <Paper
        variant="outlined"
        sx={{
          p: 1.75,
          borderColor: 'rgba(99,102,241,0.35)',
          borderWidth: 1,
          borderRadius: 3,
          background: 'rgba(99,102,241,0.03)',
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="caption" fontWeight={600} color="primary.main" sx={{ fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {t('iteration.barLabel')}
          </Typography>
          {stillOnFreeTier ? (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11 }}>
              {t('iteration.freeRemaining', { n: freeRemaining, total: freeIterationLimit })}
            </Typography>
          ) : plan.loaded && (plan.hasActiveSub || plan.grants.length > 0) ? (
            <Typography variant="caption" sx={{ color: outOfQuota ? 'error.light' : 'text.secondary', fontSize: 11 }}>
              {t('iteration.usagePct', { pct: plan.pct })}
              {resetLabel ? ` · ${t('iteration.resetOn', { date: resetLabel })}` : ''}
            </Typography>
          ) : null}
        </Stack>

        {!stillOnFreeTier && plan.loaded && (plan.hasActiveSub || plan.grants.length > 0) && (
          <LinearProgress
            variant="determinate"
            value={plan.pct}
            color={pctColor(plan.pct)}
            sx={{ borderRadius: 1, height: 3, mb: 1.25, bgcolor: 'rgba(255,255,255,0.07)' }}
          />
        )}

        {stillOnFreeTier && (
          <LinearProgress
            variant="determinate"
            value={(freeUsed / freeIterationLimit) * 100}
            color="primary"
            sx={{ borderRadius: 1, height: 3, mb: 1.25, bgcolor: 'rgba(255,255,255,0.07)' }}
          />
        )}

        {outOfQuota ? (
          <Stack spacing={1.25}>
            <Typography variant="body2" fontWeight={700}>
              {t('iteration.outOfQuotaTitle')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('iteration.outOfQuotaHint', { date: resetLabel })}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                fullWidth
                disabled={buyingTopup}
                onClick={handleTopup}
                startIcon={buyingTopup ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <DiamondIcon sx={{ fontSize: '14px !important' }} />}
                sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}
              >
                {t('iteration.buyTopup')}
              </Button>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => setSupportOpen(true)}
                startIcon={<SupportAgentIcon fontSize="small" />}
                sx={{ fontWeight: 700 }}
              >
                {t('iteration.requestExtension')}
              </Button>
            </Stack>
          </Stack>
        ) : needsSubscribe ? (
          <Stack spacing={1.25}>
            <Typography variant="body2" fontWeight={700}>
              {t('iteration.subscribeTitle')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('iteration.subscribeHint')}
            </Typography>
            <Button
              variant="contained"
              fullWidth
              disabled={subscribing}
              onClick={handleSubscribe}
              startIcon={subscribing ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <DiamondIcon sx={{ fontSize: '14px !important' }} />}
              sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}
            >
              {t('iteration.subscribeCta')}
            </Button>
          </Stack>
        ) : (
          <>
            <TextField
              fullWidth
              multiline
              minRows={2}
              maxRows={5}
              placeholder={
                hasQuota
                  ? t('iteration.placeholderLong')
                  : t('iteration.noCreditsPlaceholder')
              }
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={!hasQuota || loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              sx={{ mb: 1.25 }}
            />

            <Button
              variant="contained"
              fullWidth
              disabled={loading || !value.trim() || !hasQuota}
              onClick={handleSubmit}
              startIcon={loading ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <SendIcon fontSize="small" />}
              sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}
            >
              {loading ? (loadingLabel ?? t('preview.applyingChanges')) : t('iteration.apply')}
            </Button>

            {!stillOnFreeTier && plan.pct >= 70 && plan.pct < 100 && (
              <Box sx={{ mt: 1 }}>
                <Chip
                  size="small"
                  label={t('iteration.lowQuotaHint')}
                  onClick={handleTopup}
                  sx={{
                    cursor: 'pointer',
                    bgcolor: plan.pct >= 90 ? 'error.dark' : 'warning.dark',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 10,
                  }}
                />
              </Box>
            )}
          </>
        )}
      </Paper>

      <SupportDialog
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        presetSubject={t('iteration.requestExtensionSubject')}
      />
    </>
  );
}
