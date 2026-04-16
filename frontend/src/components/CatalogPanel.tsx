import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, List, ListItem, ListItemText, ListItemAvatar,
  Avatar, Divider, CircularProgress, Alert, Stack, Tooltip, Select,
  MenuItem, FormControl, InputLabel,
  Pagination,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { AdminField, inferFieldType, renderField } from '../lib/adminFields';
import { fixMojibake } from '../lib/textEncoding';

const MAX_FILE_BYTES = 7 * 1024 * 1024; // 7 MB
const ROWS_PER_PAGE = 25;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

interface Props {
  projectId: string;
  runPort: number | null;
  /** Sent as X-Admin-Token for POST/PUT/DELETE to generated /api (required when app-runner enforces writes). */
  adminApiToken?: string | null;
  /** Called after a successful save or delete so the parent can refresh the preview. */
  onDataChange?: () => void;
}

type Row = Record<string, unknown>;
type TypedModel = { name: string; fields: AdminField[] | null };

export default function CatalogPanel({ projectId, runPort, adminApiToken, onDataChange }: Props) {
  const { t } = useTranslation();
  const modelLabel = (name: string | null | undefined): string => fixMojibake(name ?? '');

  // Step 1: discover models
  const [models, setModels] = useState<TypedModel[] | null>(null);
  const [modelsError, setModelsError] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);

  // Step 2: fetch rows for the active model
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  // Per-field upload state
  const [fieldUploading, setFieldUploading] = useState<Record<string, boolean>>({});

  const runtimeImageUrl = (raw: unknown): string => {
    const url = typeof raw === 'string' ? raw : '';
    if (!url) return '';
    if (url.startsWith('uploads/')) return `/preview-app/${projectId}/${url}`;
    return url;
  };

  const displayImageUrl = (raw: unknown): string => {
    const url = runtimeImageUrl(raw);
    if (!url) return '';
    // Avoid browser caching a 404 while the upload is being written / served.
    // Only apply to our own uploaded assets so external URLs stay untouched.
    const prefix = `/preview-app/${projectId}/uploads/`;
    if (url.startsWith(prefix) && !url.includes('?')) {
      return `${url}?v=${Date.now()}`;
    }
    return url;
  };

  // ── Discover models ──────────────────────────────────────────────
  useEffect(() => {
    api.getCatalogModels(projectId)
      .then(({ models: m }) => {
        setModels(m);
        if (m.length > 0) setActiveModel(m[0].name);
      })
      .catch(() => setModelsError(true));
  }, [projectId]);

  // ── Fetch rows whenever active model or port changes ─────────────
  const fetchRows = useCallback(async (model: string) => {
    if (!runPort) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/preview-app/${projectId}/api/${model}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      setRows(Array.isArray(data) ? (data as Row[]) : []);
      setPage(1);
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : String(e));
      setRows([]);
      setPage(1);
    } finally {
      setLoading(false);
    }
  }, [projectId, runPort]);

  useEffect(() => {
    if (activeModel && runPort) fetchRows(activeModel);
    else if (!runPort) { setRows([]); setLoading(false); }
  }, [activeModel, runPort, fetchRows]);

  // ── Field inference ──────────────────────────────────────────────
  const activeTypedModel = models?.find((m) => m.name === activeModel) ?? null;

  // Typed fields from config; fall back to keys from first data row
  const typedFields: AdminField[] = activeTypedModel?.fields
    ?? (rows && rows.length > 0
      ? Object.keys(rows[0]).filter((k) => k !== 'id').map((k) => ({ name: k, type: inferFieldType(k) }))
      : []);

  const fields = typedFields.map((f) => f.name);
  const totalPages = Math.max(1, Math.ceil((rows?.length ?? 0) / ROWS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = rows?.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE) ?? [];

  const nameField =
    fields.find((f) => /name|title|label|make|brand|model/.test(f.toLowerCase())) ??
    fields[0] ??
    'name';
  const priceField = fields.find((f) => /price|cost|amount/.test(f.toLowerCase()));
  const imgField = typedFields.find((f) => f.type === 'image' || f.type === 'photo')?.name
    ?? fields.find((f) => /url|image|img|photo|pic|avatar|thumbnail/.test(f.toLowerCase()));

  // ── Dialog helpers ───────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    // Use discovered fields if available, otherwise empty form with just one text field
    const f = fields.length > 0 ? fields : [];
    setFormValues(Object.fromEntries(f.map((k) => [k, ''])));
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditing(row);
    setFormValues(Object.fromEntries(fields.map((f) => [f, String(row[f] ?? '')])));
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!activeModel) return;
    setFormError(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      Object.keys(formValues).forEach((f) => {
        const fieldType = typedFields.find((tf) => tf.name === f)?.type ?? inferFieldType(f);
        body[f] = fieldType === 'number' ? Number(formValues[f]) : formValues[f];
      });
      const base = `/preview-app/${projectId}/api/${activeModel}`;
      const url = editing ? `${base}/${editing.id}` : base;
      const method = editing ? 'PUT' : 'POST';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (adminApiToken) headers['X-Admin-Token'] = adminApiToken;
      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDialogOpen(false);
      await fetchRows(activeModel);
      onDataChange?.();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !activeModel) return;
    setSaving(true);
    try {
      const delHeaders: Record<string, string> = {};
      if (adminApiToken) delHeaders['X-Admin-Token'] = adminApiToken;
      const res = await fetch(
        `/preview-app/${projectId}/api/${activeModel}/${deleteTarget.id}`,
        { method: 'DELETE', headers: delHeaders },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDeleteTarget(null);
      await fetchRows(activeModel);
      onDataChange?.();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleImageFileSelect = async (field: string, file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setFormError(t('catalog.fileTooLarge'));
      return;
    }
    setFieldUploading((prev) => ({ ...prev, [field]: true }));
    setFormError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const { url } = await api.uploadImage(projectId, dataUrl, file.name);
      const runtimeUrl = url.startsWith(`/preview-app/${projectId}/uploads/`)
        ? url.replace(`/preview-app/${projectId}/`, '')
        : url;
      setFormValues((v) => ({ ...v, [field]: runtimeUrl }));
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setFieldUploading((prev) => ({ ...prev, [field]: false }));
    }
  };

  // ── Render ───────────────────────────────────────────────────────

  if (!runPort) {
    return <Alert severity="info" sx={{ m: 2 }}>{t('catalog.notRunning')}</Alert>;
  }

  if (modelsError || (models !== null && (models as TypedModel[]).length === 0)) {
    return <Alert severity="warning" sx={{ m: 2 }}>{t('catalog.notAvailable')}</Alert>;
  }

  if (models === null) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Model selector (only when more than one model detected) */}
      {models.length > 1 && (
        <Box sx={{ px: 2, pt: 1.5, pb: 1, flexShrink: 0 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>{t('catalog.modelLabel')}</InputLabel>
            <Select
              label={t('catalog.modelLabel')}
              value={activeModel ?? ''}
              onChange={(e) => {
                setActiveModel(e.target.value);
                setRows(null);
                setPage(1);
              }}
            >
              {models.map((m) => (
                <MenuItem key={m.name} value={m.name}>{modelLabel(m.name)}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      )}

      {/* Toolbar */}
      <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, fontWeight: 600 }}>
          {loading ? '…' : `${rows?.length ?? 0} ${modelLabel(activeModel)}`}
        </Typography>
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openAdd}
          disabled={loading || fields.length === 0}
          sx={{ fontSize: 11, py: 0.4 }}
        >
          {t('catalog.addProduct')}
        </Button>
      </Box>
      <Divider />

      {/* Loading */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {/* Fetch error */}
      {!loading && fetchError && (
        <Stack spacing={1.5} sx={{ m: 2 }}>
          <Alert severity="warning">{t('catalog.fetchError')}</Alert>
          <Button size="small" onClick={() => activeModel && fetchRows(activeModel)}>
            {t('common.retry')}
          </Button>
        </Stack>
      )}

      {/* Empty state */}
      {!loading && !fetchError && rows?.length === 0 && (
        <Box sx={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 2, p: 3,
        }}>
          <StorefrontIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t('catalog.empty')}
          </Typography>
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openAdd}
            disabled={fields.length === 0}>
            {t('catalog.addFirst')}
          </Button>
          {fields.length === 0 && (
            <Typography variant="caption" color="text.disabled" textAlign="center">
              {t('catalog.noFieldsHint')}
            </Typography>
          )}
        </Box>
      )}

      {/* Product list */}
      {!loading && !fetchError && rows && rows.length > 0 && (
        <List dense disablePadding sx={{ flex: 1, overflow: 'auto' }}>
          {pagedRows.map((row, i) => (
            <Box key={String(row.id ?? i)}>
              <ListItem
                sx={{ py: 1, pr: 10 }}
                secondaryAction={
                  <Stack direction="row" gap={0.5}>
                    <Tooltip title={t('catalog.edit')}>
                      <IconButton size="small" onClick={() => openEdit(row)}>
                        <EditIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('catalog.delete')}>
                      <IconButton size="small" color="error" onClick={() => setDeleteTarget(row)}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                }
              >
                {imgField && (
                  <ListItemAvatar sx={{ minWidth: 48 }}>
                    <Avatar src={displayImageUrl(row[imgField])} variant="rounded"
                      sx={{ width: 36, height: 36 }}>
                      <StorefrontIcon sx={{ fontSize: 18 }} />
                    </Avatar>
                  </ListItemAvatar>
                )}
                <ListItemText
                  primary={String(row[nameField] ?? '—')}
                  secondary={priceField != null ? String(row[priceField]) : undefined}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 600, noWrap: true }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItem>
              {i < pagedRows.length - 1 && <Divider component="li" />}
            </Box>
          ))}
        </List>
      )}
      {!loading && !fetchError && rows && rows.length > 0 && totalPages > 1 && (
        <Box
          sx={{
            px: 2,
            py: 1.25,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {`${(currentPage - 1) * ROWS_PER_PAGE + 1}-${Math.min(currentPage * ROWS_PER_PAGE, rows.length)} / ${rows.length}`}
          </Typography>
          <Pagination
            count={totalPages}
            page={currentPage}
            onChange={(_, value) => setPage(value)}
            size="small"
            color="primary"
          />
        </Box>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle fontWeight={700} sx={{ fontSize: 16 }}>
          {editing ? t('catalog.editProduct') : t('catalog.addProduct')}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '12px !important' }}>
          {formError && <Alert severity="error" sx={{ mb: 0.5 }}>{formError}</Alert>}
          {typedFields.map((field) => renderField(
            field,
            (field.type === 'image' || field.type === 'photo')
              ? displayImageUrl(formValues[field.name] ?? '')
              : (formValues[field.name] ?? ''),
            (v) => setFormValues((prev) => ({
              ...prev,
              [field.name]:
                (field.type === 'image' || field.type === 'photo') && v.startsWith(`/preview-app/${projectId}/uploads/`)
                  ? v.replace(`/preview-app/${projectId}/`, '')
                  : v,
            })),
            fieldUploading[field.name] ?? false,
            (file) => handleImageFileSelect(field.name, file),
            { clickToUpload: t('catalog.clickToUpload'), orPasteUrl: t('catalog.orPasteUrl'), imageUrl: t('catalog.imageUrl') },
          ))}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} size="small">{t('common.cancel')}</Button>
          <Button variant="contained" size="small" onClick={handleSave} disabled={saving}
            startIcon={saving ? <CircularProgress size={12} /> : undefined}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}
        PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle fontWeight={700} sx={{ fontSize: 16 }}>{t('catalog.confirmDelete')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('catalog.confirmDeleteBody', { name: String(deleteTarget?.[nameField] ?? '') })}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} size="small">{t('common.cancel')}</Button>
          <Button variant="contained" color="error" size="small" onClick={handleDelete}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={12} /> : undefined}>
            {t('catalog.deleteConfirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
