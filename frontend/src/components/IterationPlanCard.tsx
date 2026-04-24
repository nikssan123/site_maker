import { Box, Typography, Button, Stack, alpha, Paper } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EditIcon from '@mui/icons-material/Edit';
import LockIcon from '@mui/icons-material/Lock';
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
  const fallbackLine = summary.trim() || t('preview.iterationPlanFallbackSummary');
  const lines = cleanedBullets.length > 0 ? cleanedBullets : [fallbackLine];

  return (
    <Paper
      elevation={0}
      sx={{
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        mb: 1.5,
        borderRadius: 3,
        border: '1px solid',
        borderColor: (theme) => alpha(theme.palette.primary.main, 0.32),
        background: (theme) =>
          `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.10)} 0%, ${alpha(theme.palette.success.main, 0.06)} 100%), ${theme.palette.background.paper}`,
        boxShadow: (theme) =>
          `0 1px 0 ${alpha(theme.palette.common.white, 0.04)} inset, 0 8px 32px ${alpha(theme.palette.primary.main, 0.12)}`,
        animation: 'iterationPlanIn 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
        '@keyframes iterationPlanIn': {
          from: { opacity: 0, transform: 'translateY(8px) scale(0.985)' },
          to: { opacity: 1, transform: 'translateY(0) scale(1)' },
        },
      }}
    >
      {/* Decorative gradient blob */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          top: -60,
          right: -60,
          width: 180,
          height: 180,
          borderRadius: '50%',
          background: (theme) =>
            `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.18)} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      <Box sx={{ position: 'relative', p: { xs: 1.75, sm: 2.25 } }}>
        {/* Header: eyebrow + headline with sparkle icon */}
        <Stack direction="row" alignItems="center" gap={1.25} sx={{ mb: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              background: (theme) =>
                `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.success.main})`,
              boxShadow: (theme) =>
                `0 4px 14px ${alpha(theme.palette.primary.main, 0.4)}`,
              color: '#fff',
            }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 18 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="caption"
              fontWeight={800}
              sx={{
                color: 'primary.main',
                textTransform: 'uppercase',
                letterSpacing: 1.1,
                fontSize: 10,
                lineHeight: 1.2,
                display: 'block',
              }}
            >
              {t('preview.iterationPlanHeader')}
            </Typography>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, lineHeight: 1.3, mt: 0.25 }}
            >
              {t('preview.iterationPlanReview')}
            </Typography>
          </Box>
        </Stack>

        {/* Bullets as checkmark rows */}
        <Stack
          gap={0.5}
          sx={{
            mb: 1.75,
            p: 1,
            borderRadius: 2,
            bgcolor: (theme) => alpha(theme.palette.common.white, 0.025),
            border: (theme) => `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
          }}
        >
          {lines.map((b, i) => (
            <Stack
              key={i}
              direction="row"
              alignItems="flex-start"
              gap={1.25}
              sx={{
                px: 1,
                py: 0.85,
                borderRadius: 1.5,
                transition: 'background 0.18s ease',
                '&:hover': {
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
                },
              }}
            >
              <CheckCircleRoundedIcon
                sx={{
                  fontSize: 18,
                  flexShrink: 0,
                  mt: 0.15,
                  color: 'success.main',
                  filter: (theme) =>
                    `drop-shadow(0 0 6px ${alpha(theme.palette.success.main, 0.35)})`,
                }}
              />
              <Typography
                variant="body2"
                sx={{
                  lineHeight: 1.55,
                  color: 'text.primary',
                  fontWeight: 500,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {b}
              </Typography>
            </Stack>
          ))}
        </Stack>

        {showUnlockHint && (
          <Stack
            direction="row"
            alignItems="center"
            gap={0.75}
            sx={{
              px: 1.25,
              py: 0.85,
              mb: 1.5,
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: (theme) => alpha(theme.palette.warning.main, 0.4),
              bgcolor: (theme) => alpha(theme.palette.warning.main, 0.08),
            }}
          >
            <LockIcon sx={{ fontSize: 14, color: 'warning.main', flexShrink: 0 }} />
            <Typography variant="caption" sx={{ color: 'warning.main', lineHeight: 1.4 }}>
              {t('preview.iterationPlanNeedUnlock')}
            </Typography>
          </Stack>
        )}

        {/* Actions */}
        <Stack direction="row" gap={1}>
          <Button
            variant="contained"
            fullWidth
            startIcon={loading ? undefined : <CheckCircleRoundedIcon fontSize="small" />}
            onClick={onConfirm}
            disabled={loading}
            sx={{
              flex: 1,
              fontWeight: 700,
              py: 1.15,
              fontSize: 14,
              letterSpacing: 0.2,
              borderRadius: 2,
              color: '#fff',
              textTransform: 'none',
              background: loading
                ? undefined
                : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              boxShadow: loading ? undefined : '0 6px 20px rgba(99,102,241,0.35)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              '&:hover': {
                transform: 'translateY(-1px)',
                background: loading
                  ? undefined
                  : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                boxShadow: loading ? undefined : '0 10px 26px rgba(99,102,241,0.45)',
              },
            }}
          >
            {loading ? t('preview.applyingChanges') : t('preview.agreeWithChanges')}
          </Button>
          <Button
            variant="text"
            startIcon={<EditIcon fontSize="small" />}
            onClick={onEdit}
            disabled={loading}
            sx={{
              flexShrink: 0,
              px: 1.5,
              fontWeight: 600,
              color: 'text.secondary',
              textTransform: 'none',
              borderRadius: 2,
              '&:hover': {
                bgcolor: (theme) => alpha(theme.palette.common.white, 0.04),
                color: 'text.primary',
              },
            }}
          >
            {t('plan.edit')}
          </Button>
        </Stack>
      </Box>
    </Paper>
  );
}
