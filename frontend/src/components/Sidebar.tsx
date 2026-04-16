import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Typography, Stack, IconButton, Tooltip,
  Skeleton, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import BuildIcon from '@mui/icons-material/Build';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloudIcon from '@mui/icons-material/Cloud';
import LockIcon from '@mui/icons-material/Lock';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useProjectStore } from '../store/project';
import { useAuthStore } from '../store/auth';
import LanguageSwitcher from './LanguageSwitcher';

interface SessionItem {
  id: string;
  status: string;
  createdAt: string;
  title: string;
  plan: { id: string; locked: boolean; appType: string | null } | null;
  project: { id: string; status: string; paid: boolean; hosted: boolean } | null;
}

function StatusDot({ status, paid, hosted }: { status: string; paid?: boolean; hosted?: boolean }) {
  if (hosted) return <CloudIcon sx={{ fontSize: 11, color: 'secondary.main' }} />;
  if (status === 'running' && paid) return <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#10b981', flexShrink: 0 }} />;
  if (status === 'running') return <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#6366f1', flexShrink: 0 }} />;
  if (status === 'error') return <ErrorOutlineIcon sx={{ fontSize: 13, color: 'error.main' }} />;
  if (status === 'generating' || status === 'building') return <BuildIcon sx={{ fontSize: 11, color: 'warning.main', animation: 'spin 2s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} />;
  if (status === 'planning') return <ChatBubbleOutlineIcon sx={{ fontSize: 11, color: 'text.disabled' }} />;
  return <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }} />;
}

interface Props {
  onNewProject: () => void;
  onClose?: () => void;
}

export default function Sidebar({ onNewProject, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId?: string }>();
  const store = useProjectStore();
  const user = useAuthStore((s) => s.user);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return t('sidebar.justNow');
    if (diff < 3_600_000) return t('sidebar.minutesAgo', { n: Math.floor(diff / 60_000) });
    if (diff < 86_400_000) return t('sidebar.hoursAgo', { n: Math.floor(diff / 3_600_000) });
    if (diff < 604_800_000) return t('sidebar.daysAgo', { n: Math.floor(diff / 86_400_000) });
    return d.toLocaleDateString('bg-BG', { month: 'short', day: 'numeric' });
  };

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<SessionItem[]>('/sessions')
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [store.projectId]); // refresh when a project is created

  const activeId = sessionId ?? store.sessionId ?? null;

  // Group into: in-progress (planning) and completed (has project)
  const planning = sessions.filter((s) => !s.project);
  const projects = sessions.filter((s) => s.project);

  const renderItem = (s: SessionItem) => {
    const isActive = s.id === activeId;
    const hasProject = !!s.project;

    return (
      <Box key={s.id}>
        <Box
          onClick={() => { navigate(`/chat/${s.id}`); onClose?.(); }}
          sx={{
            px: 1.5,
            py: 1,
            borderRadius: 2,
            cursor: 'pointer',
            bgcolor: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
            border: '1px solid',
            borderColor: isActive ? 'rgba(99,102,241,0.3)' : 'transparent',
            '&:hover': { bgcolor: isActive ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.04)' },
            transition: 'all 0.15s',
            group: 'item',
          }}
        >
          <Stack direction="row" alignItems="flex-start" gap={1}>
            {/* Icon */}
            <Box sx={{ mt: 0.2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16 }}>
              {hasProject
                ? <StatusDot status={s.project!.status} paid={s.project!.paid} hosted={s.project!.hosted} />
                : <FolderOpenIcon sx={{ fontSize: 13, color: s.plan ? 'primary.light' : 'text.disabled' }} />}
            </Box>

            {/* Title + meta */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'text.primary' : 'text.secondary',
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.title}
              </Typography>

              <Stack direction="row" gap={0.75} alignItems="center" mt={0.25} flexWrap="wrap">
                {s.plan?.appType && (
                  <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled', textTransform: 'capitalize' }}>
                    {s.plan.appType.replace('_', ' ')}
                  </Typography>
                )}
                {s.plan?.locked && !hasProject && (
                  <>
                    <Box sx={{ width: 2, height: 2, borderRadius: '50%', bgcolor: 'text.disabled' }} />
                    <LockIcon sx={{ fontSize: 9, color: 'text.disabled' }} />
                    <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled' }}>{t('sidebar.planReady')}</Typography>
                  </>
                )}
                {hasProject && s.project!.paid && (
                  <>
                    <Box sx={{ width: 2, height: 2, borderRadius: '50%', bgcolor: 'text.disabled' }} />
                    <CheckCircleOutlineIcon sx={{ fontSize: 10, color: '#10b981' }} />
                  </>
                )}
                <Box sx={{ flex: 1 }} />
                <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled', flexShrink: 0 }}>
                  {formatDate(s.createdAt)}
                </Typography>
              </Stack>
            </Box>

            {/* Open preview icon */}
            {hasProject && (
              <Tooltip title={t('sidebar.openPreview')} placement="right">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); navigate(`/preview/${s.project!.id}`); }}
                  sx={{
                    opacity: 0,
                    pointerEvents: 'none',
                    // Only make it clickable when the row is hovered; avoids accidental clicks on invisible icon.
                    '.MuiBox-root:hover &': { opacity: 1, pointerEvents: 'auto' },
                    p: 0.25,
                    color: 'text.disabled',
                    '&:hover': { color: 'text.primary' },
                  }}
                >
                  <OpenInNewIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Box>
      </Box>
    );
  };

  return (
    <Box
      sx={{
        width: { xs: '100%', md: 240 },
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(12,12,12,0.95)',
        overflow: 'hidden',
      }}
    >
      {/* Sidebar header */}
      <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="caption" fontWeight={700} sx={{ color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 1, fontSize: 10 }}>
            {t('sidebar.projects')}
          </Typography>
          <Tooltip title={t('sidebar.newProject')} placement="right">
            <IconButton
              size="small"
              onClick={onNewProject}
              sx={{
                width: 24,
                height: 24,
                bgcolor: 'rgba(99,102,241,0.12)',
                color: 'primary.light',
                '&:hover': { bgcolor: 'rgba(99,102,241,0.22)' },
              }}
            >
              <AddIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Scrollable list */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 1,
          pb: 2,
          '&::-webkit-scrollbar': { width: 3 },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 4 },
        }}
      >
        {loading ? (
          <Stack gap={1} px={1} pt={1}>
            {[1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={44} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />)}
          </Stack>
        ) : (
          <>
            {/* Built projects */}
            {projects.length > 0 && (
              <Box mb={1}>
                <Typography variant="caption" sx={{ px: 1.5, display: 'block', mb: 0.5, fontSize: 10, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('sidebar.built')}
                </Typography>
                <Stack gap={0.5}>{projects.map(renderItem)}</Stack>
              </Box>
            )}

            {projects.length > 0 && planning.length > 0 && (
              <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.06)' }} />
            )}

            {/* Planning / in-progress */}
            {planning.length > 0 && (
              <Box>
                <Typography variant="caption" sx={{ px: 1.5, display: 'block', mb: 0.5, fontSize: 10, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('sidebar.inProgress')}
                </Typography>
                <Stack gap={0.5}>{planning.map(renderItem)}</Stack>
              </Box>
            )}

            {sessions.length === 0 && (
              <Box sx={{ px: 2, pt: 3, textAlign: 'center' }}>
                <FolderOpenIcon sx={{ fontSize: 28, color: 'rgba(255,255,255,0.08)', mb: 1 }} />
                <Typography variant="caption" color="text.disabled" display="block">
                  {t('sidebar.noProjects')}
                </Typography>
              </Box>
            )}
          </>
        )}
      </Box>

      <Box sx={{ px: 1.5, py: 1.25, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Typography variant="caption" color="text.secondary">
            {t('common.language')}
          </Typography>
          <LanguageSwitcher />
        </Stack>
      </Box>

      {/* Admin link */}
      {user?.isAdmin && (
        <Box sx={{ px: 1.5, py: 1.5, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <Box
            onClick={() => navigate('/admin')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 0.75,
              borderRadius: 2,
              cursor: 'pointer',
              '&:hover': { bgcolor: 'rgba(99,102,241,0.12)' },
              transition: 'all 0.15s',
            }}
          >
            <AdminPanelSettingsIcon sx={{ fontSize: 16, color: 'primary.light' }} />
            <Typography variant="caption" fontWeight={600} color="primary.light">
              {t('sidebar.adminPanel')}
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}
