import { useState, useRef, useEffect } from 'react';
import {
  Box, Typography, Stack, Button, CircularProgress, Tooltip, Popper, Paper, ClickAwayListener,
} from '@mui/material';
import { HexColorPicker } from 'react-colorful';
import CheckIcon from '@mui/icons-material/Check';
import ColorLensIcon from '@mui/icons-material/ColorLens';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useTranslation } from 'react-i18next';

export interface ColorTheme {
  name: string;
  primary: string;
  secondary: string;
  background: string;
}

export const THEME_PRESETS: ColorTheme[] = [
  { name: 'Indigo',   primary: '#6366f1', secondary: '#a855f7', background: '#06060f' },
  { name: 'Onyx',     primary: '#e2e8f0', secondary: '#94a3b8', background: '#09090b' },
  { name: 'Emerald',  primary: '#10b981', secondary: '#06b6d4', background: '#020c0a' },
  { name: 'Crimson',  primary: '#f43f5e', secondary: '#fb923c', background: '#0f0306' },
  { name: 'Azure',    primary: '#3b82f6', secondary: '#818cf8', background: '#020617' },
  { name: 'Amber',    primary: '#f59e0b', secondary: '#f97316', background: '#0c0700' },
];

function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 512;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

interface Props {
  value: ColorTheme;
  onChange: (theme: ColorTheme) => void;
  onExtractFromImage: (dataUrl: string) => Promise<ColorTheme>;
}

type PickerKey = 'primary' | 'secondary' | 'background';

export default function ColorThemePicker({ value, onChange, onExtractFromImage }: Props) {
  const { t } = useTranslation();
  const [showCustom, setShowCustom] = useState(false);
  const [customPrimary, setCustomPrimary] = useState(value.primary);
  const [customSecondary, setCustomSecondary] = useState(value.secondary);
  const [customBg, setCustomBg] = useState(value.background);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [openPicker, setOpenPicker] = useState<PickerKey | null>(null);
  const anchorRefs = useRef<Partial<Record<PickerKey, HTMLElement | null>>>({});

  const isPreset = THEME_PRESETS.some((p) => p.name === value.name);
  const isCustom = value.name === 'Custom';
  const isExtracted = !isPreset && !isCustom;

  const renderThemeTile = (theme: ColorTheme, selected: boolean, label: string, key: string) => (
    <Box
      key={key}
      onClick={() => { onChange(theme); setShowCustom(false); }}
      sx={{
        cursor: 'pointer',
        borderRadius: 2,
        border: `2px solid ${selected ? theme.primary : 'rgba(255,255,255,0.08)'}`,
        overflow: 'hidden',
        transition: 'all 0.18s',
        boxShadow: selected ? `0 0 0 1px ${theme.primary}55, 0 4px 16px ${theme.primary}30` : 'none',
        '&:hover': {
          borderColor: theme.primary,
          boxShadow: `0 0 0 1px ${theme.primary}44, 0 4px 12px ${theme.primary}22`,
        },
      }}
    >
      <Box
        sx={{
          height: 44,
          background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)`,
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          px: 1,
          pb: 0.5,
        }}
      >
        {selected && (
          <CheckIcon sx={{ fontSize: 13, color: '#fff', ml: 'auto', mb: 0.25, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} />
        )}
      </Box>
      <Box sx={{ bgcolor: theme.background, px: 1, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: theme.primary, flexShrink: 0 }} />
        <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: theme.secondary, flexShrink: 0, opacity: 0.8 }} />
        <Typography
          variant="caption"
          sx={{ color: selected ? '#f1f5f9' : '#94a3b8', fontSize: 10, fontWeight: selected ? 700 : 500, ml: 0.25, letterSpacing: 0.2 }}
        >
          {label}
        </Typography>
      </Box>
    </Box>
  );

  // Close picker when custom panel is hidden
  useEffect(() => { if (!showCustom) setOpenPicker(null); }, [showCustom]);

  const applyCustom = () => {
    onChange({ name: 'Custom', primary: customPrimary, secondary: customSecondary, background: customBg });
    setShowCustom(false);
  };

  const colorState: Record<PickerKey, { val: string; set: (v: string) => void }> = {
    primary:    { val: customPrimary,    set: setCustomPrimary },
    secondary:  { val: customSecondary,  set: setCustomSecondary },
    background: { val: customBg,         set: setCustomBg },
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setExtractError(null);
    setExtracting(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const compressed = await compressImage(reader.result as string);
        const theme = await onExtractFromImage(compressed);
        onChange(theme);
        setShowCustom(false);
      } catch (err: unknown) {
        setExtractError(err instanceof Error ? err.message : t('theme.extractError'));
      } finally {
        setExtracting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <Box>
      <Typography
        variant="caption"
        sx={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10, fontWeight: 600 }}
      >
        {t('theme.sectionTitle')}
      </Typography>

      {/* Preset grid — 3 columns × 2 rows */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mt: 1 }}>
        {isExtracted && renderThemeTile(value, true, value.name, '__extracted')}
        {THEME_PRESETS.map((preset) => (
          renderThemeTile(preset, value.name === preset.name, t(`theme.presets.${preset.name}`), preset.name)
        ))}
      </Box>

      {/* Logo upload zone — primary affordance */}
      <Box
        component="label"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          mt: 1.25,
          px: 1.75,
          py: 1.25,
          borderRadius: 2,
          border: '1.5px dashed',
          borderColor: extracting ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.3)',
          bgcolor: extracting ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.05)',
          cursor: extracting ? 'default' : 'pointer',
          transition: 'all 0.18s',
          '&:hover': { borderColor: 'rgba(99,102,241,0.6)', bgcolor: 'rgba(99,102,241,0.09)' },
        }}
        onClick={() => { if (!extracting) { setExtractError(null); fileRef.current?.click(); } }}
      >
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: 1.5,
            bgcolor: 'rgba(99,102,241,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {extracting
            ? <CircularProgress size={16} sx={{ color: '#a5b4fc' }} />
            : <AutoAwesomeIcon sx={{ fontSize: 17, color: '#a5b4fc' }} />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ color: '#c4b5fd', fontWeight: 700, fontSize: 12, lineHeight: 1.3 }}>
            {extracting ? t('theme.extracting') : t('theme.fromImageTitle')}
          </Typography>
          <Typography variant="caption" sx={{ color: '#64748b', fontSize: 11 }}>
            {t('theme.fromImageHint')}
          </Typography>
        </Box>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageChange}
        />
      </Box>

      {/* Secondary action */}
      <Box mt={0.75}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<ColorLensIcon sx={{ fontSize: '13px !important' }} />}
          onClick={() => setShowCustom((v) => !v)}
          sx={{
            fontSize: 11,
            py: 0.4,
            borderColor: showCustom ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)',
            color: showCustom ? '#a5b4fc' : '#94a3b8',
            '&:hover': { borderColor: 'rgba(255,255,255,0.2)' },
          }}
        >
          {t('theme.customColors')}
        </Button>
      </Box>

      {extractError && (
        <Typography variant="caption" sx={{ color: '#f87171', fontSize: 11, mt: 0.5, display: 'block' }}>
          {extractError}
        </Typography>
      )}

      {/* Custom color pickers */}
      {showCustom && (
        <Box mt={1.25}>
          <Stack direction="row" gap={1.5} mb={1.25}>
            {(['primary', 'secondary', 'background'] as PickerKey[]).map((key) => {
              const label = t(`theme.${key}`);
              const { val } = colorState[key];
              const isOpen = openPicker === key;
              return (
                <Box key={key} sx={{ textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontSize: 10, display: 'block', mb: 0.5 }}>
                    {label}
                  </Typography>
                  <Box
                    ref={(el) => { anchorRefs.current[key] = el as HTMLElement | null; }}
                    onClick={() => setOpenPicker(isOpen ? null : key)}
                    sx={{
                      width: 52,
                      height: 36,
                      borderRadius: 1.5,
                      bgcolor: val,
                      border: `2px solid ${isOpen ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.15)'}`,
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                      boxShadow: isOpen ? `0 0 0 2px rgba(99,102,241,0.3)` : 'none',
                      '&:hover': { borderColor: 'rgba(255,255,255,0.4)' },
                    }}
                  />
                  <Typography variant="caption" sx={{ color: '#475569', fontSize: 9, mt: 0.4, display: 'block', fontFamily: 'monospace' }}>
                    {val}
                  </Typography>
                </Box>
              );
            })}
          </Stack>

          {/* Floating picker popover */}
          {(['primary', 'secondary', 'background'] as PickerKey[]).map((key) => (
            <Popper
              key={key}
              open={openPicker === key}
              anchorEl={anchorRefs.current[key]}
              placement="bottom-start"
              modifiers={[{ name: 'offset', options: { offset: [0, 6] } }]}
              sx={{ zIndex: 1400 }}
            >
              <ClickAwayListener onClickAway={() => setOpenPicker(null)}>
                <Paper elevation={8} sx={{ p: 1, borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)' }}>
                  <HexColorPicker
                    color={colorState[key].val}
                    onChange={colorState[key].set}
                    style={{ width: 180, height: 160 }}
                  />
                </Paper>
              </ClickAwayListener>
            </Popper>
          ))}

          <Button
            size="small"
            variant="contained"
            fullWidth
            onClick={applyCustom}
            sx={{ fontSize: 11, py: 0.6, bgcolor: 'rgba(99,102,241,0.8)', '&:hover': { bgcolor: '#6366f1' } }}
          >
            {t('theme.apply')}
          </Button>
        </Box>
      )}

      {/* Badge for non-preset themes */}
      {!isPreset && !isExtracted && (
        <Stack direction="row" gap={0.75} mt={0.75} alignItems="center">
          <Box sx={{ width: 8, height: 8, borderRadius: 0.4, bgcolor: value.background, border: '1px solid rgba(255,255,255,0.2)' }} />
          <Box sx={{ width: 8, height: 8, borderRadius: 0.4, bgcolor: value.primary }} />
          <Box sx={{ width: 8, height: 8, borderRadius: 0.4, bgcolor: value.secondary }} />
          <Typography variant="caption" sx={{ color: '#a5b4fc', fontSize: 11 }}>
            {value.name === 'Custom'
              ? t('theme.customApplied')
              : t('theme.extractedFromImage', { name: value.name })}
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
