import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, IconButton, Typography, Button,
  Stack, Alert, CircularProgress, TextField, Box,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Seeds the description field on open — used to pre-fill context like "Token extension request". */
  presetSubject?: string;
}

const MAX_DESCRIPTION = 4000;

export default function SupportDialog({ open, onClose, presetSubject }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName((prev) => prev || user?.email?.split('@')[0] || '');
    setContactEmail((prev) => prev || user?.email || '');
    if (presetSubject) {
      setDescription((prev) => (prev ? prev : `${presetSubject}\n\n`));
    }
    setErrorMsg('');
    setDone(false);
  }, [open, user?.email, presetSubject]);

  const handleClose = () => {
    if (submitting) return;
    setDescription('');
    setContactPhone('');
    setErrorMsg('');
    setDone(false);
    onClose();
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim());
  const phoneValid = /^[+()\-\s\d]{6,}$/.test(contactPhone.trim());

  const handleSubmit = async () => {
    const n = name.trim();
    const e = contactEmail.trim();
    const p = contactPhone.trim();
    const d = description.trim();
    if (!n || !e || !p || !d) {
      setErrorMsg(t('support.errorRequired'));
      return;
    }
    if (!emailValid) {
      setErrorMsg(t('support.errorEmailInvalid'));
      return;
    }
    if (!phoneValid) {
      setErrorMsg(t('support.errorPhoneInvalid'));
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    try {
      await api.createSupportTicket({ name: n, contactEmail: e, contactPhone: p, description: d });
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg || t('support.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, bgcolor: 'background.paper' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <SupportAgentIcon color="primary" fontSize="small" />
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
          {t('support.title')}
        </Typography>
        <IconButton onClick={handleClose} size="small" sx={{ color: 'text.secondary' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {done ? (
          <Stack spacing={2} alignItems="center" textAlign="center" sx={{ py: 2 }}>
            <CheckCircleIcon sx={{ fontSize: 56, color: 'success.main' }} />
            <Typography variant="h6" fontWeight={700}>
              {t('support.sentTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('support.sentBody')}
            </Typography>
            <Button
              variant="contained"
              fullWidth
              onClick={handleClose}
              sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}
            >
              {t('support.close')}
            </Button>
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              {t('support.body')}
            </Typography>

            <TextField
              label={t('support.nameLabel')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              size="small"
              inputProps={{ maxLength: 120 }}
              disabled={submitting}
            />

            <TextField
              label={t('support.emailLabel')}
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              fullWidth
              size="small"
              type="email"
              autoComplete="email"
              inputProps={{ maxLength: 254 }}
              disabled={submitting}
              error={contactEmail.length > 0 && !emailValid}
              helperText={contactEmail.length > 0 && !emailValid ? t('support.errorEmailInvalid') : ' '}
            />

            <TextField
              label={t('support.phoneLabel')}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              fullWidth
              size="small"
              type="tel"
              autoComplete="tel"
              placeholder="+359 88 123 4567"
              inputProps={{ maxLength: 40 }}
              disabled={submitting}
              error={contactPhone.length > 0 && !phoneValid}
              helperText={contactPhone.length > 0 && !phoneValid ? t('support.errorPhoneInvalid') : ' '}
            />

            <TextField
              label={t('support.descriptionLabel')}
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
              fullWidth
              multiline
              minRows={4}
              maxRows={10}
              placeholder={t('support.descriptionPlaceholder')}
              disabled={submitting}
              helperText={
                <Box component="span" sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {description.length} / {MAX_DESCRIPTION}
                </Box>
              }
            />

            {errorMsg && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {errorMsg}
              </Alert>
            )}

            <Button
              variant="contained"
              fullWidth
              onClick={handleSubmit}
              disabled={
                submitting ||
                !name.trim() ||
                !description.trim() ||
                !emailValid ||
                !phoneValid
              }
              startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <SupportAgentIcon />}
              sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}
            >
              {submitting ? t('support.sending') : t('support.send')}
            </Button>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
