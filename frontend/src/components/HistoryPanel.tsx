import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import RestoreIcon from '@mui/icons-material/Restore';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BookmarkRoundedIcon from '@mui/icons-material/BookmarkRounded';
import { useTranslation } from 'react-i18next';

export type HistoryVariant = 'improvement' | 'snapshot';

export interface HistoryItem {
  id: string;
  title: string;
  description?: string | null;
  createdAt: string;
}

interface CommonProps {
  items: HistoryItem[];
  label: string;
  defaultOpen?: boolean;
  onToggleOpen?: (open: boolean) => void;
  emptyHint?: string;
}

interface ImprovementProps extends CommonProps {
  variant: 'improvement';
}

interface SnapshotProps extends CommonProps {
  variant: 'snapshot';
  restoringId?: string | null;
  restoreDisabled?: boolean;
  onRestore: (id: string) => void;
  restoreLabel: string;
  restoringLabel: string;
}

type Props = ImprovementProps | SnapshotProps;

function formatRelative(iso: string, locale: string | undefined): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const now = Date.now();
  const diffMs = now - then;
  const sec = Math.round(diffMs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);

  try {
    const rtf = new Intl.RelativeTimeFormat(locale || undefined, { numeric: 'auto' });
    if (sec < 45) return rtf.format(-sec, 'second');
    if (min < 45) return rtf.format(-min, 'minute');
    if (hr < 22) return rtf.format(-hr, 'hour');
    if (day < 7) return rtf.format(-day, 'day');
    if (day < 30) return rtf.format(-Math.round(day / 7), 'week');
    if (day < 365) return rtf.format(-Math.round(day / 30), 'month');
    return rtf.format(-Math.round(day / 365), 'year');
  } catch {
    return new Date(iso).toLocaleDateString(locale || undefined, {
      day: 'numeric',
      month: 'short',
    });
  }
}

function formatAbsolute(iso: string, locale: string | undefined): string {
  try {
    return new Date(iso).toLocaleString(locale || undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function HistoryPanel(props: Props) {
  const { t, i18n } = useTranslation();
  const { items, label, defaultOpen = false, onToggleOpen, emptyHint, variant } = props;
  const [open, setOpen] = useState(defaultOpen);
  const locale = i18n.language;

  const accent = variant === 'snapshot' ? 'warning.main' : 'primary.main';
  const headerIcon =
    variant === 'snapshot' ? (
      <RestoreIcon sx={{ fontSize: 16 }} />
    ) : (
      <HistoryIcon sx={{ fontSize: 16 }} />
    );
  const itemIcon =
    variant === 'snapshot' ? (
      <BookmarkRoundedIcon sx={{ fontSize: 14, color: '#fff' }} />
    ) : (
      <AutoAwesomeIcon sx={{ fontSize: 13, color: '#fff' }} />
    );

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [items],
  );

  const handleToggle = () => {
    setOpen((prev) => {
      const next = !prev;
      onToggleOpen?.(next);
      return next;
    });
  };

  return (
    <Box
      sx={{
        mt: 1,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: (theme) => alpha(theme.palette.common.white, 0.06),
        bgcolor: (theme) => alpha(theme.palette.common.white, 0.015),
        overflow: 'hidden',
      }}
    >
      <Box
        component="button"
        onClick={handleToggle}
        aria-expanded={open}
        sx={{
          all: 'unset',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          width: '100%',
          cursor: 'pointer',
          py: 1,
          px: 1.25,
          color: 'text.secondary',
          transition: 'background 0.15s, color 0.15s',
          '&:hover': {
            bgcolor: (theme) => alpha(theme.palette.common.white, 0.03),
            color: 'text.primary',
          },
        }}
      >
        <Box
          sx={{
            width: 22,
            height: 22,
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: accent,
            bgcolor: (theme) => alpha(theme.palette[variant === 'snapshot' ? 'warning' : 'primary'].main, 0.12),
            flexShrink: 0,
          }}
        >
          {headerIcon}
        </Box>
        <Typography variant="body2" fontWeight={700} sx={{ flex: 1, fontSize: 12.5, letterSpacing: 0.1, color: 'inherit' }}>
          {label}
        </Typography>
        <Box
          sx={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'text.primary',
            bgcolor: (theme) => alpha(theme.palette.common.white, 0.06),
            transition: 'background 0.15s',
            flexShrink: 0,
          }}
        >
          <ExpandMoreIcon
            sx={{
              fontSize: 18,
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
              color: 'inherit',
              opacity: 0.9,
            }}
          />
        </Box>
      </Box>

      <Collapse in={open} timeout={220} unmountOnExit>
        <Box
          sx={{
            px: 1.25,
            pb: 1.25,
            pt: 0.25,
            maxHeight: 320,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            // Subtle scrollbar styling
            '&::-webkit-scrollbar': { width: 6 },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: (theme) => alpha(theme.palette.common.white, 0.12),
              borderRadius: 3,
            },
            '&::-webkit-scrollbar-thumb:hover': {
              bgcolor: (theme) => alpha(theme.palette.common.white, 0.2),
            },
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.12) transparent',
          }}
        >
          {sortedItems.length === 0 ? (
            <Typography
              variant="caption"
              sx={{ color: 'text.disabled', display: 'block', textAlign: 'center', py: 1.5, fontSize: 12 }}
            >
              {emptyHint ?? t('preview.historyUntitled')}
            </Typography>
          ) : (
            <Stack gap={0.75}>
              {sortedItems.map((item) => (
                <HistoryEntry
                  key={item.id}
                  item={item}
                  variant={variant}
                  itemIcon={itemIcon}
                  accentKey={variant === 'snapshot' ? 'warning' : 'primary'}
                  locale={locale}
                  isRestoring={
                    variant === 'snapshot' && (props as SnapshotProps).restoringId === item.id
                  }
                  restoreDisabled={
                    variant === 'snapshot'
                      ? Boolean((props as SnapshotProps).restoreDisabled)
                      : false
                  }
                  onRestore={
                    variant === 'snapshot'
                      ? () => (props as SnapshotProps).onRestore(item.id)
                      : undefined
                  }
                  restoreLabel={
                    variant === 'snapshot' ? (props as SnapshotProps).restoreLabel : ''
                  }
                  restoringLabel={
                    variant === 'snapshot' ? (props as SnapshotProps).restoringLabel : ''
                  }
                />
              ))}
            </Stack>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

interface EntryProps {
  item: HistoryItem;
  variant: HistoryVariant;
  itemIcon: React.ReactNode;
  accentKey: 'warning' | 'primary';
  locale: string | undefined;
  isRestoring: boolean;
  restoreDisabled: boolean;
  onRestore?: () => void;
  restoreLabel: string;
  restoringLabel: string;
}

function HistoryEntry({
  item,
  variant,
  itemIcon,
  accentKey,
  locale,
  isRestoring,
  restoreDisabled,
  onRestore,
  restoreLabel,
  restoringLabel,
}: EntryProps) {
  const relative = formatRelative(item.createdAt, locale);
  const absolute = formatAbsolute(item.createdAt, locale);
  const description = item.description?.trim();
  const truncatedDescription =
    description && description.length > 220 ? `${description.slice(0, 220)}…` : description;

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        gap: 1.25,
        p: 1.25,
        borderRadius: 2,
        bgcolor: (theme) => alpha(theme.palette.common.white, 0.025),
        border: (theme) => `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
        transition: 'border-color 0.18s, background 0.18s, transform 0.18s',
        '&:hover': {
          borderColor: (theme) => alpha(theme.palette[accentKey].main, 0.35),
          bgcolor: (theme) => alpha(theme.palette[accentKey].main, 0.04),
        },
      }}
    >
      <Box
        sx={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: (theme) =>
            `linear-gradient(135deg, ${theme.palette[accentKey].main}, ${alpha(theme.palette[accentKey].main, 0.65)})`,
          boxShadow: (theme) => `0 4px 12px ${alpha(theme.palette[accentKey].main, 0.35)}`,
          mt: 0.15,
        }}
      >
        {itemIcon}
      </Box>

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.35, flexWrap: 'wrap' }}>
          <Typography
            variant="body2"
            fontWeight={700}
            sx={{
              fontSize: 13,
              lineHeight: 1.35,
              color: 'text.primary',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={item.title}
          >
            {item.title}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontSize: 11,
              color: 'text.disabled',
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            }}
            title={absolute}
          >
            {relative}
          </Typography>
        </Stack>

        {truncatedDescription ? (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              fontSize: 12,
              color: 'text.secondary',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
              mb: variant === 'snapshot' && onRestore ? 1 : 0,
            }}
          >
            {truncatedDescription}
          </Typography>
        ) : null}

        {variant === 'snapshot' && onRestore && (
          <Box sx={{ mt: truncatedDescription ? 0 : 0.5 }}>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              disabled={restoreDisabled}
              onClick={onRestore}
              startIcon={
                isRestoring ? (
                  <CircularProgress size={12} sx={{ color: 'inherit' }} />
                ) : (
                  <RestoreIcon sx={{ fontSize: 14 }} />
                )
              }
              sx={{
                fontSize: 11.5,
                py: 0.35,
                px: 1.25,
                fontWeight: 700,
                textTransform: 'none',
                borderRadius: 1.5,
                borderColor: (theme) => alpha(theme.palette.warning.main, 0.45),
                '&:hover': {
                  borderColor: 'warning.main',
                  bgcolor: (theme) => alpha(theme.palette.warning.main, 0.08),
                },
              }}
            >
              {isRestoring ? restoringLabel : restoreLabel}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
