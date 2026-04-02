import { useEffect, useState } from 'react';
import {
  Box, Container, Typography, Button, Paper, Stack,
  AppBar, Toolbar, Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudIcon from '@mui/icons-material/Cloud';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import PricingTable from '../components/PricingTable';

export default function BillingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const success = searchParams.get('success') === 'true';

  const handleManage = async () => {
    setLoading(true);
    try {
      const { url } = await api.post<{ url: string }>('/billing/portal');
      window.location.href = url;
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/chat')} color="inherit" size="small">
            {t('billing.backBuilder')}
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ pt: 5 }}>
        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {t('billing.successPay')}
          </Alert>
        )}

        <Typography variant="h4" fontWeight={700} mb={1}>{t('billing.title')}</Typography>
        <Typography variant="body2" color="text.secondary" mb={4}>
          {t('billing.subtitle')}
        </Typography>

        <Paper variant="outlined" sx={{ p: 3, mb: 4 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box>
              <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                <CloudIcon color="secondary" fontSize="small" />
                <Typography variant="subtitle1" fontWeight={600}>{t('billing.hostingTitle')}</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {t('billing.hostingDesc')}
              </Typography>
            </Box>
            <Button variant="outlined" onClick={handleManage} disabled={loading}>
              {loading ? t('billing.loadingManage') : t('billing.manage')}
            </Button>
          </Stack>
        </Paper>

        <PricingTable />
      </Container>
    </Box>
  );
}
