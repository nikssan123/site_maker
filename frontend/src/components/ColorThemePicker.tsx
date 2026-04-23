import { useState, useRef, useEffect } from 'react';
import {
  Box, Typography, Stack, Button, CircularProgress, Popper, Paper, ClickAwayListener, InputBase,
} from '@mui/material';
import { HexColorPicker } from 'react-colorful';
import CheckIcon from '@mui/icons-material/Check';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useTranslation } from 'react-i18next';

export interface ColorTheme {
  name: string;
  primary: string;
  secondary: string;
  background: string;
}

export const THEME_PRESETS: ColorTheme[] = [
  { name: 'Midnight', primary: '#818cf8', secondary: '#c084fc', background: '#0f0b1e' },
  { name: 'Noir', primary: '#f1f5f9', secondary: '#64748b', background: '#0a0a0a' },
  { name: 'Ocean', primary: '#22d3ee', secondary: '#6366f1', background: '#0a0f1a' },
  { name: 'Sunset', primary: '#f97316', secondary: '#ec4899', background: '#120b0a' },
  { name: 'Mint', primary: '#34d399', secondary: '#2dd4bf', background: '#0a1210' },
  { name: 'Rose', primary: '#fb7185', secondary: '#f0abfc', background: '#130a10' },
];

interface Props {
  value: ColorTheme;
  onChange: (theme: ColorTheme) => void;
  onExtractFromImage: (dataUrl: string) => Promise<ColorTheme>;
}

type PickerKey = 'primary' | 'secondary' | 'background';

function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxSide = 512;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
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

function expandHex(hex: string): string {
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase();
  }
  return hex.toLowerCase();
}

function rgbStringToHex(value: string): string | null {
  const match = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i);
  if (!match) return null;
  const rgb = match.slice(1, 4).map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))));
  if (rgb.some((part) => Number.isNaN(part))) return null;
  return `#${rgb.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function normalizeColorValue(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return expandHex(value);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const sentinel = '#010203';
  ctx.fillStyle = sentinel;
  ctx.fillStyle = value;
  const normalized = String(ctx.fillStyle).trim().toLowerCase();

  if (normalized === sentinel && value.toLowerCase() !== sentinel) return null;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) return expandHex(normalized);
  return rgbStringToHex(normalized);
}

export default function ColorThemePicker({ value, onChange, onExtractFromImage }: Props) {
  const { t } = useTranslation();
  const [showCustom, setShowCustom] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState<PickerKey | null>(null);
  const [customColors, setCustomColors] = useState<Record<PickerKey, string>>({
    primary: value.primary,
    secondary: value.secondary,
    background: value.background,
  });
  const [customInputs, setCustomInputs] = useState<Record<PickerKey, string>>({
    primary: value.primary,
    secondary: value.secondary,
    background: value.background,
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const anchorRefs = useRef<Partial<Record<PickerKey, HTMLElement | null>>>({});

  const isPreset = THEME_PRESETS.some((preset) => preset.name === value.name);
  const isCustom = value.name === 'Custom';
  const isExtracted = !isPreset && !isCustom;
  const customTheme: ColorTheme = {
    name: 'Custom',
    primary: customColors.primary,
    secondary: customColors.secondary,
    background: customColors.background,
  };

  useEffect(() => {
    setCustomColors({
      primary: value.primary,
      secondary: value.secondary,
      background: value.background,
    });
    setCustomInputs({
      primary: value.primary,
      secondary: value.secondary,
      background: value.background,
    });
  }, [value.background, value.primary, value.secondary]);

  useEffect(() => {
    if (!showCustom) setOpenPicker(null);
  }, [showCustom]);

  const setCustomColor = (key: PickerKey, nextValue: string) => {
    setCustomInputs((prev) => ({ ...prev, [key]: nextValue }));
    const normalized = normalizeColorValue(nextValue);
    if (!normalized) return;
    setCustomColors((prev) => ({ ...prev, [key]: normalized }));
  };

  const colorInputValid = (key: PickerKey) => Boolean(normalizeColorValue(customInputs[key]));

  const renderThemeTile = (theme: ColorTheme, selected: boolean, label: string, key: string) => (
    <Box
      key={key}
      onClick={() => {
        if (theme.name === 'Custom') {
          setShowCustom(true);
          onChange(customTheme);
          return;
        }
        onChange(theme);
        setShowCustom(false);
      }}
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

  const applyCustom = () => {
    onChange(customTheme);
    setShowCustom(false);
  };

  return (
    <Box>
      <Typography
        variant="caption"
        sx={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10, fontWeight: 600 }}
      >
        {t('theme.sectionTitle')}
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mt: 1 }}>
        {isExtracted && renderThemeTile(value, true, value.name, '__extracted')}
        {THEME_PRESETS.map((preset) => (
          renderThemeTile(preset, value.name === preset.name, t(`theme.presets.${preset.name}`), preset.name)
        ))}
        {renderThemeTile(customTheme, isCustom || showCustom, t('theme.customColors'), '__custom')}
      </Box>

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

      {extractError && (
        <Typography variant="caption" sx={{ color: '#f87171', fontSize: 11, mt: 0.5, display: 'block' }}>
          {extractError}
        </Typography>
      )}

      {showCustom && (
        <Box mt={1.25}>
          <Stack direction="row" gap={1.5} mb={1.25}>
            {(['primary', 'secondary', 'background'] as PickerKey[]).map((key) => {
              const label = t(`theme.${key}`);
              const colorValue = customColors[key];
              const isOpen = openPicker === key;
              return (
                <Box key={key} sx={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontSize: 10, display: 'block', mb: 0.5 }}>
                    {label}
                  </Typography>
                  <Box
                    ref={(el) => { anchorRefs.current[key] = el as HTMLElement | null; }}
                    onClick={() => setOpenPicker(isOpen ? null : key)}
                    sx={{
                      width: '100%',
                      height: 36,
                      borderRadius: 1.5,
                      bgcolor: colorValue,
                      border: `2px solid ${isOpen ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.15)'}`,
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                      boxShadow: isOpen ? '0 0 0 2px rgba(99,102,241,0.3)' : 'none',
                      '&:hover': { borderColor: 'rgba(255,255,255,0.4)' },
                    }}
                  />
                  <Typography variant="caption" sx={{ color: '#475569', fontSize: 9, mt: 0.4, display: 'block', fontFamily: 'monospace' }}>
                    {colorValue}
                  </Typography>
                  <InputBase
                    value={customInputs[key]}
                    onChange={(e) => setCustomColor(key, e.target.value)}
                    placeholder="#6366f1 / rgb(99,102,241)"
                    sx={{
                      mt: 0.75,
                      width: '100%',
                      fontSize: 11,
                      color: colorInputValid(key) ? '#e2e8f0' : '#fca5a5',
                      borderRadius: 1.25,
                      px: 1,
                      py: 0.55,
                      bgcolor: 'rgba(255,255,255,0.04)',
                      border: '1px solid',
                      borderColor: colorInputValid(key) ? 'rgba(255,255,255,0.1)' : 'rgba(248,113,113,0.4)',
                      '& input': { p: 0, fontFamily: 'monospace' },
                      '& input::placeholder': { color: '#64748b', opacity: 1 },
                    }}
                  />
                </Box>
              );
            })}
          </Stack>

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
                    color={customColors[key]}
                    onChange={(next) => setCustomColor(key, next)}
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
            disabled={!colorInputValid('primary') || !colorInputValid('secondary') || !colorInputValid('background')}
            sx={{ fontSize: 11, py: 0.6, bgcolor: 'rgba(99,102,241,0.8)', '&:hover': { bgcolor: '#6366f1' } }}
          >
            {t('theme.apply')}
          </Button>
        </Box>
      )}

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
