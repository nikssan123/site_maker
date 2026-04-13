import { useMemo, useState } from 'react';
import { Box, Paper, Typography, TextField, Button, Stack, Alert, Link } from '@mui/material';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import AppLogo from '../components/AppLogo';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(t('auth.resetMismatch'));
      return;
    }
    setLoading(true);
    try {
      await api.post<{ ok: true }>('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
      <Box sx={{ mb: 3 }}><AppLogo /></Box>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, mx: { xs: 2, sm: 0 }, width: '100%', maxWidth: 400 }}>
        <Typography variant="h5" fontWeight={700} mb={0.5}>{t('auth.resetTitle')}</Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>{t('auth.resetSubtitle')}</Typography>

        {!token && <Alert severity="error" sx={{ mb: 2 }}>{t('auth.resetMissingToken')}</Alert>}
        {done && <Alert severity="success" sx={{ mb: 2 }}>{t('auth.resetDone')}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {token && !done && (
          <form onSubmit={handleSubmit}>
            <Stack gap={2}>
              <TextField
                label={t('auth.resetNewPassword')}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                fullWidth
                autoFocus
                helperText={t('auth.passwordHint')}
              />
              <TextField
                label={t('auth.resetConfirmPassword')}
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                fullWidth
              />
              <Button type="submit" variant="contained" fullWidth disabled={loading || password.length < 8}>
                {loading ? t('auth.resetting') : t('auth.resetSubmit')}
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
