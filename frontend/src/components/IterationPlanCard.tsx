import { Box, Typography, Button, Stack, alpha } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import { useTranslation } from 'react-i18next';

interface Props {
  summary: string;
  /** User-facing plan lines (Bulgarian), from API — not raw technical spec. */
  planBulletsBg: string[];
  loading: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  /** Show hint when project is locked — confirm still runs parent handler (e.g. opens checkout). */
  showUnlockHint?: boolean;
}

export default function IterationPlanCard({
  summary,
  planBulletsBg,
  loading,
  onConfirm,
  onEdit,
  showUnlockHint,
}: Props) {
  const { t } = useTranslation();
  const cleanedBullets = planBulletsBg.map((s) => s.trim()).filter(Boolean);
  const fallbackLine =
    summary.trim() || t('preview.iterationPlanFallbackSummary');
  const lines = cleanedBullets.length > 0 ? cleanedBullets : [fallbackLine];

  return (
    <Box
      sx={{
        flexShrink: 0,
        border: '1px solid',
        borderColor: (theme) => alpha(theme.palette.primary.main, 0.35),
        borderRadius: 3,
        overflow: 'hidden',
        mb: 1.5,
        background: (theme) =>
          `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.06)} 0%, ${alpha(theme.palette.success.main, 0.04)} 100%)`,
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: '1px solid',
          borderColor: (theme) => alpha(theme.palette.primary.main, 0.15),
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: (theme) =>
              `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.success.main})`,
          }}
        />
        <Typography
          variant="caption"
          fontWeight={700}
          sx={{
            color: 'primary.main',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            fontSize: 10,
          }}
        >
          {t('preview.iterationPlanHeader')}
        </Typography>
      </Box>

      <Box sx={{ p: 2 }}>
        <Stack component="ul" gap={0.75} sx={{ m: 0, mb: 1.75, pl: 2.25 }}>
          {lines.map((b, i) => (
            <Typography
              key={i}
              component="li"
              variant="body2"
              sx={{ lineHeight: 1.55, color: 'text.primary', fontWeight: 500 }}
            >
              {b}
            </Typography>
          ))}
        </Stack>

        {showUnlockHint && (
          <Typography variant="caption" color="warning.main" display="block" sx={{ mb: 1 }}>
            {t('preview.iterationPlanNeedUnlock')}
          </Typography>
        )}

        <Stack direction="row" gap={1}>
          <Button
            variant="contained"
            fullWidth
            startIcon={loading ? undefined : <CheckCircleOutlineIcon fontSize="small" />}
            onClick={onConfirm}
            disabled={loading}
            sx={{
              flex: 1,
              fontWeight: 700,
              py: 1,
              background: loading
                ? undefined
                : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              boxShadow: loading ? undefined : '0 4px 16px rgba(99,102,241,0.25)',
            }}
          >
            {loading ? t('preview.applyingChanges') : t('preview.agreeWithChanges')}
          </Button>
          <Button
            variant="outlined"
            startIcon={<EditIcon fontSize="small" />}
            onClick={onEdit}
            disabled={loading}
            sx={{ flexShrink: 0, borderColor: 'divider', color: 'text.primary' }}
          >
            {t('plan.edit')}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
