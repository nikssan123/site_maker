import { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Pagination,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  alpha,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import BarChartIcon from '@mui/icons-material/BarChart';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { AdminField, inferFieldType } from '../lib/adminFields';

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
    return <Alert severity="info" sx={{ m: 2 }}>{t('catalog.notRunning')}</Alert>;
  }

  if (modelsError || (models !== null && models.length === 0)) {
    return <Alert severity="warning" sx={{ m: 2 }}>{t('catalog.notAvailable')}</Alert>;
  }

  if (models === null || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const totalRecords = Object.values(modelData).reduce((sum, rows) => sum + rows.length, 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Paper
        variant="outlined"
        sx={{
          mx: 1.5,
          mt: 1.5,
          p: 2,
          borderRadius: 3,
          borderColor: (theme) => alpha(theme.palette.primary.main, 0.22),
          background: (theme) =>
            `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.14)}, ${alpha(theme.palette.secondary.main, 0.08)})`,
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Stack direction="row" alignItems="center" gap={1}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.18),
                color: 'primary.main',
              }}
            >
              <BarChartIcon sx={{ fontSize: 20 }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" fontWeight={800}>
                {t('dashboard.heading')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('dashboard.subtitle')}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" gap={1} sx={{ ml: { md: 'auto' }, flexWrap: 'wrap' }}>
            <Chip label={`${models.length} ${t('dashboard.models')}`} size="small" />
            <Chip label={`${totalRecords} ${t('dashboard.records')}`} size="small" />
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
              onClick={() => fetchAll(models)}
            >
              {t('dashboard.refresh')}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
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

          return (
            <Paper
              key={m.name}
              variant="outlined"
              sx={{
                borderRadius: 3,
                overflow: 'hidden',
                borderColor: 'rgba(255,255,255,0.08)',
                bgcolor: 'rgba(255,255,255,0.02)',
                boxShadow: 'none',
              }}
            >
              <Box
                sx={{
                  px: 2,
                  py: 1.25,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  bgcolor: (theme) => alpha(theme.palette.common.white, 0.03),
                }}
              >
                <BarChartIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
                <Typography variant="subtitle2" fontWeight={800} sx={{ flex: 1 }}>
                  {m.name}
                </Typography>
                <Chip
                  label={`${rows.length} ${t('dashboard.records')}`}
                  size="small"
                  sx={{ height: 22, fontSize: 11, '& .MuiChip-label': { px: 0.9 } }}
                />
              </Box>

              {rows.length === 0 ? (
                <Box sx={{ px: 2, py: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('dashboard.noData')}
                  </Typography>
                </Box>
              ) : displayCols.length === 0 ? null : (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {displayCols.map((col) => (
                          <TableCell key={col} sx={{ py: 1, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
                            {col}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {visibleRows.map((row, i) => (
                        <TableRow key={String(row.id ?? i)}>
                          {displayCols.map((col) => {
                            const fieldDef = m.fields?.find((f) => f.name === col);
                            const type = fieldDef?.type ?? inferFieldType(col);
                            return (
                              <TableCell
                                key={col}
                                sx={{
                                  py: 1,
                                  fontSize: 12,
                                  maxWidth: 180,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                align={type === 'number' ? 'right' : 'left'}
                              >
                                {formatCell(row[col], type)}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {rows.length > MAX_ROWS && (
                    <Box
                      sx={{
                        px: 2,
                        py: 1,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 1,
                        flexWrap: 'wrap',
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
                </Box>
              )}
            </Paper>
          );
        })}

        {models.length === 0 && (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 4 }}>
            <BarChartIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
            <Typography variant="body2" color="text.secondary">{t('dashboard.noData')}</Typography>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
