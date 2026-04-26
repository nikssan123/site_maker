import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, IconButton, Stack, ToggleButton, ToggleButtonGroup, Select, MenuItem,
  FormControl, Tooltip, TextField, Button, Popover, CircularProgress, Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import FormatColorTextIcon from '@mui/icons-material/FormatColorText';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify';
import TuneIcon from '@mui/icons-material/Tune';
import EditIcon from '@mui/icons-material/Edit';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import LinkIcon from '@mui/icons-material/Link';
import { useTranslation } from 'react-i18next';
import type { TextStylePatch, EditTarget, EditEvent } from './EditDialog';

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Props {
  /** null = closed. */
  target: EditTarget | null;
  /** iframe-local rect of the selection — translated to viewport in this component. */
  rect: Rect | null;
  /** the iframe's bounding rect in parent viewport — toolbar uses this to convert coords. */
  iframeRect: DOMRect | null;
  /** uploads in flight (image upload). */
  busy?: boolean;
  /** in-progress text from contentEditable. */
  liveText?: string;
  /** Called when the user makes any change (style toggle, text edit, image swap). */
  onChange: (event: EditEvent) => void;
  /** Asks the iframe to enable contentEditable on the selected text node. */
  onBeginInlineEdit?: () => void;
  onClose: () => void;
  onDelete: () => void;
}

const fontOptions = [
  { value: '', label: 'Default' },
  { value: 'Inter, system-ui, sans-serif', label: 'Inter' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", serif', label: 'Times' },
  { value: '"Courier New", monospace', label: 'Courier' },
];

const sizeOptions = ['', '12px', '14px', '16px', '18px', '20px', '24px', '32px', '40px', '48px', '64px'];

function normalizeColorInput(color?: string): string {
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return color;
  return '#f4f4f5';
}

/** Snap a CSS font-size string from computed style (e.g. "16px") into the dropdown's preset list. */
function pickClosestSize(value?: string): string {
  if (!value) return '';
  const m = /([\d.]+)(px|rem|em|%)$/.exec(value);
  if (!m) return '';
  const px = parseFloat(m[1]);
  if (!isFinite(px)) return '';
  // Only auto-snap when the unit is px and the value matches exactly; otherwise keep as 'Auto'.
  const exact = sizeOptions.find((s) => s === `${Math.round(px)}px`);
  return exact ?? '';
}

export default function EditToolbar({
  target, rect, iframeRect, busy = false, liveText,
  onChange, onBeginInlineEdit, onClose, onDelete,
}: Props) {
  const { t } = useTranslation();
  // textStyle = the toolbar's current display state (initial computed style + user changes).
  // Used to drive the toggle/select UI and reflect what's visible on the element.
  const [textStyle, setTextStyle] = useState<TextStylePatch>({});
  // dirtyStyle = only the fields the user has explicitly changed in this session. This is what
  // gets persisted to source so we don't bake inherited CSS (fontSize, color from theme, …)
  // into inline styles and break responsive/dark-mode behavior.
  const [dirtyStyle, setDirtyStyle] = useState<TextStylePatch>({});
  const [textValue, setTextValue] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Reset local state when the selection changes.
  useEffect(() => {
    if (!target) {
      setTextStyle({});
      setDirtyStyle({});
      setTextValue('');
      setImageUrl('');
      setConfirmingDelete(false);
      return;
    }
    if (target.kind === 'text') {
      const incoming = target.style ?? {};
      const snapped: TextStylePatch = {
        ...incoming,
        fontSize: pickClosestSize(incoming.fontSize),
      };
      setTextStyle(snapped);
      setDirtyStyle({});
      setTextValue(target.anchor);
      setImageUrl('');
    } else if (target.kind === 'image') {
      setImageUrl(target.anchor);
      setTextValue('');
      setTextStyle({});
      setDirtyStyle({});
    }
    setConfirmingDelete(false);
  }, [target]);

  // Pull live text from the iframe into the local state so the toolbar's "more" form stays in sync.
  useEffect(() => {
    if (typeof liveText === 'string') setTextValue(liveText);
  }, [liveText]);

  // Compute viewport position from the (iframe-local) rect + the iframe's own bounding rect.
  const viewportPos = useMemo(() => {
    if (!rect || !iframeRect) return null;
    const TOOLBAR_WIDTH_GUESS = 480;
    const TOOLBAR_HEIGHT_GUESS = 56;
    const GAP = 12;
    const elTop = iframeRect.top + rect.top;
    const elLeft = iframeRect.left + rect.left;
    const elWidth = rect.width;
    // Try above the element first; flip below if not enough room.
    let top = elTop - TOOLBAR_HEIGHT_GUESS - GAP;
    if (top < 8) top = elTop + rect.height + GAP;
    // Center horizontally over the element, clamped to the viewport.
    let left = elLeft + elWidth / 2 - TOOLBAR_WIDTH_GUESS / 2;
    if (left < 8) left = 8;
    if (left + TOOLBAR_WIDTH_GUESS > window.innerWidth - 8) left = window.innerWidth - TOOLBAR_WIDTH_GUESS - 8;
    return { left, top };
  }, [rect, iframeRect]);

  if (!target || !viewportPos) return null;

  const updateStyle = (patch: TextStylePatch) => {
    const nextDisplay = { ...textStyle, ...patch };
    const nextDirty = { ...dirtyStyle, ...patch };
    setTextStyle(nextDisplay);
    setDirtyStyle(nextDirty);
    if (target?.kind === 'text') {
      // Send only fields the user has explicitly changed — avoids baking inherited CSS into
      // inline styles in the source file.
      onChange({
        kind: 'text',
        anchor: target.anchor,
        replacement: textValue || target.anchor,
        style: nextDirty,
      });
    }
  };

  const handleImageUrlCommit = () => {
    if (target?.kind !== 'image') return;
    const url = imageUrl.trim();
    if (!url || url === target.anchor) return;
    onChange({ kind: 'image-url', anchor: target.anchor, replacement: url });
  };

  const handleFile = (file: File) => {
    if (target?.kind !== 'image' || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = String(e.target?.result ?? '');
      if (!dataUrl) return;
      onChange({ kind: 'image-file', anchor: target.anchor, dataUrl, filename: file.name });
    };
    reader.readAsDataURL(file);
  };

  const isText = target.kind === 'text';
  const isImage = target.kind === 'image';

  return (
    <Box
      ref={toolbarRef}
      sx={{
        position: 'fixed',
        left: viewportPos.left,
        top: viewportPos.top,
        zIndex: 1300,
        bgcolor: '#18181b',
        color: '#f4f4f5',
        border: '1px solid rgba(99,102,241,0.45)',
        borderRadius: 2,
        boxShadow: '0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(99,102,241,0.12)',
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        p: 0.75,
        minHeight: 44,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {isText && (
        <>
          <Tooltip title={t('editToolbar.editText')}>
            <IconButton size="small" onClick={onBeginInlineEdit} sx={iconBtnSx}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={dividerSx} />

          <ToggleButtonGroup
            size="small"
            value={[
              textStyle.bold ? 'bold' : '',
              textStyle.italic ? 'italic' : '',
              textStyle.underline ? 'underline' : '',
            ].filter(Boolean)}
            onChange={(_, values) => {
              const selected = Array.isArray(values) ? values : [];
              updateStyle({
                bold: selected.includes('bold'),
                italic: selected.includes('italic'),
                underline: selected.includes('underline'),
              });
            }}
            sx={toggleGroupSx}
          >
            <ToggleButton value="bold" aria-label="Bold"><FormatBoldIcon fontSize="small" /></ToggleButton>
            <ToggleButton value="italic" aria-label="Italic"><FormatItalicIcon fontSize="small" /></ToggleButton>
            <ToggleButton value="underline" aria-label="Underline"><FormatUnderlinedIcon fontSize="small" /></ToggleButton>
          </ToggleButtonGroup>

          <Divider orientation="vertical" flexItem sx={dividerSx} />

          <FormControl size="small" sx={{ minWidth: 70 }}>
            <Select
              value={textStyle.fontSize ?? ''}
              displayEmpty
              renderValue={(v) => String(v || 'Auto')}
              onChange={(e) => updateStyle({ fontSize: String(e.target.value) || undefined })}
              sx={selectSx}
            >
              {sizeOptions.map((size) => (
                <MenuItem key={size || 'default'} value={size}>{size || 'Auto'}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 100 }}>
            <Select
              value={textStyle.fontFamily ?? ''}
              displayEmpty
              renderValue={(v) => fontOptions.find((f) => f.value === v)?.label ?? 'Default'}
              onChange={(e) => updateStyle({ fontFamily: String(e.target.value) || undefined })}
              sx={selectSx}
            >
              {fontOptions.map((font) => (
                <MenuItem key={font.value || 'default'} value={font.value} sx={{ fontFamily: font.value || undefined }}>
                  {font.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Divider orientation="vertical" flexItem sx={dividerSx} />

          <Tooltip title="Text color">
            <IconButton size="small" onClick={() => colorInputRef.current?.click()} sx={iconBtnSx}>
              <FormatColorTextIcon fontSize="small" sx={{ color: textStyle.color || '#f4f4f5' }} />
            </IconButton>
          </Tooltip>
          <input
            ref={colorInputRef}
            type="color"
            value={normalizeColorInput(textStyle.color)}
            onChange={(e) => updateStyle({ color: e.target.value })}
            style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }}
          />

          <ToggleButtonGroup
            size="small"
            exclusive
            value={textStyle.textAlign ?? ''}
            onChange={(_, value) => updateStyle({ textAlign: (value as TextStylePatch['textAlign']) || undefined })}
            sx={toggleGroupSx}
          >
            <ToggleButton value="left" aria-label="Align left"><FormatAlignLeftIcon fontSize="small" /></ToggleButton>
            <ToggleButton value="center" aria-label="Align center"><FormatAlignCenterIcon fontSize="small" /></ToggleButton>
            <ToggleButton value="right" aria-label="Align right"><FormatAlignRightIcon fontSize="small" /></ToggleButton>
            <ToggleButton value="justify" aria-label="Justify"><FormatAlignJustifyIcon fontSize="small" /></ToggleButton>
          </ToggleButtonGroup>

          <Divider orientation="vertical" flexItem sx={dividerSx} />

          <Tooltip title={t('editToolbar.more')}>
            <IconButton size="small" onClick={(e) => setMoreAnchor(e.currentTarget)} sx={iconBtnSx}>
              <TuneIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      )}

      {isImage && (
        <>
          <TextField
            size="small"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onBlur={handleImageUrlCommit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') { e.preventDefault(); handleImageUrlCommit(); }
            }}
            placeholder="Image URL"
            InputProps={{
              startAdornment: <LinkIcon sx={{ fontSize: 16, color: '#71717a', mr: 0.75 }} />,
              sx: {
                bgcolor: 'rgba(255,255,255,0.04)',
                color: '#f4f4f5',
                fontSize: 13,
                height: 32,
                width: 220,
                '& fieldset': { borderColor: 'transparent' },
                '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
                '&.Mui-focused fieldset': { borderColor: '#6366f1 !important' },
              },
            }}
          />

          <Divider orientation="vertical" flexItem sx={dividerSx} />

          <Tooltip title={t('editToolbar.upload')}>
            <IconButton size="small" onClick={() => fileRef.current?.click()} sx={iconBtnSx} disabled={busy}>
              {busy ? <CircularProgress size={14} sx={{ color: '#a1a1aa' }} /> : <CloudUploadIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </>
      )}

      <Box sx={{ flex: 1 }} />

      {confirmingDelete ? (
        <>
          <Button
            size="small"
            onClick={() => setConfirmingDelete(false)}
            sx={{ color: '#a1a1aa', textTransform: 'none', fontWeight: 600, fontSize: 12 }}
          >
            {t('editToolbar.cancel')}
          </Button>
          <Button
            size="small"
            onClick={() => { onDelete(); setConfirmingDelete(false); }}
            sx={{
              textTransform: 'none', fontWeight: 700, color: '#fff', fontSize: 12,
              bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' },
            }}
          >
            {t('editToolbar.confirmDelete')}
          </Button>
        </>
      ) : (
        <Tooltip title={t('editToolbar.delete')}>
          <IconButton size="small" onClick={() => setConfirmingDelete(true)} sx={{ ...iconBtnSx, color: '#f87171' }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      <Tooltip title={t('editToolbar.close')}>
        <IconButton size="small" onClick={onClose} sx={iconBtnSx}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {isText && (
        <Popover
          open={Boolean(moreAnchor)}
          anchorEl={moreAnchor}
          onClose={() => setMoreAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{
            sx: {
              mt: 1, p: 2, bgcolor: '#18181b', color: '#f4f4f5', border: '1px solid #27272a',
              borderRadius: 2, minWidth: 280,
            },
          }}
        >
          <Stack spacing={1.5}>
            <RowField
              label={t('editToolbar.background')}
              value={(
                <Stack direction="row" alignItems="center" gap={1}>
                  <Box
                    component="button"
                    onClick={() => bgInputRef.current?.click()}
                    sx={{
                      width: 28, height: 28, borderRadius: '50%', border: '2px solid #3f3f46',
                      bgcolor: textStyle.background || 'transparent',
                      cursor: 'pointer', p: 0,
                    }}
                  />
                  <Button
                    size="small"
                    onClick={() => updateStyle({ background: undefined })}
                    sx={{ color: '#a1a1aa', textTransform: 'none', fontSize: 11 }}
                  >
                    {t('editToolbar.clear')}
                  </Button>
                  <input
                    ref={bgInputRef}
                    type="color"
                    value={normalizeColorInput(textStyle.background)}
                    onChange={(e) => updateStyle({ background: e.target.value })}
                    style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }}
                  />
                </Stack>
              )}
            />
            <RowField
              label={t('editToolbar.padding')}
              value={(
                <TextField
                  size="small"
                  value={textStyle.padding ?? ''}
                  onChange={(e) => updateStyle({ padding: e.target.value || undefined })}
                  placeholder="e.g. 8px or 8px 16px"
                  InputProps={{ sx: smallTextSx }}
                />
              )}
            />
            <RowField
              label={t('editToolbar.margin')}
              value={(
                <TextField
                  size="small"
                  value={textStyle.margin ?? ''}
                  onChange={(e) => updateStyle({ margin: e.target.value || undefined })}
                  placeholder="e.g. 0 or 8px 0"
                  InputProps={{ sx: smallTextSx }}
                />
              )}
            />
            <RowField
              label={t('editToolbar.radius')}
              value={(
                <TextField
                  size="small"
                  value={textStyle.borderRadius ?? ''}
                  onChange={(e) => updateStyle({ borderRadius: e.target.value || undefined })}
                  placeholder="e.g. 8px"
                  InputProps={{ sx: smallTextSx }}
                />
              )}
            />
            <RowField
              label={t('editToolbar.lineHeight')}
              value={(
                <TextField
                  size="small"
                  value={textStyle.lineHeight ?? ''}
                  onChange={(e) => updateStyle({ lineHeight: e.target.value || undefined })}
                  placeholder="e.g. 1.5 or 24px"
                  InputProps={{ sx: smallTextSx }}
                />
              )}
            />
          </Stack>
        </Popover>
      )}
    </Box>
  );
}

const iconBtnSx = {
  color: '#d4d4d8',
  width: 32,
  height: 32,
  borderRadius: 1.5,
  '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
  '&.Mui-disabled': { color: '#52525b' },
};

const dividerSx = {
  bgcolor: 'rgba(255,255,255,0.08)',
  mx: 0.25,
  my: 0.5,
};

const toggleGroupSx = {
  '& .MuiToggleButton-root': {
    color: '#d4d4d8',
    borderColor: 'transparent',
    bgcolor: 'transparent',
    width: 30, height: 30, p: 0, borderRadius: '6px !important',
    '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
    '&.Mui-selected': {
      color: '#fff',
      bgcolor: 'rgba(99,102,241,0.75)',
    },
    '&.Mui-selected:hover': { bgcolor: 'rgba(99,102,241,0.85)' },
  },
};

const selectSx = {
  color: '#f4f4f5',
  height: 30,
  borderRadius: 1.5,
  bgcolor: 'rgba(255,255,255,0.04)',
  fontSize: 12,
  '& .MuiSelect-select': { py: 0.5, pl: 1, pr: 3 },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
  '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6366f1' },
  '& .MuiSvgIcon-root': { color: '#a1a1aa' },
};

const smallTextSx = {
  bgcolor: '#09090b', color: '#f4f4f5', borderRadius: 1.5, fontSize: 12,
  height: 30, width: 180,
  '& fieldset': { borderColor: '#3f3f46' },
  '&:hover fieldset': { borderColor: '#52525b' },
  '&.Mui-focused fieldset': { borderColor: '#6366f1 !important' },
};

function RowField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1.5}>
      <Box sx={{ fontSize: 12, color: '#a1a1aa', minWidth: 70 }}>{label}</Box>
      {value}
    </Stack>
  );
}
