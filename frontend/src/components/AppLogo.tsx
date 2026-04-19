import { Box, Typography, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import BrandMark from './BrandMark';

interface Props {
  size?: 'small' | 'default';
}

export default function AppLogo({ size = 'default' }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const iconSize = size === 'small' ? 24 : 28;
  const fontSize = size === 'small' ? 14 : 16;
  const shellRadius = size === 'small' ? 8 : 10;
  const innerRadius = size === 'small' ? 7 : 9;

  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={size === 'small' ? 0.75 : 1}
      role="link"
      tabIndex={0}
      aria-label={`${t('common.appName')} - home`}
      onClick={() => navigate(token ? '/chat' : '/')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(token ? '/chat' : '/');
        }
      }}
      sx={{
        cursor: 'pointer',
        userSelect: 'none',
        '&:hover .app-logo-icon': { transform: 'scale(1.05)' },
        transition: 'opacity 0.15s',
        '&:active': { opacity: 0.8 },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2, borderRadius: 1 },
      }}
    >
      <Box
        className="app-logo-icon"
        sx={{
          width: iconSize,
          height: iconSize,
          p: '1px',
          borderRadius: `${shellRadius}px`,
          background: 'linear-gradient(135deg, #818cf8 0%, #6366f1 55%, #10b981 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s ease',
          boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
        }}
      >
        <Box
          sx={{
            width: '100%',
            height: '100%',
            borderRadius: `${innerRadius}px`,
            bgcolor: '#0f0f0f',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <BrandMark size={iconSize * 0.68} color="#fff" strokeWidth={5} />
        </Box>
      </Box>
      <Typography fontWeight={700} sx={{ letterSpacing: '-0.3px', fontSize }}>
        {t('common.appName')}
      </Typography>
    </Stack>
  );
}
