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
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import VerifiedIcon from '@mui/icons-material/Verified';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

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
  const [fromEmail, setFromEmail] = useState('');
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
        setFromEmail(s.fromEmail ?? '');
        setDomainId(s.domainId ?? null);
      } else {
        setFromName('');
        setFromEmail('');
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
      if (!settings && typeof res.domain === 'string') setFromEmail(`no-reply@${res.domain}`);
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
      const res = await api.emailSettingsPut(projectId, { fromName: fromName || undefined, fromEmail, domainId });
      setToast({ open: true, severity: 'success', message: t('emailPanel.toasts.settingsSaved') });
      setSettings({
        projectId: res.projectId,
        domainId: res.domainId,
        domain: domains.find((d) => d.id === res.domainId)?.domain ?? null,
        fromName: res.fromName,
        fromEmail: res.fromEmail,
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

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: { xs: 1.25, md: 2 } }}>
      <Stack gap={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={1.5}>
          <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ minHeight: 0 }}>
            <Tab value="domains" label={t('emailPanel.tabs.domains')} />
            <Tab value="sender" label={t('emailPanel.tabs.sender')} />
            <Tab value="templates" label={t('emailPanel.tabs.templates')} />
          </Tabs>
          <Button startIcon={<RefreshIcon />} onClick={loadAll} disabled={loading}>
            {t('emailPanel.refresh')}
          </Button>
        </Stack>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {tab === 'domains' && (
              <Stack gap={2}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={2}>
                    <Box>
                      <Typography variant="h6" fontWeight={800}>{t('emailPanel.domains.heading')}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t('emailPanel.domains.subtitle')}
                      </Typography>
                    </Box>
                    <Button startIcon={<AddIcon />} variant="contained" onClick={() => setCreateOpen(true)}>
                      {t('emailPanel.domains.newDomain')}
                    </Button>
                  </Stack>
                </Paper>

                {domains.length === 0 ? (
                  <Alert severity="info">{t('emailPanel.domains.empty')}</Alert>
                ) : (
                  <Stack gap={2}>
                    {domains.map((d) => (
                      <Paper key={d.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                        <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ md: 'center' }} justifyContent="space-between">
                          <Box sx={{ flex: 1, minWidth: 260 }}>
                            <Stack direction="row" gap={1} alignItems="center">
                              <Typography fontWeight={800}>{d.domain}</Typography>
                              {d.verified ? (
                                <Stack direction="row" gap={0.5} alignItems="center">
                                  <VerifiedIcon fontSize="small" color="success" />
                                  <Typography variant="caption" color="success.main" fontWeight={700}>
                                    {t('emailPanel.domains.verified')}
                                  </Typography>
                                </Stack>
                              ) : (
                                <Typography variant="caption" color="warning.main" fontWeight={700}>
                                  {t('emailPanel.domains.notVerified')}
                                </Typography>
                              )}
                            </Stack>
                            <Typography variant="caption" color="text.secondary">
                              {t('emailPanel.domains.added', { date: new Date(d.createdAt).toLocaleString() })}
                            </Typography>
                          </Box>

                          <Stack direction="row" gap={1} flexWrap="wrap">
                            <Button variant="outlined" onClick={() => onVerify(d.id)}>
                              {t('emailPanel.domains.verify')}
                            </Button>
                            <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => onDelete(d.id)}>
                              {t('emailPanel.domains.delete')}
                            </Button>
                          </Stack>
                        </Stack>

                        <Divider sx={{ my: 2 }} />
                        <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
                          {t('emailPanel.domains.dnsRecords')}
                        </Typography>
                        <TextField
                          value={prettyJson(d.dnsRecords)}
                          multiline
                          minRows={6}
                          fullWidth
                          InputProps={{ readOnly: true }}
                        />
                      </Paper>
                    ))}
                  </Stack>
                )}
              </Stack>
            )}

            {tab === 'sender' && (
              <Stack gap={2}>
                <Alert severity="info">
                  {t('emailPanel.sender.fallbackInfo')}
                </Alert>

                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>
                    {t('emailPanel.sender.heading')}
                  </Typography>
                  <Stack gap={2}>
                    <TextField
                      label={t('emailPanel.sender.nameLabel')}
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      fullWidth
                    />

                    <FormControl fullWidth>
                      <InputLabel id="email-domain-select-label">{t('emailPanel.sender.domainLabel')}</InputLabel>
                      <Select
                        labelId="email-domain-select-label"
                        label={t('emailPanel.sender.domainLabel')}
                        value={domainId ?? ''}
                        onChange={(e) => setDomainId(String(e.target.value || '') || null)}
                      >
                        <MenuItem value="">{t('emailPanel.sender.platformDefault')}</MenuItem>
                        {domains.map((d) => (
                          <MenuItem key={d.id} value={d.id} disabled={!d.verified}>
                            {d.domain} {d.verified ? '' : t('emailPanel.sender.notVerifiedSuffix')}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <TextField
                      label={t('emailPanel.sender.emailLabel')}
                      value={fromEmail}
                      onChange={(e) => setFromEmail(e.target.value)}
                      fullWidth
                    />

                    <Stack direction="row" gap={1} justifyContent="flex-end">
                      <Button variant="contained" onClick={onSaveSender}>{t('emailPanel.sender.save')}</Button>
                    </Stack>
                  </Stack>
                </Paper>

                {settings && (
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                    <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
                      {t('emailPanel.sender.currentHeading')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('emailPanel.sender.currentSender', {
                        email: `${settings.fromEmail}${settings.fromName ? ` (${settings.fromName})` : ''}`,
                      })}<br />
                      {t('emailPanel.sender.currentDomain', {
                        domain: settings.domain ?? t('emailPanel.sender.platformLabel'),
                      })}<br />
                      {t('emailPanel.sender.currentVerified', {
                        value: settings.verified ? t('emailPanel.sender.yes') : t('emailPanel.sender.no'),
                      })}
                    </Typography>
                  </Paper>
                )}
              </Stack>
            )}

            {tab === 'templates' && (
              <Stack gap={2}>
                <Alert severity="info">
                  <span dangerouslySetInnerHTML={{ __html: variablesHintHtml }} />
                </Alert>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
                    <FormControl sx={{ minWidth: 280 }}>
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
                    <Box sx={{ flex: 1 }} />
                    <Button variant="contained" onClick={onSaveTemplate}>{t('emailPanel.templates.saveTemplate')}</Button>
                  </Stack>

                  <Divider sx={{ my: 2 }} />

                  <Stack gap={2}>
                    <TextField
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
                    />
                  </Stack>
                </Paper>
              </Stack>
            )}
          </>
        )}
      </Stack>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('emailPanel.dialog.title')}</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            <Alert severity="info">
              {t('emailPanel.dialog.info')}
            </Alert>
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
    </Box>
  );
}
