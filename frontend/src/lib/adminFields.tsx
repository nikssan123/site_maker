import { Box, Typography, TextField, Button, CircularProgress, Stack } from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';
import CameraAltIcon from '@mui/icons-material/CameraAlt';

export interface AdminField { name: string; type: string; }

/** Infer a field type from its name when no typed config is available (legacy fallback). */
export function inferFieldType(key: string): string {
  const k = key.toLowerCase();
  if (/url|image|img|photo|pic|avatar|thumbnail|cover|banner|logo|picture|poster/.test(k)) return 'image';
  if (/price|cost|amount|rating|count|stock|qty|quantity|seats|year|mileage|duration|age|weight/.test(k)) return 'number';
  if (/date|createdat|updatedat|birthday/.test(k)) return 'date';
  if (/description|content|notes|bio|body|details|summary|message/.test(k)) return 'textarea';
  if (/link|href|website|profile/.test(k)) return 'url';
  return 'text';
}

/** Render an appropriate MUI input for a typed admin field. */
export function renderField(
  f: AdminField,
  value: string,
  onChange: (v: string) => void,
  uploading: boolean,
  onFileSelect: (file: File) => void,
  labels: { clickToUpload: string; orPasteUrl: string; imageUrl: string },
): React.ReactNode {
  if (f.type === 'image' || f.type === 'photo') {
    const hasImage = Boolean(value);
    return (
      <Box key={f.name}>
        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75, color: 'text.secondary', fontWeight: 600 }}>
          <CameraAltIcon sx={{ fontSize: 13 }} />{f.name}
        </Typography>
        <Button
          component="label"
          disabled={uploading}
          fullWidth
          sx={{
            p: 0, height: 130, borderRadius: 1.5, border: '1.5px dashed',
            borderColor: hasImage ? 'transparent' : 'divider',
            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: hasImage ? 'transparent' : 'action.hover', mb: 1,
            '&:hover': { borderColor: 'primary.main', bgcolor: hasImage ? 'transparent' : 'action.selected' },
          }}
        >
          {uploading ? <CircularProgress size={28} /> : hasImage ? (
            <Box component="img" src={value}
              sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <Stack alignItems="center" gap={0.5}>
              <UploadIcon sx={{ fontSize: 28, color: 'text.disabled' }} />
              <Typography variant="caption" color="text.disabled" fontWeight={600}>{labels.clickToUpload}</Typography>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>{labels.orPasteUrl}</Typography>
            </Stack>
          )}
          <input type="file" accept="image/*" hidden
            onChange={(e) => { const file = e.target.files?.[0]; if (file) onFileSelect(file); e.target.value = ''; }} />
        </Button>
        <TextField label={labels.imageUrl} type="url" size="small" fullWidth
          value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…" />
      </Box>
    );
  }
  if (f.type === 'textarea') {
    return <TextField key={f.name} label={f.name} multiline rows={4} size="small" fullWidth
      value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  if (f.type === 'date') {
    return <TextField key={f.name} label={f.name} type="date" size="small" fullWidth
      value={value} onChange={(e) => onChange(e.target.value)} InputLabelProps={{ shrink: true }} />;
  }
  if (f.type === 'number') {
    return <TextField key={f.name} label={f.name} type="number" size="small" fullWidth
      value={value} onChange={(e) => onChange(e.target.value)} inputProps={{ min: 0 }} />;
  }
  if (f.type === 'url') {
    return <TextField key={f.name} label={f.name} type="url" size="small" fullWidth
      value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…" />;
  }
  return <TextField key={f.name} label={f.name} size="small" fullWidth
    value={value} onChange={(e) => onChange(e.target.value)} />;
}
