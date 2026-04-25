import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, TextField, Button, Stack, Typography, LinearProgress, Paper, Chip, CircularProgress,
  IconButton,
} from '@mui/material';
import DiamondIcon from '@mui/icons-material/Diamond';
import SendIcon from '@mui/icons-material/Send';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../store/project';
import { useIterationPlanStore } from '../store/iterationPlan';
import { api } from '../lib/api';
import SupportDialog from './SupportDialog';

export interface IterationAttachment {
  url: string;
  filename: string;
  mimeType: string;
}

interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  uploading: boolean;
  uploaded?: IterationAttachment;
  error?: string;
}

interface Props {
  onSubmit: (message: string, attachments: IterationAttachment[]) => void;
  loading: boolean;
  loadingLabel?: string;
  /** Project the photos belong to. Required for the upload endpoint. */
  projectId?: string;
}

const MAX_ATTACHMENTS = 4;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function pctColor(pct: number): 'primary' | 'warning' | 'error' {
  if (pct >= 90) return 'error';
  if (pct >= 70) return 'warning';
  return 'primary';
}

export default function IterationBar({ onSubmit, loading, loadingLabel, projectId }: Props) {
  const { t, i18n } = useTranslation();
  const [value, setValue] = useState('');
  const [supportOpen, setSupportOpen] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [buyingTopup, setBuyingTopup] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { iterationsTotal, freeIterationLimit } = useProjectStore();
  const plan = useIterationPlanStore();

  useEffect(() => {
    if (!plan.loaded && !plan.loading) {
      void plan.refresh();
    }
  }, [plan]);

  const freeUsed = Math.min(iterationsTotal, freeIterationLimit);
  const freeRemaining = Math.max(0, freeIterationLimit - freeUsed);
  const stillOnFreeTier = freeRemaining > 0;

  const hasQuota = stillOnFreeTier || (plan.pct < 100 && (plan.hasActiveSub || plan.grants.length > 0));
  const outOfQuota = !stillOnFreeTier && plan.loaded && plan.pct >= 100 && plan.hasActiveSub;
  const needsSubscribe = !stillOnFreeTier && plan.loaded && !plan.hasActiveSub && plan.grants.length === 0;

  const resetLabel = useMemo(() => {
    if (!plan.periodEnd) return '';
    try {
      return new Date(plan.periodEnd).toLocaleDateString(i18n.language || undefined, {
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return '';
    }
  }, [plan.periodEnd, i18n.language]);

  const anyUploading = attachments.some((a) => a.uploading);
  const readyAttachments = attachments
    .map((a) => a.uploaded)
    .filter((a): a is IterationAttachment => Boolean(a));
  const canSend =
    hasQuota && !loading && !anyUploading && (value.trim().length > 0 || readyAttachments.length > 0);

  const handleAddFiles = async (files: File[]) => {
    if (!projectId) return;
    const room = MAX_ATTACHMENTS - attachments.length;
    const accepted = files.filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (accepted.length === 0) return;

    const queued: PendingAttachment[] = accepted.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      uploading: true,
    }));
    setAttachments((prev) => [...prev, ...queued]);

    for (const item of queued) {
      if (item.file.size > MAX_FILE_BYTES) {
        setAttachments((prev) =>
          prev.map((a) => (a.id === item.id ? { ...a, uploading: false, error: 'too large' } : a)),
        );
        continue;
      }
      try {
        const dataUrl = await readAsDataUrl(item.file);
        const { url } = await api.uploadImage(projectId, dataUrl, item.file.name);
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === item.id
              ? {
                  ...a,
                  uploading: false,
                  uploaded: { url, filename: item.file.name, mimeType: item.file.type },
                }
              : a,
          ),
        );
      } catch (err: any) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === item.id
              ? { ...a, uploading: false, error: err?.message ?? 'upload failed' }
              : a,
          ),
        );
      }
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  const handleSubmit = () => {
    if (!canSend) return;
    onSubmit(value.trim(), readyAttachments);
    setValue('');
    attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
  };

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const { url } = await api.iterationPlanCheckout();
      if (url) window.location.href = url;
    } catch {
      setSubscribing(false);
    }
  };

  const handleTopup = async () => {
    setBuyingTopup(true);
    try {
      const { url } = await api.tokenTopupCheckout();
      if (url) window.location.href = url;
    } catch {
      setBuyingTopup(false);
    }
  };

  return (
    <>
      <Paper
        variant="outlined"
        sx={{
          p: 1.75,
          borderColor: 'rgba(99,102,241,0.35)',
          borderWidth: 1,
          borderRadius: 3,
          background: 'rgba(99,102,241,0.03)',
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="caption" fontWeight={600} color="primary.main" sx={{ fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {t('iteration.barLabel')}
          </Typography>
          {stillOnFreeTier ? (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11 }}>
              {t('iteration.freeRemaining', { n: freeRemaining, total: freeIterationLimit })}
            </Typography>
          ) : plan.loaded && (plan.hasActiveSub || plan.grants.length > 0) ? (
            <Typography variant="caption" sx={{ color: outOfQuota ? 'error.light' : 'text.secondary', fontSize: 11 }}>
              {t('iteration.usagePct', { pct: plan.pct })}
              {resetLabel ? ` · ${t('iteration.resetOn', { date: resetLabel })}` : ''}
            </Typography>
          ) : null}
        </Stack>

        {!stillOnFreeTier && plan.loaded && (plan.hasActiveSub || plan.grants.length > 0) && (
          <LinearProgress
            variant="determinate"
            value={plan.pct}
            color={pctColor(plan.pct)}
            sx={{ borderRadius: 1, height: 3, mb: 1.25, bgcolor: 'rgba(255,255,255,0.07)' }}
          />
        )}

        {stillOnFreeTier && (
          <LinearProgress
            variant="determinate"
            value={(freeUsed / freeIterationLimit) * 100}
            color="primary"
            sx={{ borderRadius: 1, height: 3, mb: 1.25, bgcolor: 'rgba(255,255,255,0.07)' }}
          />
        )}

        {outOfQuota ? (
          <Stack spacing={1.25}>
            <Typography variant="body2" fontWeight={700}>
              {t('iteration.outOfQuotaTitle')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('iteration.outOfQuotaHint', { date: resetLabel })}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                fullWidth
                disabled={buyingTopup}
                onClick={handleTopup}
                startIcon={buyingTopup ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <DiamondIcon sx={{ fontSize: '14px !important' }} />}
                sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}
              >
                {t('iteration.buyTopup')}
              </Button>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => setSupportOpen(true)}
                startIcon={<SupportAgentIcon fontSize="small" />}
                sx={{ fontWeight: 700 }}
              >
                {t('iteration.requestExtension')}
              </Button>
            </Stack>
          </Stack>
        ) : needsSubscribe ? (
          <Stack spacing={1.25}>
            <Typography variant="body2" fontWeight={700}>
              {t('iteration.subscribeTitle')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('iteration.subscribeHint')}
            </Typography>
            <Button
              variant="contained"
              fullWidth
              disabled={subscribing}
              onClick={handleSubscribe}
              startIcon={subscribing ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <DiamondIcon sx={{ fontSize: '14px !important' }} />}
              sx={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}
            >
              {t('iteration.subscribeCta')}
            </Button>
          </Stack>
        ) : (
          <>
            {attachments.length > 0 && (
              <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mb: 1 }}>
                {attachments.map((a) => (
                  <Box
                    key={a.id}
                    sx={{
                      position: 'relative',
                      width: 56,
                      height: 56,
                      borderRadius: 1.5,
                      overflow: 'hidden',
                      border: '1px solid',
                      borderColor: a.error ? 'error.main' : 'rgba(99,102,241,0.4)',
                      bgcolor: 'rgba(0,0,0,0.4)',
                    }}
                  >
                    <Box
                      component="img"
                      src={a.previewUrl}
                      alt={a.file.name}
                      sx={{ width: '100%', height: '100%', objectFit: 'cover', opacity: a.uploading ? 0.45 : 1 }}
                    />
                    {a.uploading && (
                      <Box sx={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <CircularProgress size={18} sx={{ color: '#fff' }} />
                      </Box>
                    )}
                    <IconButton
                      size="small"
                      onClick={() => handleRemoveAttachment(a.id)}
                      sx={{
                        position: 'absolute', top: 2, right: 2,
                        width: 18, height: 18, p: 0,
                        bgcolor: 'rgba(0,0,0,0.65)', color: '#fff',
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.85)' },
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 12 }} />
                    </IconButton>
                  </Box>
                ))}
              </Stack>
            )}

            <Box
              onDragOver={(e) => {
                if (!projectId) return;
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (!projectId) return;
                const files = Array.from(e.dataTransfer.files ?? []);
                if (files.length > 0) void handleAddFiles(files);
              }}
              sx={{
                position: 'relative',
                borderRadius: 2,
                outline: dragActive ? '2px dashed' : 'none',
                outlineColor: 'primary.main',
                outlineOffset: 2,
                mb: 1.25,
              }}
            >
              <TextField
                fullWidth
                multiline
                minRows={2}
                maxRows={5}
                placeholder={
                  hasQuota
                    ? t('iteration.placeholderLong')
                    : t('iteration.noCreditsPlaceholder')
                }
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={!hasQuota || loading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
            </Box>

            <Stack direction="row" gap={1} alignItems="center">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) void handleAddFiles(files);
                  if (fileRef.current) fileRef.current.value = '';
                }}
              />
              <IconButton
                size="small"
                onClick={() => fileRef.current?.click()}
                disabled={!projectId || !hasQuota || loading || attachments.length >= MAX_ATTACHMENTS}
                aria-label={t('iteration.attachPhoto', { defaultValue: 'Attach photo' })}
                sx={{
                  border: '1px solid rgba(99,102,241,0.4)',
                  color: 'primary.light',
                  borderRadius: 1.5,
                  width: 36, height: 36,
                  '&:hover': { bgcolor: 'rgba(99,102,241,0.08)' },
                }}
              >
                <AttachFileIcon fontSize="small" />
              </IconButton>

              <Button
                variant="contained"
                disabled={!canSend}
                onClick={handleSubmit}
                startIcon={loading || anyUploading ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <SendIcon fontSize="small" />}
                sx={{ flex: 1, background: 'linear-gradient(135deg, #6366f1, #a855f7)', fontWeight: 700 }}
              >
                {loading
                  ? (loadingLabel ?? t('preview.applyingChanges'))
                  : anyUploading
                    ? t('iteration.uploadingPhotos', { defaultValue: 'Uploading…' })
                    : t('iteration.apply')}
              </Button>
            </Stack>

            {!stillOnFreeTier && plan.pct >= 70 && plan.pct < 100 && (
              <Box sx={{ mt: 1 }}>
                <Chip
                  size="small"
                  label={t('iteration.lowQuotaHint')}
                  onClick={handleTopup}
                  sx={{
                    cursor: 'pointer',
                    bgcolor: plan.pct >= 90 ? 'error.dark' : 'warning.dark',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 10,
                  }}
                />
              </Box>
            )}
          </>
        )}
      </Paper>

      <SupportDialog
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        presetSubject={t('iteration.requestExtensionSubject')}
      />
    </>
  );
}
