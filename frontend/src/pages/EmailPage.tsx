import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AppBar,
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Typography,
  Snackbar,
  Paper,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import VerifiedIcon from '@mui/icons-material/Verified';
import RefreshIcon from '@mui/icons-material/Refresh';

import { api } from '../lib/api';

type DomainRow = {
  id: string;
  projectId: string;
  domain: string;
  verified: boolean;
  verifiedAt: string | null;
  dnsRecords: any;
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

const EVENT_TYPES: Array<{ key: string; label: string }> = [
  { key: 'user.signup', label: 'Регистрация на потребител' },
  { key: 'form.submitted', label: 'Ново запитване (контактна форма)' },
  { key: 'booking.created', label: 'Нова резервация' },
  { key: 'payment.received', label: 'Получено плащане' },
];

function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v ?? '');
  }
}

export default function EmailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

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

  const [templateEventType, setTemplateEventType] = useState(EVENT_TYPES[1].key);
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateHtml, setTemplateHtml] = useState('');

  const templateByType = useMemo(() => {
    const m = new Map<string, TemplateRow>();
    for (const t of templates) m.set(t.eventType, t);
    return m;
  }, [templates]);

  const loadAll = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [d, s, t] = await Promise.all([
        api.emailDomainsList({ projectId }),
        api.emailSettingsGet(projectId),
        api.emailTemplatesGet(projectId),
      ]);
      setDomains(d);
      setSettings(s);
      setTemplates(t);

      // hydrate sender form from settings or defaults
      if (s) {
        setFromName(s.fromName ?? '');
        setFromEmail(s.fromEmail ?? '');
        setDomainId(s.domainId ?? null);
      } else {
        setFromName('');
        setFromEmail('');
        setDomainId(null);
      }

      // hydrate template editor
      const chosen = t.find((x) => x.eventType === templateEventType) ?? t[0];
      if (chosen) {
        setTemplateEventType(chosen.eventType);
        setTemplateSubject(chosen.subject);
        setTemplateHtml(chosen.htmlBody);
      } else {
        setTemplateSubject('');
        setTemplateHtml('');
      }
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: e?.message ?? 'Грешка при зареждане' });
    } finally {
      setLoading(false);
    }
  }, [projectId, templateEventType]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onCreateDomain = async () => {
    if (!projectId) return;
    try {
      const res = await api.emailDomainCreate(projectId, createDomain);
      setToast({ open: true, severity: 'success', message: 'Домейнът е добавен. Конфигурирайте DNS записите и натиснете „Провери“.' });
      setCreateOpen(false);
      setCreateDomain('');
      await loadAll();

      // if no settings yet, pre-fill fromEmail suggestion
      if (!settings && typeof res.domain === 'string') {
        setFromEmail(`no-reply@${res.domain}`);
      }
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: e?.message ?? 'Грешка' });
    }
  };

  const onVerify = async (id: string) => {
    try {
      const res = await api.emailDomainVerify(id);
      setToast({
        open: true,
        severity: res.verified ? 'success' : 'info',
        message: res.verified ? 'Домейнът е потвърден.' : 'Все още не е потвърден. DNS-ът може да не е пропагирал.',
      });
      await loadAll();
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: e?.message ?? 'Грешка' });
    }
  };

  const onDelete = async (id: string) => {
    try {
      await api.emailDomainDelete(id);
      setToast({ open: true, severity: 'success', message: 'Домейнът е изтрит.' });
      await loadAll();
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: e?.message ?? 'Грешка' });
    }
  };

  const onSaveSender = async () => {
    if (!projectId) return;
    try {
      const res = await api.emailSettingsPut(projectId, { fromName: fromName || undefined, fromEmail, domainId });
      setToast({ open: true, severity: 'success', message: 'Настройките са запазени.' });
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
      setToast({ open: true, severity: 'error', message: e?.message ?? 'Грешка' });
    }
  };

  useEffect(() => {
    const t = templateByType.get(templateEventType);
    if (t) {
      setTemplateSubject(t.subject);
      setTemplateHtml(t.htmlBody);
    } else {
      setTemplateSubject('');
      setTemplateHtml('');
    }
  }, [templateByType, templateEventType]);

  const onSaveTemplate = async () => {
    if (!projectId) return;
    try {
      await api.emailTemplatePut(projectId, templateEventType, { subject: templateSubject, htmlBody: templateHtml });
      setToast({ open: true, severity: 'success', message: 'Шаблонът е запазен.' });
      await loadAll();
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: e?.message ?? 'Грешка' });
    }
  };

  if (!projectId) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">Липсва projectId.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" elevation={0} color="transparent">
        <Toolbar sx={{ gap: 2 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/preview/${projectId}`)}>
            Назад
          </Button>
          <Typography variant="h6" fontWeight={800} sx={{ flex: 1 }}>
            Имейл настройки
          </Typography>
          <Button startIcon={<RefreshIcon />} onClick={loadAll} disabled={loading}>
            Обнови
          </Button>
        </Toolbar>
        <Divider />
        <Tabs
          value={tab}
          onChange={(_e, v) => setTab(v)}
          sx={{ px: 2 }}
        >
          <Tab value="domains" label="Домейни" />
          <Tab value="sender" label="Подател" />
          <Tab value="templates" label="Шаблони" />
        </Tabs>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
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
                      <Typography variant="h6" fontWeight={800}>Домейни за изпращане</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Добавете домейн, настройте DNS записите и потвърдете. След потвърждение можете да го изберете като подател.
                      </Typography>
                    </Box>
                    <Button startIcon={<AddIcon />} variant="contained" onClick={() => setCreateOpen(true)}>
                      Нов домейн
                    </Button>
                  </Stack>
                </Paper>

                {domains.length === 0 ? (
                  <Alert severity="info">Няма добавени домейни за този проект.</Alert>
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
                                  <Typography variant="caption" color="success.main" fontWeight={700}>Потвърден</Typography>
                                </Stack>
                              ) : (
                                <Typography variant="caption" color="warning.main" fontWeight={700}>Непотвърден</Typography>
                              )}
                            </Stack>
                            <Typography variant="caption" color="text.secondary">
                              Добавен: {new Date(d.createdAt).toLocaleString()}
                            </Typography>
                          </Box>

                          <Stack direction="row" gap={1} flexWrap="wrap">
                            <Button variant="outlined" onClick={() => onVerify(d.id)}>
                              Провери
                            </Button>
                            <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => onDelete(d.id)}>
                              Изтрий
                            </Button>
                          </Stack>
                        </Stack>

                        <Divider sx={{ my: 2 }} />
                        <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
                          DNS записи (копирайте в DNS провайдъра)
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
                  Ако няма потвърден домейн, системата автоматично изпраща от платформения подател.
                </Alert>

                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>
                    Подател
                  </Typography>
                  <Stack gap={2}>
                    <TextField
                      label="Име на подателя (по желание)"
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      placeholder="Напр. Моят Бранд"
                      fullWidth
                    />

                    <FormControl fullWidth>
                      <InputLabel id="domain-select-label">Домейн</InputLabel>
                      <Select
                        labelId="domain-select-label"
                        label="Домейн"
                        value={domainId ?? ''}
                        onChange={(e) => setDomainId(String(e.target.value || '') || null)}
                      >
                        <MenuItem value="">
                          Платформен домейн (по подразбиране)
                        </MenuItem>
                        {domains.map((d) => (
                          <MenuItem key={d.id} value={d.id} disabled={!d.verified}>
                            {d.domain} {d.verified ? '' : '(непотвърден)'}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <TextField
                      label="Имейл на подателя"
                      value={fromEmail}
                      onChange={(e) => setFromEmail(e.target.value)}
                      placeholder={domainId ? 'hello@yourdomain.com' : 'no-reply@myplatform.com'}
                      fullWidth
                    />

                    <Stack direction="row" gap={1} justifyContent="flex-end" flexWrap="wrap">
                      <Button variant="contained" onClick={onSaveSender}>
                        Запази
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>

                {settings && (
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                    <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>Текущо</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Подател: {settings.fromEmail}{settings.fromName ? ` (${settings.fromName})` : ''}<br />
                      Домейн: {settings.domain ?? 'Платформен'}<br />
                      Потвърден: {settings.verified ? 'Да' : 'Не'}
                    </Typography>
                  </Paper>
                )}
              </Stack>
            )}

            {tab === 'templates' && (
              <Stack gap={2}>
                <Alert severity="info">
                  Шаблоните поддържат променливи като <code>{`{{name}}`}</code>, <code>{`{{email}}`}</code>, <code>{`{{message}}`}</code>.
                </Alert>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
                    <FormControl sx={{ minWidth: 280 }}>
                      <InputLabel id="event-type-label">Събитие</InputLabel>
                      <Select
                        labelId="event-type-label"
                        label="Събитие"
                        value={templateEventType}
                        onChange={(e) => setTemplateEventType(String(e.target.value))}
                      >
                        {EVENT_TYPES.map((e) => (
                          <MenuItem key={e.key} value={e.key}>
                            {e.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Box sx={{ flex: 1 }} />
                    <Button variant="contained" onClick={onSaveTemplate}>
                      Запази шаблон
                    </Button>
                  </Stack>

                  <Divider sx={{ my: 2 }} />

                  <Stack gap={2}>
                    <TextField
                      label="Тема"
                      value={templateSubject}
                      onChange={(e) => setTemplateSubject(e.target.value)}
                      fullWidth
                    />
                    <TextField
                      label="HTML"
                      value={templateHtml}
                      onChange={(e) => setTemplateHtml(e.target.value)}
                      multiline
                      minRows={12}
                      fullWidth
                    />
                    {!templateByType.get(templateEventType) && (
                      <Alert severity="warning">
                        Няма запазен шаблон за това събитие. Ако запазите, ще се използва вместо вградения по подразбиране.
                      </Alert>
                    )}
                  </Stack>
                </Paper>
              </Stack>
            )}
          </>
        )}
      </Container>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Нов домейн</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            <Alert severity="info">
              След добавяне ще получите DNS записи. След като ги настроите, натиснете „Провери“.
            </Alert>
            <TextField
              label="Домейн"
              value={createDomain}
              onChange={(e) => setCreateDomain(e.target.value)}
              placeholder="example.com"
              fullWidth
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Отказ</Button>
          <Button variant="contained" onClick={onCreateDomain} disabled={!createDomain.trim()}>
            Добави
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

