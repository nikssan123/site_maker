import { useState } from 'react';
import { Box, Paper, Typography, TextField, Button, Stack, Alert, Link } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';

export default function RegisterPage() {
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
      const res = await api.post<{ token: string; user: any }>('/auth/register', { email, password });
      setAuth(res.token, res.user);
      navigate('/chat');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
      <Paper variant="outlined" sx={{ p: 4, width: '100%', maxWidth: 400 }}>
        <Typography variant="h5" fontWeight={700} mb={0.5}>{t('auth.registerTitle')}</Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>{t('auth.registerSubtitle')}</Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <Stack gap={2}>
            <TextField label={t('auth.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
            <TextField
              label={t('auth.password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              helperText={t('auth.passwordHint')}
            />
            <Button type="submit" variant="contained" fullWidth disabled={loading}>
              {loading ? t('auth.creating') : t('auth.getStartedFree')}
            </Button>
          </Stack>
        </form>

        <Typography variant="body2" mt={2} textAlign="center" color="text.secondary">
          {t('auth.hasAccount')}{' '}
          <Link href="/login" underline="hover">{t('auth.signIn')}</Link>
        </Typography>
      </Paper>
    </Box>
  );
}
