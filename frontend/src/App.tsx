import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuthStore, UserProfile } from './store/auth';
import { api } from './lib/api';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ChatPage from './pages/ChatPage';
import PreviewPage from './pages/PreviewPage';
import FilesPage from './pages/FilesPage';
import EmailPage from './pages/EmailPage';
import BillingPage from './pages/BillingPage';
import SettingsPage from './pages/SettingsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ConnectDomainDocsPage from './pages/ConnectDomainDocsPage';
import AdminPage from './pages/AdminPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import CookieBanner from './components/CookieBanner';
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

function GuestOnly() {
  const token = useAuthStore((s) => s.token);
  if (tokenValid(token)) return <Navigate to="/chat" replace />;
  return <Outlet />;
}

function AdminRequired() {
  const user = useAuthStore((s) => s.user);
  if (!user?.isAdmin) return <Navigate to="/chat" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <CookieBanner />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<LandingPage scrollTo="pricing" />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        <Route element={<AuthRequired />}>
          {/* One route so /chat → /chat/:id does not remount ChatPage and drop in-flight state */}
          <Route path="/chat/:sessionId?" element={<ChatPage />} />
          <Route path="/preview/:projectId" element={<PreviewPage />} />
          <Route path="/files/:projectId" element={<FilesPage />} />
          <Route path="/email/:projectId" element={<EmailPage />} />
          <Route path="/analytics/:projectId" element={<AnalyticsPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/docs/connect-domain" element={<ConnectDomainDocsPage />} />
          <Route path="/payments/:projectId" element={<PaymentsRedirect />} />
          <Route element={<AdminRequired />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
