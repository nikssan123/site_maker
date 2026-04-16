import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';

type Inquiry = {
  id: number;
  name?: string | null;
  email?: string | null;
  message?: string | null;
  createdAt?: string | null;
};

export default function InquiriesPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const API_BASE = useMemo(() => `/preview-app/${projectId}`.replace(/\/$/, ''), [projectId]);
  const [rows, setRows] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function readJsonOrExplain<T>(res: Response): Promise<T> {
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    const text = await res.text();
    if (contentType.includes('text/html') || /^\s*</.test(text)) {
      throw new Error(t('inquiries.errors.noApi'));
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(t('inquiries.errors.invalidJson', { text: text.slice(0, 120) }));
    }
  }

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/inquiries`);
      if (!res.ok) throw new Error((await res.text()).slice(0, 300));
      const data = await readJsonOrExplain<Inquiry[]>(res);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError((e instanceof Error ? e.message : String(e)) || t('inquiries.errors.load'));
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
    } catch (e: unknown) {
      setError((e instanceof Error ? e.message : String(e)) || t('inquiries.errors.delete'));
    } finally {
      setSaving(false);
    }
  };

  const sorted = [...rows].sort((a, b) => String(b.id ?? 0).localeCompare(String(a.id ?? 0)));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: 3,
          borderColor: (theme) => alpha(theme.palette.secondary.main, 0.24),
          background: (theme) =>
            `linear-gradient(135deg, ${alpha(theme.palette.secondary.main, 0.12)}, ${alpha(theme.palette.primary.main, 0.08)})`,
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} gap={1.25}>
          <Stack direction="row" alignItems="center" gap={1}>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 2.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: (theme) => alpha(theme.palette.secondary.main, 0.16),
                color: 'secondary.main',
              }}
            >
              <MailOutlineIcon sx={{ fontSize: 18 }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" fontWeight={800}>
                {t('inquiries.heading')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('inquiries.subtitle')}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" gap={1} sx={{ ml: { sm: 'auto' } }}>
            <Chip
              size="small"
              label={t('inquiries.total', { n: rows.length })}
              sx={{ height: 24, fontSize: 11, bgcolor: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.22)' }}
            />
            <Button size="small" variant="outlined" onClick={load} disabled={loading || saving}>
              {t('inquiries.refresh')}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Box sx={{ flex: 1, overflow: 'auto', mt: 1.5, pr: 0.25 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={18} />
          </Box>
        ) : sorted.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, textAlign: 'center' }}>
            <Typography variant="body1" fontWeight={700}>
              {t('inquiries.emptyTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              {t('inquiries.emptyBody')}
            </Typography>
          </Paper>
        ) : (
          <Stack gap={1.25}>
            {sorted.map((r) => (
              <Paper
                key={r.id}
                variant="outlined"
                sx={{
                  p: 1.75,
                  borderRadius: 3,
                  borderColor: 'rgba(255,255,255,0.08)',
                  bgcolor: 'rgba(255,255,255,0.02)',
                  boxShadow: 'none',
                }}
              >
                <Stack direction="row" alignItems="flex-start" gap={1.25}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 14 }}>
                      {r.name || '—'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                      {r.email || '—'}
                      {r.createdAt ? ` • ${String(r.createdAt)}` : ''}
                    </Typography>
                    <Typography variant="body2" color="text.primary" sx={{ mt: 1.25, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                      {r.message || '—'}
                    </Typography>
                  </Box>
                  <Tooltip title={t('inquiries.delete')}>
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
