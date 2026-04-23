import { type ReactNode } from 'react';
import {
  Box,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  alpha,
} from '@mui/material';

type Tone = 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'neutral';

const toneColor = (tone: Tone) => {
  switch (tone) {
    case 'primary':
      return '#6366f1';
    case 'secondary':
      return '#10b981';
    case 'success':
      return '#22c55e';
    case 'warning':
      return '#f59e0b';
    case 'info':
      return '#06b6d4';
    case 'neutral':
    default:
      return '#94a3b8';
  }
};

export function AdminPageHeader({
  icon,
  title,
  subtitle,
  actions,
  tone = 'primary',
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  tone?: Tone;
}) {
  const color = toneColor(tone);
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 1.75, md: 2.25 },
        borderRadius: 3,
        borderColor: alpha(color, 0.2),
        background: `linear-gradient(135deg, ${alpha(color, 0.16)} 0%, ${alpha(color, 0.04)} 60%, transparent 100%)`,
        boxShadow: 'none',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        gap={1.5}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
      >
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0 }}>
          {icon && (
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: 2.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha(color, 0.18),
                color,
                flexShrink: 0,
              }}
            >
              {icon}
            </Box>
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, lineHeight: 1.5 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
        </Stack>
        {actions && (
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ flexShrink: 0 }}>
            {actions}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

export function AdminSection({
  icon,
  title,
  subtitle,
  actions,
  children,
  dense = false,
  bodyPadding,
}: {
  icon?: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  dense?: boolean;
  bodyPadding?: number | string;
}) {
  const showHeader = Boolean(title || actions);
  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 3,
        borderColor: 'rgba(255,255,255,0.07)',
        bgcolor: 'rgba(255,255,255,0.02)',
        boxShadow: 'none',
        overflow: 'hidden',
      }}
    >
      {showHeader && (
        <Box
          sx={{
            px: 2,
            py: dense ? 1 : 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            bgcolor: 'rgba(255,255,255,0.015)',
          }}
        >
          {icon && (
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'rgba(99,102,241,0.12)',
                color: 'primary.main',
                flexShrink: 0,
              }}
            >
              {icon}
            </Box>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {title && (
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.1, lineHeight: 1.3 }}
              >
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.4 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {actions && (
            <Stack direction="row" gap={0.75} sx={{ flexShrink: 0 }}>
              {actions}
            </Stack>
          )}
        </Box>
      )}
      <Box sx={{ p: bodyPadding ?? (dense ? 1.25 : 2) }}>{children}</Box>
    </Paper>
  );
}

export function AdminEmptyState({
  icon,
  title,
  body,
  action,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  hint?: string;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        py: 6,
        px: 3,
        textAlign: 'center',
      }}
    >
      {icon && (
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(99,102,241,0.10)',
            color: 'primary.main',
            mb: 0.5,
          }}
        >
          {icon}
        </Box>
      )}
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {body && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420, lineHeight: 1.6 }}>
          {body}
        </Typography>
      )}
      {action && <Box sx={{ mt: 0.5 }}>{action}</Box>}
      {hint && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 1 }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}

export function AdminStatusChip({
  label,
  tone = 'neutral',
  icon,
  size = 'small',
}: {
  label: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  size?: 'small' | 'medium';
}) {
  const color = toneColor(tone);
  return (
    <Chip
      icon={icon as any}
      label={label}
      size={size}
      sx={{
        height: size === 'small' ? 24 : 28,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.2,
        color,
        bgcolor: alpha(color, 0.12),
        border: `1px solid ${alpha(color, 0.28)}`,
        '& .MuiChip-icon': { color, fontSize: 14, ml: 0.5 },
        '& .MuiChip-label': { px: 1 },
      }}
    />
  );
}

export interface AdminTableColumn<T> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  minWidth?: number | string;
  /** Truncate cell text and show ellipsis after this max width */
  truncate?: number;
  cell: (row: T, index: number) => ReactNode;
}

export function AdminDataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  actions,
  size = 'medium',
  stickyHeader = true,
  maxHeight,
}: {
  columns: AdminTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  onRowClick?: (row: T) => void;
  actions?: (row: T) => ReactNode;
  size?: 'small' | 'medium';
  stickyHeader?: boolean;
  maxHeight?: number | string;
}) {
  const cellPadY = size === 'small' ? 1 : 1.4;
  return (
    <TableContainer sx={{ maxHeight, borderRadius: 0 }}>
      <Table size={size === 'small' ? 'small' : 'medium'} stickyHeader={stickyHeader}>
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <TableCell
                key={col.key}
                align={col.align ?? 'left'}
                sx={{
                  py: 1.1,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: 'text.secondary',
                  bgcolor: 'rgba(255,255,255,0.025)',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  whiteSpace: 'nowrap',
                  width: col.width,
                  minWidth: col.minWidth,
                }}
              >
                {col.header}
              </TableCell>
            ))}
            {actions && (
              <TableCell
                align="right"
                sx={{
                  py: 1.1,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: 'text.secondary',
                  bgcolor: 'rgba(255,255,255,0.025)',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  width: 96,
                }}
              />
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow
              key={rowKey(row, i)}
              hover
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              sx={{
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background 0.15s ease',
                '&:nth-of-type(even)': { bgcolor: 'rgba(255,255,255,0.012)' },
                '&:hover': { bgcolor: 'rgba(99,102,241,0.07) !important' },
                '& td': { borderBottom: '1px solid rgba(255,255,255,0.04)' },
                '&:last-of-type td': { borderBottom: 'none' },
              }}
            >
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  align={col.align ?? 'left'}
                  sx={{
                    py: cellPadY,
                    fontSize: 13,
                    color: 'text.primary',
                    maxWidth: col.truncate,
                    overflow: col.truncate ? 'hidden' : undefined,
                    textOverflow: col.truncate ? 'ellipsis' : undefined,
                    whiteSpace: col.truncate ? 'nowrap' : undefined,
                  }}
                >
                  {col.cell(row, i)}
                </TableCell>
              ))}
              {actions && (
                <TableCell align="right" sx={{ py: cellPadY }}>
                  <Stack direction="row" gap={0.25} justifyContent="flex-end" onClick={(e) => e.stopPropagation()}>
                    {actions(row)}
                  </Stack>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** Standard panel container: provides scrollable body, consistent padding & gap. */
export function AdminPanelLayout({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        WebkitOverflowScrolling: 'touch',
        p: { xs: 1.5, md: 2 },
      }}
    >
      <Stack gap={2}>{children}</Stack>
    </Box>
  );
}
