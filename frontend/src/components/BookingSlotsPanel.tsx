import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  Paper,
  Alert,
  Button,
  Chip,
  TextField,
  Divider,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/bg';
import { useTranslation } from 'react-i18next';

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

    // If we got the SPA HTML fallback, Vite/Express likely served index.html instead of an API.
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
      // Some implementations return the created row; others return ok:true. Either way, re-load.
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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderColor: 'rgba(99,102,241,0.2)' }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <CalendarMonthIcon sx={{ fontSize: 16, color: 'primary.main' }} />
          <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>
            {t('bookingSlots.heading')}
          </Typography>
          <Chip
            size="small"
            label={t('bookingSlots.chip')}
            sx={{ ml: 'auto', height: 22, fontSize: 11, bgcolor: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
          />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, lineHeight: 1.5 }}>
          <span dangerouslySetInnerHTML={{ __html: t('bookingSlots.intro') }} />
        </Typography>
      </Paper>

      <Box sx={{ flex: 1, overflow: 'auto', mt: 1.5 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}

        <Stack gap={1.5}>
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
            <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={locale}>
              <DateCalendar
                value={selectedDate}
                onChange={(v) => { if (v) setSelectedDate(v); }}
              />
            </LocalizationProvider>
          </Paper>

          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
            <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13, mb: 1 }}>
              {t('bookingSlots.markHeading')}
            </Typography>

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
                  sx={{ fontWeight: 800 }}
                >
                  {saving ? t('bookingSlots.saving') : t('bookingSlots.markCta')}
                </Button>
              </Stack>
            </LocalizationProvider>
          </Paper>

          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>
                {t('bookingSlots.listHeading', { date: selectedDate.locale(locale).format('D MMM YYYY') })}
              </Typography>
              <Button size="small" variant="outlined" onClick={load} disabled={loading || saving}>
                {t('bookingSlots.refresh')}
              </Button>
            </Stack>
            <Divider sx={{ mb: 1.25 }} />

            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={18} />
              </Box>
            ) : daySlots.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('bookingSlots.none')}
              </Typography>
            ) : (
              <Stack gap={0.75}>
                {daySlots.map((s) => (
                  <Stack key={s.id} direction="row" alignItems="center" gap={1} sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <Chip size="small" label={s.time} sx={{ fontWeight: 800 }} />
                    <Typography variant="body2" color="text.secondary" sx={{ flex: 1, fontSize: 12 }}>
                      {s.note ?? '—'}
                    </Typography>
                    <Tooltip title={t('bookingSlots.remove')}>
                      <span>
                        <IconButton size="small" onClick={() => deleteSlot(s.id)} disabled={saving}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                ))}
              </Stack>
            )}
          </Paper>
        </Stack>
      </Box>
    </Box>
  );
}
