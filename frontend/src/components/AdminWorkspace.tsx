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
          Визия на бранда
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.75, color: 'text.secondary', lineHeight: 1.7 }}>
          Тук сменяш основните визии, които хората виждат първо на сайта. След промяна прегледът се обновява автоматично.
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
                Лого
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                Смени логото, което се показва в навигацията и основните части на сайта.
              </Typography>
            </Box>
          </Stack>
          <Button variant="contained" sx={{ mt: 2 }} onClick={onOpenLogoUpload}>
            Смени логото
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
                Главна снимка
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                Смени голямата фонова снимка в горната част на сайта.
              </Typography>
            </Box>
          </Stack>
          <Button variant="contained" sx={{ mt: 2 }} onClick={onOpenHeroUpload}>
            Смени снимката
          </Button>
        </Paper>
      </Stack>
    </Box>
  );
}

function workspaceTitle(mode: AdminWorkspaceMode): string {
  switch (mode) {
    case 'catalog':
      return '\u041f\u0440\u043e\u0434\u0443\u043a\u0442\u0438';
    case 'booking_slots':
      return 'Свободни часове';
    case 'inquiries':
      return 'Съобщения';
    case 'blog':
      return 'Статии';
    case 'dashboard':
      return 'Общ преглед';
    case 'branding':
      return 'Визия';
    case 'analytics':
      return 'Анализ';
    case 'email':
      return 'Имейл';
    case 'hosting':
      return 'Адрес на сайта';
  }
}

function workspaceSubtitle(mode: AdminWorkspaceMode): string {
  switch (mode) {
    case 'catalog':
      return '\u0423\u043f\u0440\u0430\u0432\u043b\u044f\u0432\u0430\u0439 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0438\u0442\u0435 \u0438 \u0437\u0430\u043f\u0438\u0441\u0438\u0442\u0435 \u0432 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435\u0442\u043e.';
    case 'booking_slots':
      return 'Поддържай графика си винаги актуален.';
    case 'inquiries':
      return 'Виж какво са изпратили хората през контактната форма.';
    case 'blog':
      return 'Пиши и обновявай публикациите на сайта си.';
    case 'dashboard':
      return 'Кратък преглед на съдържанието в сайта ти.';
    case 'branding':
      return 'Смени основните визии, които хората забелязват първо.';
    case 'analytics':
      return 'Преглед на посещенията, източниците и поведението на посетителите.';
    case 'email':
      return 'Управлявай домейните за изпращане, подателя и имейл шаблоните.';
    case 'hosting':
      return 'Управлявай адреса, на който хората намират живия ти сайт.';
  }
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
            УПРАВЛЕНИЕ
          </Typography>
          <Typography variant="h6" sx={{ mt: 0.5, fontWeight: 800, color: 'text.primary' }}>
            Управление на сайта
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.75, color: 'text.secondary', lineHeight: 1.6 }}>
            Редактирай съдържанието, следи какво се случва и се връщай към живия преглед по всяко време.
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
            title="Общ преглед"
            subtitle="Виж най-важната информация на едно място."
            active={mode === 'dashboard'}
            onClick={() => onModeChange('dashboard')}
          />
          <WorkspaceNavButton
            icon={<ImageIcon fontSize="small" />}
            title="Визия"
            subtitle="Смени логото и основната снимка в горната част на сайта."
            active={mode === 'branding'}
            onClick={() => onModeChange('branding')}
          />
          {planAppType !== 'portfolio' && planAppType !== 'landing_page' && planAppType !== 'saas' && (
            <WorkspaceNavButton
              icon={<StorefrontIcon fontSize="small" />}
              title="\u041f\u0440\u043e\u0434\u0443\u043a\u0442\u0438"
              subtitle="Управлявай продуктите, записите и съдържанието."
              active={mode === 'catalog'}
              onClick={() => onModeChange('catalog')}
            />
          )}
          {planAppType === 'blog' && (
            <WorkspaceNavButton
              icon={<ArticleIcon fontSize="small" />}
              title="Статии"
              subtitle="Създавай и редактирай публикациите за сайта си."
              active={mode === 'blog'}
              onClick={() => onModeChange('blog')}
            />
          )}
          {planAppType === 'booking' && (
            <WorkspaceNavButton
              icon={<CalendarMonthIcon fontSize="small" />}
              title="Свободни часове"
              subtitle="Поддържай датите и часовете си актуални."
              active={mode === 'booking_slots'}
              onClick={() => onModeChange('booking_slots')}
            />
          )}
          {planHasContactForm && (
            <WorkspaceNavButton
              icon={<MailOutlineIcon fontSize="small" />}
              title="Съобщения"
              subtitle="Преглеждай и изчиствай съобщенията от посетители."
              active={mode === 'inquiries'}
              onClick={() => onModeChange('inquiries')}
            />
          )}
          {projectPaid && projectHosted && (
            <WorkspaceNavButton
              icon={<CloudDoneIcon fontSize="small" />}
              title="Адрес на сайта"
              subtitle="Управлявай живия сайт и свързаните домейни."
              active={mode === 'hosting'}
              onClick={() => onModeChange('hosting')}
            />
          )}
          <WorkspaceNavButton
            icon={<BarChartIcon fontSize="small" />}
            title="Анализ"
            subtitle="Виж посещения, устройства и най-популярни страници."
            active={mode === 'analytics'}
            onClick={() => onModeChange('analytics')}
          />
          {projectPaid && (
            <WorkspaceNavButton
              icon={<SettingsEthernetIcon fontSize="small" />}
              title="Имейл"
              subtitle="Настрой домейни, подател и имейл шаблони."
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
            Обратно към прегледа
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary', lineHeight: 1.6 }}>
            Върни се към живия преглед, за да видиш сайта така, както го виждат посетителите.
          </Typography>
          <Button variant="contained" size="small" sx={{ mt: 1.25 }} onClick={onBackToPreview}>
            Отвори прегледа
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
              {workspaceTitle(mode)}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.35, color: 'text.secondary' }}>
              {workspaceSubtitle(mode)}
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
