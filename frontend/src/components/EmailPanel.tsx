import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import VerifiedIcon from '@mui/icons-material/Verified';
import RefreshIcon from '@mui/icons-material/Refresh';
import EmailIcon from '@mui/icons-material/Email';
import DnsIcon from '@mui/icons-material/Dns';
import PersonIcon from '@mui/icons-material/Person';
import DescriptionIcon from '@mui/icons-material/Description';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import {
  AdminPageHeader,
  AdminPanelLayout,
  AdminSection,
  AdminEmptyState,
  AdminStatusChip,
} from './AdminUI';

type DomainRow = {
  id: string;
  projectId: string;
  domain: string;
  verified: boolean;
  verifiedAt: string | null;
  dnsRecords: unknown;
  createdAt: string;
};

type SettingsRow = null | {
  projectId: string;
  domainId: string | null;
  domain: string | null;
  fromName: string | null;
  fromEmail: string;
  platformFromEmail: string;
  verified: boolean;
  provider: 'resend';
};

type TemplateRow = { id: string; eventType: string; subject: string; htmlBody: string; updatedAt: string };

const EVENT_TYPE_KEYS = ['user.signup', 'form.submitted', 'booking.created', 'order.created', 'payment.received'] as const;

function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v ?? '');
  }
}

function emailLocalPart(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

function emailDomainPart(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1) : '';
}

export default function EmailPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'domains' | 'sender' | 'templates'>('domains');
  const [loading, setLoading] = useState(true);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [settings, setSettings] = useState<SettingsRow>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [toast, setToast] = useState<{ open: boolean; severity: 'success' | 'error' | 'info'; message: string }>({
    open: false,
    severity: 'info',
    message: '',
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [createDomain, setCreateDomain] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmailLocal, setFromEmailLocal] = useState('no-reply');
  const [platformFromEmail, setPlatformFromEmail] = useState('');
  const [domainId, setDomainId] = useState<string | null>(null);
  const [templateEventType, setTemplateEventType] = useState<string>(EVENT_TYPE_KEYS[1]);
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateHtml, setTemplateHtml] = useState('');

  const templateByType = useMemo(() => {
    const m = new Map<string, TemplateRow>();
    for (const tpl of templates) m.set(tpl.eventType, tpl);
    return m;
  }, [templates]);

  const variablesHintHtml = useMemo(() => {
    const vars = ['{{name}}', '{{email}}', '{{message}}']
      .map((v) => `<code>${v}</code>`)
      .join(', ');
    return t('emailPanel.templates.variablesHint', { vars, interpolation: { escapeValue: false } });
  }, [t]);

  const selectedSenderDomain = useMemo(() => {
    if (domainId) return domains.find((d) => d.id === domainId)?.domain ?? '';
    return emailDomainPart(platformFromEmail);
  }, [domainId, domains, platformFromEmail]);

  const platformDomainLabel = useMemo(() => {
    const domain = emailDomainPart(platformFromEmail);
    return domain ? `${t('emailPanel.sender.platformDefault')} - ${domain}` : t('emailPanel.sender.platformDefault');
  }, [platformFromEmail, t]);

  const constructedFromEmail = useMemo(() => {
    const local = fromEmailLocal.trim();
    return local && selectedSenderDomain ? `${local}@${selectedSenderDomain}` : '';
  }, [fromEmailLocal, selectedSenderDomain]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [d, s, tpls] = await Promise.all([
        api.emailDomainsList({ projectId }),
        api.emailSettingsGet(projectId),
        api.emailTemplatesGet(projectId),
      ]);
      setDomains(d);
      setSettings(s);
      setTemplates(tpls);

      if (s) {
        setFromName(s.fromName ?? '');
        setFromEmailLocal(emailLocalPart(s.fromEmail ?? '') || 'no-reply');
        setPlatformFromEmail(s.platformFromEmail ?? s.fromEmail ?? '');
        setDomainId(s.domainId ?? null);
      } else {
        setFromName('');
        setFromEmailLocal('no-reply');
        setPlatformFromEmail('');
        setDomainId(null);
      }

      const chosen = tpls.find((x) => x.eventType === templateEventType) ?? tpls[0];
      if (chosen) {
        setTemplateEventType(chosen.eventType);
        setTemplateSubject(chosen.subject);
        setTemplateHtml(chosen.htmlBody);
      } else {
        setTemplateSubject('');
        setTemplateHtml('');
      }
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: e?.message ?? t('emailPanel.toasts.loadError') });
    } finally {
      setLoading(false);
    }
  }, [projectId, templateEventType, t]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const tpl = templateByType.get(templateEventType);
    if (tpl) {
      setTemplateSubject(tpl.subject);
      setTemplateHtml(tpl.htmlBody);
    }
  }, [templateByType, templateEventType]);

  const onCreateDomain = async () => {
    try {
      const res = await api.emailDomainCreate(projectId, createDomain);
      setToast({ open: true, severity: 'success', message: t('emailPanel.toasts.domainAdded') });
      setCreateOpen(false);
      setCreateDomain('');
      await loadAll();
      if (!settings && typeof res.domain === 'string') setFromEmailLocal('no-reply');
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: e?.message ?? t('emailPanel.toasts.generic') });
    }
  };

  const onVerify = async (id: string) => {
    try {
      const res = await api.emailDomainVerify(id);
      setToast({
        open: true,
        severity: res.verified ? 'success' : 'info',
        message: res.verified ? t('emailPanel.toasts.domainVerified') : t('emailPanel.toasts.domainNotYetVerified'),
      });
      await loadAll();
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: e?.message ?? t('emailPanel.toasts.generic') });
    }
  };

  const onDelete = async (id: string) => {
    try {
      await api.emailDomainDelete(id);
      setToast({ open: true, severity: 'success', message: t('emailPanel.toasts.domainDeleted') });
      await loadAll();
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: e?.message ?? t('emailPanel.toasts.generic') });
    }
  };

  const onSaveSender = async () => {
    try {
      const res = await api.emailSettingsPut(projectId, { fromName: fromName || undefined, fromEmail: constructedFromEmail, domainId });
      setToast({ open: true, severity: 'success', message: t('emailPanel.toasts.settingsSaved') });
      setSettings({
        projectId: res.projectId,
        domainId: res.domainId,
        domain: domains.find((d) => d.id === res.domainId)?.domain ?? null,
        fromName: res.fromName,
        fromEmail: res.fromEmail,
        platformFromEmail: res.platformFromEmail,
        verified: res.verified,
        provider: 'resend',
      });
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: e?.message ?? t('emailPanel.toasts.generic') });
    }
  };

  const onSaveTemplate = async () => {
    try {
      await api.emailTemplatePut(projectId, templateEventType, { subject: templateSubject, htmlBody: templateHtml });
      setToast({ open: true, severity: 'success', message: t('emailPanel.toasts.templateSaved') });
      await loadAll();
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: e?.message ?? t('emailPanel.toasts.generic') });
    }
  };

  const headerSubtitle: Record<typeof tab, string> = {
    domains: t('emailPanel.domains.subtitle'),
    sender: t('emailPanel.sender.fallbackInfo'),
    templates: '',
  };

  return (
    <>
      <AdminPanelLayout>
        <AdminPageHeader
          icon={<EmailIcon fontSize="small" />}
          title={t(`emailPanel.tabs.${tab}`)}
          subtitle={headerSubtitle[tab]}
          actions={
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
              onClick={loadAll}
              disabled={loading}
            >
              {t('emailPanel.refresh')}
            </Button>
          }
        />

        <Box
          sx={{
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            bgcolor: 'rgba(255,255,255,0.02)',
            borderRadius: 3,
            border: '1px solid rgba(255,255,255,0.07)',
            px: 1,
          }}
        >
          <Tabs
            value={tab}
            onChange={(_e, v) => setTab(v)}
            sx={{
              minHeight: 44,
              '& .MuiTab-root': {
                minHeight: 44,
                fontWeight: 700,
                fontSize: 13,
                textTransform: 'none',
              },
            }}
          >
            <Tab value="domains" icon={<DnsIcon sx={{ fontSize: 16 }} />} iconPosition="start" label={t('emailPanel.tabs.domains')} />
            <Tab value="sender" icon={<PersonIcon sx={{ fontSize: 16 }} />} iconPosition="start" label={t('emailPanel.tabs.sender')} />
            <Tab value="templates" icon={<DescriptionIcon sx={{ fontSize: 16 }} />} iconPosition="start" label={t('emailPanel.tabs.templates')} />
          </Tabs>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {tab === 'domains' && (
              <>
                <AdminSection
                  icon={<DnsIcon sx={{ fontSize: 16 }} />}
                  title={t('emailPanel.domains.heading')}
                  subtitle={t('emailPanel.domains.subtitle')}
                  actions={
                    <Button
                      size="small"
                      startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                      variant="contained"
                      onClick={() => setCreateOpen(true)}
                    >
                      {t('emailPanel.domains.newDomain')}
                    </Button>
                  }
                >
                  {domains.length === 0 ? (
                    <AdminEmptyState
                      icon={<DnsIcon sx={{ fontSize: 32 }} />}
                      title={t('emailPanel.domains.empty')}
                      action={
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                          onClick={() => setCreateOpen(true)}
                        >
                          {t('emailPanel.domains.newDomain')}
                        </Button>
                      }
                    />
                  ) : (
                    <Stack gap={1.5}>
                      {domains.map((d) => (
                        <Box
                          key={d.id}
                          sx={{
                            borderRadius: 2.5,
                            border: '1px solid rgba(255,255,255,0.06)',
                            bgcolor: 'rgba(255,255,255,0.02)',
                            overflow: 'hidden',
                          }}
                        >
                          <Stack
                            direction={{ xs: 'column', md: 'row' }}
                            gap={1.5}
                            alignItems={{ md: 'center' }}
                            justifyContent="space-between"
                            sx={{ p: 1.75 }}
                          >
                            <Box sx={{ flex: 1, minWidth: 220 }}>
                              <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                                <Typography sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
                                  {d.domain}
                                </Typography>
                                {d.verified ? (
                                  <AdminStatusChip
                                    tone="success"
                                    icon={<VerifiedIcon />}
                                    label={t('emailPanel.domains.verified')}
                                  />
                                ) : (
                                  <AdminStatusChip
                                    tone="warning"
                                    label={t('emailPanel.domains.notVerified')}
                                  />
                                )}
                              </Stack>
                              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                {t('emailPanel.domains.added', { date: new Date(d.createdAt).toLocaleString() })}
                              </Typography>
                            </Box>

                            <Stack direction="row" gap={1} flexWrap="wrap">
                              <Button size="small" variant="outlined" onClick={() => onVerify(d.id)}>
                                {t('emailPanel.domains.verify')}
                              </Button>
                              <Tooltip title={t('emailPanel.domains.delete')}>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => onDelete(d.id)}
                                >
                                  <DeleteIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </Stack>

                          <Box
                            sx={{
                              borderTop: '1px solid rgba(255,255,255,0.05)',
                              p: 1.5,
                              bgcolor: 'rgba(255,255,255,0.015)',
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                color: 'text.secondary',
                                display: 'block',
                                mb: 0.75,
                              }}
                            >
                              {t('emailPanel.domains.dnsRecords')}
                            </Typography>
                            <TextField
                              value={prettyJson(d.dnsRecords)}
                              multiline
                              minRows={5}
                              fullWidth
                              size="small"
                              InputProps={{
                                readOnly: true,
                                sx: { fontFamily: 'monospace', fontSize: 12, bgcolor: 'rgba(0,0,0,0.2)' },
                              }}
                            />
                          </Box>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </AdminSection>
              </>
            )}

            {tab === 'sender' && (
              <>
                <Alert severity="info">{t('emailPanel.sender.fallbackInfo')}</Alert>

                <AdminSection
                  icon={<PersonIcon sx={{ fontSize: 16 }} />}
                  title={t('emailPanel.sender.heading')}
                >
                  <Stack gap={2}>
                    <TextField
                      size="small"
                      label={t('emailPanel.sender.nameLabel')}
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      fullWidth
                    />

                    <FormControl size="small" fullWidth>
                      <InputLabel id="email-domain-select-label">{t('emailPanel.sender.domainLabel')}</InputLabel>
                      <Select
                        labelId="email-domain-select-label"
                        label={t('emailPanel.sender.domainLabel')}
                        value={domainId ?? ''}
                        displayEmpty
                        renderValue={(value) => {
                          const selected = String(value || '');
                          if (!selected) return platformDomainLabel;
                          return domains.find((d) => d.id === selected)?.domain ?? selected;
                        }}
                        onChange={(e) => {
                          const nextDomainId = String(e.target.value || '') || null;
                          setDomainId(nextDomainId);
                        }}
                      >
                        <MenuItem value="">
                          <Stack spacing={0.25}>
                            <Typography variant="body2">{platformDomainLabel}</Typography>
                            {platformFromEmail && (
                              <Typography variant="caption" color="text.secondary">{platformFromEmail}</Typography>
                            )}
                          </Stack>
                        </MenuItem>
                        {domains.map((d) => (
                          <MenuItem key={d.id} value={d.id} disabled={!d.verified}>
                            {d.domain} {d.verified ? '' : t('emailPanel.sender.notVerifiedSuffix')}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <TextField
                      size="small"
                      label={t('emailPanel.sender.emailNameLabel')}
                      value={fromEmailLocal}
                      onChange={(e) => setFromEmailLocal(e.target.value.replace(/@.*/, '').trim())}
                      fullWidth
                    />

                    <TextField
                      size="small"
                      label={t('emailPanel.sender.emailLabel')}
                      value={constructedFromEmail}
                      fullWidth
                      InputProps={{ readOnly: true, sx: { fontFamily: 'monospace' } }}
                      helperText={t('emailPanel.sender.emailReadonlyHint')}
                      sx={{
                        '& .MuiInputBase-input.Mui-readOnly': {
                          cursor: 'default',
                          color: 'text.secondary',
                          WebkitTextFillColor: 'currentColor',
                        },
                        '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.2)' },
                      }}
                    />

                    <Stack direction="row" gap={1} justifyContent="flex-end">
                      <Button variant="contained" onClick={onSaveSender} disabled={!constructedFromEmail}>
                        {t('emailPanel.sender.save')}
                      </Button>
                    </Stack>
                  </Stack>
                </AdminSection>

                {settings && (
                  <AdminSection
                    icon={<VerifiedIcon sx={{ fontSize: 16 }} />}
                    title={t('emailPanel.sender.currentHeading')}
                    dense
                  >
                    <Stack gap={0.75}>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                        {t('emailPanel.sender.currentSender', {
                          email: `${settings.fromEmail}${settings.fromName ? ` (${settings.fromName})` : ''}`,
                        })}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                        {t('emailPanel.sender.currentDomain', {
                          domain: settings.domain ?? t('emailPanel.sender.platformLabel'),
                        })}
                      </Typography>
                      <Stack direction="row" gap={1} alignItems="center">
                        <Typography variant="body2" color="text.secondary">
                          {t('emailPanel.sender.currentVerified', { value: '' }).replace(/[:.]\s*$/, '')}
                        </Typography>
                        <AdminStatusChip
                          tone={settings.verified ? 'success' : 'warning'}
                          label={settings.verified ? t('emailPanel.sender.yes') : t('emailPanel.sender.no')}
                        />
                      </Stack>
                    </Stack>
                  </AdminSection>
                )}
              </>
            )}

            {tab === 'templates' && (
              <>
                <Alert severity="info">
                  <span dangerouslySetInnerHTML={{ __html: variablesHintHtml }} />
                </Alert>

                <AdminSection
                  icon={<DescriptionIcon sx={{ fontSize: 16 }} />}
                  title={t('emailPanel.tabs.templates')}
                  actions={
                    <Button size="small" variant="contained" onClick={onSaveTemplate}>
                      {t('emailPanel.templates.saveTemplate')}
                    </Button>
                  }
                >
                  <Stack gap={2}>
                    <FormControl size="small" fullWidth>
                      <InputLabel id="email-template-event-type-label">{t('emailPanel.templates.eventLabel')}</InputLabel>
                      <Select
                        labelId="email-template-event-type-label"
                        label={t('emailPanel.templates.eventLabel')}
                        value={templateEventType}
                        onChange={(e) => setTemplateEventType(String(e.target.value))}
                      >
                        {EVENT_TYPE_KEYS.map((key) => (
                          <MenuItem key={key} value={key}>{t(`emailPanel.eventTypes.${key}`)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <TextField
                      size="small"
                      label={t('emailPanel.templates.subjectLabel')}
                      value={templateSubject}
                      onChange={(e) => setTemplateSubject(e.target.value)}
                      fullWidth
                    />
                    <TextField
                      label={t('emailPanel.templates.htmlLabel')}
                      value={templateHtml}
                      onChange={(e) => setTemplateHtml(e.target.value)}
                      multiline
                      minRows={12}
                      fullWidth
                      InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }}
                    />
                  </Stack>
                </AdminSection>
              </>
            )}
          </>
        )}
      </AdminPanelLayout>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle>{t('emailPanel.dialog.title')}</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            <Alert severity="info">{t('emailPanel.dialog.info')}</Alert>
            <TextField
              label={t('emailPanel.dialog.domainLabel')}
              value={createDomain}
              onChange={(e) => setCreateDomain(e.target.value)}
              placeholder="example.com"
              fullWidth
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>{t('emailPanel.dialog.cancel')}</Button>
          <Button variant="contained" onClick={onCreateDomain} disabled={!createDomain.trim()}>
            {t('emailPanel.dialog.add')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast((tt) => ({ ...tt, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} onClose={() => setToast((tt) => ({ ...tt, open: false }))} sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}
