import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Stack, Box, Divider, Chip,
} from '@mui/material';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CloudIcon from '@mui/icons-material/Cloud';
import DownloadIcon from '@mui/icons-material/Download';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  reason?: string;
}

export default function ProjectCheckout({ open, onClose, projectId, reason }: Props) {
  const { t } = useTranslation();
  const handlePurchase = async () => {
    try {
      const { url } = await api.post<{ url: string }>('/billing/project-checkout', { projectId });
      window.location.href = url;
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleHosting = async () => {
    try {
      const { url } = await api.post<{ url: string }>('/billing/hosting-checkout', { projectId });
      window.location.href = url;
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('checkout.title')}</DialogTitle>
      <DialogContent>
        {reason && (
          <Typography variant="body2" color="text.secondary" mb={2}>
            {reason}
          </Typography>
        )}

        <Stack gap={2}>
          <Box
            sx={{
              p: 2, border: '2px solid', borderColor: 'primary.main',
              borderRadius: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' },
            }}
            onClick={handlePurchase}
          >
            <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
              <RocketLaunchIcon color="primary" />
              <Typography fontWeight={700}>{t('checkout.saveProject')}</Typography>
              <Chip label={t('checkout.oneTime')} size="small" color="primary" />
            </Stack>
            <Typography variant="body2" color="text.secondary" mb={1}>
              {t('checkout.saveDesc')}
            </Typography>
            <Stack direction="row" gap={2}>
              <Stack direction="row" alignItems="center" gap={0.5}>
                <DownloadIcon fontSize="small" color="action" />
                <Typography variant="caption">{t('checkout.zip')}</Typography>
              </Stack>
              <Stack direction="row" alignItems="center" gap={0.5}>
                <AutoFixHighIcon fontSize="small" color="action" />
                <Typography variant="caption">{t('checkout.unlimited')}</Typography>
              </Stack>
            </Stack>
          </Box>

          <Divider>
            <Typography variant="caption" color="text.secondary">{t('checkout.also')}</Typography>
          </Divider>

          <Box
            sx={{
              p: 2, border: '1px solid', borderColor: 'divider',
              borderRadius: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' },
            }}
            onClick={handleHosting}
          >
            <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
              <CloudIcon color="secondary" />
              <Typography fontWeight={700}>{t('checkout.hostTitle')}</Typography>
              <Chip label={t('checkout.hostChip')} size="small" variant="outlined" />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {t('checkout.hostDesc')}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">{t('checkout.maybeLater')}</Button>
      </DialogActions>
    </Dialog>
  );
}
