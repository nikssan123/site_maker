import { useState } from 'react';
import { Box, Paper, Typography, TextField, Button, Stack, Alert, Link } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import AppLogo from '../components/AppLogo';
import Seo from '../components/Seo';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post<{ ok: true }>('/auth/forgot-password', { email });
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="main" sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
      <Seo title={t('seo.forgotTitle')} description={t('seo.forgotDesc')} path="/forgot-password" noindex />
      <Box sx={{ mb: 3 }}><AppLogo /></Box>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, mx: { xs: 2, sm: 0 }, width: '100%', maxWidth: 400 }}>
        <Typography variant="h5" component="h1" fontWeight={700} mb={0.5}>{t('auth.forgotTitle')}</Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>{t('auth.forgotSubtitle')}</Typography>

        {sent && <Alert severity="success" sx={{ mb: 2 }}>{t('auth.forgotSent')}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!sent && (
          <form onSubmit={handleSubmit}>
            <Stack gap={2}>
              <TextField
                label={t('auth.email')}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                autoFocus
              />
              <Button type="submit" variant="contained" fullWidth disabled={loading}>
                {loading ? t('auth.sending') : t('auth.forgotSubmit')}
              </Button>
            </Stack>
          </form>
        )}

        <Typography variant="body2" mt={2} textAlign="center" color="text.secondary">
          <Link href="/login" underline="hover">{t('auth.forgotBackToLogin')}</Link>
        </Typography>
      </Paper>
    </Box>
  );
}
