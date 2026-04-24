import { Box, Typography, Chip, Button, Stack, Tooltip, InputBase, FormControl, Select, MenuItem, Checkbox, ListItemText, Paper, alpha } from '@mui/material';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import EditIcon from '@mui/icons-material/Edit';
import StorageIcon from '@mui/icons-material/Storage';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LanguageIcon from '@mui/icons-material/Language';
import ShareIcon from '@mui/icons-material/Share';
import PaletteIcon from '@mui/icons-material/Palette';
import FacebookIcon from '@mui/icons-material/Facebook';
import InstagramIcon from '@mui/icons-material/Instagram';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import YouTubeIcon from '@mui/icons-material/YouTube';
import XIcon from '@mui/icons-material/X';
import { SvgIcon } from '@mui/material';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PlanData } from '../store/project';
import ColorThemePicker, { ColorTheme } from './ColorThemePicker';

function TikTokIcon(props: React.ComponentProps<typeof SvgIcon>) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <path d="M16.6 5.82s.51.5 0 0A4.278 4.278 0 0 1 15.54 3h-3.09v12.4a2.592 2.592 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z" />
    </SvgIcon>
  );
}

interface Props {
  plan: PlanData;
  onConfirm: () => void;
  onEdit: () => void;
  onLanguagesChange: (languages: string[]) => void;
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

function normalizeLanguages(v: unknown): string[] {
  const values = Array.isArray(v) ? v : [];
  const normalized = Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  return normalized.includes('bg') ? normalized : ['bg', ...normalized];
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
    languages: normalizeLanguages(o.languages),
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

const SOCIAL_FIELDS = [
  { key: 'facebook', label: 'Facebook', icon: FacebookIcon, color: '#1877f2' },
  { key: 'instagram', label: 'Instagram', icon: InstagramIcon, color: '#e4405f' },
  { key: 'tiktok', label: 'TikTok', icon: TikTokIcon, color: '#fff' },
  { key: 'linkedin', label: 'LinkedIn', icon: LinkedInIcon, color: '#0a66c2' },
  { key: 'youtube', label: 'YouTube', icon: YouTubeIcon, color: '#ff0000' },
  { key: 'x', label: 'X', icon: XIcon, color: '#fff' },
] as const;

const LANGUAGE_OPTIONS = [
  { code: 'bg', label: 'Bulgarian' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'ro', label: 'Română' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'el', label: 'Ελληνικά' },
  { code: 'pl', label: 'Polski' },
  { code: 'cs', label: 'Čeština' },
  { code: 'sk', label: 'Slovenčina' },
  { code: 'hu', label: 'Magyar' },
  { code: 'hr', label: 'Hrvatski' },
  { code: 'sl', label: 'Slovenščina' },
  { code: 'sr', label: 'Srpski' },
  { code: 'da', label: 'Dansk' },
  { code: 'sv', label: 'Svenska' },
  { code: 'fi', label: 'Suomi' },
  { code: 'et', label: 'Eesti' },
  { code: 'lv', label: 'Latviešu' },
  { code: 'lt', label: 'Lietuvių' },
] as const;

function SectionHeader({
  icon,
  title,
  count,
  accent = '#94a3b8',
}: {
  icon: ReactNode;
  title: string;
  count?: number | null;
  accent?: string;
}) {
  return (
    <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
      <Box
        sx={{
          width: 22,
          height: 22,
          borderRadius: 1.25,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: alpha(accent, 0.16),
          color: accent,
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Typography
        variant="caption"
        sx={{
          color: accent,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          fontSize: 10.5,
          fontWeight: 800,
        }}
      >
        {title}
      </Typography>
      {typeof count === 'number' && count > 0 && (
        <Box
          sx={{
            ml: 0.25,
            minWidth: 18,
            height: 18,
            px: 0.6,
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(accent, 0.18),
            color: accent,
            fontSize: 10,
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {count}
        </Box>
      )}
    </Stack>
  );
}

export default function PlanSummary({ plan, onConfirm, onEdit, onLanguagesChange, onSocialLinksChange, loading, ctaLabel, colorTheme, onThemeChange, onExtractFromImage }: Props) {
  const { t, i18n } = useTranslation();
  const data = normalizePlanData(plan?.data);
  const hasStructured =
    !!(data.appType || data.style || data.tech || data.hasDatabase || data.pages.length || data.features.length);
  const selectedLanguages = data.languages ?? ['bg'];
  const links = data.socialLinks ?? {};
  const getLanguageLabel = (code: string) => {
    const bgLabels: Record<string, string> = {
      bg: 'Български',
      en: 'Английски',
      de: 'Немски',
      fr: 'Френски',
      es: 'Испански',
      it: 'Италиански',
      pt: 'Португалски',
      ro: 'Румънски',
      nl: 'Нидерландски',
      el: 'Гръцки',
      pl: 'Полски',
      cs: 'Чешки',
      sk: 'Словашки',
      hu: 'Унгарски',
      hr: 'Хърватски',
      sl: 'Словенски',
      sr: 'Сръбски',
      da: 'Датски',
      sv: 'Шведски',
      fi: 'Финландски',
      et: 'Естонски',
      lv: 'Латвийски',
      lt: 'Литовски',
    };
    const enLabels: Record<string, string> = {
      bg: 'Bulgarian',
      en: 'English',
      de: 'German',
      fr: 'French',
      es: 'Spanish',
      it: 'Italian',
      pt: 'Portuguese',
      ro: 'Romanian',
      nl: 'Dutch',
      el: 'Greek',
      pl: 'Polish',
      cs: 'Czech',
      sk: 'Slovak',
      hu: 'Hungarian',
      hr: 'Croatian',
      sl: 'Slovenian',
      sr: 'Serbian',
      da: 'Danish',
      sv: 'Swedish',
      fi: 'Finnish',
      et: 'Estonian',
      lv: 'Latvian',
      lt: 'Lithuanian',
    };

    if (i18n.resolvedLanguage === 'bg') return bgLabels[code] ?? code.toUpperCase();
    return t(`plan.languageNames.${code}`, { defaultValue: enLabels[code] ?? code.toUpperCase() });
  };

  const filledSocialCount = Object.values(links).filter((v) => v && String(v).trim()).length;

  return (
    <Paper
      elevation={0}
      sx={{
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        mb: 3,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'rgba(99,102,241,0.32)',
        background: (theme) =>
          `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.10)} 0%, ${alpha(theme.palette.success.main, 0.06)} 100%), ${theme.palette.background.paper}`,
        boxShadow: (theme) =>
          `0 1px 0 ${alpha(theme.palette.common.white, 0.04)} inset, 0 12px 36px ${alpha(theme.palette.primary.main, 0.16)}`,
        animation: 'planSummaryIn 0.36s cubic-bezier(0.22, 1, 0.36, 1)',
        '@keyframes planSummaryIn': {
          from: { opacity: 0, transform: 'translateY(10px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      {/* Decorative gradient blob */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          top: -80,
          right: -80,
          width: 240,
          height: 240,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <Box sx={{ position: 'relative', p: { xs: 2, sm: 2.5 } }}>
        {/* ── Hero header ── */}
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 2 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              background: 'linear-gradient(135deg, #6366f1 0%, #10b981 100%)',
              boxShadow: '0 6px 18px rgba(99,102,241,0.4)',
              color: '#fff',
            }}
          >
            <RocketLaunchIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="caption"
              sx={{
                color: '#a5b4fc',
                textTransform: 'uppercase',
                letterSpacing: 1.1,
                fontSize: 10,
                fontWeight: 800,
                display: 'block',
                lineHeight: 1.2,
              }}
            >
              {t('plan.header')}
            </Typography>
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: 700, lineHeight: 1.35, mt: 0.25 }}
            >
              {hasStructured ? t('plan.reviewStructured') : t('plan.reviewSimple')}
            </Typography>
          </Box>
        </Stack>

        {/* ── Meta strip: type + style + tech + data ── */}
        {(data.appType || data.style || data.tech || data.hasDatabase) && (
          <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 2 }}>
            {data.appType && (
              <Chip
                label={data.appType.replace(/_/g, ' ')}
                size="small"
                sx={{
                  bgcolor: 'rgba(99,102,241,0.18)',
                  color: '#c4b5fd',
                  border: '1px solid rgba(99,102,241,0.32)',
                  textTransform: 'capitalize',
                  fontWeight: 700,
                  fontSize: 12,
                  height: 26,
                }}
              />
            )}
            {data.style && (
              <Chip
                label={data.style}
                size="small"
                sx={{
                  bgcolor: 'rgba(16,185,129,0.12)',
                  color: '#34d399',
                  border: '1px solid rgba(16,185,129,0.22)',
                  fontSize: 12,
                  height: 26,
                }}
              />
            )}
            {data.tech && (
              <Chip
                label={data.tech}
                size="small"
                sx={{
                  bgcolor: 'rgba(255,255,255,0.05)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(255,255,255,0.12)',
                  fontSize: 12,
                  height: 26,
                }}
              />
            )}
            {data.hasDatabase && (
              <Tooltip
                title={t('plan.dataTooltip', { models: data.dataModels?.map((m) => m.name).join(', ') ?? '—' })}
                placement="top"
              >
                <Chip
                  icon={<StorageIcon sx={{ fontSize: '14px !important', color: '#fbbf24 !important' }} />}
                  label={t('plan.withData')}
                  size="small"
                  sx={{
                    bgcolor: 'rgba(245,158,11,0.12)',
                    color: '#fbbf24',
                    border: '1px solid rgba(245,158,11,0.22)',
                    cursor: 'help',
                    fontSize: 12,
                    height: 26,
                  }}
                />
              </Tooltip>
            )}
          </Stack>
        )}

        {/* ── Sections + Features ── */}
        <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} sx={{ mb: 2 }}>
          {data.pages.length > 0 && (
            <Box
              sx={{
                flex: 1,
                p: 1.5,
                borderRadius: 2,
                border: '1px solid rgba(255,255,255,0.07)',
                bgcolor: 'rgba(255,255,255,0.025)',
              }}
            >
              <SectionHeader
                icon={<DashboardIcon sx={{ fontSize: 14 }} />}
                title={t('plan.sections')}
                count={data.pages.length}
                accent="#a5b4fc"
              />
              <Stack direction="row" flexWrap="wrap" gap={0.6}>
                {data.pages.map((p) => (
                  <Chip
                    key={p}
                    label={p}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(99,102,241,0.10)',
                      color: '#e2e8f0',
                      border: '1px solid rgba(99,102,241,0.22)',
                      height: 24,
                      fontSize: 12,
                    }}
                  />
                ))}
              </Stack>
            </Box>
          )}

          {data.features.length > 0 && (
            <Box
              sx={{
                flex: 1,
                p: 1.5,
                borderRadius: 2,
                border: '1px solid rgba(255,255,255,0.07)',
                bgcolor: 'rgba(255,255,255,0.025)',
              }}
            >
              <SectionHeader
                icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />}
                title={t('plan.whatItDoes')}
                count={data.features.length}
                accent="#34d399"
              />
              <Stack direction="row" flexWrap="wrap" gap={0.6}>
                {data.features.map((f) => (
                  <Chip
                    key={f}
                    label={f}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(16,185,129,0.10)',
                      color: '#e2e8f0',
                      border: '1px solid rgba(16,185,129,0.22)',
                      height: 24,
                      fontSize: 12,
                    }}
                  />
                ))}
              </Stack>
            </Box>
          )}
        </Stack>

        {/* ── Languages section ── */}
        <Box
          sx={{
            mb: 2,
            p: 1.5,
            borderRadius: 2,
            border: '1px solid rgba(16,185,129,0.32)',
            bgcolor: 'rgba(16,185,129,0.06)',
          }}
        >
          <SectionHeader
            icon={<LanguageIcon sx={{ fontSize: 14 }} />}
            title={t('plan.languages')}
            count={selectedLanguages.length}
            accent="#86efac"
          />
          <Typography variant="body2" sx={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.55, mb: 0.5 }}>
            {t('plan.languagesHint')}
          </Typography>
          <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 11, display: 'block', mb: 1 }}>
            {t('plan.languagesDefault')}
          </Typography>
          <FormControl fullWidth size="small">
            <Select
              multiple
              value={selectedLanguages}
              onChange={(event) => onLanguagesChange(normalizeLanguages(event.target.value))}
              renderValue={(selected) =>
                normalizeLanguages(selected).map(getLanguageLabel).join(', ')
              }
              sx={{
                color: '#e2e8f0',
                borderRadius: 1.5,
                bgcolor: 'rgba(255,255,255,0.04)',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.12)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(16,185,129,0.3)' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(16,185,129,0.45)' },
                '& .MuiSelect-icon': { color: '#94a3b8' },
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    bgcolor: '#0f172a',
                    border: '1px solid rgba(255,255,255,0.08)',
                    mt: 0.5,
                  },
                },
              }}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <MenuItem key={option.code} value={option.code}>
                  <Checkbox
                    checked={selectedLanguages.includes(option.code)}
                    disabled={option.code === 'bg'}
                    sx={{ color: 'rgba(255,255,255,0.45)', '&.Mui-checked': { color: '#10b981' } }}
                  />
                  <ListItemText
                    primary={getLanguageLabel(option.code)}
                    secondary={option.code === 'bg' ? t('plan.languagesBulgarianDefault') : undefined}
                    primaryTypographyProps={{ fontSize: 13, color: '#e2e8f0' }}
                    secondaryTypographyProps={{ fontSize: 11, color: '#94a3b8' }}
                  />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* ── Social links ── */}
        <Box
          sx={{
            mb: 2,
            p: 1.5,
            borderRadius: 2,
            border: '1px solid rgba(99,102,241,0.32)',
            bgcolor: 'rgba(99,102,241,0.05)',
          }}
        >
          <SectionHeader
            icon={<ShareIcon sx={{ fontSize: 14 }} />}
            title={t('plan.socialLinks')}
            count={filledSocialCount}
            accent="#c4b5fd"
          />
          <Typography variant="body2" sx={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.55, mb: 0.5 }}>
            {t('plan.socialLinksHint')}
          </Typography>
          <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 11, display: 'block', mb: 1 }}>
            {t('plan.socialLinksOptional')}
          </Typography>
          <Stack gap={0.5}>
            {SOCIAL_FIELDS.map(({ key, label, icon: Icon, color }) => {
              const value = (links as Record<string, string | undefined>)[key] ?? '';
              const filled = Boolean(value.trim());
              return (
                <Box
                  key={key}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    bgcolor: 'rgba(255,255,255,0.035)',
                    borderRadius: 1.5,
                    pl: 1,
                    pr: 1.25,
                    py: 0.5,
                    border: '1px solid',
                    borderColor: filled ? alpha(color, 0.4) : 'rgba(255,255,255,0.08)',
                    transition: 'border-color 0.15s',
                    '&:focus-within': { borderColor: 'rgba(99,102,241,0.5)' },
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
                      bgcolor: alpha(color, filled ? 0.2 : 0.1),
                      color,
                      flexShrink: 0,
                    }}
                  >
                    <Icon sx={{ fontSize: 13 }} />
                  </Box>
                  <InputBase
                    placeholder={label}
                    value={value}
                    onChange={(e) => onSocialLinksChange({ ...links, [key]: e.target.value })}
                    sx={{
                      flex: 1,
                      color: '#e2e8f0',
                      fontSize: 13,
                      '& input': { p: 0 },
                      '& input::placeholder': { color: '#64748b', opacity: 1 },
                    }}
                  />
                </Box>
              );
            })}
          </Stack>
        </Box>

        {/* ── Color picker (full-width edge-to-edge) ── */}
        <Box
          sx={{
            mx: { xs: -2, sm: -2.5 },
            mt: 2,
            mb: 2,
            px: { xs: 2, sm: 2.5 },
            py: 2,
            borderTop: '1px solid rgba(99,102,241,0.18)',
            borderBottom: '1px solid rgba(99,102,241,0.18)',
            background: 'linear-gradient(180deg, rgba(99,102,241,0.05) 0%, rgba(99,102,241,0.01) 100%)',
          }}
        >
          <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.25 }}>
            <Box
              sx={{
                width: 22,
                height: 22,
                borderRadius: 1.25,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'rgba(168,85,247,0.18)',
                color: '#c4b5fd',
              }}
            >
              <PaletteIcon sx={{ fontSize: 14 }} />
            </Box>
            <Typography
              variant="caption"
              sx={{ color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 10.5, fontWeight: 800 }}
            >
              {t('theme.sectionTitle')}
            </Typography>
          </Stack>
          <ColorThemePicker
            value={colorTheme}
            onChange={onThemeChange}
            onExtractFromImage={onExtractFromImage}
          />
        </Box>

        <Stack direction="row" gap={1} sx={{ pt: 0.5 }}>
          <Button
            variant="contained"
            startIcon={loading ? undefined : <RocketLaunchIcon fontSize="small" />}
            onClick={onConfirm}
            disabled={loading}
            sx={{
              flex: 1,
              color: '#fff !important',
              fontSize: 14.5,
              fontWeight: 700,
              letterSpacing: 0.2,
              borderRadius: 2,
              py: 1.4,
              textTransform: 'none',
              background: loading ? 'rgba(99,102,241,0.45)' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              boxShadow: '0 6px 22px rgba(99,102,241,0.35)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              '&:hover': {
                transform: 'translateY(-1px)',
                boxShadow: '0 10px 30px rgba(99,102,241,0.5)',
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              },
              '&.Mui-disabled': { color: 'rgba(255,255,255,0.65) !important' },
            }}
          >
            {loading ? t('plan.buildProcessing') : (ctaLabel ?? t('plan.buildDefault'))}
          </Button>
          <Button
            variant="text"
            startIcon={<EditIcon fontSize="small" />}
            onClick={onEdit}
            disabled={loading}
            sx={{
              flexShrink: 0,
              px: 1.75,
              borderRadius: 2,
              color: 'text.secondary',
              fontWeight: 600,
              textTransform: 'none',
              '&:hover': {
                color: 'text.primary',
                bgcolor: (theme) => alpha(theme.palette.common.white, 0.04),
              },
            }}
          >
            {t('plan.edit')}
          </Button>
        </Stack>
      </Box>
    </Paper>
  );
}
