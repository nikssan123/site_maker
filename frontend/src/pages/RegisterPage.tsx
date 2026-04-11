import { useState } from 'react';
import { Box, Paper, Typography, TextField, Button, Stack, Alert, Link } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuthStore, type UserProfile } from '../store/auth';

type Step = 'credentials' | 'verify';

export default function RegisterPage() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await api.post<{ pending: true; email: string }>('/auth/register', { email, password });
      setStep('verify');
      setInfo(t('auth.verifySent', { email }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: UserProfile }>('/auth/verify-email', {
        email,
        code,
      });
      setAuth(res.token, res.user);
      navigate('/chat');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await api.post<{ pending: true; email: string }>('/auth/resend-verification', { email });
      setInfo(t('auth.verifyResent'));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep('credentials');
    setCode('');
    setError('');
    setInfo('');
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
      <Paper variant="outlined" sx={{ p: 4, width: '100%', maxWidth: 400 }}>
        {step === 'credentials' ? (
          <>
            <Typography variant="h5" fontWeight={700} mb={0.5}>{t('auth.registerTitle')}</Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>{t('auth.registerSubtitle')}</Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <form onSubmit={handleCredentialsSubmit}>
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
          </>
        ) : (
          <>
            <Typography variant="h5" fontWeight={700} mb={0.5}>{t('auth.verifyTitle')}</Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              {t('auth.verifySubtitle', { email })}
            </Typography>

            {info && <Alert severity="info" sx={{ mb: 2 }}>{info}</Alert>}
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <form onSubmit={handleVerifySubmit}>
              <Stack gap={2}>
                <TextField
                  label={t('auth.verifyCodeLabel')}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  fullWidth
                  autoFocus
                  inputProps={{
                    inputMode: 'numeric',
                    pattern: '[0-9]{6}',
                    maxLength: 6,
                    style: { letterSpacing: '0.4em', textAlign: 'center', fontSize: 20, fontWeight: 600 },
                  }}
                  helperText={t('auth.verifyCodeHint')}
                />
                <Button type="submit" variant="contained" fullWidth disabled={loading || code.length !== 6}>
                  {loading ? t('auth.verifying') : t('auth.verifyConfirm')}
                </Button>
                <Stack direction="row" justifyContent="space-between">
                  <Button type="button" size="small" onClick={handleBack} disabled={loading}>
                    {t('auth.verifyBack')}
                  </Button>
                  <Button type="button" size="small" onClick={handleResend} disabled={loading}>
                    {t('auth.verifyResend')}
                  </Button>
                </Stack>
              </Stack>
            </form>
          </>
        )}
      </Paper>
    </Box>
  );
}
