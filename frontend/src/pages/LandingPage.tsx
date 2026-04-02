import { useEffect, useRef } from 'react';
import {
  Box, Container, Typography, Button, Stack, AppBar,
  Toolbar, Chip,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useTranslation } from 'react-i18next';
import PricingTable from '../components/PricingTable';
import { useAuthStore } from '../store/auth';

interface Props {
  scrollTo?: string;
}

export default function LandingPage({ scrollTo }: Props) {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const pricingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollTo === 'pricing') {
      pricingRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scrollTo]);

  const features = [
    { icon: '💬', title: t('landing.feat1Title'), desc: t('landing.feat1Desc') },
    { icon: '⚡', title: t('landing.feat2Title'), desc: t('landing.feat2Desc') },
    { icon: '🔄', title: t('landing.feat3Title'), desc: t('landing.feat3Desc') },
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar>
          <Stack direction="row" alignItems="center" gap={1} sx={{ flex: 1 }}>
            <AutoAwesomeIcon color="primary" />
            <Typography variant="h6" fontWeight={700}>{t('common.appName')}</Typography>
          </Stack>
          <Stack direction="row" gap={1}>
            <Button href="#pricing" color="inherit" size="small">{t('landing.pricingNav')}</Button>
            {token ? (
              <Button variant="contained" href="/chat" size="small">{t('landing.goToApp')}</Button>
            ) : (
              <>
                <Button href="/login" color="inherit" size="small">{t('auth.signIn')}</Button>
                <Button variant="contained" href="/register" size="small">{t('landing.getStartedFree')}</Button>
              </>
            )}
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ textAlign: 'center', pt: 12, pb: 8 }}>
        <Chip label={t('landing.chipAi')} size="small" color="primary" variant="outlined" sx={{ mb: 3 }} />
        <Typography variant="h2" fontWeight={800} mb={2} sx={{ lineHeight: 1.2, whiteSpace: 'pre-line' }}>
          {t('landing.heroTitle')}
        </Typography>
        <Typography variant="h6" color="text.secondary" mb={4} fontWeight={400}>
          {t('landing.heroSubtitle')}
        </Typography>
        <Stack direction="row" gap={2} justifyContent="center">
          <Button variant="contained" size="large" href={token ? '/chat' : '/register'} sx={{ px: 4 }}>
            {t('landing.ctaBuild')}
          </Button>
          <Button variant="outlined" size="large" href="#pricing">
            {t('landing.ctaPricing')}
          </Button>
        </Stack>
      </Container>

      <Container maxWidth="md" sx={{ py: 6 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          gap={4}
          justifyContent="center"
          textAlign="center"
        >
          {features.map((f) => (
            <Box key={f.title} sx={{ flex: 1 }}>
              <Typography fontSize={40}>{f.icon}</Typography>
              <Typography variant="h6" fontWeight={700} mb={0.5}>{f.title}</Typography>
              <Typography variant="body2" color="text.secondary">{f.desc}</Typography>
            </Box>
          ))}
        </Stack>
      </Container>

      <Box ref={pricingRef}>
        <PricingTable />
      </Box>

      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', py: 3, textAlign: 'center' }}>
        <Typography variant="caption" color="text.disabled">
          {t('landing.footer', { year: new Date().getFullYear() })}
        </Typography>
      </Box>
    </Box>
  );
}
