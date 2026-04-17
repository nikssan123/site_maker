import { Box, Container, Typography, Stack, Link as MuiLink } from '@mui/material';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppLogo from '../components/AppLogo';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} mb={1}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" component="div" sx={{ '& p': { mb: 1.5 }, '& ul': { pl: 2.5, mb: 1.5 }, '& li': { mb: 0.5 } }}>
        {children}
      </Typography>
    </Box>
  );
}

export default function PrivacyPage() {
  const { t } = useTranslation();

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', py: 4 }}>
      <Container maxWidth="md">
        <Box sx={{ mb: 4, textAlign: 'center' }}><AppLogo /></Box>

        <Typography variant="h4" fontWeight={800} mb={1}>{t('privacy.title')}</Typography>
        <Typography variant="body2" color="text.secondary" mb={4}>{t('privacy.lastUpdated')}</Typography>

        <Stack spacing={3}>
          <Section title={t('privacy.s1Title')}>
            <p dangerouslySetInnerHTML={{ __html: t('privacy.s1Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('privacy.s2Title')}>
            <div dangerouslySetInnerHTML={{ __html: t('privacy.s2Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('privacy.s3Title')}>
            <div dangerouslySetInnerHTML={{ __html: t('privacy.s3Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('privacy.s4Title')}>
            <div dangerouslySetInnerHTML={{ __html: t('privacy.s4Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('privacy.s5Title')}>
            <div dangerouslySetInnerHTML={{ __html: t('privacy.s5Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('privacy.s6Title')}>
            <div dangerouslySetInnerHTML={{ __html: t('privacy.s6Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('privacy.s7Title')}>
            <p dangerouslySetInnerHTML={{ __html: t('privacy.s7Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('privacy.s8Title')}>
            <p dangerouslySetInnerHTML={{ __html: t('privacy.s8Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('privacy.s9Title')}>
            <p dangerouslySetInnerHTML={{ __html: t('privacy.s9Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('privacy.s10Title')}>
            <p dangerouslySetInnerHTML={{ __html: t('privacy.s10Body', { interpolation: { escapeValue: false } }) }} />
          </Section>
        </Stack>

        <Box sx={{ mt: 6, pt: 3, borderTop: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
          <MuiLink component={Link} to="/terms" variant="body2" underline="hover">{t('legal.termsLink')}</MuiLink>
        </Box>
      </Container>
    </Box>
  );
}
