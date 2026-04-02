import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, List, ListItem, ListItemText, ListItemAvatar,
  Avatar, Divider, CircularProgress, Alert, Stack, Tooltip, Select,
  MenuItem, FormControl, InputLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import StorefrontIcon from '@mui/icons-material/Storefront';
import UploadIcon from '@mui/icons-material/Upload';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

const MAX_FILE_BYTES = 7 * 1024 * 1024; // 7 MB

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

function fieldInputType(key: string): 'number' | 'url' | 'textarea' | 'text' {
  const k = key.toLowerCase();
  if (/price|cost|amount|qty|quantity|stock|count|rating/.test(k)) return 'number';
  if (/url|image|img|photo|pic|avatar|thumbnail|cover|banner|logo|picture|media|portrait|backdrop|poster/.test(k)) return 'url';
  if (/description|desc|details|notes|bio|content|body/.test(k)) return 'textarea';
  return 'text';
}

export default function CatalogPanel({ projectId, runPort }: Props) {
  const { t } = useTranslation();

  // Step 1: discover models from server.js
  const [models, setModels] = useState<string[] | null>(null);
  const [modelsError, setModelsError] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);

  // Step 2: fetch rows for the active model
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  // Per-field upload state
  const [fieldUploading, setFieldUploading] = useState<Record<string, boolean>>({});

  // ── Discover models ──────────────────────────────────────────────
  useEffect(() => {
    api.getCatalogModels(projectId)
      .then(({ models: m }) => {
        setModels(m);
        if (m.length > 0) setActiveModel(m[0]);
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

  // ── Field inference ──────────────────────────────────────────────
  // Use keys from first row; fall back to empty list when no data yet
  const fields = rows && rows.length > 0
    ? Object.keys(rows[0]).filter((k) => k !== 'id')
    : [];

  const nameField =
    fields.find((f) => /name|title|label|make|brand|model/.test(f.toLowerCase())) ??
    fields[0] ??
    'name';
  const priceField = fields.find((f) => /price|cost|amount/.test(f.toLowerCase()));
  const imgField = fields.find((f) =>
    /url|image|img|photo|pic|avatar|thumbnail/.test(f.toLowerCase()),
  );

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
        body[f] = fieldInputType(f) === 'number' ? Number(formValues[f]) : formValues[f];
      });
      const base = `/preview-app/${projectId}/api/${activeModel}`;
      const url = editing ? `${base}/${editing.id}` : base;
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
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
      setFormValues((v) => ({ ...v, [field]: url }));
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
              }}
            >
              {models.map((m) => (
                <MenuItem key={m} value={m}>{m}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      )}

      {/* Toolbar */}
      <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, fontWeight: 600 }}>
          {loading ? '…' : `${rows?.length ?? 0} ${activeModel ?? ''}`}
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
                {imgField && (
                  <ListItemAvatar sx={{ minWidth: 48 }}>
                    <Avatar src={String(row[imgField] ?? '')} variant="rounded"
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
              {i < rows.length - 1 && <Divider component="li" />}
            </Box>
          ))}
        </List>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle fontWeight={700} sx={{ fontSize: 16 }}>
          {editing ? t('catalog.editProduct') : t('catalog.addProduct')}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '12px !important' }}>
          {formError && <Alert severity="error" sx={{ mb: 0.5 }}>{formError}</Alert>}
          {Object.keys(formValues).map((f) => {
            const baseType = fieldInputType(f);
            // Also treat any text field whose value already looks like a URL as an image field
            const looksLikeUrl = baseType === 'text' && /^https?:\/\//i.test(formValues[f] ?? '');
            const type = looksLikeUrl ? 'url' : baseType;
            const isUrl = type === 'url';
            const uploading = fieldUploading[f] ?? false;

            if (type === 'textarea') {
              return (
                <TextField key={f} label={f} multiline rows={3} size="small" fullWidth
                  value={formValues[f] ?? ''}
                  onChange={(e) => setFormValues((v) => ({ ...v, [f]: e.target.value }))} />
              );
            }

            if (isUrl) {
              const hasImage = Boolean(formValues[f]);
              return (
                <Box key={f}>
                  <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75, color: 'text.secondary', fontWeight: 600 }}>
                    <CameraAltIcon sx={{ fontSize: 13 }} />
                    {f}
                  </Typography>

                  {/* Clickable upload zone — primary affordance */}
                  <Button
                    component="label"
                    disabled={uploading}
                    fullWidth
                    sx={{
                      p: 0,
                      height: 130,
                      borderRadius: 1.5,
                      border: '1.5px dashed',
                      borderColor: hasImage ? 'transparent' : 'divider',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: hasImage ? 'transparent' : 'action.hover',
                      mb: 1,
                      '&:hover': { borderColor: 'primary.main', bgcolor: hasImage ? 'transparent' : 'action.selected' },
                    }}
                  >
                    {uploading ? (
                      <CircularProgress size={28} />
                    ) : hasImage ? (
                      <Box
                        component="img"
                        src={formValues[f]}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <Stack alignItems="center" gap={0.5}>
                        <UploadIcon sx={{ fontSize: 28, color: 'text.disabled' }} />
                        <Typography variant="caption" color="text.disabled" fontWeight={600}>
                          {t('catalog.clickToUpload')}
                        </Typography>
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
                          {t('catalog.orPasteUrl')}
                        </Typography>
                      </Stack>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageFileSelect(f, file);
                        e.target.value = '';
                      }}
                    />
                  </Button>

                  {/* URL input — secondary */}
                  <TextField
                    label={t('catalog.imageUrl')}
                    type="url"
                    size="small"
                    fullWidth
                    value={formValues[f] ?? ''}
                    onChange={(e) => setFormValues((v) => ({ ...v, [f]: e.target.value }))}
                    placeholder="https://…"
                  />
                </Box>
              );
            }

            // Show a subtle upload hint on any text field that isn't obviously non-image
            // (catches Bulgarian / other-language field names without flooding every field)
            const notImage = /^(name|title|label|brand|make|manufacturer|model|year|color|colour|type|category|status|sku|code|barcode|slug|email|phone|size|weight|condition|fuel|transmission|mileage|seats|style)$/i.test(f);
            const showCameraHint = type === 'text' && !notImage;

            return (
              <TextField key={f} label={f}
                type={type === 'number' ? 'number' : 'text'}
                size="small" fullWidth
                value={formValues[f] ?? ''}
                onChange={(e) => setFormValues((v) => ({ ...v, [f]: e.target.value }))}
                InputProps={showCameraHint ? {
                  endAdornment: (
                    <Tooltip title={t('catalog.uploadImage')}>
                      <IconButton
                        component="label"
                        size="small"
                        disabled={fieldUploading[f] ?? false}
                        sx={{ p: 0.5, opacity: 0.4, '&:hover': { opacity: 1 } }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {fieldUploading[f]
                          ? <CircularProgress size={14} />
                          : <CameraAltIcon sx={{ fontSize: 16 }} />}
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageFileSelect(f, file);
                            e.target.value = '';
                          }}
                        />
                      </IconButton>
                    </Tooltip>
                  ),
                } : undefined}
              />
            );
          })}
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
