import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, Avatar, CircularProgress, Alert, Stack, Tooltip, Select,
  MenuItem, FormControl, InputLabel, Pagination,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { AdminField, inferFieldType, renderField } from '../lib/adminFields';
import { fixMojibake } from '../lib/textEncoding';
import {
  AdminPageHeader,
  AdminPanelLayout,
  AdminSection,
  AdminEmptyState,
  AdminStatusChip,
  AdminDataTable,
  type AdminTableColumn,
} from './AdminUI';

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

  const [models, setModels] = useState<TypedModel[] | null>(null);
  const [modelsError, setModelsError] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
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
    const prefix = `/preview-app/${projectId}/uploads/`;
    if (url.startsWith(prefix) && !url.includes('?')) {
      return `${url}?v=${Date.now()}`;
    }
    return url;
  };

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

  const activeTypedModel = models?.find((m) => m.name === activeModel) ?? null;

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

  // A small set of additional preview columns (skip the ones already shown)
  const detailColumns = fields
    .filter((f) => f !== nameField && f !== priceField && f !== imgField)
    .slice(0, 2);

  const openAdd = () => {
    setEditing(null);
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

  if (!runPort) {
    return (
      <AdminPanelLayout>
        <Alert severity="info">{t('catalog.notRunning')}</Alert>
      </AdminPanelLayout>
    );
  }

  if (modelsError || (models !== null && (models as TypedModel[]).length === 0)) {
    return (
      <AdminPanelLayout>
        <Alert severity="warning">{t('catalog.notAvailable')}</Alert>
      </AdminPanelLayout>
    );
  }

  if (models === null) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const formatCellText = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—';
    return String(v).slice(0, 80);
  };

  const columns: AdminTableColumn<Row>[] = [];
  if (imgField) {
    columns.push({
      key: '__image',
      header: '',
      width: 64,
      cell: (row) => (
        <Avatar
          src={displayImageUrl(row[imgField])}
          variant="rounded"
          sx={{ width: 40, height: 40, bgcolor: 'rgba(255,255,255,0.04)' }}
        >
          <StorefrontIcon sx={{ fontSize: 20 }} />
        </Avatar>
      ),
    });
  }
  columns.push({
    key: nameField,
    header: nameField,
    minWidth: 180,
    cell: (row) => (
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {String(row[nameField] ?? '—')}
      </Typography>
    ),
  });
  detailColumns.forEach((col) => {
    columns.push({
      key: col,
      header: col,
      truncate: 200,
      cell: (row) => (
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
          {formatCellText(row[col])}
        </Typography>
      ),
    });
  });
  if (priceField) {
    columns.push({
      key: priceField,
      header: priceField,
      align: 'right',
      width: 110,
      cell: (row) => (
        <Typography variant="body2" sx={{ fontWeight: 700, color: 'secondary.main' }}>
          {formatCellText(row[priceField])}
        </Typography>
      ),
    });
  }

  return (
    <>
      <AdminPanelLayout>
        <AdminPageHeader
          icon={<StorefrontIcon fontSize="small" />}
          title={t(`adminWorkspace.titles.catalog`) || modelLabel(activeModel)}
          subtitle={t(`adminWorkspace.subtitles.catalog`)}
          actions={
            <>
              <AdminStatusChip
                tone="primary"
                label={loading ? '…' : `${rows?.length ?? 0} ${modelLabel(activeModel)}`}
              />
              <Button
                size="small"
                variant="contained"
                startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                onClick={openAdd}
                disabled={loading || fields.length === 0}
              >
                {t('catalog.addProduct')}
              </Button>
            </>
          }
        />

        {models.length > 1 && (
          <AdminSection dense>
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
          </AdminSection>
        )}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {!loading && fetchError && (
          <AdminSection>
            <Stack spacing={1.5}>
              <Alert severity="warning">{t('catalog.fetchError')}</Alert>
              <Box>
                <Button size="small" variant="outlined" onClick={() => activeModel && fetchRows(activeModel)}>
                  {t('common.retry')}
                </Button>
              </Box>
            </Stack>
          </AdminSection>
        )}

        {!loading && !fetchError && rows?.length === 0 && (
          <AdminSection>
            <AdminEmptyState
              icon={<StorefrontIcon sx={{ fontSize: 32 }} />}
              title={t('catalog.empty')}
              action={
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                  onClick={openAdd}
                  disabled={fields.length === 0}
                >
                  {t('catalog.addFirst')}
                </Button>
              }
              hint={fields.length === 0 ? t('catalog.noFieldsHint') : undefined}
            />
          </AdminSection>
        )}

        {!loading && !fetchError && rows && rows.length > 0 && (
          <AdminSection bodyPadding={0}>
            <AdminDataTable
              columns={columns}
              rows={pagedRows}
              rowKey={(row, i) => String(row.id ?? i)}
              actions={(row) => (
                <>
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
                </>
              )}
            />
            {totalPages > 1 && (
              <Box
                sx={{
                  px: 2,
                  py: 1.25,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 1,
                  flexWrap: 'wrap',
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <Typography variant="caption" color="text.disabled">
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
          </AdminSection>
        )}
      </AdminPanelLayout>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
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
        PaperProps={{ sx: { borderRadius: 3 } }}>
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
    </>
  );
}
