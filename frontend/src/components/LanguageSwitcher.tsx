import { Box, ButtonBase } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface Props {
  size?: 'small' | 'medium';
}

export default function LanguageSwitcher({ size = 'small' }: Props) {
  const { i18n } = useTranslation();
  const current: 'bg' | 'en' = i18n.language.startsWith('bg') ? 'bg' : 'en';
  const setLang = (lng: 'bg' | 'en') => {
    if (lng !== current) void i18n.changeLanguage(lng);
  };

  const py = size === 'small' ? 0.4 : 0.6;
  const px = size === 'small' ? 1.1 : 1.5;
  const fs = size === 'small' ? 11 : 12;

  const pillSx = (active: boolean) => ({
    px,
    py,
    fontSize: fs,
    fontWeight: 700,
    letterSpacing: '0.06em',
    borderRadius: 999,
    color: active ? '#fff' : 'rgba(255,255,255,0.55)',
    background: active
      ? 'linear-gradient(135deg, rgba(99,102,241,0.85) 0%, rgba(139,92,246,0.85) 100%)'
      : 'transparent',
    boxShadow: active ? '0 2px 10px rgba(99,102,241,0.35)' : 'none',
    transition: 'color .15s, background .15s',
    '&:hover': {
      color: active ? '#fff' : 'rgba(255,255,255,0.85)',
    },
  });

  return (
    <Box
      role="group"
      aria-label="Language"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        p: '3px',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <ButtonBase
        aria-pressed={current === 'bg'}
        onClick={() => setLang('bg')}
        sx={pillSx(current === 'bg')}
      >
        BG
      </ButtonBase>
      <ButtonBase
        aria-pressed={current === 'en'}
        onClick={() => setLang('en')}
        sx={pillSx(current === 'en')}
      >
        EN
      </ButtonBase>
    </Box>
  );
}
