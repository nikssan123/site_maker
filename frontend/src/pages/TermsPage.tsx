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

export default function TermsPage() {
  const { t } = useTranslation();

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', py: 4 }}>
      <Container maxWidth="md">
        <Box sx={{ mb: 4, textAlign: 'center' }}><AppLogo /></Box>

        <Typography variant="h4" fontWeight={800} mb={1}>{t('terms.title')}</Typography>
        <Typography variant="body2" color="text.secondary" mb={4}>{t('terms.lastUpdated')}</Typography>

        <Stack spacing={3}>
          <Section title={t('terms.s1Title')}>
            <p dangerouslySetInnerHTML={{ __html: t('terms.s1Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('terms.s2Title')}>
            <p dangerouslySetInnerHTML={{ __html: t('terms.s2Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('terms.s3Title')}>
            <div dangerouslySetInnerHTML={{ __html: t('terms.s3Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('terms.s4Title')}>
            <div dangerouslySetInnerHTML={{ __html: t('terms.s4Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('terms.s5Title')}>
            <div dangerouslySetInnerHTML={{ __html: t('terms.s5Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('terms.s6Title')}>
            <div dangerouslySetInnerHTML={{ __html: t('terms.s6Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('terms.s7Title')}>
            <div dangerouslySetInnerHTML={{ __html: t('terms.s7Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('terms.s8Title')}>
            <div dangerouslySetInnerHTML={{ __html: t('terms.s8Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('terms.s9Title')}>
            <div dangerouslySetInnerHTML={{ __html: t('terms.s9Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('terms.s10Title')}>
            <p dangerouslySetInnerHTML={{ __html: t('terms.s10Body', { interpolation: { escapeValue: false } }) }} />
          </Section>

          <Section title={t('terms.s11Title')}>
            <p dangerouslySetInnerHTML={{ __html: t('terms.s11Body', { interpolation: { escapeValue: false } }) }} />
          </Section>
        </Stack>

        <Box sx={{ mt: 6, pt: 3, borderTop: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
          <MuiLink component={Link} to="/privacy" variant="body2" underline="hover">{t('legal.privacyLink')}</MuiLink>
        </Box>
      </Container>
    </Box>
  );
}
