import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  Paper,
  Alert,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

export type CustomDomainDto = {
  customDomain: string | null;
  customDomainVerifiedAt: string | null;
  hostingSitesConfigured: boolean;
  cnameTarget: string | null;
  challengeTxtName: string | null;
  challengeTxtValue: string | null;
};

interface Props {
  projectId: string;
  onUpdated?: () => void;
}

async function copyText(copyPrompt: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt(copyPrompt, text);
  }
}

export default function ConnectDomainPanel({ projectId, onUpdated }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [data, setData] = useState<CustomDomainDto | null>(null);
  const [input, setInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLocalError(null);
    try {
      const d = await api.get<CustomDomainDto>(`/preview/${projectId}/custom-domain`);
      setData(d);
      setInput(d.customDomain ?? '');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('connectDomain.loadFailed');
      setLocalError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setLocalError(null);
    try {
      const d = await api.put<CustomDomainDto>(`/preview/${projectId}/custom-domain`, {
        customDomain: input.trim(),
      });
      setData(d);
      onUpdated?.();
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : t('connectDomain.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setLocalError(null);
    try {
      const d = await api.post<CustomDomainDto & { ok?: boolean }>(
        `/preview/${projectId}/custom-domain/verify`,
        {},
      );
      setData({
        customDomain: d.customDomain,
        customDomainVerifiedAt: d.customDomainVerifiedAt,
        hostingSitesConfigured: d.hostingSitesConfigured,
        cnameTarget: d.cnameTarget,
        challengeTxtName: d.challengeTxtName,
        challengeTxtValue: d.challengeTxtValue,
      });
      onUpdated?.();
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : t('connectDomain.verifyFailed'));
    } finally {
      setVerifying(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setLocalError(null);
    try {
      const d = await api.delete<CustomDomainDto>(`/preview/${projectId}/custom-domain`);
      setData(d);
      setInput('');
      onUpdated?.();
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : t('connectDomain.removeFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={28} />
      </Paper>
    );
  }

  if (!data && localError) {
    return (
      <Alert severity="error" sx={{ borderRadius: 2 }}>
        {localError}
      </Alert>
    );
  }

  if (!data) return null;

  const verified = Boolean(data.customDomainVerifiedAt);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, borderColor: 'rgba(99,102,241,0.35)' }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1} mb={1.5}>
        <Box>
          <Typography variant="subtitle2" fontWeight={700}>
            {t('connectDomain.panelTitle')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('connectDomain.panelSubtitle')}
          </Typography>
        </Box>
        <Tooltip title={t('connectDomain.helpTooltip')}>
          <IconButton size="small" onClick={() => navigate('/docs/connect-domain')} color="primary">
            <HelpOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {!data.hostingSitesConfigured && (
        <Alert severity="warning" sx={{ mb: 2, py: 0.5 }}>
          {t('connectDomain.hostingEnvWarn')}
        </Alert>
      )}

      {localError && (
        <Alert severity="error" sx={{ mb: 2, py: 0.5 }} onClose={() => setLocalError(null)}>
          {localError}
        </Alert>
      )}

      {verified && data.customDomain && (
        <>
          <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1, color: 'success.main' }}>
            <CheckCircleIcon fontSize="small" />
            <Typography variant="body2" fontWeight={600}>
              {t('connectDomain.verifiedFor')}{' '}
              <Box component="span" sx={{ fontFamily: 'monospace', color: 'text.primary' }}>
                {data.customDomain}
              </Box>
            </Typography>
          </Stack>
          <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>
            {t('connectDomain.httpsHint', { target: data.cnameTarget ?? '…' })}
          </Alert>
        </>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'flex-start' }} sx={{ mb: 2 }}>
        <TextField
          size="small"
          fullWidth
          label={t('connectDomain.hostnameLabel')}
          placeholder="www.yourbrand.com"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          helperText={t('connectDomain.hostnameHint')}
        />
        <Button variant="contained" onClick={handleSave} disabled={saving || !input.trim()} sx={{ flexShrink: 0 }}>
          {saving ? <CircularProgress size={20} color="inherit" /> : t('connectDomain.saveDomain')}
        </Button>
      </Stack>

      {data.cnameTarget && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
            {t('connectDomain.cnameHelp')}
          </Typography>
          <Stack direction="row" alignItems="center" gap={0.5}>
            <Typography
              variant="body2"
              sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1, bgcolor: 'rgba(0,0,0,0.2)', px: 1, py: 0.5, borderRadius: 1 }}
            >
              {data.cnameTarget}
            </Typography>
            <Tooltip title={t('common.copy')}>
              <IconButton
                size="small"
                onClick={() =>
                  copyText(
                    t('connectDomain.copyPrompt', { label: t('connectDomain.copyCnameTarget') }),
                    data.cnameTarget!,
                  )}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      )}

      {data.challengeTxtName && data.challengeTxtValue && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
            {t('connectDomain.txtHelp')}
          </Typography>
          <Typography variant="caption" color="text.disabled" display="block" sx={{ fontFamily: 'monospace', mb: 0.5 }}>
            {t('connectDomain.nameLabel')}: {data.challengeTxtName}
          </Typography>
          <Stack direction="row" alignItems="center" gap={0.5}>
            <Typography
              variant="body2"
              sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1, bgcolor: 'rgba(0,0,0,0.2)', px: 1, py: 0.5, borderRadius: 1 }}
            >
              {data.challengeTxtValue}
            </Typography>
            <Tooltip title={t('common.copy')}>
              <IconButton
                size="small"
                onClick={() =>
                  copyText(
                    t('connectDomain.copyPrompt', { label: t('connectDomain.copyTxtValue') }),
                    data.challengeTxtValue!,
                  )}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      )}

      <Stack direction="row" flexWrap="wrap" gap={1}>
        <Button
          variant="outlined"
          onClick={handleVerify}
          disabled={verifying || !data.customDomain}
        >
          {verifying ? <CircularProgress size={20} /> : t('connectDomain.verifyDns')}
        </Button>
        <Button variant="text" color="inherit" onClick={() => navigate('/docs/connect-domain')} size="small">
          {t('connectDomain.fullGuide')}
        </Button>
        {data.customDomain && (
          <Button variant="text" color="error" onClick={handleClear} disabled={saving} size="small">
            {t('connectDomain.removeDomain')}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
