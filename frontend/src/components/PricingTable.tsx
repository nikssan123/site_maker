import {
  Box, Typography, Grid, Paper, Stack, Chip, Divider,
} from '@mui/material';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CloudIcon from '@mui/icons-material/Cloud';
import DownloadIcon from '@mui/icons-material/Download';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useTranslation } from 'react-i18next';

export default function PricingTable() {
  const { t } = useTranslation();

  const items = [
    {
      icon: <RocketLaunchIcon color="primary" />,
      title: t('pricing.generateTitle'),
      price: t('pricing.generatePrice'),
      period: t('pricing.generatePeriod'),
      highlight: false,
      description: t('pricing.generateDesc'),
      features: [
        t('pricing.featMultiPage'),
        t('pricing.featPreview'),
        t('pricing.featZip'),
        t('pricing.featIterations'),
      ],
      hostStyle: false,
    },
    {
      icon: <CloudIcon color="secondary" />,
      title: t('pricing.hostTitle'),
      price: t('pricing.hostPrice'),
      period: t('pricing.hostPeriod'),
      highlight: true,
      description: t('pricing.hostDesc'),
      features: [
        t('pricing.featHosting'),
        t('pricing.featPublicUrl'),
        t('pricing.featCancel'),
      ],
      hostStyle: true,
    },
  ];

  return (
    <Box id="pricing" sx={{ py: 8 }}>
      <Typography variant="h4" fontWeight={700} textAlign="center" mb={1}>
        {t('pricing.title')}
      </Typography>
      <Typography variant="body1" color="text.secondary" textAlign="center" mb={1}>
        {t('pricing.subtitle')}
      </Typography>
      <Stack direction="row" justifyContent="center" gap={1} mb={5}>
        <Chip icon={<VisibilityIcon />} label={t('pricing.chipFree')} size="small" variant="outlined" />
      </Stack>

      <Grid container spacing={3} justifyContent="center" maxWidth={700} mx="auto">
        {items.map((item) => (
          <Grid item xs={12} md={6} key={item.title}>
            <Paper
              variant={item.highlight ? 'elevation' : 'outlined'}
              elevation={item.highlight ? 8 : 0}
              sx={{
                p: 3,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                border: item.highlight ? '2px solid' : undefined,
                borderColor: item.highlight ? 'secondary.main' : undefined,
              }}
            >
              <Stack direction="row" alignItems="center" gap={1} mb={1}>
                {item.icon}
                <Typography variant="h6" fontWeight={700}>{item.title}</Typography>
              </Stack>
              <Stack direction="row" alignItems="baseline" gap={0.5} mb={0.5}>
                <Typography variant="h4" fontWeight={800}>{item.price}</Typography>
                <Typography variant="caption" color="text.secondary">{item.period}</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" mb={2}>
                {item.description}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack gap={1}>
                {item.features.map((f) => (
                  <Stack key={f} direction="row" alignItems="center" gap={1}>
                    {item.hostStyle
                      ? <CloudIcon fontSize="small" color="secondary" />
                      : <DownloadIcon fontSize="small" color="primary" />}
                    <Typography variant="body2">{f}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Box textAlign="center" mt={4}>
        <Stack direction="row" justifyContent="center" gap={1}>
          <AutoFixHighIcon fontSize="small" color="action" />
          <Typography variant="caption" color="text.secondary">
            {t('pricing.footnote')}
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
