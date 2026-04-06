import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, TextField, Stack, Typography, IconButton,
  Tooltip, CircularProgress, Chip, Button, LinearProgress,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import LogoutIcon from '@mui/icons-material/Logout';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import MenuIcon from '@mui/icons-material/Menu';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Sidebar from '../components/Sidebar';

import MessageBubble from '../components/MessageBubble';
import PlanSummary from '../components/PlanSummary';
import GenerationStatus from '../components/GenerationStatus';
import UsageBanner from '../components/UsageBanner';

import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { useProjectStore, INITIAL_STEPS } from '../store/project';
import { ColorTheme, THEME_PRESETS } from '../components/ColorThemePicker';
import { estimateTokens, FREE_TOKEN_LIMIT } from '../components/UsageBanner';

/** Map GET /sessions/:id into store so refresh shows failed builds + full transcript. */
function applySessionFromApi(session: any) {
  useProjectStore.setState((s) => ({
    messages: (session.messages ?? []).map((m: { role: 'user' | 'assistant'; content: string }) => ({
      role: m.role,
      content: m.content,
    })),
    plan: session.plan ?? null,
  }));

  const proj = session.project as
    | { id: string; status: string; runPort?: number | null }
    | null
    | undefined;
  let phase: 'planning' | 'generating' | 'running' | 'error' = 'planning';
  let projectId: string | null = null;
  let runPort: number | null = null;

  const hasLivePreview =
    proj?.status === 'running' &&
    typeof proj.runPort === 'number' &&
    proj.runPort > 0;

  if (hasLivePreview) {
    projectId = proj!.id;
    runPort = proj!.runPort!;
    phase = 'running';
  } else if (session.status === 'error' || proj?.status === 'error') {
    projectId = proj?.id ?? null;
    phase = 'error';
  } else if (
    session.status === 'generating' ||
    (proj && (proj.status === 'generating' || proj.status === 'building'))
  ) {
    projectId = proj?.id ?? null;
    phase = 'generating';
  } else if (proj?.status === 'running') {
    // DB says "running" but no active preview port (stopped, stale, or inconsistent)
    projectId = proj.id;
    phase = 'planning';
  } else if (proj) {
    projectId = proj.id;
    phase = 'generating';
  }

  useProjectStore.setState({
    projectId,
    phase,
    runPort,
    generationFriendlyMessage: '',
    // Fresh planning session: clear pipeline UI. Keep steps for in-memory error (fatal → refetch).
    ...(phase === 'planning' ? { generationSteps: INITIAL_STEPS, fixAttempts: [] } : {}),
  });
}

export default function ChatPage() {
  const { t } = useTranslation();
  const exampleKeys = ['chat.example1', 'chat.example2', 'chat.example3', 'chat.example4'] as const;
  const { sessionId: paramSessionId } = useParams<{ sessionId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [colorTheme, setColorTheme] = useState<ColorTheme>(THEME_PRESETS[0]); // Indigo default
  const [planVisible, setPlanVisible] = useState(false);
  /** When a plan is present, hide chat until user explicitly clicks Edit. */
  const [chatUnlockedForEditing, setChatUnlockedForEditing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** True while this tab started generation via Build (skip watch+resume duplicate). */
  const buildStartedInTabRef = useRef(false);
  /** Session ID last explicitly loaded from API in this component instance. */
  const loadedSessionRef = useRef<string | null>(null);

  const { logout, user, updateUser } = useAuthStore();
  const store = useProjectStore();

  const emitGenerationEvent = useCallback(
    (sessionId: string, event: any) => {
      const st = useProjectStore.getState();
      if (event.step) {
        st.updateStep({ step: event.step, label: event.label, status: event.status, detail: event.detail });
      }
      if (event.type === 'user_progress' && typeof event.message === 'string') {
        st.setGenerationFriendlyMessage(event.message);
      }
      if (event.type === 'fix_attempt') st.addFixAttempt({ attempt: event.attempt, error: event.error });
      if (event.type === 'done') {
        st.clearStreamBuffer();
        st.setGenerationFriendlyMessage('');
        const pid = event.projectId as string | undefined;
        const port = event.port as number | undefined;
        if (pid && typeof port === 'number') {
          st.setProjectId(pid);
          st.setRunPort(port);
          st.setPhase('running');
          navigate(`/preview/${pid}`);
        } else {
          const sid = st.sessionId ?? sessionId;
          if (sid) api.get<any>(`/sessions/${sid}`).then(applySessionFromApi).catch(() => {});
        }
      }
      if (event.type === 'fatal') {
        st.clearStreamBuffer();
        st.setGenerationFriendlyMessage('');
        st.setPhase('error');
        const sid = st.sessionId ?? sessionId;
        if (sid) {
          api.get<any>(`/sessions/${sid}`).then(applySessionFromApi).catch(() => {
            st.addMessage({ role: 'assistant', content: t('chat.errorFatal', { msg: event.message }) });
          });
        } else {
          st.addMessage({ role: 'assistant', content: t('chat.errorFatal', { msg: event.message }) });
        }
      }
    },
    [navigate, t],
  );

  const finishGenerationStream = useCallback((sessionId: string) => {
    buildStartedInTabRef.current = false;
    const st = useProjectStore.getState();
    st.setIsStreaming(false);
    const sid = st.sessionId ?? sessionId;
    if (st.phase === 'generating' && sid) {
      api.get<any>(`/sessions/${sid}`).then(applySessionFromApi).catch(() => {});
    }
  }, []);

  // Load session from backend when navigating to a different session
  useEffect(() => {
    if (!paramSessionId) {
      store.reset();
      loadedSessionRef.current = null;
      buildStartedInTabRef.current = false;
      return;
    }

    // Same session AND already loaded by this component instance — skip reload.
    // (handles navigate from /chat → /chat/:id after the first message)
    // We intentionally do NOT skip on fresh mount even if store.sessionId matches,
    // because an external store update (e.g. PreviewPage.loadProject) may have set
    // store.sessionId to a value that doesn't match the actual loaded content.
    if (loadedSessionRef.current === paramSessionId) return;

    loadedSessionRef.current = paramSessionId;

    // Only reset when truly switching sessions
    if (store.sessionId !== paramSessionId) {
      store.reset();
      buildStartedInTabRef.current = false;
    }
    store.setSessionId(paramSessionId);

    api.get<any>(`/sessions/${paramSessionId}`)
      .then((session) => {
        applySessionFromApi(session);
        if (session.plan) {
          setPlanVisible(true);
          setChatUnlockedForEditing(false);
        } else {
          setChatUnlockedForEditing(true);
        }
      })
      .catch(() => {});
  }, [paramSessionId]);

  useEffect(() => {
    if (searchParams.get('generate') === 'true' && paramSessionId) {
      store.setSessionId(paramSessionId);
      startGeneration(paramSessionId);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [store.messages, store.streamBuffer, store.plan]);

  /** Reattach SSE + ask backend to continue install/build after refresh or server restart. */
  useEffect(() => {
    if (!paramSessionId || store.phase !== 'generating') return;
    if (buildStartedInTabRef.current) return;

    useProjectStore.getState().setIsStreaming(true);
    const { cancel } = api.subscribeGenerationEvents(
      paramSessionId,
      (event: any) => emitGenerationEvent(paramSessionId, event),
      () => finishGenerationStream(paramSessionId),
    );

    void api.post('/generate/resume', { sessionId: paramSessionId }).catch(() => {});

    return () => {
      cancel();
    };
  }, [paramSessionId, store.phase, emitGenerationEvent, finishGenerationStream]);

  const startGeneration = (sessionId: string) => {
    buildStartedInTabRef.current = true;
    store.setPhase('generating');
    store.setIsStreaming(true);
    store.clearStreamBuffer();
    store.setGenerationFriendlyMessage(t('chat.buildStarted'));

    api.streamEvents(
      '/generate',
      { sessionId },
      (event: any) => emitGenerationEvent(sessionId, event),
      () => finishGenerationStream(sessionId),
    );
  };

  const handleSend = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || store.isStreaming || atChatLimit) return;
    setInput('');

    store.addMessage({ role: 'user', content: msg });
    store.setIsStreaming(true);

    try {
      const res = await api.post<any>('/chat', {
        message: msg,
        sessionId: store.sessionId ?? undefined,
      });

      const wasNewSession = !store.sessionId;
      if (wasNewSession) {
        store.setSessionId(res.sessionId);
      }

      store.addMessage({ role: 'assistant', content: res.message });
      if (res.plan) { store.setPlan(res.plan); }
      if (res.plan || store.plan) {
        setPlanVisible(true);
        setChatUnlockedForEditing(false);
      }

      // Navigate last so Zustand already has messages + plan before any route-driven effects run.
      if (wasNewSession) {
        navigate(`/chat/${res.sessionId}`, { replace: true });
      }
    } catch (err: any) {
      store.addMessage({ role: 'assistant', content: t('chat.errorGeneric') });
    } finally {
      store.setIsStreaming(false);
      api.get<any>('/auth/me').then(updateUser).catch(() => {});
    }
  };

  const handleExtractFromImage = useCallback(async (dataUrl: string): Promise<ColorTheme> => {
    return api.post<ColorTheme>('/chat/extract-colors', { imageDataUrl: dataUrl });
  }, []);

  const handleBuildIt = async () => {
    if (!store.plan || !store.sessionId) return;

    try {
      // Persist selected color theme into the plan before locking
      await api.patch(`/plan/${store.plan.id}`, { colorTheme });
    } catch {
      // Non-fatal — generation can still proceed with a default theme
    }

    try {
      await api.post(`/plan/${store.plan.id}/lock`);
      store.setPlan({ ...store.plan, locked: true });
    } catch (err: any) {
      store.addMessage({ role: 'assistant', content: t('chat.errorGeneric') });
      return;
    }

    if (user?.freeProjectUsed && store.sessionId) {
      try {
        const s = await api.get<{
          generationPurchased?: boolean;
          project?: { status: string } | null;
        }>(`/sessions/${store.sessionId}`);
        // Backend allows free retry when project failed after codegen; paid session skips checkout.
        if (s.generationPurchased || s.project?.status === 'error') {
          startGeneration(store.sessionId);
          return;
        }
      } catch {
        /* fall through to checkout */
      }

      setPaymentLoading(true);
      try {
        const { url } = await api.post<{ url: string }>('/billing/generation-checkout', {
          sessionId: store.sessionId,
        });
        window.location.href = url;
      } catch (err: any) {
        store.addMessage({ role: 'assistant', content: t('chat.errorGeneric') });
        setPaymentLoading(false);
      }
      return;
    }

    startGeneration(store.sessionId);
  };

  const isFreeProject = !user?.freeProjectUsed;
  const atChatLimit = isFreeProject && estimateTokens(store.messages) >= FREE_TOKEN_LIMIT;
  const isEmpty = store.messages.length === 0;
  const planBlockingChat =
    planVisible &&
    Boolean(store.plan) &&
    store.phase !== 'running' &&
    !chatUnlockedForEditing;

  const handleNewProject = () => {
    store.reset();
    navigate('/chat');
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', bgcolor: 'background.default', overflow: 'hidden' }}>

      {/* Sidebar */}
      {sidebarOpen && <Sidebar onNewProject={handleNewProject} />}

      {/* Main column */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(15,15,15,0.8)',
          backdropFilter: 'blur(12px)',
          flexShrink: 0,
        }}
      >
        <Tooltip title={sidebarOpen ? t('chat.sidebarHide') : t('chat.sidebarShow')}>
          <IconButton onClick={() => setSidebarOpen((v) => !v)} size="small" sx={{ color: 'text.secondary', mr: 1 }}>
            <MenuIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #10b981)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mr: 1.5,
          }}
        >
          <AutoAwesomeIcon sx={{ fontSize: 14, color: '#fff' }} />
        </Box>
        <Typography fontWeight={700} sx={{ flex: 1, letterSpacing: '-0.3px' }}>{t('common.appName')}</Typography>

        <Stack direction="row" gap={1} alignItems="center">
          {isFreeProject && (
            <Chip label={t('chat.freeProjectChip')} color="success" size="small" sx={{ height: 24, fontSize: 11 }} />
          )}
          <Tooltip title={t('common.signOut')}>
            <IconButton onClick={logout} size="small" sx={{ color: 'text.secondary' }}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {store.isStreaming && store.phase === 'planning' && (
        <LinearProgress
          variant="indeterminate"
          color="primary"
          sx={{
            flexShrink: 0,
            height: 2,
            bgcolor: 'rgba(99,102,241,0.12)',
            '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg, #6366f1, #10b981)' },
          }}
        />
      )}

      {/* Messages — full-width scroll container so the scrollbar spans the whole app */}
      <Box sx={{ flex: 1, overflowY: 'auto', width: '100%' }}>
      <Box
        sx={{
          px: { xs: 2, sm: 3 },
          py: 4,
          maxWidth: 760,
          width: '100%',
          mx: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <UsageBanner />

        {isEmpty && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', py: 8 }}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1, #10b981)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 3,
                boxShadow: '0 0 40px rgba(99,102,241,0.3)',
              }}
            >
              <AutoAwesomeIcon sx={{ fontSize: 26, color: '#fff' }} />
            </Box>
            <Typography
              variant="h5"
              fontWeight={700}
              mb={1}
              sx={{
                background: 'linear-gradient(135deg, #f1f5f9 0%, #94a3b8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {t('chat.emptyTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={4} maxWidth={400}>
              {t('chat.emptySubtitle')}
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1} justifyContent="center" maxWidth={500}>
              {exampleKeys.map((key) => {
                const ex = t(key);
                return (
                <Chip
                  key={key}
                  label={ex}
                  onClick={() => !atChatLimit && handleSend(ex)}
                  sx={{
                    cursor: 'pointer',
                    bgcolor: 'rgba(99,102,241,0.08)',
                    border: '1px solid rgba(99,102,241,0.2)',
                    color: 'text.secondary',
                    '&:hover': { bgcolor: 'rgba(99,102,241,0.15)', color: 'text.primary' },
                    transition: 'all 0.2s',
                  }}
                />
              );})}
            </Stack>
          </Box>
        )}

        {store.messages.map((m, i) => (
          !planBlockingChat ? <MessageBubble key={i} role={m.role} content={m.content} /> : null
        ))}

        {store.streamBuffer && (
          !planBlockingChat ? <MessageBubble role="assistant" content={store.streamBuffer} /> : null
        )}

        {planVisible && store.plan && store.phase !== 'running' && (
          <PlanSummary
            plan={store.plan}
            onConfirm={handleBuildIt}
            onEdit={() => {
              setChatUnlockedForEditing(true);
              setPlanVisible(false);
              // Keep focus behavior for quick edits
              inputRef.current?.focus();
            }}
            loading={store.isStreaming || paymentLoading}
            ctaLabel={isFreeProject ? t('plan.buildFree') : t('plan.buildPaid')}
            colorTheme={colorTheme}
            onThemeChange={setColorTheme}
            onExtractFromImage={handleExtractFromImage}
          />
        )}

        {(store.phase === 'generating' ||
          (store.phase === 'error' &&
            store.generationSteps.some((s) => s.status !== 'pending'))) && (
          <GenerationStatus
            steps={store.generationSteps}
            fixAttempts={store.fixAttempts}
            friendlyMessage={store.generationFriendlyMessage}
          />
        )}

        {store.phase === 'running' &&
          store.projectId &&
          store.runPort != null &&
          store.runPort > 0 && (
          <Box
            sx={{
              border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 3,
              p: 2,
              background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(99,102,241,0.04) 100%)',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981', flexShrink: 0, boxShadow: '0 0 8px #10b981' }} />
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              {t('chat.appRunning')}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              endIcon={<OpenInNewIcon fontSize="small" />}
              onClick={() => navigate(`/preview/${store.projectId}`)}
              sx={{ borderColor: 'rgba(16,185,129,0.4)', color: 'secondary.main', '&:hover': { borderColor: 'secondary.main' } }}
            >
              {t('chat.openPreview')}
            </Button>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>
      </Box>{/* end scroll container */}

      {/* Input — locked when project is active */}
      <Box
        sx={{
          px: { xs: 2, sm: 3 },
          py: 2.5,
          maxWidth: 760,
          width: '100%',
          mx: 'auto',
        }}
      >
        {store.phase === 'running' && store.projectId ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              px: 2.5,
              py: 1.75,
              borderRadius: 3,
              border: '1px solid rgba(16,185,129,0.2)',
              background: 'rgba(16,185,129,0.04)',
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} color="text.primary" noWrap>
                {t('chat.projectLocked')}
              </Typography>
              <Typography variant="caption" color="text.disabled">
                {t('chat.projectLockedHint')}
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="small"
              onClick={() => navigate(`/preview/${store.projectId}`)}
              sx={{
                flexShrink: 0,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                fontSize: 12,
                px: 2,
                '&:hover': { background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' },
              }}
            >
              {t('chat.openPreview')}
            </Button>
          </Box>
        ) : (
          !planBlockingChat ? (
          <>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 1,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 3,
                px: 2,
                py: 1.5,
                transition: 'border-color 0.2s, box-shadow 0.2s',
                '&:focus-within': {
                  borderColor: 'rgba(99,102,241,0.5)',
                  boxShadow: '0 0 0 3px rgba(99,102,241,0.08)',
                },
              }}
            >
              <TextField
                inputRef={inputRef}
                fullWidth
                multiline
                maxRows={5}
                variant="standard"
                placeholder={
                  store.phase === 'generating'
                    ? t('chat.placeholderBuilding')
                    : atChatLimit
                    ? t('chat.placeholderLimit')
                    : t('chat.placeholderDefault')
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                }}
                inputProps={{ readOnly: store.phase === 'generating' || atChatLimit }}
                InputProps={{ disableUnderline: true }}
                sx={{
                  '& .MuiInputBase-input': {
                    fontSize: '0.95rem',
                    lineHeight: 1.6,
                    color: 'text.primary',
                    '&::placeholder': { color: 'text.disabled', opacity: 1 },
                  },
                }}
              />
              <IconButton
                onClick={() => handleSend()}
                disabled={store.isStreaming || !input.trim() || store.phase === 'generating' || atChatLimit}
                sx={{
                  width: 36,
                  height: 36,
                  background: input.trim() ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.06)',
                  color: input.trim() ? '#fff' : 'text.disabled',
                  borderRadius: 2,
                  flexShrink: 0,
                  transition: 'all 0.2s',
                  '&:hover': { background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff' },
                  '&.Mui-disabled': { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.2)' },
                }}
              >
                {store.isStreaming
                  ? <CircularProgress size={16} sx={{ color: 'inherit' }} />
                  : <SendIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </Box>
            <Typography variant="caption" color="text.disabled" display="block" textAlign="center" mt={1}>
              {t('chat.sendHint')}
            </Typography>
          </>
          ) : null
        )}
      </Box>

      </Box>{/* end main column */}
    </Box>
  );
}
