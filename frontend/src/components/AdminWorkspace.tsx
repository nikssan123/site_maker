import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import StorefrontIcon from '@mui/icons-material/Storefront';
import ArticleIcon from '@mui/icons-material/Article';
import DashboardIcon from '@mui/icons-material/Dashboard';

import CatalogPanel from './CatalogPanel';
import BookingSlotsPanel from './BookingSlotsPanel';
import InquiriesPanel from './InquiriesPanel';
import BlogPanel from './BlogPanel';
import DashboardPanel from './DashboardPanel';
import HostingPanel from './HostingPanel';

export type AdminWorkspaceMode =
  | 'catalog'
  | 'booking_slots'
  | 'inquiries'
  | 'blog'
  | 'dashboard'
  | 'hosting';

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
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: active ? 'rgba(15,118,110,0.28)' : 'rgba(148,163,184,0.18)',
        bgcolor: active ? 'rgba(15,118,110,0.10)' : 'rgba(255,255,255,0.02)',
        transition: 'background 0.18s ease, border-color 0.18s ease, transform 0.18s ease',
        '&:hover': {
          bgcolor: active ? 'rgba(15,118,110,0.14)' : 'rgba(148,163,184,0.08)',
          borderColor: active ? 'rgba(15,118,110,0.34)' : 'rgba(148,163,184,0.26)',
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
          color: active ? '#0f766e' : 'text.secondary',
          bgcolor: active ? 'rgba(15,118,110,0.16)' : 'rgba(148,163,184,0.10)',
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, textAlign: 'left' }}>
        <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
          {title}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.4, display: 'block', mt: 0.25 }}>
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
}: Props) {
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, bgcolor: '#f7faf9' }}>
      <Box
        sx={{
          width: { xs: '100%', md: WORKSPACE_NAV_WIDTH },
          flexShrink: 0,
          borderRight: { md: '1px solid rgba(15,23,42,0.08)' },
          borderBottom: { xs: '1px solid rgba(15,23,42,0.08)', md: 'none' },
          bgcolor: '#fcfdfc',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          overflow: 'auto',
        }}
      >
        <Box>
          <Typography variant="overline" sx={{ color: '#0f766e', fontWeight: 800, letterSpacing: '0.12em' }}>
            Site Manager
          </Typography>
          <Typography variant="h6" sx={{ mt: 0.5, fontWeight: 800, color: '#0f172a' }}>
            Manage your site
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.75, color: 'text.secondary', lineHeight: 1.6 }}>
            Update content, review activity, and jump back to the live preview whenever you want.
          </Typography>
        </Box>

        <Stack gap={1}>
          <WorkspaceNavButton
            icon={<DashboardIcon fontSize="small" />}
            title="Overview"
            subtitle="See the main information in one place."
            active={mode === 'dashboard'}
            onClick={() => onModeChange('dashboard')}
          />
          {(planAppType !== 'portfolio' && planAppType !== 'landing_page' && planAppType !== 'saas') && (
            <WorkspaceNavButton
              icon={<StorefrontIcon fontSize="small" />}
              title="Shop items"
              subtitle="Add, update, and organize your products."
              active={mode === 'catalog'}
              onClick={() => onModeChange('catalog')}
            />
          )}
          {planAppType === 'blog' && (
            <WorkspaceNavButton
              icon={<ArticleIcon fontSize="small" />}
              title="Articles"
              subtitle="Create and edit posts for your site."
              active={mode === 'blog'}
              onClick={() => onModeChange('blog')}
            />
          )}
          {planAppType === 'booking' && (
            <WorkspaceNavButton
              icon={<CalendarMonthIcon fontSize="small" />}
              title="Availability"
              subtitle="Keep your dates and time slots up to date."
              active={mode === 'booking_slots'}
              onClick={() => onModeChange('booking_slots')}
            />
          )}
          {planHasContactForm && (
            <WorkspaceNavButton
              icon={<MailOutlineIcon fontSize="small" />}
              title="Messages"
              subtitle="Read and clear visitor messages."
              active={mode === 'inquiries'}
              onClick={() => onModeChange('inquiries')}
            />
          )}
          {projectPaid && projectHosted && (
            <WorkspaceNavButton
              icon={<CloudDoneIcon fontSize="small" />}
              title="Website address"
              subtitle="Manage your live site and connected domains."
              active={mode === 'hosting'}
              onClick={() => onModeChange('hosting')}
            />
          )}
        </Stack>

        <Paper
          variant="outlined"
          sx={{
            mt: 'auto',
            p: 1.5,
            borderRadius: 3,
            bgcolor: 'rgba(15,118,110,0.05)',
            borderColor: 'rgba(15,118,110,0.18)',
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#134e4a' }}>
            Back to live preview
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary', lineHeight: 1.6 }}>
            Return to the website preview to see the page the same way visitors do.
          </Typography>
          <Button
            variant="contained"
            size="small"
            sx={{ mt: 1.25, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}
            onClick={onBackToPreview}
          >
            Open preview
          </Button>
        </Paper>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, p: { xs: 1.25, md: 2 }, display: 'flex' }}>
        <Paper
          elevation={0}
          sx={{
            flex: 1,
            minHeight: 0,
            borderRadius: 4,
            border: '1px solid rgba(15,23,42,0.08)',
            bgcolor: '#ffffff',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box
            sx={{
              px: { xs: 1.5, md: 2.5 },
              py: 1.75,
              borderBottom: '1px solid rgba(15,23,42,0.08)',
              background: 'linear-gradient(135deg, rgba(240,253,250,0.95), rgba(248,250,252,0.95))',
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>
              {mode === 'catalog'
                ? 'Shop items'
                : mode === 'booking_slots'
                ? 'Availability'
                : mode === 'inquiries'
                ? 'Messages'
                : mode === 'blog'
                ? 'Articles'
                : mode === 'dashboard'
                ? 'Overview'
                : 'Website address'}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.35, color: 'text.secondary' }}>
              {mode === 'catalog'
                ? 'Everything for your products in one place.'
                : mode === 'booking_slots'
                ? 'Keep your calendar current.'
                : mode === 'inquiries'
                ? 'See what people sent through your contact form.'
                : mode === 'blog'
                ? 'Write and update the stories on your site.'
                : mode === 'dashboard'
                ? 'A simple summary of the content on your site.'
                : 'Control where people can find your live website.'}
            </Typography>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', p: mode === 'hosting' || mode === 'booking_slots' || mode === 'inquiries' ? { xs: 1, md: 1.5 } : 0 }}>
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
            {mode === 'inquiries' && (
              <InquiriesPanel projectId={projectId} />
            )}
            {mode === 'blog' && (
              <BlogPanel projectId={projectId} runPort={runPort} />
            )}
            {mode === 'dashboard' && (
              <DashboardPanel projectId={projectId} runPort={runPort} />
            )}
            {mode === 'hosting' && (
              <HostingPanel
                projectId={projectId}
                hosted={projectHosted}
                paid={projectPaid}
                onUpdated={onHostingUpdated}
              />
            )}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
