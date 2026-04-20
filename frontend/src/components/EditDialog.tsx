import { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, Box, Typography, TextField, IconButton, Button,
  Stack, Chip, CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useTranslation } from 'react-i18next';
import IconPickerBody, { type IconPickResult } from './IconPickerBody';

export type EditTarget =
  | { kind: 'text'; anchor: string }
  | { kind: 'image'; anchor: string }
  | { kind: 'icon'; sourcePathD: string; width: number; height: number };

/**
 * What the dialog emits on save. PreviewPage turns these into the batch-op shape
 * (uploading any data URLs to S3 first and converting to the final URL).
 */
export type EditEvent =
  | { kind: 'text'; anchor: string; replacement: string }
  | { kind: 'image-url'; anchor: string; replacement: string }
  | { kind: 'image-file'; anchor: string; dataUrl: string; filename: string }
  | { kind: 'icon-library'; sourcePathD: string; width: number; height: number; name: string }
  | { kind: 'icon-file'; sourcePathD: string; width: number; height: number; dataUrl: string; filename: string }
  | { kind: 'delete'; target: EditTarget };

interface Props {
  target: EditTarget | null;
  onSave: (event: EditEvent) => void;
  onClose: () => void;
  /** Shown as an inline spinner inside the dialog when a save is being processed (e.g. image upload). */
  busy?: boolean;
}

export default function EditDialog({ target, onSave, onClose, busy = false }: Props) {
  const { t } = useTranslation();
  const open = target !== null;

  const [textValue, setTextValue] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<{ dataUrl: string; filename: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!target) return;
    if (target.kind === 'text') {
      setTextValue(target.anchor);
      setImageUrl('');
    } else if (target.kind === 'image') {
      setImageUrl(target.anchor);
      setTextValue('');
    } else {
      setTextValue('');
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
    if (!replacement || replacement === target.anchor) {
      onClose();
      return;
    }
    onSave({ kind: 'text', anchor: target.anchor, replacement });
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
                  bgcolor: '#09090b', color: '#f4f4f5', borderRadius: 2, fontSize: 14, lineHeight: 1.55,
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
