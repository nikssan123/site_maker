import { Box, Button, Paper, Stack, Typography, alpha } from '@mui/material';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import StorefrontIcon from '@mui/icons-material/Storefront';
import ArticleIcon from '@mui/icons-material/Article';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ImageIcon from '@mui/icons-material/Image';
import WallpaperIcon from '@mui/icons-material/Wallpaper';
import BarChartIcon from '@mui/icons-material/BarChart';
import SettingsEthernetIcon from '@mui/icons-material/SettingsEthernet';
import { useTranslation } from 'react-i18next';

import CatalogPanel from './CatalogPanel';
import BookingSlotsPanel from './BookingSlotsPanel';
import InquiriesPanel from './InquiriesPanel';
import BlogPanel from './BlogPanel';
import DashboardPanel from './DashboardPanel';
import HostingPanel from './HostingPanel';
import AnalyticsPanel from './AnalyticsPanel';
import EmailPanel from './EmailPanel';

export type AdminWorkspaceMode =
  | 'catalog'
  | 'booking_slots'
  | 'inquiries'
  | 'blog'
  | 'dashboard'
  | 'branding'
  | 'hosting'
  | 'analytics'
  | 'email';

const WORKSPACE_NAV_WIDTH = 280;

function WorkspaceNavButton({
  icon,
  title,
  subtitle,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        all: 'unset',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        p: 1.25,
        minWidth: { xs: 220, md: 0 },
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: (theme) =>
          active
            ? alpha(theme.palette.primary.main, 0.34)
            : alpha(theme.palette.common.white, 0.08),
        bgcolor: (theme) =>
          active
            ? alpha(theme.palette.primary.main, 0.14)
            : alpha(theme.palette.common.white, 0.02),
        transition: 'background 0.18s ease, border-color 0.18s ease, transform 0.18s ease',
        '&:hover': {
          bgcolor: (theme) =>
            active
              ? alpha(theme.palette.primary.main, 0.18)
              : alpha(theme.palette.common.white, 0.05),
          borderColor: (theme) =>
            active
              ? alpha(theme.palette.primary.main, 0.4)
              : alpha(theme.palette.common.white, 0.14),
          transform: 'translateY(-1px)',
        },
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: active ? 'primary.main' : 'text.secondary',
          bgcolor: (theme) =>
            active
              ? alpha(theme.palette.primary.main, 0.18)
              : alpha(theme.palette.common.white, 0.06),
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, textAlign: 'left' }}>
        <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
          {title}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', lineHeight: 1.4, display: 'block', mt: 0.25 }}
        >
          {subtitle}
        </Typography>
      </Box>
    </Box>
  );
}

interface Props {
  mode: AdminWorkspaceMode;
  projectId: string;
  planAppType: string | null;
  planHasContactForm: boolean;
  projectPaid: boolean;
  projectHosted: boolean;
  runPort: number | null;
  adminApiToken?: string | null;
  onModeChange: (mode: AdminWorkspaceMode) => void;
  onBackToPreview: () => void;
  onRefreshPreview: () => void;
  onHostingUpdated: () => void;
  onOpenLogoUpload: () => void;
  onOpenHeroUpload: () => void;
}

function BrandingPanel({
  onOpenLogoUpload,
  onOpenHeroUpload,
}: {
  onOpenLogoUpload: () => void;
  onOpenHeroUpload: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Box sx={{ p: { xs: 1.25, md: 2 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: 3,
          bgcolor: 'rgba(255,255,255,0.02)',
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary' }}>
          {t('adminWorkspace.branding.heading')}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.75, color: 'text.secondary', lineHeight: 1.7 }}>
          {t('adminWorkspace.branding.body')}
        </Typography>
      </Paper>

      <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
        <Paper
          variant="outlined"
          sx={{
            flex: 1,
            p: 2,
            borderRadius: 3,
            bgcolor: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.14),
                color: 'primary.main',
              }}
            >
              <ImageIcon fontSize="small" />
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary' }}>
                {t('adminWorkspace.branding.logoTitle')}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                {t('adminWorkspace.branding.logoBody')}
              </Typography>
            </Box>
          </Stack>
          <Button variant="contained" sx={{ mt: 2 }} onClick={onOpenLogoUpload}>
            {t('adminWorkspace.branding.logoCta')}
          </Button>
        </Paper>

        <Paper
          variant="outlined"
          sx={{
            flex: 1,
            p: 2,
            borderRadius: 3,
            bgcolor: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: (theme) => alpha(theme.palette.secondary.main, 0.12),
                color: 'secondary.main',
              }}
            >
              <WallpaperIcon fontSize="small" />
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary' }}>
                {t('adminWorkspace.branding.heroTitle')}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                {t('adminWorkspace.branding.heroBody')}
              </Typography>
            </Box>
          </Stack>
          <Button variant="contained" sx={{ mt: 2 }} onClick={onOpenHeroUpload}>
            {t('adminWorkspace.branding.heroCta')}
          </Button>
        </Paper>
      </Stack>
    </Box>
  );
}

export default function AdminWorkspace({
  mode,
  projectId,
  planAppType,
  planHasContactForm,
  projectPaid,
  projectHosted,
  runPort,
  adminApiToken,
  onModeChange,
  onBackToPreview,
  onRefreshPreview,
  onHostingUpdated,
  onOpenLogoUpload,
  onOpenHeroUpload,
}: Props) {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        overflow: 'auto',
        bgcolor: 'background.default',
        background:
          'radial-gradient(circle at top left, rgba(99,102,241,0.10), transparent 28%), radial-gradient(circle at bottom right, rgba(16,185,129,0.08), transparent 24%)',
      }}
    >
      <Box
        sx={{
          width: { xs: '100%', md: WORKSPACE_NAV_WIDTH },
          flexShrink: 0,
          borderRight: { md: '1px solid rgba(255,255,255,0.08)' },
          borderBottom: { xs: '1px solid rgba(255,255,255,0.08)', md: 'none' },
          bgcolor: 'rgba(255,255,255,0.02)',
          backdropFilter: 'blur(10px)',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          overflow: { xs: 'visible', md: 'auto' },
        }}
      >
        <Box>
          <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: '0.12em' }}>
            {t('adminWorkspace.sectionLabel')}
          </Typography>
          <Typography variant="h6" sx={{ mt: 0.5, fontWeight: 800, color: 'text.primary' }}>
            {t('adminWorkspace.sectionTitle')}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.75, color: 'text.secondary', lineHeight: 1.6 }}>
            {t('adminWorkspace.sectionSubtitle')}
          </Typography>
        </Box>

        <Stack
          direction={{ xs: 'row', md: 'column' }}
          gap={1}
          sx={{
            overflowX: { xs: 'auto', md: 'visible' },
            overflowY: 'visible',
            pb: { xs: 0.5, md: 0 },
            pr: { xs: 0.5, md: 0 },
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': { height: 6, width: 6 },
          }}
        >
          <WorkspaceNavButton
            icon={<DashboardIcon fontSize="small" />}
            title={t('adminWorkspace.nav.dashboardTitle')}
            subtitle={t('adminWorkspace.nav.dashboardSubtitle')}
            active={mode === 'dashboard'}
            onClick={() => onModeChange('dashboard')}
          />
          <WorkspaceNavButton
            icon={<ImageIcon fontSize="small" />}
            title={t('adminWorkspace.nav.brandingTitle')}
            subtitle={t('adminWorkspace.nav.brandingSubtitle')}
            active={mode === 'branding'}
            onClick={() => onModeChange('branding')}
          />
          {planAppType !== 'portfolio' && planAppType !== 'landing_page' && planAppType !== 'saas' && (
            <WorkspaceNavButton
              icon={<StorefrontIcon fontSize="small" />}
              title={t('adminWorkspace.nav.catalogTitle')}
              subtitle={t('adminWorkspace.nav.catalogSubtitle')}
              active={mode === 'catalog'}
              onClick={() => onModeChange('catalog')}
            />
          )}
          {planAppType === 'blog' && (
            <WorkspaceNavButton
              icon={<ArticleIcon fontSize="small" />}
              title={t('adminWorkspace.nav.blogTitle')}
              subtitle={t('adminWorkspace.nav.blogSubtitle')}
              active={mode === 'blog'}
              onClick={() => onModeChange('blog')}
            />
          )}
          {planAppType === 'booking' && (
            <WorkspaceNavButton
              icon={<CalendarMonthIcon fontSize="small" />}
              title={t('adminWorkspace.nav.bookingTitle')}
              subtitle={t('adminWorkspace.nav.bookingSubtitle')}
              active={mode === 'booking_slots'}
              onClick={() => onModeChange('booking_slots')}
            />
          )}
          {planHasContactForm && (
            <WorkspaceNavButton
              icon={<MailOutlineIcon fontSize="small" />}
              title={t('adminWorkspace.nav.inquiriesTitle')}
              subtitle={t('adminWorkspace.nav.inquiriesSubtitle')}
              active={mode === 'inquiries'}
              onClick={() => onModeChange('inquiries')}
            />
          )}
          {projectPaid && projectHosted && (
            <WorkspaceNavButton
              icon={<CloudDoneIcon fontSize="small" />}
              title={t('adminWorkspace.nav.hostingTitle')}
              subtitle={t('adminWorkspace.nav.hostingSubtitle')}
              active={mode === 'hosting'}
              onClick={() => onModeChange('hosting')}
            />
          )}
          <WorkspaceNavButton
            icon={<BarChartIcon fontSize="small" />}
            title={t('adminWorkspace.nav.analyticsTitle')}
            subtitle={t('adminWorkspace.nav.analyticsSubtitle')}
            active={mode === 'analytics'}
            onClick={() => onModeChange('analytics')}
          />
          {projectPaid && (
            <WorkspaceNavButton
              icon={<SettingsEthernetIcon fontSize="small" />}
              title={t('adminWorkspace.nav.emailTitle')}
              subtitle={t('adminWorkspace.nav.emailSubtitle')}
              active={mode === 'email'}
              onClick={() => onModeChange('email')}
            />
          )}
        </Stack>

        <Paper
          variant="outlined"
          sx={{
            mt: { xs: 0, md: 'auto' },
            p: 1.5,
            borderRadius: 3,
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
            borderColor: (theme) => alpha(theme.palette.primary.main, 0.2),
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary' }}>
            {t('adminWorkspace.backHeading')}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary', lineHeight: 1.6 }}>
            {t('adminWorkspace.backBody')}
          </Typography>
          <Button variant="contained" size="small" sx={{ mt: 1.25 }} onClick={onBackToPreview}>
            {t('adminWorkspace.backCta')}
          </Button>
        </Paper>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, p: { xs: 1, md: 2 }, display: 'flex' }}>
        <Paper
          elevation={0}
          sx={{
            flex: 1,
            minHeight: 0,
            borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.08)',
            bgcolor: 'background.paper',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box
            sx={{
              px: { xs: 1.5, md: 2.5 },
              py: 1.75,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              background: (theme) =>
                `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.16)}, ${alpha(theme.palette.secondary.main, 0.08)})`,
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary' }}>
              {t(`adminWorkspace.titles.${mode}`)}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.35, color: 'text.secondary' }}>
              {t(`adminWorkspace.subtitles.${mode}`)}
            </Typography>
          </Box>

          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              WebkitOverflowScrolling: 'touch',
              p: mode === 'hosting' || mode === 'booking_slots' || mode === 'inquiries'
                ? { xs: 1, md: 1.5 }
                : 0,
            }}
          >
            {mode === 'catalog' && (
              <CatalogPanel
                projectId={projectId}
                runPort={runPort}
                adminApiToken={adminApiToken}
                onDataChange={onRefreshPreview}
              />
            )}
            {mode === 'booking_slots' && (
              <BookingSlotsPanel projectId={projectId} adminApiToken={adminApiToken} />
            )}
            {mode === 'inquiries' && <InquiriesPanel projectId={projectId} />}
            {mode === 'blog' && <BlogPanel projectId={projectId} runPort={runPort} />}
            {mode === 'dashboard' && <DashboardPanel projectId={projectId} runPort={runPort} />}
            {mode === 'branding' && (
              <BrandingPanel
                onOpenLogoUpload={onOpenLogoUpload}
                onOpenHeroUpload={onOpenHeroUpload}
              />
            )}
            {mode === 'hosting' && (
              <HostingPanel
                projectId={projectId}
                hosted={projectHosted}
                paid={projectPaid}
                onUpdated={onHostingUpdated}
              />
            )}
            {mode === 'analytics' && <AnalyticsPanel projectId={projectId} />}
            {mode === 'email' && <EmailPanel projectId={projectId} />}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
