import { useState } from 'react';
import { Box, Paper, Typography, TextField, Button, Stack, Alert, Link } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';
import AppLogo from '../components/AppLogo';
import Seo from '../components/Seo';

export default function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: any }>('/auth/login', { email, password });
      setAuth(res.token, res.user);
      navigate('/chat');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="main" sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
      <Seo title={t('seo.loginTitle')} description={t('seo.loginDesc')} path="/login" />
      <Box sx={{ mb: 3 }}><AppLogo /></Box>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, mx: { xs: 2, sm: 0 }, width: '100%', maxWidth: 400 }}>
        <Typography variant="h5" component="h1" fontWeight={700} mb={0.5}>{t('auth.loginTitle')}</Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>{t('auth.loginSubtitle')}</Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <Stack gap={2}>
            <TextField label={t('auth.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
            <TextField label={t('auth.password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth />
            <Button type="submit" variant="contained" fullWidth disabled={loading}>
              {loading ? t('auth.signingIn') : t('auth.signIn')}
            </Button>
          </Stack>
        </form>

        <Typography variant="body2" mt={2} textAlign="center">
          <Link href="/forgot-password" underline="hover">{t('auth.forgotLink')}</Link>
        </Typography>

        <Typography variant="body2" mt={1} textAlign="center" color="text.secondary">
          {t('auth.noAccount')}{' '}
          <Link href="/register" underline="hover">{t('auth.createOne')}</Link>
        </Typography>
      </Paper>
    </Box>
  );
}
