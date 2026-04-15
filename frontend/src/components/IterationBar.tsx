import { useState } from 'react';
import {
  Box, TextField, Button, Stack, Typography, LinearProgress, Paper,
  Dialog, DialogTitle, DialogContent, DialogActions, Slider, Chip, CircularProgress,
} from '@mui/material';
import DiamondIcon from '@mui/icons-material/Diamond';
import SendIcon from '@mui/icons-material/Send';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../store/project';

const MAX_QTY = 20;
const SINGLE_PRICE = 1.5;  // € per credit
const PACK_PRICE = 20;     // € for MAX_QTY credits

function calcPrice(qty: number): number {
  return qty === MAX_QTY ? PACK_PRICE : qty * SINGLE_PRICE;
}

function formatPrice(price: number): string {
  return price % 1 === 0 ? `€${price}` : `€${price.toFixed(2)}`;
}

interface Props {
  onSubmit: (message: string) => void;
  loading: boolean;
  loadingLabel?: string;
  onBuyIteration: (quantity: number) => void;
}

export default function IterationBar({ onSubmit, loading, loadingLabel, onBuyIteration }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [qty, setQty] = useState(1);
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

  const handleBuyConfirm = () => {
    setBuyDialogOpen(false);
    onBuyIteration(qty);
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

  const price = calcPrice(qty);
  const isBestValue = qty === MAX_QTY;

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
        {/* Label + usage */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="caption" fontWeight={600} color="primary.main" sx={{ fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {t('iteration.barLabel')}
          </Typography>
          <Typography variant="caption" sx={{ color: hasCredits ? 'text.secondary' : 'error.light', fontSize: 11 }}>
            {statusLabel}
          </Typography>
        </Stack>

        {freeUsed < freeIterationLimit && (
          <LinearProgress
            variant="determinate"
            value={pct}
            color={barColor}
            sx={{ borderRadius: 1, height: 3, mb: 1.25, bgcolor: 'rgba(255,255,255,0.07)' }}
          />
        )}

        {/* Textarea + submit */}
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

        {hasCredits ? (
          <Button
            variant="contained"
            fullWidth
            disabled={loading || !value.trim()}
            onClick={handleSubmit}
            startIcon={loading ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <SendIcon fontSize="small" />}
            sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}
          >
            {loading ? (loadingLabel ?? t('preview.applyingChanges')) : t('iteration.apply')}
          </Button>
        ) : (
          <Button
            variant="contained"
            fullWidth
            startIcon={<DiamondIcon sx={{ fontSize: '14px !important' }} />}
            onClick={() => { setQty(1); setBuyDialogOpen(true); }}
            sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}
          >
            {t('iteration.buyCredits')}
          </Button>
        )}
      </Paper>

      {/* Buy dialog */}
      <Dialog
        open={buyDialogOpen}
        onClose={() => setBuyDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle fontWeight={700} sx={{ fontSize: 16, pb: 1 }}>
          {t('iteration.buyDialogTitle')}
        </DialogTitle>
        <DialogContent sx={{ pt: '4px !important' }}>
          {/* Quantity slider */}
          <Box sx={{ px: 1, pt: 1 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.5}>
              <Typography variant="body2" color="text.secondary">
                {t('iteration.buyDialogQty')}
              </Typography>
              <Typography variant="body2" fontWeight={700}>
                {qty}
              </Typography>
            </Stack>
            <Slider
              value={qty}
              min={1}
              max={MAX_QTY}
              step={1}
              onChange={(_, v) => setQty(v as number)}
              marks={[
                { value: 1 },
                { value: 5 },
                { value: 10 },
                { value: 15 },
                { value: 20 },
              ]}
              sx={{ color: 'primary.main' }}
            />
          </Box>

          {/* Price summary */}
          <Box
            sx={{
              mt: 1.5, p: 2, borderRadius: 1.5,
              background: isBestValue ? 'rgba(99,102,241,0.08)' : 'action.hover',
              border: isBestValue ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
              display: 'flex', alignItems: 'center', gap: 1.5,
            }}
          >
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1 }}>
                {formatPrice(price)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {qty === 1
                  ? t('iteration.buyDialogOne')
                  : t('iteration.buyDialogMany', { n: qty })}
              </Typography>
            </Box>
            {isBestValue && (
              <Chip
                label={t('iteration.buyPackBadge')}
                size="small"
                sx={{ bgcolor: 'success.main', color: '#fff', fontWeight: 700, fontSize: 10 }}
              />
            )}
          </Box>

          {!isBestValue && (
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
              {t('iteration.buyDialogPackHint', { price: formatPrice(PACK_PRICE), n: MAX_QTY })}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 0 }}>
          <Button onClick={() => setBuyDialogOpen(false)} size="small">{t('common.cancel')}</Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleBuyConfirm}
            sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700, minWidth: 120 }}
          >
            {t('iteration.buyDialogConfirm', { price: formatPrice(price) })}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
