import { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Pagination,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import BarChartIcon from '@mui/icons-material/BarChart';
import StorageIcon from '@mui/icons-material/Storage';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { AdminField, inferFieldType } from '../lib/adminFields';
import {
  AdminPageHeader,
  AdminPanelLayout,
  AdminSection,
  AdminEmptyState,
  AdminStatusChip,
  AdminDataTable,
  type AdminTableColumn,
} from './AdminUI';

interface Props {
  projectId: string;
  runPort: number | null;
}

type Row = Record<string, unknown>;
type TypedModel = { name: string; fields: AdminField[] | null };

const MAX_ROWS = 5;

function formatCell(value: unknown, type: string): string {
  if (value === null || value === undefined) return '—';
  if (type === 'date') return String(value).slice(0, 10);
  if (type === 'number') return String(Number(value));
  return String(value).slice(0, 60);
}

export default function DashboardPanel({ projectId, runPort }: Props) {
  const { t } = useTranslation();

  const [models, setModels] = useState<TypedModel[] | null>(null);
  const [modelsError, setModelsError] = useState(false);
  const [modelData, setModelData] = useState<Record<string, Row[]>>({});
  const [loading, setLoading] = useState(false);
  const [modelPages, setModelPages] = useState<Record<string, number>>({});

  useEffect(() => {
    api.getCatalogModels(projectId)
      .then(({ models: m }) => setModels(m))
      .catch(() => setModelsError(true));
  }, [projectId]);

  const fetchAll = useCallback(async (ms: TypedModel[]) => {
    if (!runPort || ms.length === 0) return;
    setLoading(true);
    const results: Record<string, Row[]> = {};
    await Promise.all(ms.map(async (m) => {
      try {
        const res = await fetch(`/preview-app/${projectId}/api/${m.name}`);
        if (!res.ok) return;
        const data: unknown = await res.json();
        results[m.name] = Array.isArray(data) ? (data as Row[]) : [];
      } catch {
        results[m.name] = [];
      }
    }));
    setModelData(results);
    setModelPages((prev) => {
      const next: Record<string, number> = {};
      for (const m of ms) next[m.name] = prev[m.name] ?? 1;
      return next;
    });
    setLoading(false);
  }, [projectId, runPort]);

  useEffect(() => {
    if (models && runPort) fetchAll(models);
  }, [models, runPort, fetchAll]);

  if (!runPort) {
    return (
      <AdminPanelLayout>
        <Alert severity="info">{t('catalog.notRunning')}</Alert>
      </AdminPanelLayout>
    );
  }

  if (modelsError || (models !== null && models.length === 0)) {
    return (
      <AdminPanelLayout>
        <Alert severity="warning">{t('catalog.notAvailable')}</Alert>
      </AdminPanelLayout>
    );
  }

  if (models === null || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const totalRecords = Object.values(modelData).reduce((sum, rows) => sum + rows.length, 0);

  return (
    <AdminPanelLayout>
      <AdminPageHeader
        icon={<BarChartIcon fontSize="small" />}
        title={t('dashboard.heading')}
        subtitle={t('dashboard.subtitle')}
        actions={
          <>
            <AdminStatusChip tone="primary" label={`${models.length} ${t('dashboard.models')}`} />
            <AdminStatusChip tone="secondary" label={`${totalRecords} ${t('dashboard.records')}`} />
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
              onClick={() => fetchAll(models)}
            >
              {t('dashboard.refresh')}
            </Button>
          </>
        }
      />

      {models.map((m) => {
        const rows = modelData[m.name] ?? [];
        const totalPages = Math.max(1, Math.ceil(rows.length / MAX_ROWS));
        const currentPage = Math.min(modelPages[m.name] ?? 1, totalPages);
        const visibleRows = rows.slice((currentPage - 1) * MAX_ROWS, currentPage * MAX_ROWS);
        const allKeys = m.fields
          ? m.fields.map((f) => f.name)
          : rows.length > 0
          ? Object.keys(rows[0]).filter((k) => k !== 'id')
          : [];
        const displayCols = allKeys.slice(0, 4);

        const columns: AdminTableColumn<Row>[] = displayCols.map((col) => {
          const fieldDef = m.fields?.find((f) => f.name === col);
          const type = fieldDef?.type ?? inferFieldType(col);
          return {
            key: col,
            header: col,
            align: type === 'number' ? 'right' : 'left',
            truncate: 220,
            cell: (row) => formatCell(row[col], type),
          };
        });

        return (
          <AdminSection
            key={m.name}
            icon={<StorageIcon sx={{ fontSize: 16 }} />}
            title={m.name}
            actions={
              <AdminStatusChip tone="neutral" label={`${rows.length} ${t('dashboard.records')}`} />
            }
            bodyPadding={0}
          >
            {rows.length === 0 ? (
              <Box sx={{ px: 2, py: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  {t('dashboard.noData')}
                </Typography>
              </Box>
            ) : displayCols.length === 0 ? null : (
              <>
                <AdminDataTable
                  columns={columns}
                  rows={visibleRows}
                  rowKey={(row, i) => String(row.id ?? i)}
                  size="small"
                />
                {rows.length > MAX_ROWS && (
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
                      {`${(currentPage - 1) * MAX_ROWS + 1}-${Math.min(currentPage * MAX_ROWS, rows.length)} / ${rows.length}`}
                    </Typography>
                    <Pagination
                      count={totalPages}
                      page={currentPage}
                      onChange={(_, value) => setModelPages((prev) => ({ ...prev, [m.name]: value }))}
                      size="small"
                      color="primary"
                    />
                  </Box>
                )}
              </>
            )}
          </AdminSection>
        );
      })}

      {models.length === 0 && (
        <AdminSection>
          <AdminEmptyState
            icon={<BarChartIcon sx={{ fontSize: 32 }} />}
            title={t('dashboard.noData')}
          />
        </AdminSection>
      )}
    </AdminPanelLayout>
  );
}
