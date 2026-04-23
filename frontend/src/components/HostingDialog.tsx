import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Stack,
  Typography,
  Button,
  Alert,
  CircularProgress,
  IconButton,
  TextField,
  Link,
  alpha,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CloudIcon from '@mui/icons-material/Cloud';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import LanguageIcon from '@mui/icons-material/Language';
import DnsIcon from '@mui/icons-material/Dns';
import SettingsIcon from '@mui/icons-material/Settings';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import ConnectDomainPanel, { type CustomDomainDto } from './ConnectDomainPanel';
import { AdminSection } from './AdminUI';

type HostingStatus = 'not_activated' | 'trial' | 'active' | 'expired';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  status: HostingStatus;
  hostingFreeUntil: string | null;
  hosted: boolean;
  paid: boolean;
  onUpdated?: () => void;
}

function daysBetween(future: Date, now: Date): number {
  const ms = future.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function StatusHero({
  status,
  hostingFreeUntil,
  formatDate,
  t,
}: {
  status: HostingStatus;
  hostingFreeUntil: string | null;
  formatDate: (d: string) => string;
  t: (k: string, opts?: any) => string;
}) {
  const meta = useMemo(() => {
    const trialDays = hostingFreeUntil ? daysBetween(new Date(hostingFreeUntil), new Date()) : 0;
    switch (status) {
      case 'not_activated':
        return {
          icon: <CloudOffIcon sx={{ fontSize: 24 }} />,
          color: '#94a3b8',
          title: t('hostingPanel.status.notActivatedTitle'),
          body: t('hostingPanel.status.notActivatedBody'),
        };
      case 'trial':
        return {
          icon: <AccessTimeIcon sx={{ fontSize: 24 }} />,
          color: '#f59e0b',
          title: t('hostingPanel.status.trialTitle'),
          body: hostingFreeUntil
            ? t('hostingPanel.status.trialBody', { date: formatDate(hostingFreeUntil), days: trialDays })
            : t('hostingPanel.status.trialBody', { date: '—', days: trialDays }),
          chip: trialDays > 0 ? t('hostingPanel.status.trialEndingSoon', { days: trialDays }) : null,
        };
      case 'active':
        return {
          icon: <CloudDoneIcon sx={{ fontSize: 24 }} />,
          color: '#10b981',
          title: t('hostingPanel.status.activeTitle'),
          body: t('hostingPanel.status.activeBody'),
        };
      case 'expired':
        return {
          icon: <CloudIcon sx={{ fontSize: 24 }} />,
          color: '#ef4444',
          title: t('hostingPanel.status.expiredTitle'),
          body: t('hostingPanel.status.expiredBody'),
        };
    }
  }, [status, hostingFreeUntil, formatDate, t]);

  return (
    <Box
      sx={{
        p: 2.25,
        borderRadius: 3,
        border: '1px solid',
        borderColor: alpha(meta.color, 0.3),
        background: `linear-gradient(135deg, ${alpha(meta.color, 0.18)} 0%, ${alpha(meta.color, 0.04)} 60%, transparent 100%)`,
      }}
    >
      <Stack direction="row" alignItems="center" gap={2}>
        <Box
          sx={{
            width: 52,
            height: 52,
            borderRadius: 2.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(meta.color, 0.18),
            color: meta.color,
            flexShrink: 0,
          }}
        >
          {meta.icon}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="center" gap={1.25} flexWrap="wrap">
            <Typography variant="h6" sx={{ fontWeight: 800, color: meta.color, lineHeight: 1.2 }}>
              {meta.title}
            </Typography>
            {('chip' in meta) && meta.chip && (
              <Box
                sx={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  px: 1,
                  py: 0.4,
                  borderRadius: 1,
                  bgcolor: alpha(meta.color, 0.22),
                  color: meta.color,
                  border: `1px solid ${alpha(meta.color, 0.35)}`,
                }}
              >
                {meta.chip as string}
              </Box>
            )}
          </Stack>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, lineHeight: 1.6 }}>
            {meta.body}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}

export default function HostingDialog({
  open,
  onClose,
  projectId,
  status,
  hostingFreeUntil,
  hosted,
  paid,
  onUpdated,
}: Props) {
  const { t, i18n } = useTranslation();
  const [domainInfo, setDomainInfo] = useState<CustomDomainDto | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [slug, setSlug] = useState('');
  const [savingSlug, setSavingSlug] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugSuccess, setSlugSuccess] = useState<string | null>(null);

  const normalizedSlug = useMemo(() => slug.trim().toLowerCase(), [slug]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(i18n.language || undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const refreshDomainInfo = async () => {
    if (!hosted) return;
    try {
      const d = await api.get<CustomDomainDto>(`/preview/${projectId}/custom-domain`);
      setDomainInfo(d);
    } catch {
      setDomainInfo(null);
    }
  };

  useEffect(() => {
    if (open && hosted) refreshDomainInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hosted, projectId]);

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

  const purchaseSite = async () => {
    setPurchasing(true);
    try {
      const { url } = await api.post<{ url: string }>('/billing/project-checkout', { projectId });
      window.location.href = url;
    } catch (e: any) {
      alert(e?.message ?? t('errors.generic'));
      setPurchasing(false);
    }
  };

  const subscribeHosting = async () => {
    setPurchasing(true);
    try {
      const { url } = await api.post<{ url: string }>('/billing/hosting-checkout', { projectId });
      window.location.href = url;
    } catch (e: any) {
      alert(e?.message ?? t('errors.generic'));
      setPurchasing(false);
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

  const activeAddress =
    domainInfo?.domainKind === 'first_party_subdomain' && domainInfo.customDomain
      ? domainInfo.customDomain
      : slugSuccess;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" alignItems="center" gap={1.25}>
          <CloudIcon sx={{ color: 'primary.main', fontSize: 20 }} />
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {t('hostingPanel.dialogTitle')}
          </Typography>
        </Stack>
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 12, top: 12, color: 'text.secondary' }}
          size="small"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: { xs: 1.75, sm: 2.5 } }}>
        <Stack gap={2}>
          <StatusHero status={status} hostingFreeUntil={hostingFreeUntil} formatDate={formatDate} t={t} />

          {status === 'not_activated' && (
            <Box sx={{ textAlign: 'center', py: 1 }}>
              <Button
                variant="contained"
                size="large"
                startIcon={purchasing ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : <RocketLaunchIcon />}
                onClick={purchaseSite}
                disabled={purchasing}
                sx={{
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                  fontWeight: 700,
                  px: 3,
                }}
              >
                {t('hostingPanel.purchaseCta')}
              </Button>
            </Box>
          )}

          {status === 'expired' && paid && (
            <Box>
              <Button
                variant="contained"
                fullWidth
                startIcon={purchasing ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : <CloudIcon />}
                onClick={subscribeHosting}
                disabled={purchasing}
              >
                {t('preview.hostCta')}
              </Button>
            </Box>
          )}

          {status === 'trial' && (
            <Box>
              <Button
                variant="contained"
                fullWidth
                color="secondary"
                startIcon={purchasing ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : <CloudIcon />}
                onClick={subscribeHosting}
                disabled={purchasing}
              >
                {t('preview.hostCta')}
              </Button>
            </Box>
          )}

          {hosted && (
            <>
              <AdminSection
                icon={<LanguageIcon sx={{ fontSize: 16 }} />}
                title={t('hostingPanel.option1Title')}
                subtitle={t('hostingPanel.option1Body')}
              >
                <Stack gap={1.25}>
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
                      sx={{ minWidth: 100, alignSelf: { sm: 'flex-start' }, mt: { sm: 0.25 } }}
                    >
                      {savingSlug ? <CircularProgress size={18} /> : t('hostingPanel.save')}
                    </Button>
                  </Stack>

                  {slugError && <Alert severity="error">{slugError}</Alert>}

                  {activeAddress && (
                    <Alert severity="success">
                      {t('hostingPanel.activeAddress')}{' '}
                      <Box component="span" sx={{ fontFamily: 'monospace' }}>{activeAddress}</Box>
                      {' • '}
                      <Link
                        href={`https://${activeAddress}`}
                        target="_blank"
                        rel="noreferrer"
                        underline="hover"
                        sx={{ ml: 0.5 }}
                      >
                        {t('hostingPanel.open')}
                      </Link>
                    </Alert>
                  )}
                </Stack>
              </AdminSection>

              <AdminSection
                icon={<DnsIcon sx={{ fontSize: 16 }} />}
                title={t('hostingPanel.option2Title')}
              >
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.6 }}>
                  <span dangerouslySetInnerHTML={{ __html: t('hostingPanel.option2Body') }} />
                </Typography>
                <ConnectDomainPanel
                  projectId={projectId}
                  onUpdated={async () => {
                    await refreshDomainInfo();
                    onUpdated?.();
                  }}
                />
              </AdminSection>
            </>
          )}

          {(status === 'active' || status === 'trial' || status === 'expired') && (
            <Button
              variant="outlined"
              fullWidth
              startIcon={loadingPortal ? <CircularProgress size={16} /> : <SettingsIcon fontSize="small" />}
              onClick={openPortal}
              disabled={loadingPortal}
            >
              {t('hostingPanel.manageSubscription')}
            </Button>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} color="inherit">
          {t('hostingPanel.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
