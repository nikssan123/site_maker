import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  Alert,
  Button,
  TextField,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/bg';
import { useTranslation } from 'react-i18next';
import {
  AdminPageHeader,
  AdminPanelLayout,
  AdminSection,
  AdminStatusChip,
} from './AdminUI';

type TakenSlot = {
  id: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  note?: string | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(d: Dayjs): string {
  return `${d.year()}-${pad2(d.month() + 1)}-${pad2(d.date())}`;
}

function formatTime(t: Dayjs): string {
  return `${pad2(t.hour())}:${pad2(t.minute())}`;
}

export default function BookingSlotsPanel({
  projectId,
  adminApiToken,
}: {
  projectId: string;
  adminApiToken?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const API_BASE = useMemo(() => `/preview-app/${projectId}`.replace(/\/$/, ''), [projectId]);
  const locale = i18n.language === 'en' ? 'en' : 'bg';
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs().locale(locale));
  const [slots, setSlots] = useState<TakenSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [time, setTime] = useState<Dayjs>(dayjs().hour(10).minute(0));
  const [note, setNote] = useState('');

  const dateKey = formatDate(selectedDate);
  const daySlots = slots
    .filter((s) => s.date === dateKey)
    .sort((a, b) => a.time.localeCompare(b.time));

  async function readJsonOrExplain<T>(res: Response): Promise<T> {
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    const text = await res.text();
    if (contentType.includes('text/html') || /^\s*</.test(text)) {
      throw new Error(t('bookingSlots.errors.noApi'));
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(t('bookingSlots.errors.invalidJson', { text: text.slice(0, 120) }));
    }
  }

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/takenSlots`);
      if (!res.ok) throw new Error((await res.text()).slice(0, 300));
      const data = await readJsonOrExplain<TakenSlot[]>(res);
      setSlots(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError((e instanceof Error ? e.message : String(e)) || t('bookingSlots.errors.load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_BASE]);

  const addSlot = async () => {
    const payload = { date: dateKey, time: formatTime(time), note: note.trim() || undefined };
    setSaving(true);
    setError(null);
    try {
      const postHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (adminApiToken) postHeaders['X-Admin-Token'] = adminApiToken;
      const res = await fetch(`${API_BASE}/api/takenSlots`, {
        method: 'POST',
        headers: postHeaders,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.text()).slice(0, 300));
      await load();
      setNote('');
    } catch (e: any) {
      setError((e instanceof Error ? e.message : String(e)) || t('bookingSlots.errors.save'));
    } finally {
      setSaving(false);
    }
  };

  const deleteSlot = async (id: number) => {
    setSaving(true);
    setError(null);
    try {
      const delHeaders: Record<string, string> = {};
      if (adminApiToken) delHeaders['X-Admin-Token'] = adminApiToken;
      const res = await fetch(`${API_BASE}/api/takenSlots/${id}`, { method: 'DELETE', headers: delHeaders });
      if (!res.ok) throw new Error((await res.text()).slice(0, 300));
      await load();
    } catch (e: any) {
      setError((e instanceof Error ? e.message : String(e)) || t('bookingSlots.errors.delete'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPanelLayout>
      <AdminPageHeader
        icon={<CalendarMonthIcon fontSize="small" />}
        title={t('bookingSlots.heading')}
        subtitle={t('bookingSlots.chip')}
      />

      <Alert severity="info" icon={<CalendarMonthIcon fontSize="small" />}>
        <span dangerouslySetInnerHTML={{ __html: t('bookingSlots.intro') }} />
      </Alert>

      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems="stretch">
        <Box sx={{ flex: { md: '0 0 320px' }, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <AdminSection
            icon={<CalendarMonthIcon sx={{ fontSize: 16 }} />}
            title={t('bookingSlots.heading')}
            dense
            bodyPadding={0.5}
          >
            <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={locale}>
              <DateCalendar
                value={selectedDate}
                onChange={(v) => { if (v) setSelectedDate(v); }}
              />
            </LocalizationProvider>
          </AdminSection>

          <AdminSection
            icon={<EventAvailableIcon sx={{ fontSize: 16 }} />}
            title={t('bookingSlots.markHeading')}
          >
            <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={locale}>
              <Stack gap={1.25}>
                <TimePicker
                  label={t('bookingSlots.timeLabel')}
                  value={time}
                  onChange={(v) => { if (v) setTime(v); }}
                  minutesStep={5}
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />
                <TextField
                  size="small"
                  label={t('bookingSlots.noteLabel')}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('bookingSlots.notePlaceholder')}
                  fullWidth
                />
                <Button
                  variant="contained"
                  onClick={addSlot}
                  disabled={saving}
                  sx={{ fontWeight: 700 }}
                >
                  {saving ? t('bookingSlots.saving') : t('bookingSlots.markCta')}
                </Button>
              </Stack>
            </LocalizationProvider>
          </AdminSection>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <AdminSection
            icon={<AccessTimeIcon sx={{ fontSize: 16 }} />}
            title={t('bookingSlots.listHeading', { date: selectedDate.locale(locale).format('D MMM YYYY') })}
            actions={
              <>
                <AdminStatusChip tone="primary" label={daySlots.length} />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
                  onClick={load}
                  disabled={loading || saving}
                >
                  {t('bookingSlots.refresh')}
                </Button>
              </>
            }
            bodyPadding={1.5}
          >
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={20} />
              </Box>
            ) : daySlots.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <AccessTimeIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  {t('bookingSlots.none')}
                </Typography>
              </Box>
            ) : (
              <Stack gap={0.75}>
                {daySlots.map((s) => (
                  <Stack
                    key={s.id}
                    direction="row"
                    alignItems="center"
                    gap={1.25}
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderRadius: 2,
                      bgcolor: 'rgba(255,255,255,0.025)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      transition: 'background 0.15s ease',
                      '&:hover': { bgcolor: 'rgba(99,102,241,0.06)' },
                    }}
                  >
                    <Box
                      sx={{
                        minWidth: 56,
                        textAlign: 'center',
                        py: 0.5,
                        px: 1,
                        borderRadius: 1.5,
                        bgcolor: 'rgba(99,102,241,0.14)',
                        color: 'primary.main',
                        fontWeight: 800,
                        fontSize: 13,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {s.time}
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{ flex: 1, color: s.note ? 'text.primary' : 'text.disabled', fontSize: 13 }}
                    >
                      {s.note ?? '—'}
                    </Typography>
                    <Tooltip title={t('bookingSlots.remove')}>
                      <span>
                        <IconButton size="small" color="error" onClick={() => deleteSlot(s.id)} disabled={saving}>
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                ))}
              </Stack>
            )}
          </AdminSection>
        </Box>
      </Stack>
    </AdminPanelLayout>
  );
}
