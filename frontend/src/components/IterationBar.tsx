import { useState } from 'react';
import {
  Box, TextField, Button, Stack, Typography, Tooltip, Chip, Paper, LinearProgress,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DiamondIcon from '@mui/icons-material/Diamond';
import SendIcon from '@mui/icons-material/Send';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../store/project';

interface Props {
  onSubmit: (message: string) => void;
  loading: boolean;
  onBuyIteration: (pack: boolean) => void;
}

export default function IterationBar({ onSubmit, loading, onBuyIteration }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const { iterationsTotal, paidIterationCredits, freeIterationLimit } = useProjectStore();

  const freeUsed = Math.min(iterationsTotal, freeIterationLimit);
  const paidUsed = Math.max(0, iterationsTotal - freeIterationLimit);
  const paidRemaining = paidIterationCredits - paidUsed;
  const hasCredits = freeUsed < freeIterationLimit || paidRemaining > 0;

  const handleSubmit = () => {
    if (!value.trim() || !hasCredits) return;
    onSubmit(value.trim());
    setValue('');
  };

  const freeLeft = freeIterationLimit - freeUsed;
  const statusLabel = freeUsed < freeIterationLimit
    ? t('iteration.freeRemaining', { n: freeLeft, total: freeIterationLimit })
    : paidRemaining > 0
    ? paidRemaining === 1
      ? t('iteration.paidRemainingOne')
      : t('iteration.paidRemaining', { n: paidRemaining })
    : t('iteration.noneLeft');

  const pct = freeUsed < freeIterationLimit ? (freeUsed / freeIterationLimit) * 100 : 100;
  const barColor = freeUsed < freeIterationLimit ? 'primary' : 'warning';

  return (
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
      {/* Label + usage */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="caption" fontWeight={600} color="primary.main" sx={{ fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {t('iteration.barLabel')}
        </Typography>
        <Typography variant="caption" sx={{ color: hasCredits ? 'text.secondary' : 'error.light', fontSize: 11 }}>
          {statusLabel}
        </Typography>
      </Stack>

      {freeUsed <= freeIterationLimit && (
        <LinearProgress
          variant="determinate"
          value={pct}
          color={barColor}
          sx={{ borderRadius: 1, height: 3, mb: 1.25, bgcolor: 'rgba(255,255,255,0.07)' }}
        />
      )}

      {/* Textarea + submit */}
      <Tooltip title={!hasCredits ? t('iteration.buyTooltip') : ''} placement="top">
        <TextField
          fullWidth
          multiline
          minRows={2}
          maxRows={5}
          placeholder={
            hasCredits
              ? t('iteration.placeholderLong')
              : t('iteration.noCreditsPlaceholder')
          }
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!hasCredits || loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          sx={{ mb: 1.25 }}
        />
      </Tooltip>

      {hasCredits ? (
        <Button
          variant="contained"
          fullWidth
          disabled={loading || !value.trim()}
          onClick={handleSubmit}
          startIcon={<SendIcon fontSize="small" />}
          sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}
        >
          {t('iteration.apply')}
        </Button>
      ) : (
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DiamondIcon sx={{ fontSize: '14px !important' }} />}
            onClick={() => onBuyIteration(false)}
            sx={{ flex: 1, borderColor: 'rgba(99,102,241,0.4)', fontSize: 12, fontWeight: 600 }}
          >
            {t('iteration.buySingle')}
          </Button>
          <Box sx={{ flex: 1.4, position: 'relative' }}>
            <Button
              variant="contained"
              size="small"
              fullWidth
              onClick={() => onBuyIteration(true)}
              sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontSize: 12, fontWeight: 700 }}
            >
              {t('iteration.buyPack')}
            </Button>
            <Chip
              label={t('iteration.buyPackBadge')}
              size="small"
              sx={{
                position: 'absolute',
                top: -10,
                right: 4,
                fontSize: 9,
                height: 16,
                bgcolor: 'success.main',
                color: '#fff',
                fontWeight: 700,
                pointerEvents: 'none',
              }}
            />
          </Box>
        </Stack>
      )}
    </Paper>
  );
}
