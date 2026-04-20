import { useMemo, useState, useRef } from 'react';
import {
  Box, Typography, TextField, InputAdornment, Tabs, Tab,
  Button, Stack, ToggleButtonGroup, ToggleButton, Alert,
} from '@mui/material';
import * as MuiIcons from '@mui/icons-material';
import SearchIcon from '@mui/icons-material/Search';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useTranslation } from 'react-i18next';
import { ICON_CATEGORIES, ICON_NAMES, type IconCatalogEntry } from '../lib/iconCatalog';

export interface IconPickResult {
  kind: 'library' | 'upload';
  name?: string;
  dataUrl?: string;
  filename?: string;
}

interface Props {
  onPick: (result: IconPickResult) => void;
  /** When true, reduce outer padding so the body fits comfortably inside another dialog. */
  compact?: boolean;
}

function LazyIcon({ name, size = 24 }: { name: string; size?: number }) {
  const Component = (MuiIcons as Record<string, React.ComponentType<{ sx?: unknown }>>)[name];
  if (!Component) {
    return <Box sx={{ width: size, height: size, bgcolor: 'error.main', opacity: 0.2, borderRadius: 0.5 }} />;
  }
  return <Component sx={{ fontSize: size }} />;
}

export default function IconPickerBody({ onPick, compact = false }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'library' | 'upload'>('library');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [uploadPreview, setUploadPreview] = useState<{ dataUrl: string; filename: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredIcons: IconCatalogEntry[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source =
      categoryId === 'all'
        ? ICON_NAMES.map((n) => ({ name: n }))
        : ICON_CATEGORIES.find((c) => c.id === categoryId)?.icons ?? [];
    if (!q) return source;
    return source.filter((i) => i.name.toLowerCase().includes(q));
  }, [categoryId, query]);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadPreview({ dataUrl: String(e.target?.result ?? ''), filename: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmUpload = () => {
    if (!uploadPreview) return;
    onPick({ kind: 'upload', dataUrl: uploadPreview.dataUrl, filename: uploadPreview.filename });
    setUploadPreview(null);
  };

  const pad = compact ? 2 : 3;
  const gridMaxHeight = compact ? 320 : 420;

  return (
    <Box>
      <Tabs
        value={mode}
        onChange={(_, v) => setMode(v)}
        sx={{
          px: pad, borderBottom: '1px solid #27272a', minHeight: 44,
          '& .MuiTab-root': {
            minHeight: 44, textTransform: 'none', fontWeight: 600, fontSize: 13,
            color: '#71717a', '&.Mui-selected': { color: '#c7d2fe' },
          },
          '& .MuiTabs-indicator': { background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', height: 2 },
        }}
      >
        <Tab value="library" label={t('iconPicker.tabLibrary')} />
        <Tab value="upload" label={t('iconPicker.tabUpload')} />
      </Tabs>

      {mode === 'library' && (
        <Box sx={{ p: pad, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            placeholder={t('iconPicker.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            size="small"
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: '#52525b' }} />
                </InputAdornment>
              ),
              sx: {
                bgcolor: '#09090b', color: '#f4f4f5', borderRadius: 2,
                '& fieldset': { borderColor: '#3f3f46' },
                '&:hover fieldset': { borderColor: '#52525b' },
                '&.Mui-focused fieldset': { borderColor: '#6366f1 !important' },
              },
            }}
          />

          <ToggleButtonGroup
            value={categoryId}
            exclusive
            onChange={(_, v) => v && setCategoryId(v)}
            size="small"
            sx={{
              flexWrap: 'wrap', gap: 0.75,
              '& .MuiToggleButton-root': {
                border: '1px solid #27272a !important', borderRadius: '999px !important',
                px: 1.5, py: 0.4, textTransform: 'none', fontSize: 12, fontWeight: 600,
                color: '#a1a1aa', bgcolor: 'transparent',
                '&:hover': { bgcolor: '#27272a' },
                '&.Mui-selected': {
                  color: '#fff',
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))',
                  borderColor: 'transparent !important',
                  '&:hover': { background: 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))' },
                },
              },
            }}
          >
            <ToggleButton value="all">{t('iconPicker.catAll')}</ToggleButton>
            {ICON_CATEGORIES.map((c) => (
              <ToggleButton key={c.id} value={c.id}>
                {t(c.labelKey)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Box
            sx={{
              maxHeight: gridMaxHeight, overflowY: 'auto', mt: 0.5,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
              gap: 1,
              pr: 0.5,
              '&::-webkit-scrollbar': { width: 8 },
              '&::-webkit-scrollbar-thumb': { bgcolor: '#3f3f46', borderRadius: 4 },
            }}
          >
            {filteredIcons.length === 0 ? (
              <Typography sx={{ gridColumn: '1/-1', textAlign: 'center', py: 6, color: '#71717a', fontSize: 13 }}>
                {t('iconPicker.noResults')}
              </Typography>
            ) : (
              filteredIcons.map((ic) => (
                <Box
                  key={ic.name}
                  onClick={() => onPick({ kind: 'library', name: ic.name })}
                  sx={{
                    aspectRatio: '1 / 1',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 0.5, p: 1, borderRadius: 2, cursor: 'pointer',
                    border: '1px solid transparent',
                    bgcolor: 'rgba(39,39,42,0.4)',
                    color: '#d4d4d8',
                    transition: 'transform .15s, background .15s, border-color .15s, color .15s',
                    '&:hover': {
                      bgcolor: 'rgba(99,102,241,0.12)',
                      borderColor: 'rgba(99,102,241,0.5)',
                      color: '#c7d2fe',
                      transform: 'translateY(-1px)',
                    },
                  }}
                  title={ic.name}
                >
                  <LazyIcon name={ic.name} size={24} />
                  <Typography
                    sx={{
                      fontSize: 9, fontWeight: 500, textAlign: 'center',
                      maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: 'inherit', opacity: 0.7,
                    }}
                  >
                    {ic.name}
                  </Typography>
                </Box>
              ))
            )}
          </Box>
        </Box>
      )}

      {mode === 'upload' && (
        <Box sx={{ p: pad, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Alert severity="info" variant="outlined" sx={{ borderColor: '#3730a3', color: '#c7d2fe', bgcolor: 'transparent' }}>
            {t('iconPicker.uploadHint')}
          </Alert>

          <Box
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFileSelect(f);
            }}
            sx={{
              border: '2px dashed #3f3f46', borderRadius: 3, p: 5, textAlign: 'center',
              cursor: 'pointer', transition: 'border-color .15s, background .15s',
              '&:hover': { borderColor: '#6366f1', bgcolor: 'rgba(99,102,241,0.06)' },
            }}
          >
            {uploadPreview ? (
              <Stack alignItems="center" gap={1.5}>
                <Box
                  component="img"
                  src={uploadPreview.dataUrl}
                  alt=""
                  sx={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 2, bgcolor: '#09090b', p: 2 }}
                />
                <Typography sx={{ fontSize: 12, color: '#a1a1aa' }}>{uploadPreview.filename}</Typography>
              </Stack>
            ) : (
              <Stack alignItems="center" gap={1}>
                <UploadFileIcon sx={{ fontSize: 40, color: '#6366f1' }} />
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{t('iconPicker.uploadCta')}</Typography>
                <Typography sx={{ fontSize: 12, color: '#71717a' }}>{t('iconPicker.uploadHelp')}</Typography>
              </Stack>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/svg+xml,image/png,image/jpeg"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
          </Box>

          <Stack direction="row" gap={1} justifyContent="flex-end">
            <Button
              disabled={!uploadPreview}
              onClick={handleConfirmUpload}
              sx={{
                textTransform: 'none', fontWeight: 700, color: '#fff', px: 3,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                '&:hover': { background: 'linear-gradient(135deg, #5458e5, #7c3aed)' },
                '&.Mui-disabled': { background: '#27272a', color: '#52525b' },
              }}
            >
              {t('iconPicker.useThis')}
            </Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
}
