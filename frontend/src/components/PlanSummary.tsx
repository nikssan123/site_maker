import { Box, Typography, Chip, Button, Stack, Tooltip, Divider, TextField } from '@mui/material';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import EditIcon from '@mui/icons-material/Edit';
import StorageIcon from '@mui/icons-material/Storage';
import { useTranslation } from 'react-i18next';
import { PlanData } from '../store/project';
import ColorThemePicker, { ColorTheme } from './ColorThemePicker';

interface Props {
  plan: PlanData;
  onConfirm: () => void;
  onEdit: () => void;
  onSocialLinksChange: (links: NonNullable<PlanData['data']['socialLinks']>) => void;
  loading: boolean;
  ctaLabel?: string;
  colorTheme: ColorTheme;
  onThemeChange: (theme: ColorTheme) => void;
  onExtractFromImage: (dataUrl: string) => Promise<ColorTheme>;
}

function pickStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string') {
      out.push(item);
      continue;
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      if (typeof o.name === 'string') out.push(o.name);
      else if (typeof o.title === 'string') out.push(o.title);
      else if (typeof o.label === 'string') out.push(o.label);
    }
  }
  return out;
}

/** Unwrap string JSON and common nesting shapes from the API / model. */
function coercePlanRaw(raw: unknown): unknown {
  let v = raw;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return {};
    try {
      v = JSON.parse(t);
    } catch {
      return {};
    }
  }
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return v;

  let o = v as Record<string, unknown>;
  const inner = o.data ?? o.spec ?? o.plan ?? o.body;
  if (inner != null && typeof inner === 'object' && !Array.isArray(inner)) {
    o = inner as Record<string, unknown>;
  }
  return o;
}

/** AI JSON may use pages/features or alternate keys (screens, sections, etc.). */
function normalizePlanData(raw: unknown): PlanData['data'] {
  const base: PlanData['data'] = {
    appType: '',
    pages: [],
    features: [],
    style: '',
    tech: '',
  };

  const coerced = coercePlanRaw(raw);
  if (coerced == null || typeof coerced !== 'object' || Array.isArray(coerced)) return base;
  const o = coerced as Record<string, unknown>;

  const pages =
    pickStringArray(o.pages).length > 0
      ? pickStringArray(o.pages)
      : pickStringArray(o.screens).length > 0
        ? pickStringArray(o.screens)
        : pickStringArray(o.sections);

  const features =
    pickStringArray(o.features).length > 0
      ? pickStringArray(o.features)
      : pickStringArray(o.capabilities).length > 0
        ? pickStringArray(o.capabilities)
        : pickStringArray(o.thingsItDoes);

  const dataModels = Array.isArray(o.dataModels)
    ? o.dataModels
        .filter((m): m is { name: string; fields: string[] } => {
          if (m == null || typeof m !== 'object') return false;
          const row = m as Record<string, unknown>;
          return typeof row.name === 'string' && Array.isArray(row.fields);
        })
        .map((m) => ({
          name: m.name,
          fields: (m.fields as unknown[]).filter((f): f is string => typeof f === 'string'),
        }))
    : undefined;

  return {
    ...base,
    appType: typeof o.appType === 'string' ? o.appType : base.appType,
    pages,
    features,
    style: typeof o.style === 'string' ? o.style : base.style,
    tech: typeof o.tech === 'string' ? o.tech : base.tech,
    hasDatabase: o.hasDatabase === true,
    dataModels,
    socialLinks:
      o.socialLinks && typeof o.socialLinks === 'object' && !Array.isArray(o.socialLinks)
        ? {
            facebook: typeof (o.socialLinks as any).facebook === 'string' ? (o.socialLinks as any).facebook : undefined,
            instagram: typeof (o.socialLinks as any).instagram === 'string' ? (o.socialLinks as any).instagram : undefined,
            tiktok: typeof (o.socialLinks as any).tiktok === 'string' ? (o.socialLinks as any).tiktok : undefined,
            linkedin: typeof (o.socialLinks as any).linkedin === 'string' ? (o.socialLinks as any).linkedin : undefined,
            youtube: typeof (o.socialLinks as any).youtube === 'string' ? (o.socialLinks as any).youtube : undefined,
            x: typeof (o.socialLinks as any).x === 'string' ? (o.socialLinks as any).x : undefined,
          }
        : undefined,
  };
}

export default function PlanSummary({ plan, onConfirm, onEdit, onSocialLinksChange, loading, ctaLabel, colorTheme, onThemeChange, onExtractFromImage }: Props) {
  const { t } = useTranslation();
  const data = normalizePlanData(plan?.data);
  const hasStructured =
    !!(data.appType || data.style || data.tech || data.hasDatabase || data.pages.length || data.features.length);
  const links = data.socialLinks ?? {};

  return (
    <Box
      sx={{
        flexShrink: 0,
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: 3,
        overflow: 'visible',
        mb: 3,
        background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(16,185,129,0.04) 100%)',
      }}
    >
      {/* Header strip */}
      <Box
        sx={{
          px: 2.5,
          py: 1.25,
          borderBottom: '1px solid rgba(99,102,241,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #10b981)',
          }}
        />
        <Typography
          variant="caption"
          fontWeight={700}
          sx={{ color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: 1, fontSize: 10 }}
        >
          {t('plan.header')}
        </Typography>
      </Box>

      <Box sx={{ p: 2.5, minHeight: 120 }}>
        {/* Inline styles so parent theme / markdown styles cannot zero out visibility */}
        <p style={{ margin: '0 0 12px', color: '#f1f5f9', fontSize: 14, lineHeight: 1.6 }}>
          {hasStructured
            ? t('plan.reviewStructured')
            : t('plan.reviewSimple')}
        </p>

        <Stack direction="row" flexWrap="wrap" gap={1} mb={hasStructured ? 2 : 1}>
          {data.appType && (
            <Chip
              label={data.appType.replace(/_/g, ' ')}
              size="small"
              sx={{ bgcolor: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)', textTransform: 'capitalize' }}
            />
          )}
          {data.style && (
            <Chip
              label={data.style}
              size="small"
              sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}
            />
          )}
          {data.tech && (
            <Chip
              label={data.tech}
              size="small"
              sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.12)' }}
            />
          )}
          {data.hasDatabase && (
            <Tooltip title={t('plan.dataTooltip', { models: data.dataModels?.map((m) => m.name).join(', ') ?? '—' })} placement="top">
              <Chip
                icon={<StorageIcon sx={{ fontSize: '12px !important', color: '#fbbf24 !important' }} />}
                label={t('plan.withData')}
                size="small"
                sx={{ bgcolor: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)', cursor: 'help' }}
              />
            </Tooltip>
          )}
        </Stack>

        {data.pages.length > 0 && (
          <Box mb={1.5}>
            <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10, fontWeight: 600 }}>
              {t('plan.sections')}
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.75} mt={0.75}>
              {data.pages.map((p) => (
                <Chip key={p} label={p} size="small" variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.15)', color: '#e2e8f0', height: 24 }} />
              ))}
            </Stack>
          </Box>
        )}

        {data.features.length > 0 && (
          <Box mb={2}>
            <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10, fontWeight: 600 }}>
              {t('plan.whatItDoes')}
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.75} mt={0.75}>
              {data.features.map((f) => (
                <Chip key={f} label={f} size="small" variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.15)', color: '#e2e8f0', height: 24 }} />
              ))}
            </Stack>
          </Box>
        )}

        <Box mb={2}>
          <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10, fontWeight: 600 }}>
            {t('plan.socialLinks')}
          </Typography>
          <Stack gap={1} mt={0.75}>
            <TextField
              size="small"
              label="Facebook"
              value={links.facebook ?? ''}
              onChange={(e) => onSocialLinksChange({ ...links, facebook: e.target.value })}
            />
            <TextField
              size="small"
              label="Instagram"
              value={links.instagram ?? ''}
              onChange={(e) => onSocialLinksChange({ ...links, instagram: e.target.value })}
            />
            <TextField
              size="small"
              label="TikTok"
              value={links.tiktok ?? ''}
              onChange={(e) => onSocialLinksChange({ ...links, tiktok: e.target.value })}
            />
            <TextField
              size="small"
              label="LinkedIn"
              value={links.linkedin ?? ''}
              onChange={(e) => onSocialLinksChange({ ...links, linkedin: e.target.value })}
            />
            <TextField
              size="small"
              label="YouTube"
              value={links.youtube ?? ''}
              onChange={(e) => onSocialLinksChange({ ...links, youtube: e.target.value })}
            />
            <TextField
              size="small"
              label="X (Twitter)"
              value={links.x ?? ''}
              onChange={(e) => onSocialLinksChange({ ...links, x: e.target.value })}
            />
          </Stack>
        </Box>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.07)', my: 1.5 }} />
        <ColorThemePicker
          value={colorTheme}
          onChange={onThemeChange}
          onExtractFromImage={onExtractFromImage}
        />
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.07)', mt: 1.5, mb: 1 }} />

        <Stack direction="row" gap={1} sx={{ pt: 0.5 }}>
          <Button
            variant="contained"
            startIcon={loading ? undefined : <RocketLaunchIcon fontSize="small" />}
            onClick={onConfirm}
            disabled={loading}
            sx={{
              flex: 1,
              color: '#fff !important',
              background: loading ? 'rgba(99,102,241,0.45)' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              boxShadow: '0 4px 20px rgba(99,102,241,0.3)',
              py: 1.25,
              fontWeight: 700,
              '&:hover': { boxShadow: '0 6px 28px rgba(99,102,241,0.45)', background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' },
              '&.Mui-disabled': { color: 'rgba(255,255,255,0.65) !important' },
            }}
          >
            {loading ? t('plan.buildProcessing') : (ctaLabel ?? t('plan.buildDefault'))}
          </Button>
          <Button
            variant="outlined"
            startIcon={<EditIcon fontSize="small" />}
            onClick={onEdit}
            disabled={loading}
            sx={{
              color: '#e2e8f0',
              borderColor: 'rgba(255,255,255,0.2)',
              '&:hover': { borderColor: 'rgba(255,255,255,0.35)', bgcolor: 'rgba(255,255,255,0.04)' },
            }}
          >
            {t('plan.edit')}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
