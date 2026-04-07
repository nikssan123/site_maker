import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  Paper,
  Alert,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import DeleteIcon from '@mui/icons-material/Delete';

type Inquiry = {
  id: number;
  name?: string | null;
  email?: string | null;
  message?: string | null;
  createdAt?: string | null;
};

async function readJsonOrExplain<T>(res: Response): Promise<T> {
  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  const text = await res.text();
  if (contentType.includes('text/html') || /^\s*</.test(text)) {
    throw new Error(
      'Този проект не предоставя API `GET /api/inquiries` (връща HTML вместо JSON). ' +
      'Уверете се, че контактната форма се записва в база данни и че `server.js` има модел/маршрут `inquiries`.',
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Невалиден отговор от сървъра (очаква се JSON): ${text.slice(0, 120)}`);
  }
}

export default function InquiriesPanel({ projectId }: { projectId: string }) {
  const API_BASE = useMemo(() => `/preview-app/${projectId}`.replace(/\/$/, ''), [projectId]);
  const [rows, setRows] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/inquiries`);
      if (!res.ok) throw new Error((await res.text()).slice(0, 300));
      const data = await readJsonOrExplain<Inquiry[]>(res);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError((e instanceof Error ? e.message : String(e)) || 'Грешка при зареждане.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_BASE]);

  const del = async (id: number) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/inquiries/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.text()).slice(0, 300));
      await load();
    } catch (e: any) {
      setError((e instanceof Error ? e.message : String(e)) || 'Грешка при изтриване.');
    } finally {
      setSaving(false);
    }
  };

  const sorted = [...rows].sort((a, b) => String(b.id ?? 0).localeCompare(String(a.id ?? 0)));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderColor: 'rgba(52,211,153,0.25)' }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <MailOutlineIcon sx={{ fontSize: 16, color: '#34d399' }} />
          <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>
            Запитвания
          </Typography>
          <Chip
            size="small"
            label={`${rows.length} общо`}
            sx={{ ml: 'auto', height: 22, fontSize: 11, bgcolor: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.22)' }}
          />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, lineHeight: 1.5 }}>
          Показва съобщенията от контактната форма. API: <code>/api/inquiries</code>
        </Typography>
      </Paper>

      <Box sx={{ flex: 1, overflow: 'auto', mt: 1.5 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}

        <Stack direction="row" justifyContent="flex-end" mb={1}>
          <Button size="small" variant="outlined" onClick={load} disabled={loading || saving}>
            Обнови
          </Button>
        </Stack>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={18} />
          </Box>
        ) : sorted.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Все още няма запитвания.
          </Typography>
        ) : (
          <Stack gap={1}>
            {sorted.map((r) => (
              <Paper key={r.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Stack direction="row" alignItems="flex-start" gap={1.25}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>
                      {r.name || '—'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {r.email || '—'}
                      {r.createdAt ? ` • ${String(r.createdAt)}` : ''}
                    </Typography>
                    <Typography variant="body2" color="text.primary" sx={{ mt: 1, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {r.message || '—'}
                    </Typography>
                  </Box>
                  <Tooltip title="Изтрий">
                    <span>
                      <IconButton size="small" onClick={() => del(r.id)} disabled={saving}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

