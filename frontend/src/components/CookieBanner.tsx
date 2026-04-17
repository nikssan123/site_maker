import { useState, useEffect } from 'react';
import { Box, Typography, Button, Stack, Link as MuiLink, Slide } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const STORAGE_KEY = 'cookie-consent';

export default function CookieBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    setVisible(false);
  };

  return (
    <Slide direction="up" in={visible} mountOnEnter unmountOnExit>
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1400,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
          px: { xs: 2, sm: 4 },
          py: 2,
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ sm: 'center' }}
          justifyContent="center"
          gap={2}
          sx={{ maxWidth: 900, mx: 'auto' }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {t('cookie.message')}{' '}
            <MuiLink component={RouterLink} to="/privacy" underline="hover">
              {t('legal.privacyLink')}
            </MuiLink>
          </Typography>
          <Button variant="contained" size="small" onClick={accept} sx={{ whiteSpace: 'nowrap' }}>
            {t('cookie.accept')}
          </Button>
        </Stack>
      </Box>
    </Slide>
  );
}
