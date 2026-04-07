import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuthStore, UserProfile } from './store/auth';
import { api } from './lib/api';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ChatPage from './pages/ChatPage';
import PreviewPage from './pages/PreviewPage';
import FilesPage from './pages/FilesPage';
import BillingPage from './pages/BillingPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ConnectDomainDocsPage from './pages/ConnectDomainDocsPage';
import { useParams, useSearchParams } from 'react-router-dom';

function PaymentsRedirect() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const qs = new URLSearchParams({ payments: '1' });
  if (searchParams.get('connected') === 'true') qs.set('connected', 'true');
  const err = searchParams.get('error');
  if (err) qs.set('error', err);
  return <Navigate to={`/preview/${projectId}?${qs}`} replace />;
}

function tokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function AuthRequired() {
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [verified, setVerified] = useState<'pending' | 'ok' | 'fail'>('pending');

  useEffect(() => {
    if (!tokenValid(token)) {
      setVerified('fail');
      return;
    }
    let cancelled = false;
    api
      .get<UserProfile>('/auth/me')
      .then((user) => {
        if (!cancelled) {
          updateUser(user);
          setVerified('ok');
        }
      })
      .catch(() => {
        if (!cancelled) {
          logout();
          setVerified('fail');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, logout, updateUser]);

  if (!tokenValid(token)) {
    if (token) logout();
    return <Navigate to="/" replace />;
  }

  if (verified === 'pending') {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (verified === 'fail') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<LandingPage scrollTo="pricing" />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<AuthRequired />}>
          {/* One route so /chat → /chat/:id does not remount ChatPage and drop in-flight state */}
          <Route path="/chat/:sessionId?" element={<ChatPage />} />
          <Route path="/preview/:projectId" element={<PreviewPage />} />
          <Route path="/files/:projectId" element={<FilesPage />} />
          <Route path="/analytics/:projectId" element={<AnalyticsPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/docs/connect-domain" element={<ConnectDomainDocsPage />} />
          <Route path="/payments/:projectId" element={<PaymentsRedirect />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
