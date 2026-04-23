import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonIcon from '@mui/icons-material/Person';
import { useTranslation } from 'react-i18next';
import {
  AdminPageHeader,
  AdminPanelLayout,
  AdminSection,
  AdminEmptyState,
  AdminStatusChip,
} from './AdminUI';

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
    <AdminPanelLayout>
      <AdminPageHeader
        tone="secondary"
        icon={<MailOutlineIcon fontSize="small" />}
        title={t('inquiries.heading')}
        subtitle={t('inquiries.subtitle')}
        actions={
          <>
            <AdminStatusChip tone="secondary" label={t('inquiries.total', { n: rows.length })} />
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
              onClick={load}
              disabled={loading || saving}
            >
              {t('inquiries.refresh')}
            </Button>
          </>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={24} />
        </Box>
      ) : sorted.length === 0 ? (
        <AdminSection>
          <AdminEmptyState
            icon={<MailOutlineIcon sx={{ fontSize: 32 }} />}
            title={t('inquiries.emptyTitle')}
            body={t('inquiries.emptyBody')}
          />
        </AdminSection>
      ) : (
        <Stack gap={1.25}>
          {sorted.map((r) => (
            <AdminSection
              key={r.id}
              icon={<PersonIcon sx={{ fontSize: 16 }} />}
              title={r.name || '—'}
              subtitle={[r.email || '—', r.createdAt ? String(r.createdAt) : null].filter(Boolean).join(' • ')}
              actions={
                <Tooltip title={t('inquiries.delete')}>
                  <span>
                    <IconButton size="small" color="error" onClick={() => del(r.id)} disabled={saving}>
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </span>
                </Tooltip>
              }
            >
              <Typography
                variant="body2"
                color="text.primary"
                sx={{
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.7,
                  fontSize: 13.5,
                  bgcolor: 'rgba(255,255,255,0.025)',
                  p: 1.5,
                  borderRadius: 2,
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                {r.message || '—'}
              </Typography>
            </AdminSection>
          ))}
        </Stack>
      )}
    </AdminPanelLayout>
  );
}
