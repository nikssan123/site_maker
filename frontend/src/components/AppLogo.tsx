import { Box, Typography, Stack } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';

interface Props {
  size?: 'small' | 'default';
}

export default function AppLogo({ size = 'default' }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const iconSize = size === 'small' ? 24 : 28;
  const fontSize = size === 'small' ? 14 : 16;

  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={size === 'small' ? 0.75 : 1}
      onClick={() => navigate(token ? '/chat' : '/')}
      sx={{
        cursor: 'pointer',
        userSelect: 'none',
        '&:hover .app-logo-icon': { transform: 'scale(1.08)' },
        transition: 'opacity 0.15s',
        '&:active': { opacity: 0.8 },
      }}
    >
      <Box
        className="app-logo-icon"
        sx={{
          width: iconSize,
          height: iconSize,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #10b981)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s ease',
        }}
      >
        <AutoAwesomeIcon sx={{ fontSize: iconSize * 0.5, color: '#fff' }} />
      </Box>
      <Typography fontWeight={700} sx={{ letterSpacing: '-0.3px', fontSize }}>
        {t('common.appName')}
      </Typography>
    </Stack>
  );
}
