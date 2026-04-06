import {
  Box,
  Typography,
  Grid,
  Paper,
  Stack,
  Chip,
  Divider,
} from '@mui/material';
import { alpha, keyframes } from '@mui/material/styles';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CloudIcon from '@mui/icons-material/Cloud';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import type { FC, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const REVEAL_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export type PricingRevealOptions = {
  inView: boolean;
  reduceMotion: boolean;
};

function pricingRevealSx(reveal: PricingRevealOptions | undefined, delaySec: number) {
  if (!reveal) return {};
  const { reduceMotion, inView } = reveal;
  if (reduceMotion) return {};
  if (!inView) return { opacity: 0 };
  return {
    animation: `${fadeUp} 0.6s ${REVEAL_EASE} forwards`,
    animationDelay: `${delaySec}s`,
    opacity: 0,
  };
}

export type PricingTableProps = {
  reveal?: PricingRevealOptions;
};

type PlanTone = 'generate' | 'host' | 'iterate';

const PricingTable: FC<PricingTableProps> = ({ reveal }) => {
  const { t } = useTranslation();

  const items: Array<{
    tone: PlanTone;
    featured?: boolean;
    icon: ReactNode;
    title: string;
    price: string;
    period: string;
    description: string;
    features: string[];
  }> = [
      {
        tone: 'generate',
        icon: <RocketLaunchIcon sx={{ fontSize: 26, color: 'primary.light' }} />,
        title: t('pricing.generateTitle'),
        price: t('pricing.generatePrice'),
        period: t('pricing.generatePeriod'),
        description: t('pricing.generateDesc'),
        features: [
          t('pricing.featMultiPage'),
          t('pricing.featPreview'),
          t('pricing.featZip')
        ],
      },
      {
        tone: 'host',
        featured: true,
        icon: <CloudIcon sx={{ fontSize: 26, color: 'secondary.light' }} />,
        title: t('pricing.hostTitle'),
        price: t('pricing.hostPrice'),
        period: t('pricing.hostPeriod'),
        description: t('pricing.hostDesc'),
        features: [
          t('pricing.featHosting'),
          t('pricing.featPublicUrl'),
          t('pricing.featCancel'),
        ],
      },
      {
        tone: 'iterate',
        icon: <ChatBubbleOutlineIcon sx={{ fontSize: 26, color: '#a5b4fc' }} />,
        title: t('pricing.iterateTitle'),
        price: t('pricing.iteratePrice'),
        period: t('pricing.iteratePeriod'),
        description: t('pricing.iterateDesc'),
        features: [
          t('pricing.featIterateChat'),
          t('pricing.featIterateCredits'),
          t('pricing.featIterateBundle'),
        ],
      },
    ];

  const accentForTone = (tone: PlanTone, featured: boolean) => {
    if (tone === 'host' && featured) {
      return {
        border: '2px solid',
        borderColor: 'secondary.main',
        borderTopWidth: 3,
        borderTopColor: 'secondary.light',
        bgcolor: alpha('#10b981', 0.06),
        boxShadow: `0 20px 56px ${alpha('#10b981', 0.12)}, 0 0 0 1px ${alpha('#fff', 0.06)} inset`,
      };
    }
    if (tone === 'generate') {
      return {
        border: `1px solid ${alpha('#fff', 0.08)}`,
        borderTop: '3px solid',
        borderTopColor: 'primary.main',
        bgcolor: alpha('#6366f1', 0.04),
        boxShadow: `0 16px 48px rgba(0,0,0,0.28)`,
      };
    }
    return {
      border: `1px solid ${alpha('#fff', 0.08)}`,
      borderTop: '3px solid',
      borderTopColor: '#818cf8',
      bgcolor: alpha('#818cf8', 0.05),
      boxShadow: `0 16px 48px rgba(0,0,0,0.28)`,
    };
  };

  const checkColor = (tone: PlanTone) => {
    if (tone === 'host') return 'secondary.light' as const;
    if (tone === 'iterate') return '#a5b4fc';
    return 'primary.light' as const;
  };

  return (
    <Box id="pricing" sx={{ py: 8 }}>
      <Typography
        variant="h4"
        fontWeight={700}
        textAlign="center"
        mb={1}
        sx={pricingRevealSx(reveal, 0)}
      >
        {t('pricing.title')}
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        textAlign="center"
        mb={1}
        sx={pricingRevealSx(reveal, 0.07)}
      >
        {t('pricing.subtitle')}
      </Typography>
      <Stack direction="row" justifyContent="center" gap={1} mb={5} sx={pricingRevealSx(reveal, 0.12)}>
        <Chip icon={<VisibilityIcon />} label={t('pricing.chipFree')} size="small" variant="outlined" />
      </Stack>

      <Grid
        container
        spacing={3}
        justifyContent="center"
        sx={{ maxWidth: { xs: '100%', md: 1180 }, mx: 'auto', px: { xs: 0, sm: 1 } }}
      >
        {items.map((item, i) => (
          <Grid item xs={12} md={4} key={item.title}>
            <Paper
              elevation={0}
              sx={{
                p: 3,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 3,
                backdropFilter: 'blur(10px)',
                position: 'relative',
                overflow: 'hidden',
                transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow:
                    item.featured
                      ? `0 24px 64px ${alpha('#10b981', 0.18)}`
                      : '0 24px 56px rgba(0,0,0,0.35)',
                },
                ...accentForTone(item.tone, !!item.featured),
                ...pricingRevealSx(reveal, 0.18 + i * 0.09),
              }}
            >
              {item.featured ? (
                <Chip
                  label={t('pricing.hostBadge')}
                  size="small"
                  color="secondary"
                  sx={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    fontWeight: 700,
                    fontSize: '0.7rem',
                  }}
                />
              ) : null}
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 2,
                  bgcolor:
                    item.tone === 'host'
                      ? alpha('#10b981', 0.12)
                      : item.tone === 'iterate'
                        ? alpha('#818cf8', 0.15)
                        : alpha('#6366f1', 0.12),
                  border: '1px solid',
                  borderColor:
                    item.tone === 'host'
                      ? alpha('#10b981', 0.35)
                      : item.tone === 'iterate'
                        ? alpha('#818cf8', 0.35)
                        : alpha('#6366f1', 0.3),
                }}
              >
                {item.icon}
              </Box>
              <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5, letterSpacing: '-0.02em' }}>
                {item.title}
              </Typography>
              <Stack direction="row" alignItems="baseline" gap={0.75} mb={1} flexWrap="wrap">
                <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.03em' }}>
                  {item.price}
                </Typography>
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  {item.period}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" mb={2} sx={{ lineHeight: 1.65 }}>
                {item.description}
              </Typography>
              <Divider
                sx={{
                  mb: 2,
                  borderColor: alpha('#fff', 0.08),
                }}
              />
              <Stack gap={1.25} sx={{ flex: 1 }}>
                {item.features.map((f) => (
                  <Stack key={f} direction="row" alignItems="flex-start" gap={1.25}>
                    <CheckRoundedIcon
                      sx={{
                        fontSize: 20,
                        mt: 0.15,
                        flexShrink: 0,
                        color: checkColor(item.tone),
                      }}
                    />
                    <Typography variant="body2" sx={{ lineHeight: 1.55 }}>
                      {f}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Box textAlign="center" mt={4} sx={pricingRevealSx(reveal, 0.45)}>
        <Stack direction="row" justifyContent="center" gap={1} alignItems="center" flexWrap="wrap">
          <AutoFixHighIcon fontSize="small" color="action" />
          <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 520 }}>
            {t('pricing.footnote')}
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
};

export default PricingTable;
