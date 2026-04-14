import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, List, ListItem, ListItemText, Divider, CircularProgress,
  Alert, Stack, Tooltip, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArticleIcon from '@mui/icons-material/Article';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { AdminField, inferFieldType, renderField } from '../lib/adminFields';

const MAX_FILE_BYTES = 7 * 1024 * 1024;

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
}

type Row = Record<string, unknown>;
type TypedModel = { name: string; fields: AdminField[] | null };

export default function BlogPanel({ projectId, runPort }: Props) {
  const { t } = useTranslation();

  const previewImageUrl = (raw: unknown): string => {
    const url = typeof raw === 'string' ? raw : '';
    if (!url) return '';
    if (url.startsWith('uploads/')) return `/preview-app/${projectId}/${url}`;
    return url;
  };

  const [models, setModels] = useState<TypedModel[] | null>(null);
  const [modelsError, setModelsError] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldUploading, setFieldUploading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.getCatalogModels(projectId)
      .then(({ models: m }) => {
        setModels(m);
        if (m.length > 0) setActiveModel(m[0].name);
      })
      .catch(() => setModelsError(true));
  }, [projectId]);

  const fetchRows = useCallback(async (model: string) => {
    if (!runPort) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/preview-app/${projectId}/api/${model}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      setRows(Array.isArray(data) ? (data as Row[]) : []);
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, runPort]);

  useEffect(() => {
    if (activeModel && runPort) fetchRows(activeModel);
    else if (!runPort) { setRows([]); setLoading(false); }
  }, [activeModel, runPort, fetchRows]);

  const activeTypedModel = models?.find((m) => m.name === activeModel) ?? null;

  const typedFields: AdminField[] = activeTypedModel?.fields
    ?? (rows && rows.length > 0
      ? Object.keys(rows[0]).filter((k) => k !== 'id').map((k) => ({ name: k, type: inferFieldType(k) }))
      : []);

  const fields = typedFields.map((f) => f.name);

  const titleField =
    fields.find((f) => /title|heading|name|subject/.test(f.toLowerCase())) ??
    fields[0] ?? 'title';
  const dateField = fields.find((f) => /date|publishedat|createdat|postedat/.test(f.toLowerCase()));
  const authorField = fields.find((f) => /author|by|writer|creator/.test(f.toLowerCase()));

  const openAdd = () => {
    setEditing(null);
    setFormValues(Object.fromEntries(fields.map((k) => [k, ''])));
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
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDialogOpen(false);
      await fetchRows(activeModel);
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
      const res = await fetch(
        `/preview-app/${projectId}/api/${activeModel}/${deleteTarget.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDeleteTarget(null);
      await fetchRows(activeModel);
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

  if (!runPort) {
    return <Alert severity="info" sx={{ m: 2 }}>{t('catalog.notRunning')}</Alert>;
  }

  if (modelsError || (models !== null && models.length === 0)) {
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

      {models.length > 1 && (
        <Box sx={{ px: 2, pt: 1.5, pb: 1, flexShrink: 0 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>{t('catalog.modelLabel')}</InputLabel>
            <Select
              label={t('catalog.modelLabel')}
              value={activeModel ?? ''}
              onChange={(e) => { setActiveModel(e.target.value); setRows(null); }}
            >
              {models.map((m) => (
                <MenuItem key={m.name} value={m.name}>{m.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      )}

      <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, fontWeight: 600 }}>
          {loading ? '…' : `${rows?.length ?? 0} ${activeModel ?? ''}`}
        </Typography>
        <Button
          size="small" variant="contained" startIcon={<AddIcon />} onClick={openAdd}
          disabled={loading || fields.length === 0}
          sx={{ fontSize: 11, py: 0.4 }}
        >
          {t('blog.addPost')}
        </Button>
      </Box>
      <Divider />

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {!loading && fetchError && (
        <Stack spacing={1.5} sx={{ m: 2 }}>
          <Alert severity="warning">{t('catalog.fetchError')}</Alert>
          <Button size="small" onClick={() => activeModel && fetchRows(activeModel)}>
            {t('common.retry')}
          </Button>
        </Stack>
      )}

      {!loading && !fetchError && rows?.length === 0 && (
        <Box sx={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 2, p: 3,
        }}>
          <ArticleIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t('blog.empty')}
          </Typography>
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openAdd}
            disabled={fields.length === 0}>
            {t('blog.addFirst')}
          </Button>
        </Box>
      )}

      {!loading && !fetchError && rows && rows.length > 0 && (
        <List dense disablePadding sx={{ flex: 1, overflow: 'auto' }}>
          {rows.map((row, i) => (
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
                <ListItemText
                  primary={String(row[titleField] ?? '—')}
                  secondary={
                    [
                      dateField ? String(row[dateField] ?? '').slice(0, 10) : null,
                      authorField ? String(row[authorField] ?? '') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 600, noWrap: true }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItem>
              {i < rows.length - 1 && <Divider component="li" />}
            </Box>
          ))}
        </List>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle fontWeight={700} sx={{ fontSize: 16 }}>
          {editing ? t('blog.editPost') : t('blog.addPost')}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '12px !important' }}>
          {formError && <Alert severity="error" sx={{ mb: 0.5 }}>{formError}</Alert>}
          {typedFields.map((field) => renderField(
            field,
            (field.type === 'image' || field.type === 'photo')
              ? previewImageUrl(formValues[field.name] ?? '')
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

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}
        PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle fontWeight={700} sx={{ fontSize: 16 }}>{t('catalog.confirmDelete')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('catalog.confirmDeleteBody', { name: String(deleteTarget?.[titleField] ?? '') })}
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
