import {
  Dialog, DialogContent, Box, Typography, IconButton, Stack,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CategoryIcon from '@mui/icons-material/Category';
import { useTranslation } from 'react-i18next';
import IconPickerBody, { type IconPickResult } from './IconPickerBody';

export type { IconPickResult };

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (result: IconPickResult) => void;
}

export default function IconPickerDialog({ open, onClose, onPick }: Props) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: '#18181b',
          color: '#f4f4f5',
          borderRadius: 3,
          border: '1px solid #27272a',
          boxShadow: '0 0 0 1px rgba(99,102,241,0.3), 0 32px 80px rgba(0,0,0,0.8)',
        },
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        <Box
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            px: 3, py: 2, borderBottom: '1px solid #27272a',
          }}
        >
          <Stack direction="row" alignItems="center" gap={1.25}>
            <Box
              sx={{
                width: 32, height: 32, borderRadius: 1.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.35))',
              }}
            >
              <CategoryIcon sx={{ fontSize: 18, color: '#c7d2fe' }} />
            </Box>
            <Typography sx={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>
              {t('iconPicker.title')}
            </Typography>
          </Stack>
          <IconButton onClick={onClose} size="small" sx={{ color: '#71717a' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <IconPickerBody
          onPick={(r) => {
            onPick(r);
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
