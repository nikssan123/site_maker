import { Box, LinearProgress, Typography, Stack } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../store/project';
import { useAuthStore } from '../store/auth';

/** Estimated token limit for free planning conversations (~10–14 exchanges). */
export const FREE_TOKEN_LIMIT = 3000;

/** Rough token estimate from message content (1 token ≈ 4 characters). */
export function estimateTokens(messages: { content: string }[]): number {
  return Math.round(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
}

export default function UsageBanner() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { messages, phase, plan } = useProjectStore();

  if (!user || user.freeProjectUsed || phase !== 'planning' || messages.length === 0) return null;

  const tokensUsed = estimateTokens(messages);
  const pct = Math.min(100, Math.round((tokensUsed / FREE_TOKEN_LIMIT) * 100));

  const isWarning = pct >= 70;
  const isLimit = pct >= 100;

  const barColor = isLimit ? 'error' : isWarning ? 'warning' : 'primary';

  const label = isLimit
    ? plan
      ? t('usage.limitBuild')
      : t('usage.limitWrap')
    : isWarning
    ? t('usage.warningRemaining', { pct: 100 - pct })
    : t('usage.used', { pct });

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        mb: 3,
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: isLimit ? 'error.dark' : isWarning ? 'warning.dark' : 'rgba(255,255,255,0.08)',
        background: isLimit
          ? 'rgba(239,68,68,0.06)'
          : isWarning
          ? 'rgba(245,158,11,0.06)'
          : 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <Stack direction="row" alignItems="center" gap={1} mb={1}>
        <AutoAwesomeIcon sx={{ fontSize: 14, color: isLimit ? 'error.main' : isWarning ? 'warning.main' : 'primary.main' }} />
        <Typography variant="caption" sx={{ color: isLimit ? 'error.light' : isWarning ? 'warning.light' : 'text.secondary', fontSize: 11 }}>
          {label}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={pct}
        color={barColor}
        sx={{ borderRadius: 1, height: 4, bgcolor: 'rgba(255,255,255,0.08)' }}
      />
    </Box>
  );
}
