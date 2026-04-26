import { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, Box, Typography, TextField, IconButton, Button,
  Stack, Chip, CircularProgress, ToggleButton, ToggleButtonGroup, Select,
  MenuItem, FormControl,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatColorTextIcon from '@mui/icons-material/FormatColorText';
import { useTranslation } from 'react-i18next';
import IconPickerBody, { type IconPickResult } from './IconPickerBody';

export type TextStylePatch = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: string;
  fontFamily?: string;
  color?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  lineHeight?: string;
  letterSpacing?: string;
  padding?: string;
  margin?: string;
  background?: string;
  borderRadius?: string;
};

/** Width/height/borderRadius applied to an <img> via the imageAttrs op. */
export type ImageAttrsPatch = {
  width?: string;
  height?: string;
  borderRadius?: string;
};

export type EditTarget =
  | { kind: 'text'; anchor: string; style?: TextStylePatch }
  | { kind: 'image'; anchor: string }
  | { kind: 'icon'; sourcePathD: string; width: number; height: number };

/**
 * What the dialog emits on save. PreviewPage turns these into the batch-op shape
 * (uploading any data URLs to S3 first and converting to the final URL).
 */
export type EditEvent =
  | { kind: 'text'; anchor: string; replacement: string; style?: TextStylePatch }
  | { kind: 'image-url'; anchor: string; replacement: string }
  | { kind: 'image-file'; anchor: string; dataUrl: string; filename: string }
  | { kind: 'image-attrs'; anchor: string; width?: string; height?: string; borderRadius?: string }
  | { kind: 'icon-library'; sourcePathD: string; width: number; height: number; name: string; newPathD?: string }
  | { kind: 'icon-file'; sourcePathD: string; width: number; height: number; dataUrl: string; filename: string }
  | { kind: 'delete'; target: EditTarget };

interface Props {
  target: EditTarget | null;
  onSave: (event: EditEvent) => void;
  onClose: () => void;
  /** Shown as an inline spinner inside the dialog when a save is being processed (e.g. image upload). */
  busy?: boolean;
}

function cleanTextStyle(style: TextStylePatch): TextStylePatch {
  return {
    ...(style.bold ? { bold: true } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.underline ? { underline: true } : {}),
    ...(style.fontSize ? { fontSize: style.fontSize } : {}),
    ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
    ...(style.color ? { color: style.color } : {}),
    ...(style.textAlign ? { textAlign: style.textAlign } : {}),
    ...(style.lineHeight ? { lineHeight: style.lineHeight } : {}),
    ...(style.letterSpacing ? { letterSpacing: style.letterSpacing } : {}),
    ...(style.padding ? { padding: style.padding } : {}),
    ...(style.margin ? { margin: style.margin } : {}),
    ...(style.background ? { background: style.background } : {}),
    ...(style.borderRadius ? { borderRadius: style.borderRadius } : {}),
  };
}

function normalizeColorInput(color?: string): string {
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return color;
  return '#f4f4f5';
}

export default function EditDialog({ target, onSave, onClose, busy = false }: Props) {
  const { t } = useTranslation();
  const open = target !== null;

  const [textValue, setTextValue] = useState('');
  const [textStyle, setTextStyle] = useState<TextStylePatch>({});
  const [imageUrl, setImageUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<{ dataUrl: string; filename: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!target) return;
    if (target.kind === 'text') {
      setTextValue(target.anchor);
      setTextStyle(cleanTextStyle(target.style ?? {}));
      setImageUrl('');
    } else if (target.kind === 'image') {
      setImageUrl(target.anchor);
      setTextValue('');
      setTextStyle({});
    } else {
      setTextValue('');
      setTextStyle({});
      setImageUrl('');
    }
    setUploadedFile(null);
    setConfirmingDelete(false);
  }, [target]);

  const handlePickFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadedFile({ dataUrl: String(e.target?.result ?? ''), filename: file.name });
      setImageUrl('');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveText = () => {
    if (!target || target.kind !== 'text') return;
    const replacement = textValue.trim();
    const cleanedStyle = cleanTextStyle(textStyle);
    const styleChanged = JSON.stringify(cleanedStyle) !== JSON.stringify(cleanTextStyle(target.style ?? {}));
    if (!replacement || (replacement === target.anchor && !styleChanged)) {
      onClose();
      return;
    }
    onSave({ kind: 'text', anchor: target.anchor, replacement, style: cleanedStyle });
  };

  const handleSaveImage = () => {
    if (!target || target.kind !== 'image') return;
    if (uploadedFile) {
      onSave({
        kind: 'image-file',
        anchor: target.anchor,
        dataUrl: uploadedFile.dataUrl,
        filename: uploadedFile.filename,
      });
      return;
    }
    const url = imageUrl.trim();
    if (!url || url === target.anchor) {
      onClose();
      return;
    }
    onSave({ kind: 'image-url', anchor: target.anchor, replacement: url });
  };

  const handlePickIcon = (result: IconPickResult) => {
    if (!target || target.kind !== 'icon') return;
    if (result.kind === 'library' && result.name) {
      onSave({
        kind: 'icon-library',
        sourcePathD: target.sourcePathD,
        width: target.width,
        height: target.height,
        name: result.name,
        newPathD: result.pathD,
      });
    } else if (result.kind === 'upload' && result.dataUrl) {
      onSave({
        kind: 'icon-file',
        sourcePathD: target.sourcePathD,
        width: target.width,
        height: target.height,
        dataUrl: result.dataUrl,
        filename: result.filename ?? 'icon.svg',
      });
    }
  };

  const handleDelete = () => {
    if (!target) return;
    onSave({ kind: 'delete', target });
  };

  const typeLabel =
    target?.kind === 'text' ? t('editDialog.typeText')
    : target?.kind === 'image' ? t('editDialog.typeImage')
    : target?.kind === 'icon' ? t('editDialog.typeIcon')
    : '';

  const fontOptions = [
    { value: '', label: t('editDialog.fontDefault') },
    { value: 'Inter, system-ui, sans-serif', label: 'Inter' },
    { value: 'Arial, sans-serif', label: 'Arial' },
    { value: 'Georgia, serif', label: 'Georgia' },
    { value: '"Times New Roman", serif', label: 'Times' },
    { value: '"Courier New", monospace', label: 'Courier' },
  ];
  const sizeOptions = ['', '12px', '14px', '16px', '18px', '20px', '24px', '32px', '40px', '48px'];

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth={target?.kind === 'icon' ? 'md' : 'xs'}
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: '#18181b',
          color: '#f4f4f5',
          borderRadius: 3,
          border: '1px solid #27272a',
          boxShadow: '0 0 0 1px rgba(99,102,241,0.3), 0 32px 80px rgba(0,0,0,0.8)',
        },
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        <Box
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.5,
            px: 3, py: 2, borderBottom: '1px solid #27272a',
          }}
        >
          <Box
            sx={{
              width: 32, height: 32, borderRadius: 1.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.35))',
            }}
          >
            <EditIcon sx={{ fontSize: 18, color: '#c7d2fe' }} />
          </Box>
          <Typography sx={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', flex: 1 }}>
            {t('editDialog.title')}
          </Typography>
          <Chip
            label={typeLabel}
            size="small"
            sx={{
              height: 22, fontSize: 11, fontWeight: 600, letterSpacing: '0.03em',
              bgcolor: '#27272a', color: '#a1a1aa',
            }}
          />
          <IconButton onClick={onClose} size="small" disabled={busy} sx={{ color: '#71717a' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {target?.kind === 'text' && (
          <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                p: 0.75,
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 2.5,
                bgcolor: 'rgba(24,24,27,0.78)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                flexWrap: 'wrap',
              }}
            >
              <ToggleButtonGroup
                size="small"
                value={[textStyle.bold ? 'bold' : '', textStyle.italic ? 'italic' : ''].filter(Boolean)}
                onChange={(_, values) => {
                  const selected = Array.isArray(values) ? values : [];
                  setTextStyle((s) => ({
                    ...s,
                    bold: selected.includes('bold'),
                    italic: selected.includes('italic'),
                  }));
                }}
                sx={{
                  '& .MuiToggleButton-root': {
                    color: '#d4d4d8',
                    borderColor: 'transparent',
                    bgcolor: 'rgba(255,255,255,0.04)',
                    width: 32,
                    height: 30,
                    p: 0,
                    borderRadius: '8px !important',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                    '&.Mui-selected': {
                      color: '#fff',
                      bgcolor: 'rgba(99,102,241,0.75)',
                      boxShadow: '0 6px 16px rgba(99,102,241,0.2)',
                    },
                    '&.Mui-selected:hover': { bgcolor: 'rgba(99,102,241,0.85)' },
                  },
                }}
              >
                <ToggleButton value="bold" aria-label={t('editDialog.bold')}>
                  <FormatBoldIcon fontSize="small" />
                </ToggleButton>
                <ToggleButton value="italic" aria-label={t('editDialog.italic')}>
                  <FormatItalicIcon fontSize="small" />
                </ToggleButton>
              </ToggleButtonGroup>

              <Box sx={{ width: '1px', height: 22, flex: '0 0 auto', bgcolor: 'rgba(255,255,255,0.08)' }} />

              <FormControl size="small" sx={{ minWidth: 88 }}>
                <Select
                  value={textStyle.fontSize ?? ''}
                  displayEmpty
                  aria-label={t('editDialog.size')}
                  renderValue={(value) => String(value || t('editDialog.sizeDefault'))}
                  onChange={(e) => setTextStyle((s) => ({ ...s, fontSize: String(e.target.value) || undefined }))}
                  sx={{
                    color: '#f4f4f5',
                    height: 30,
                    borderRadius: 2,
                    bgcolor: 'rgba(255,255,255,0.04)',
                    fontSize: 13,
                    '& .MuiSelect-select': { py: 0.5, pl: 1.25, pr: 3 },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6366f1' },
                    '& .MuiSvgIcon-root': { color: '#a1a1aa' },
                  }}
                >
                  {sizeOptions.map((size) => (
                    <MenuItem key={size || 'default'} value={size}>
                      {size || t('editDialog.sizeDefault')}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 126, flex: 1 }}>
                <Select
                  value={textStyle.fontFamily ?? ''}
                  displayEmpty
                  aria-label={t('editDialog.font')}
                  renderValue={(value) => fontOptions.find((font) => font.value === value)?.label ?? t('editDialog.fontDefault')}
                  onChange={(e) => setTextStyle((s) => ({ ...s, fontFamily: String(e.target.value) || undefined }))}
                  sx={{
                    color: '#f4f4f5',
                    height: 30,
                    borderRadius: 2,
                    bgcolor: 'rgba(255,255,255,0.04)',
                    fontSize: 13,
                    '& .MuiSelect-select': { py: 0.5, pl: 1.25, pr: 3 },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6366f1' },
                    '& .MuiSvgIcon-root': { color: '#a1a1aa' },
                  }}
                >
                  {fontOptions.map((font) => (
                    <MenuItem key={font.value || 'default'} value={font.value} sx={{ fontFamily: font.value || undefined }}>
                      {font.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box
                sx={{
                  height: 30,
                  px: 0.75,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  color: '#d4d4d8',
                  bgcolor: 'rgba(255,255,255,0.04)',
                  borderRadius: 2,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                }}
              >
                <FormatColorTextIcon sx={{ fontSize: 18 }} />
                <Box
                  component="input"
                  type="color"
                  value={normalizeColorInput(textStyle.color)}
                  onChange={(e) => setTextStyle((s) => ({ ...s, color: e.target.value }))}
                  aria-label={t('editDialog.color')}
                  sx={{
                    width: 24,
                    height: 24,
                    p: 0,
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: '999px',
                    bgcolor: 'transparent',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    '&::-webkit-color-swatch-wrapper': { p: 0 },
                    '&::-webkit-color-swatch': { border: 0, borderRadius: '999px' },
                  }}
                />
              </Box>
            </Box>

            <TextField
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveText();
              }}
              multiline
              minRows={3}
              maxRows={12}
              fullWidth
              label={t('editDialog.contentLabel')}
              InputLabelProps={{ sx: { color: '#a1a1aa' } }}
              InputProps={{
                sx: {
                  bgcolor: '#09090b',
                  color: textStyle.color || '#f4f4f5',
                  borderRadius: 2,
                  fontSize: textStyle.fontSize || 14,
                  fontFamily: textStyle.fontFamily,
                  fontWeight: textStyle.bold ? 700 : undefined,
                  fontStyle: textStyle.italic ? 'italic' : undefined,
                  lineHeight: 1.55,
                  '& fieldset': { borderColor: '#3f3f46' },
                  '&:hover fieldset': { borderColor: '#52525b' },
                  '&.Mui-focused fieldset': { borderColor: '#6366f1 !important', borderWidth: '1.5px !important' },
                },
              }}
            />
            <Typography sx={{ fontSize: 11, color: '#52525b', textAlign: 'right' }}>
              {t('editDialog.charCount', { count: textValue.length })}
            </Typography>
          </Box>
        )}

        {target?.kind === 'image' && (
          <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              autoFocus
              value={imageUrl}
              onChange={(e) => { setImageUrl(e.target.value); if (e.target.value) setUploadedFile(null); }}
              onKeyDown={(e) => e.stopPropagation()}
              fullWidth
              label={t('editDialog.imageUrl')}
              placeholder={t('editDialog.imageUrlPlaceholder')}
              InputLabelProps={{ sx: { color: '#a1a1aa' } }}
              InputProps={{
                sx: {
                  bgcolor: '#09090b', color: '#f4f4f5', borderRadius: 2,
                  '& fieldset': { borderColor: '#3f3f46' },
                  '&:hover fieldset': { borderColor: '#52525b' },
                  '&.Mui-focused fieldset': { borderColor: '#6366f1 !important', borderWidth: '1.5px !important' },
                },
              }}
            />

            <Stack direction="row" alignItems="center" gap={1.5}>
              <Box sx={{ flex: 1, height: '1px', bgcolor: '#27272a' }} />
              <Typography sx={{ fontSize: 11, color: '#52525b', whiteSpace: 'nowrap' }}>
                {t('editDialog.uploadDivider')}
              </Typography>
              <Box sx={{ flex: 1, height: '1px', bgcolor: '#27272a' }} />
            </Stack>

            <Box
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handlePickFile(f);
              }}
              sx={{
                border: '1.5px dashed #4f46e5', borderRadius: 2, p: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
                cursor: 'pointer', color: '#818cf8', fontWeight: 600, fontSize: 13,
                transition: 'border-color .15s, background .15s',
                '&:hover': { borderColor: '#6366f1', bgcolor: 'rgba(99,102,241,0.06)' },
              }}
            >
              <CloudUploadIcon fontSize="small" />
              {t('editDialog.uploadFromDevice')}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePickFile(f);
                }}
              />
            </Box>

            {uploadedFile && (
              <Stack alignItems="center" gap={1}>
                <Box
                  component="img"
                  src={uploadedFile.dataUrl}
                  alt=""
                  sx={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 2, border: '1px solid #27272a' }}
                />
                <Typography sx={{ fontSize: 11, color: '#71717a' }}>{uploadedFile.filename}</Typography>
              </Stack>
            )}
          </Box>
        )}

        {target?.kind === 'icon' && (
          <IconPickerBody onPick={handlePickIcon} compact />
        )}

        {(target?.kind === 'text' || target?.kind === 'image') && (
          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: 1,
              px: 3, py: 2, borderTop: '1px solid #27272a',
            }}
          >
            {confirmingDelete ? (
              <>
                <Typography sx={{ fontSize: 12, color: '#fca5a5', flex: 1 }}>
                  {t('editDialog.deleteConfirmTitle')}
                </Typography>
                <Button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                  sx={{ color: '#a1a1aa', textTransform: 'none', fontWeight: 600 }}
                >
                  {t('editDialog.cancel')}
                </Button>
                <Button
                  onClick={handleDelete}
                  disabled={busy}
                  sx={{
                    textTransform: 'none', fontWeight: 700, color: '#fff', px: 2,
                    bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' },
                  }}
                >
                  {t('editDialog.deleteConfirmCta')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => setConfirmingDelete(true)}
                  startIcon={<DeleteOutlineIcon />}
                  disabled={busy}
                  sx={{
                    textTransform: 'none', fontWeight: 600, color: '#f87171',
                    border: '1px solid rgba(239,68,68,0.35)', borderRadius: 2, px: 1.5,
                    '&:hover': { bgcolor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.6)' },
                  }}
                >
                  {t('editDialog.delete')}
                </Button>
                <Box sx={{ flex: 1 }} />
                <Button
                  onClick={onClose}
                  disabled={busy}
                  sx={{
                    color: '#a1a1aa', textTransform: 'none', fontWeight: 600,
                    bgcolor: '#27272a', px: 2.5, borderRadius: 2,
                    '&:hover': { bgcolor: '#3f3f46' },
                  }}
                >
                  {t('editDialog.cancel')}
                </Button>
                <Button
                  onClick={target?.kind === 'text' ? handleSaveText : handleSaveImage}
                  disabled={busy}
                  startIcon={busy ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : null}
                  sx={{
                    textTransform: 'none', fontWeight: 700, color: '#fff', px: 3, borderRadius: 2,
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    '&:hover': { background: 'linear-gradient(135deg, #5458e5, #7c3aed)' },
                    '&.Mui-disabled': { color: 'rgba(255,255,255,0.6)' },
                  }}
                >
                  {t('editDialog.save')}
                </Button>
              </>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
