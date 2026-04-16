import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  Button,
  Alert,
  CircularProgress,
  Paper,
  Divider,
  TextField,
  Link,
} from '@mui/material';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudIcon from '@mui/icons-material/Cloud';
import SettingsIcon from '@mui/icons-material/Settings';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import ConnectDomainPanel, { type CustomDomainDto } from './ConnectDomainPanel';

interface Props {
  projectId: string;
  hosted: boolean;
  paid: boolean;
  onUpdated?: () => void;
}

export default function HostingPanel({ projectId, hosted, paid, onUpdated }: Props) {
  const { t } = useTranslation();
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [slug, setSlug] = useState('');
  const [savingSlug, setSavingSlug] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugSuccess, setSlugSuccess] = useState<string | null>(null);
  const [domainInfo, setDomainInfo] = useState<CustomDomainDto | null>(null);

  const normalizedSlug = useMemo(() => slug.trim().toLowerCase(), [slug]);

  const refreshDomainInfo = async () => {
    try {
      const d = await api.get<CustomDomainDto>(`/preview/${projectId}/custom-domain`);
      setDomainInfo(d);
    } catch {
      setDomainInfo(null);
    }
  };

  useEffect(() => {
    if (paid && hosted) refreshDomainInfo();
  }, [paid, hosted, projectId]);

  const openPortal = async () => {
    setLoadingPortal(true);
    try {
      const { url } = await api.post<{ url: string }>('/billing/portal');
      window.location.href = url;
    } catch (e: any) {
      alert(e?.message ?? t('errors.generic'));
    } finally {
      setLoadingPortal(false);
    }
  };

  const saveSlug = async () => {
    setSlugError(null);
    setSlugSuccess(null);
    setSavingSlug(true);
    try {
      const d = await api.setHostedSubdomain(projectId, normalizedSlug);
      await refreshDomainInfo();
      onUpdated?.();
      setSlug('');
      if (d.customDomain) setSlugSuccess(d.customDomain);
    } catch (e: any) {
      setSlugError(e?.message ?? t('errors.generic'));
    } finally {
      setSavingSlug(false);
    }
  };

  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}>
        <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
          {hosted ? (
            <CloudDoneIcon sx={{ fontSize: 18, color: 'secondary.main' }} />
          ) : (
            <CloudIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          )}
          <Typography variant="subtitle2" fontWeight={800}>
            {hosted ? t('preview.hosted') : t('preview.hostCta')}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {hosted ? t('hostingPanel.statusOnline') : t('hostingPanel.statusOffline')}
        </Typography>
      </Paper>

      {!paid && <Alert severity="warning">{t('preview.unlockSubtitle')}</Alert>}

      {paid && hosted && (
        <>
          <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}>
            <Typography variant="subtitle2" fontWeight={800} mb={0.75}>
              {t('hostingPanel.option1Title')}
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={1.25}>
              {t('hostingPanel.option1Body')}
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
              <TextField
                size="small"
                label={t('hostingPanel.slugLabel')}
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={t('hostingPanel.slugPlaceholder')}
                fullWidth
                inputProps={{ spellCheck: false }}
                disabled={savingSlug}
                helperText={
                  domainInfo?.firstPartyRootDomain
                    ? t('hostingPanel.slugHelperExample', { root: domainInfo.firstPartyRootDomain })
                    : t('hostingPanel.slugHelperPlain')
                }
              />
              <Button
                variant="contained"
                onClick={saveSlug}
                disabled={savingSlug || normalizedSlug.length === 0}
              >
                {savingSlug ? <CircularProgress size={18} /> : t('hostingPanel.save')}
              </Button>
            </Stack>

            {slugError && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {slugError}
              </Alert>
            )}

            {((domainInfo?.domainKind === 'first_party_subdomain' && domainInfo.customDomain) || slugSuccess) && (
              <Alert severity="success" sx={{ mt: 1 }}>
                {t('hostingPanel.activeAddress')}{' '}
                <Box component="span" sx={{ fontFamily: 'monospace' }}>
                  {domainInfo?.domainKind === 'first_party_subdomain' && domainInfo.customDomain
                    ? domainInfo.customDomain
                    : slugSuccess}
                </Box>
                {' • '}
                <Link
                  href={`https://${domainInfo?.domainKind === 'first_party_subdomain' && domainInfo.customDomain
                    ? domainInfo.customDomain
                    : slugSuccess}`}
                  target="_blank"
                  rel="noreferrer"
                  underline="hover"
                  sx={{ ml: 0.5 }}
                >
                  {t('hostingPanel.open')}
                </Link>
              </Alert>
            )}
          </Paper>

          <Paper
            variant="outlined"
            sx={{ p: 1.75, borderRadius: 2, borderColor: 'rgba(99,102,241,0.35)' }}
          >
            <Typography variant="subtitle2" fontWeight={800} mb={0.75}>
              {t('hostingPanel.option2Title')}
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={1.25}>
              <span dangerouslySetInnerHTML={{ __html: t('hostingPanel.option2Body') }} />
            </Typography>
            <ConnectDomainPanel
              projectId={projectId}
              onUpdated={async () => {
                await refreshDomainInfo();
                onUpdated?.();
              }}
            />
          </Paper>

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />

          <Button
            variant="outlined"
            startIcon={loadingPortal ? undefined : <SettingsIcon fontSize="small" />}
            onClick={openPortal}
            disabled={loadingPortal}
          >
            {loadingPortal ? <CircularProgress size={18} /> : t('hostingPanel.manageSubscription')}
          </Button>
        </>
      )}

      {paid && !hosted && (
        <Alert severity="info">
          {t('hostingPanel.activateHint', { cta: t('preview.hostCta') })}
        </Alert>
      )}
    </Box>
  );
}
