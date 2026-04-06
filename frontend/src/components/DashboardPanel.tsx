import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, CircularProgress, Alert, Stack, Divider,
  Table, TableBody, TableCell, TableHead, TableRow, Paper, Chip,
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, fontWeight: 600 }}>
          {models.length} {t('dashboard.models')}
        </Typography>
        <Button
          size="small" startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
          onClick={() => fetchAll(models)}
          sx={{ fontSize: 11, py: 0.4 }}
        >
          {t('dashboard.refresh')}
        </Button>
      </Box>
      <Divider />

      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {models.map((m) => {
          const rows = modelData[m.name] ?? [];
          const allKeys = m.fields
            ? m.fields.map((f) => f.name)
            : rows.length > 0
            ? Object.keys(rows[0]).filter((k) => k !== 'id')
            : [];
          const displayCols = allKeys.slice(0, 4);

          return (
            <Paper key={m.name} variant="outlined" sx={{ borderRadius: 1.5, overflow: 'hidden' }}>
              <Box sx={{ px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'action.hover' }}>
                <BarChartIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography variant="caption" fontWeight={700} sx={{ flex: 1, fontSize: 12 }}>
                  {m.name}
                </Typography>
                <Chip
                  label={`${rows.length} ${t('dashboard.records')}`}
                  size="small"
                  sx={{ height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.75 } }}
                />
              </Box>

              {rows.length === 0 ? (
                <Box sx={{ px: 1.5, py: 1.5 }}>
                  <Typography variant="caption" color="text.disabled">{t('dashboard.noData')}</Typography>
                </Box>
              ) : displayCols.length === 0 ? null : (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {displayCols.map((col) => (
                          <TableCell key={col} sx={{ py: 0.5, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {col}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.slice(0, MAX_ROWS).map((row, i) => (
                        <TableRow key={String(row.id ?? i)}>
                          {displayCols.map((col) => {
                            const fieldDef = m.fields?.find((f) => f.name === col);
                            const type = fieldDef?.type ?? inferFieldType(col);
                            return (
                              <TableCell key={col} sx={{ py: 0.5, fontSize: 11, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                align={type === 'number' ? 'right' : 'left'}>
                                {formatCell(row[col], type)}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {rows.length > MAX_ROWS && (
                    <Box sx={{ px: 1.5, py: 0.75 }}>
                      <Typography variant="caption" color="text.disabled">
                        +{rows.length - MAX_ROWS} {t('dashboard.moreRows')}
                      </Typography>
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
