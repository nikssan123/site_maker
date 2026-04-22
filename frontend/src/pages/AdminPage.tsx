import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, IconButton, Stack,
  CircularProgress, Paper, Grid, Chip, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, TextField, Select, MenuItem, FormControl, InputLabel,
  Collapse, Button, Snackbar, Alert, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import PeopleIcon from '@mui/icons-material/People';
import FolderIcon from '@mui/icons-material/Folder';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import ErrorIcon from '@mui/icons-material/Error';
import CloudIcon from '@mui/icons-material/Cloud';
import TimerIcon from '@mui/icons-material/Timer';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import EmailIcon from '@mui/icons-material/Email';
import StorageIcon from '@mui/icons-material/Storage';
import DescriptionIcon from '@mui/icons-material/Description';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import StopIcon from '@mui/icons-material/Stop';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import BuildIcon from '@mui/icons-material/Build';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import AppLogo from '../components/AppLogo';

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface Stats {
  totalUsers: number;
  totalProjects: number;
  totalSessions: number;
  paidProjects: number;
  hostedProjects: number;
  errorProjects: number;
  projectsByStatus: Record<string, number>;
  sessionsByStatus: Record<string, number>;
  totalPlanExecutions: number;
  paidGenerations: number;
  retryGenerations: number;
  usersLast7d: number;
  usersLast30d: number;
  projectsLast7d: number;
  avgGenerationSeconds: number | null;
}

interface DailyData {
  dailyUsers: Array<{ date: string; count: number }>;
  dailyProjects: Array<{ date: string; count: number }>;
}

interface UserRow {
  id: string;
  email: string;
  isAdmin: boolean;
  freeProjectUsed: boolean;
  createdAt: string;
  iterationSubStatus: string | null;
  iterationSubCurrentPeriodStart: string | null;
  iterationSubCurrentPeriodEnd: string | null;
  tokensLast30d: number;
  costCentsLast30d: number;
  _count: { sessions: number };
}

interface ProjectRow {
  id: string;
  kind?: 'project' | 'session';
  status: string;
  paid: boolean;
  hosted: boolean;
  customDomain: string | null;
  fixAttempts: number;
  errorLog: string | null;
  buildLog: string | null;
  paidIterationCredits: number;
  runPort: number | null;
  createdAt: string;
  updatedAt: string;
  session: { id: string; user: { email: string } };
  _count: { iterationLogs: number };
}

interface Revenue {
  paidProjectCount: number;
  hostedProjectCount: number;
  paidGenerationCount: number;
  estimatedGenerationRevenue: number;
  estimatedMonthlyHostingRevenue: number;
  activeImprovementSubs: number;
  estimatedMonthlyImprovementRevenue: number;
  topupPurchasesLast30d: number;
  estimatedTopupRevenueLast30d: number;
}

interface EmailHealth {
  byStatus: Record<string, number>;
  totalSent: number;
  deliveryRate: string;
  bounceRate: string;
  totalDomains: number;
  verifiedDomains: number;
}

interface ErrorProject {
  id: string;
  kind?: 'project' | 'session';
  errorLog: string | null;
  buildLog: string | null;
  fixAttempts: number;
  createdAt: string;
  updatedAt: string;
  session: { id: string; user: { email: string } };
}

interface GenerationRow {
  id: string;
  status: string;
  active: boolean;
  createdAt: string;
  user: { email: string };
  project: { id: string; status: string; runPort: number | null; errorLog: string | null; buildLog: string | null } | null;
  latestEvent: { id: number; payload: unknown; createdAt: string } | null;
}

interface GenerationLogResponse {
  sessionId: string;
  active: boolean;
  project: { id: string; buildLog: string | null; errorLog: string | null } | null;
  events: Array<{ id: number; payload: unknown; createdAt: string }>;
}

interface PlanRow {
  id: string;
  data: Record<string, unknown>;
  locked: boolean;
  createdAt: string;
  session: {
    id: string;
    status: string;
    user: { email: string };
    project: { id: string; status: string } | null;
  };
}

interface SystemInfo {
  diskUsage: string;
  projectDirCount: number;
  memoryUsage: { rss: number; heapUsed: number; heapTotal: number };
  uptime: number;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const ROWS_PER_PAGE_OPTIONS = [10, 20, 50, 100];

const TH_SX = { fontWeight: 700, whiteSpace: 'nowrap' as const } as const;

function StatCard({ label, value, icon, sub }: { label: string; value: string | number; icon: ReactNode; sub?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 }, borderRadius: 2, height: '100%' }}>
      <Stack direction="row" alignItems="center" gap={1} mb={{ xs: 0.5, sm: 1 }}>
        <Box sx={{ color: 'primary.main', display: 'flex', '& svg': { fontSize: { xs: 18, sm: 24 } } }}>{icon}</Box>
        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={600}
          textTransform="uppercase"
          letterSpacing={0.6}
          sx={{ fontSize: { xs: 10, sm: 11 }, lineHeight: 1.2 }}
        >
          {label}
        </Typography>
      </Stack>
      <Typography
        fontWeight={700}
        sx={{ fontSize: { xs: '1.35rem', sm: '1.8rem', md: '2.125rem' }, lineHeight: 1.15, wordBreak: 'break-word' }}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: 10, sm: 11 } }}>
          {sub}
        </Typography>
      )}
    </Paper>
  );
}

const STATUS_COLORS: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  running: 'success',
  error: 'error',
  generating: 'warning',
  building: 'info',
  planning: 'default',
  stopped: 'default',
};

const PIE_COLORS = ['#7c3aed', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#8b5cf6'];
const ADMIN_IMPORT_TEXT_EXTENSIONS = new Set([
  'html', 'css', 'js', 'jsx', 'ts', 'tsx', 'json', 'md', 'txt', 'yml', 'yaml',
  'toml', 'env', 'cjs', 'mjs', 'svg', 'xml',
]);

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatSeconds(s: number | null, naLabel = 'N/A'): string {
  if (s == null) return naLabel;
  const mins = Math.floor(s / 60);
  const secs = Math.round(s % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatUptime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isAdminImportTextFile(pathname: string): boolean {
  const clean = pathname.replace(/\\/g, '/');
  const base = clean.split('/').pop() ?? clean;
  if (base === 'Dockerfile' || base.startsWith('.env') || base.startsWith('.gitignore')) return true;
  const ext = base.includes('.') ? base.split('.').pop()?.toLowerCase() : '';
  return !!ext && ADMIN_IMPORT_TEXT_EXTENSIONS.has(ext);
}

async function readAdminImportFiles(fileList: FileList): Promise<Record<string, string>> {
  const entries = Array.from(fileList);
  const files: Record<string, string> = {};
  for (const file of entries) {
    const webkitPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const parts = webkitPath.replace(/\\/g, '/').split('/').filter(Boolean);
    const rel = parts.length > 1 ? parts.slice(1).join('/') : parts.join('/');
    if (!rel || /(^|\/)(node_modules|dist|dist-hosted|\.git)(\/|$)/i.test(rel)) continue;
    if (!isAdminImportTextFile(rel)) continue;
    files[rel] = await file.text();
  }
  return files;
}

function RepairPromptDialog({
  open,
  project,
  prompt,
  busy,
  onPromptChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  project: { id: string; errorLog: string | null; buildLog: string | null } | null;
  prompt: string;
  busy: boolean;
  onPromptChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>{t('admin.repairModal.title')}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {t('admin.repairModal.body')}
          </Typography>
          {project?.errorLog && (
            <Box>
              <Typography variant="caption" fontWeight={700} color="error.main">{t('admin.errorsTab.errorLog')}</Typography>
              <Box component="pre" sx={{ mt: 0.5, p: 1.5, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.35)', fontSize: 11, fontFamily: 'monospace', overflow: 'auto', maxHeight: 180, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {project.errorLog}
              </Box>
            </Box>
          )}
          {project?.buildLog && (
            <Box>
              <Typography variant="caption" fontWeight={700}>{t('admin.errorsTab.buildLog')}</Typography>
              <Box component="pre" sx={{ mt: 0.5, p: 1.5, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.35)', fontSize: 11, fontFamily: 'monospace', overflow: 'auto', maxHeight: 180, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {project.buildLog}
              </Box>
            </Box>
          )}
          <TextField
            autoFocus
            multiline
            minRows={6}
            label={t('admin.repairModal.promptLabel')}
            placeholder={t('admin.repairModal.promptPlaceholder')}
            value={prompt}
            disabled={busy}
            onChange={(e) => onPromptChange(e.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{t('admin.common.cancel')}</Button>
        <Button
          variant="contained"
          onClick={onSubmit}
          disabled={busy || prompt.trim().length === 0}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <BuildIcon fontSize="small" />}
        >
          {busy ? t('admin.repairModal.running') : t('admin.repairModal.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ─── Tab Panels ─────────────────────────────────────────────────────────── */

function OverviewPanel() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [daily, setDaily] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Stats>('/admin/stats'),
      api.get<DailyData>('/admin/stats/daily?days=30'),
    ])
      .then(([s, d]) => { setStats(s); setDaily(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (!stats) return <Typography color="error">{t('admin.failed.stats')}</Typography>;

  const chartData = daily
    ? daily.dailyUsers.map((u, i) => ({
        date: u.date,
        users: u.count,
        projects: daily.dailyProjects[i]?.count ?? 0,
      }))
    : [];

  const statusData = Object.entries(stats.projectsByStatus).map(([name, value]) => ({ name, value }));

  return (
    <Stack spacing={{ xs: 2, sm: 3 }}>
      <Grid container spacing={{ xs: 1, sm: 2 }}>
        <Grid item xs={6} sm={4} md={3}><StatCard label={t('admin.overview.totalUsers')} value={stats.totalUsers} icon={<PeopleIcon />} sub={t('admin.overview.last7d', { n: stats.usersLast7d })} /></Grid>
        <Grid item xs={6} sm={4} md={3}><StatCard label={t('admin.overview.totalProjects')} value={stats.totalProjects} icon={<FolderIcon />} sub={t('admin.overview.last7d', { n: stats.projectsLast7d })} /></Grid>
        <Grid item xs={6} sm={4} md={3}><StatCard label={t('admin.overview.paidProjects')} value={stats.paidProjects} icon={<AttachMoneyIcon />} /></Grid>
        <Grid item xs={6} sm={4} md={3}><StatCard label={t('admin.overview.hosted')} value={stats.hostedProjects} icon={<CloudIcon />} /></Grid>
        <Grid item xs={6} sm={4} md={3}><StatCard label={t('admin.overview.errors')} value={stats.errorProjects} icon={<ErrorIcon />} /></Grid>
        <Grid item xs={6} sm={4} md={3}><StatCard label={t('admin.overview.avgGenTime')} value={formatSeconds(stats.avgGenerationSeconds, t('admin.common.na'))} icon={<TimerIcon />} /></Grid>
        <Grid item xs={6} sm={4} md={3}><StatCard label={t('admin.overview.paidGenerations')} value={stats.paidGenerations} icon={<TrendingUpIcon />} sub={t('admin.overview.retries', { n: stats.retryGenerations })} /></Grid>
        <Grid item xs={6} sm={4} md={3}><StatCard label={t('admin.overview.totalSessions')} value={stats.totalSessions} icon={<DescriptionIcon />} /></Grid>
      </Grid>

      <Grid container spacing={{ xs: 1, sm: 2 }}>
        <Grid item xs={12} md={8}>
          <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 }, borderRadius: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} mb={2}>{t('admin.overview.dailyActivity')}</Typography>
            {chartData.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}><Typography color="text.secondary" variant="body2">{t('admin.overview.noDataYet')}</Typography></Box>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradProjects" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                  <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip contentStyle={{ background: '#1e1b4b', border: '1px solid #3b3077', borderRadius: 8, fontSize: 12 }} labelFormatter={formatShortDate} />
                  <Area type="monotone" dataKey="users" stroke="#7c3aed" fill="url(#gradUsers)" name={t('admin.overview.chartUsers')} />
                  <Area type="monotone" dataKey="projects" stroke="#10b981" fill="url(#gradProjects)" name={t('admin.overview.chartProjects')} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 }, borderRadius: 2, height: '100%' }}>
            <Typography variant="subtitle2" fontWeight={700} mb={2}>{t('admin.overview.projectsByStatus')}</Typography>
            {statusData.length === 0 ? (
              <Typography color="text.secondary" variant="body2">{t('admin.overview.noProjects')}</Typography>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${t(`admin.statusLabels.${name}`, { defaultValue: name })}: ${value}`}>
                    {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={{ background: '#1e1b4b', border: '1px solid #3b3077', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}

function UsersPanel() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [grantFor, setGrantFor] = useState<UserRow | null>(null);
  const [grantTokens, setGrantTokens] = useState('50000');
  const [grantNote, setGrantNote] = useState('');
  const [grantSaving, setGrantSaving] = useState(false);
  const [toast, setToast] = useState<{ open: boolean; severity: 'success' | 'error'; message: string }>({ open: false, severity: 'success', message: '' });

  const load = (p: number, rpp: number, s: string) => {
    setLoading(true);
    api.get<{ users: UserRow[]; total: number }>(`/admin/users?page=${p + 1}&limit=${rpp}&search=${encodeURIComponent(s)}`)
      .then((d) => { setUsers(d.users); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page, rowsPerPage, search); }, [page, rowsPerPage, search]);

  const submitGrant = async () => {
    if (!grantFor) return;
    const n = parseInt(grantTokens, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setToast({ open: true, severity: 'error', message: t('admin.tokens.grantInvalid') });
      return;
    }
    setGrantSaving(true);
    try {
      await api.adminGrantTokens(grantFor.id, {
        tokens: n,
        reason: 'admin_grant',
        note: grantNote.trim() || undefined,
      });
      setToast({ open: true, severity: 'success', message: t('admin.tokens.grantSaved') });
      setGrantFor(null);
      setGrantTokens('50000');
      setGrantNote('');
    } catch (err) {
      setToast({ open: true, severity: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setGrantSaving(false);
    }
  };

  return (
    <Stack spacing={2}>
      <TextField
        size="small" placeholder={t('admin.users.searchPlaceholder')} value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        sx={{ maxWidth: 350 }}
      />
      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress size={28} /></Box> : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell align="center" sx={TH_SX}>{t('admin.users.colEmail')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.users.colAdmin')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.users.colSessions')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.users.colFreeUsed')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.users.colSubStatus')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.users.colTokens30d')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.users.colCost30d')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.users.colJoined')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.users.colActions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell align="center">{u.email}</TableCell>
                  <TableCell align="center">{u.isAdmin ? <Chip label={t('admin.users.adminChip')} size="small" color="primary" /> : '-'}</TableCell>
                  <TableCell align="center">{u._count.sessions}</TableCell>
                  <TableCell align="center">{u.freeProjectUsed ? t('admin.common.yes') : t('admin.common.no')}</TableCell>
                  <TableCell align="center">
                    {u.iterationSubStatus ? (
                      <Chip
                        size="small"
                        label={u.iterationSubStatus}
                        color={u.iterationSubStatus === 'active' ? 'success' : 'default'}
                      />
                    ) : '-'}
                  </TableCell>
                  <TableCell align="center">{u.tokensLast30d.toLocaleString()}</TableCell>
                  <TableCell align="center">{(u.costCentsLast30d / 100).toFixed(2)} €</TableCell>
                  <TableCell align="center">{formatDate(u.createdAt)}</TableCell>
                  <TableCell align="center">
                    <Button size="small" variant="outlined" onClick={() => setGrantFor(u)}>
                      {t('admin.tokens.grantCta')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow><TableCell colSpan={9} align="center">{t('admin.users.noUsers')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div" count={total} page={page} rowsPerPage={rowsPerPage}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
          />
        </TableContainer>
      )}

      {grantFor && (
        <Paper variant="outlined" sx={{ p: 2, borderColor: 'primary.main' }}>
          <Typography variant="subtitle2" fontWeight={700} mb={1}>
            {t('admin.tokens.grantTitle', { email: grantFor.email })}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} alignItems={{ sm: 'flex-end' }}>
            <TextField
              label={t('admin.tokens.grantTokensLabel')}
              value={grantTokens}
              onChange={(e) => setGrantTokens(e.target.value)}
              size="small"
              type="number"
              inputProps={{ min: 1 }}
              sx={{ minWidth: 160 }}
            />
            <TextField
              label={t('admin.tokens.grantNoteLabel')}
              value={grantNote}
              onChange={(e) => setGrantNote(e.target.value)}
              size="small"
              fullWidth
            />
            <Button variant="contained" onClick={submitGrant} disabled={grantSaving}>
              {grantSaving ? '…' : t('admin.tokens.grantConfirm')}
            </Button>
            <Button onClick={() => setGrantFor(null)} disabled={grantSaving}>
              {t('admin.common.cancel')}
            </Button>
          </Stack>
        </Paper>
      )}

      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast((s) => ({ ...s, open: false }))}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}

function ProjectsPanel() {
  const { t } = useTranslation();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ open: boolean; severity: 'success' | 'error'; message: string }>({ open: false, severity: 'success', message: '' });
  const [repairProject, setRepairProject] = useState<ProjectRow | null>(null);
  const [repairPrompt, setRepairPrompt] = useState('');
  const [importProject, setImportProject] = useState<ProjectRow | null>(null);

  const load = (p: number, rpp: number, s: string) => {
    setLoading(true);
    const q = s ? `&status=${s}` : '';
    api.get<{ projects: ProjectRow[]; total: number }>(`/admin/projects?page=${p + 1}&limit=${rpp}${q}`)
      .then((d) => { setProjects(d.projects); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page, rowsPerPage, status); }, [page, rowsPerPage, status]);

  const doAction = async (projectId: string, action: 'stop' | 'restart' | 'clear-error' | 'delete', confirmKey: string) => {
    if (!window.confirm(t(`admin.projects.${confirmKey}`))) return;
    setActing(projectId);
    try {
      if (action === 'delete') {
        await api.delete(`/admin/projects/${projectId}`);
      } else {
        await api.post(`/admin/projects/${projectId}/${action}`);
      }
      setToast({ open: true, severity: 'success', message: t('admin.projects.actionSuccess') });
      load(page, rowsPerPage, status);
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: t('admin.projects.actionFailed', { message: e?.message ?? '?' }) });
    } finally {
      setActing(null);
    }
  };

  const stopSessionGeneration = async (sessionId: string) => {
    if (!window.confirm(t('admin.generations.confirmStop'))) return;
    setActing(sessionId);
    try {
      await api.post(`/admin/generations/${sessionId}/stop`, {});
      setToast({ open: true, severity: 'success', message: t('admin.generations.stopSuccess') });
      load(page, rowsPerPage, status);
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: t('admin.projects.actionFailed', { message: e?.message ?? '?' }) });
    } finally {
      setActing(null);
    }
  };

  const openRepair = (project: ProjectRow) => {
    setRepairProject(project);
    setRepairPrompt(project.errorLog || project.buildLog || '');
  };

  const submitRepair = async () => {
    if (!repairProject) return;
    const projectId = repairProject.id;
    setActing(projectId);
    try {
      await api.post(`/admin/projects/${projectId}/resolve`, { prompt: repairPrompt });
      setToast({ open: true, severity: 'success', message: t('admin.errorsTab.resolveSuccess') });
      setRepairProject(null);
      setRepairPrompt('');
      load(page, rowsPerPage, status);
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: t('admin.projects.actionFailed', { message: e?.message ?? '?' }) });
      load(page, rowsPerPage, status);
    } finally {
      setActing(null);
    }
  };

  const downloadProject = async (projectId: string) => {
    try {
      await api.download(`/admin/projects/${projectId}/download`, `project-${projectId}.zip`);
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: t('admin.projects.actionFailed', { message: e?.message ?? '?' }) });
    }
  };

  const openImport = (project: ProjectRow) => {
    setImportProject(project);
    importInputRef.current?.click();
  };

  const handleImportFiles = async (fileList: FileList | null) => {
    const project = importProject;
    setImportProject(null);
    if (!project || !fileList || fileList.length === 0) return;
    setActing(project.id);
    try {
      const files = await readAdminImportFiles(fileList);
      if (Object.keys(files).length === 0) {
        throw new Error(t('admin.import.noFiles'));
      }
      await api.post(`/admin/projects/${project.id}/import-files`, { files });
      setToast({ open: true, severity: 'success', message: t('admin.import.success', { n: Object.keys(files).length }) });
      load(page, rowsPerPage, status);
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: t('admin.projects.actionFailed', { message: e?.message ?? '?' }) });
      load(page, rowsPerPage, status);
    } finally {
      setActing(null);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const COL_COUNT = 10;

  return (
    <Stack spacing={2}>
      <input
        ref={importInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleImportFiles(e.target.files).catch(() => {})}
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
      />
      <FormControl size="small" sx={{ maxWidth: 200 }}>
        <InputLabel>{t('admin.projects.statusLabel')}</InputLabel>
        <Select value={status} label={t('admin.projects.statusLabel')} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <MenuItem value="">{t('admin.common.all')}</MenuItem>
          <MenuItem value="running">{t('admin.statusLabels.running')}</MenuItem>
          <MenuItem value="error">{t('admin.statusLabels.error')}</MenuItem>
          <MenuItem value="generating">{t('admin.statusLabels.generating')}</MenuItem>
          <MenuItem value="building">{t('admin.statusLabels.building')}</MenuItem>
          <MenuItem value="stopped">{t('admin.statusLabels.stopped')}</MenuItem>
        </Select>
      </FormControl>
      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress size={28} /></Box> : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell align="center" sx={{ ...TH_SX, width: 30 }} />
                <TableCell align="center" sx={TH_SX}>{t('admin.projects.colId')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.projects.colOwner')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.projects.colStatus')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.projects.colPaid')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.projects.colHosted')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.projects.colIterations')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.projects.colFixAttempts')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.projects.colCreated')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.projects.colActions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.map((p) => (
                <Box component="tbody" key={p.id}>
                  <TableRow hover sx={{ cursor: 'pointer' }}>
                    <TableCell align="center" sx={{ width: 30 }} onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                      {expanded === p.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </TableCell>
                    <TableCell align="center" sx={{ fontFamily: 'monospace', fontSize: 12 }} onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                      {p.id.slice(0, 8)}
                      {p.kind === 'session' && (
                        <Typography variant="caption" color="warning.main" display="block" sx={{ fontFamily: 'inherit' }}>
                          {t('admin.errorsTab.sessionOnly')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>{p.session.user.email}</TableCell>
                    <TableCell align="center" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                      <Chip label={t(`admin.statusLabels.${p.status}`, { defaultValue: p.status })} size="small" color={STATUS_COLORS[p.status] ?? 'default'} />
                    </TableCell>
                    <TableCell align="center" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>{p.paid ? t('admin.common.yes') : t('admin.common.no')}</TableCell>
                    <TableCell align="center" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>{p.hosted ? t('admin.common.yes') : t('admin.common.no')}{p.customDomain ? ` (${p.customDomain})` : ''}</TableCell>
                    <TableCell align="center" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>{t('admin.projects.iterationsCell', { n: p._count.iterationLogs, paid: p.paidIterationCredits })}</TableCell>
                    <TableCell align="center" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>{p.fixAttempts}</TableCell>
                    <TableCell align="center" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>{formatDate(p.createdAt)}</TableCell>
                    <TableCell align="center">
                      <Stack direction="row" gap={0.5} justifyContent="center" flexWrap="wrap">
                        {p.kind === 'session' ? (
                          <Tooltip title={t('admin.generations.stop')}>
                            <IconButton size="small" color="warning" disabled={acting === p.id || p.status !== 'generating'} onClick={() => stopSessionGeneration(p.id)}>
                              <StopIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : (p.status === 'running' || p.runPort) && (
                          <Tooltip title={t('admin.projects.actionStop')}>
                            <IconButton size="small" color="warning" disabled={acting === p.id} onClick={() => doAction(p.id, 'stop', 'confirmStop')}>
                              <StopIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {p.kind !== 'session' && (
                          <>
                            <Tooltip title={t('admin.projects.actionRestart')}>
                              <IconButton size="small" color="primary" disabled={acting === p.id} onClick={() => doAction(p.id, 'restart', 'confirmRestart')}>
                                <RestartAltIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={t('admin.projects.actionResolve')}>
                              <IconButton size="small" color="success" disabled={acting === p.id} onClick={() => openRepair(p)}>
                                <BuildIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={t('admin.import.download')}>
                              <IconButton size="small" color="primary" disabled={acting === p.id} onClick={() => downloadProject(p.id)}>
                                <DownloadIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={t('admin.import.upload')}>
                              <IconButton size="small" color="secondary" disabled={acting === p.id} onClick={() => openImport(p)}>
                                <UploadFileIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {p.status === 'error' && (
                              <Tooltip title={t('admin.projects.actionClearError')}>
                                <IconButton size="small" color="info" disabled={acting === p.id} onClick={() => doAction(p.id, 'clear-error', 'confirmClearError')}>
                                  <CleaningServicesIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title={t('admin.projects.actionDelete')}>
                              <IconButton size="small" color="error" disabled={acting === p.id} onClick={() => doAction(p.id, 'delete', 'confirmDelete')}>
                                <DeleteForeverIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        {acting === p.id && <CircularProgress size={16} />}
                      </Stack>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={COL_COUNT} sx={{ p: 0, border: 0 }}>
                      <Collapse in={expanded === p.id}>
                        <Box sx={{ p: 2, bgcolor: 'background.default' }}>
                          <Typography variant="caption" fontWeight={700}>{t('admin.projects.sessionId')}</Typography>
                          <Typography variant="body2" fontFamily="monospace" mb={1}>{p.session.id}</Typography>
                          {p.kind === 'session' && (
                            <Alert severity="warning" sx={{ mb: 1 }}>
                              {t('admin.projects.sessionOnlyHint')}
                            </Alert>
                          )}
                          {p.runPort && <><Typography variant="caption" fontWeight={700}>{t('admin.projects.port')}</Typography><Typography variant="body2" mb={1}>{p.runPort}</Typography></>}
                          <Typography variant="caption" fontWeight={700}>{t('admin.projects.updated')}</Typography>
                          <Typography variant="body2">{formatDate(p.updatedAt)}</Typography>
                          {p.errorLog && (
                            <Box mt={2}>
                              <Typography variant="caption" fontWeight={700} color="error.main">{t('admin.errorsTab.errorLog')}</Typography>
                              <Box component="pre" sx={{ mt: 0.5, p: 1.5, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.3)', fontSize: 11, fontFamily: 'monospace', overflow: 'auto', maxHeight: 260, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {p.errorLog}
                              </Box>
                            </Box>
                          )}
                          {p.buildLog && (
                            <Box mt={2}>
                              <Typography variant="caption" fontWeight={700}>{t('admin.errorsTab.buildLog')}</Typography>
                              <Box component="pre" sx={{ mt: 0.5, p: 1.5, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.3)', fontSize: 11, fontFamily: 'monospace', overflow: 'auto', maxHeight: 260, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {p.buildLog}
                              </Box>
                            </Box>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Box>
              ))}
              {projects.length === 0 && (
                <TableRow><TableCell colSpan={COL_COUNT} align="center">{t('admin.projects.noProjects')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div" count={total} page={page} rowsPerPage={rowsPerPage}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
          />
        </TableContainer>
      )}

      <Snackbar open={toast.open} autoHideDuration={5000} onClose={() => setToast((t) => ({ ...t, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} sx={{ width: '100%' }}>{toast.message}</Alert>
      </Snackbar>
      <RepairPromptDialog
        open={!!repairProject}
        project={repairProject}
        prompt={repairPrompt}
        busy={!!repairProject && acting === repairProject.id}
        onPromptChange={setRepairPrompt}
        onClose={() => {
          if (acting) return;
          setRepairProject(null);
          setRepairPrompt('');
        }}
        onSubmit={submitRepair}
      />
    </Stack>
  );
}

function RevenuePanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<Revenue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Revenue>('/admin/revenue').then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (!data) return <Typography color="error">{t('admin.failed.revenue')}</Typography>;

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6}>
        <StatCard
          label={t('admin.revenue.generationRevenue')}
          value={`€${data.estimatedGenerationRevenue.toLocaleString()}`}
          icon={<AttachMoneyIcon />}
          sub={t('admin.revenue.paidProjectsSub', { n: data.paidProjectCount })}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <StatCard
          label={t('admin.revenue.monthlyHosting')}
          value={t('admin.revenue.monthlyHostingValue', { value: data.estimatedMonthlyHostingRevenue.toLocaleString() })}
          icon={<CloudIcon />}
          sub={t('admin.revenue.hostedSub', { n: data.hostedProjectCount })}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <StatCard
          label={t('admin.revenue.improvementMrr')}
          value={`€${data.estimatedMonthlyImprovementRevenue.toLocaleString()}`}
          icon={<TrendingUpIcon />}
          sub={t('admin.revenue.improvementSubsSub', { n: data.activeImprovementSubs })}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <StatCard
          label={t('admin.revenue.topupRevenue30d')}
          value={`€${data.estimatedTopupRevenueLast30d.toLocaleString()}`}
          icon={<AttachMoneyIcon />}
          sub={t('admin.revenue.topupSub', { n: data.topupPurchasesLast30d })}
        />
      </Grid>
      <Grid item xs={12}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} mb={1}>{t('admin.revenue.summary')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('admin.revenue.summaryBody', {
              oneTime: data.estimatedGenerationRevenue.toLocaleString(),
              recurring: (
                data.estimatedMonthlyHostingRevenue + data.estimatedMonthlyImprovementRevenue
              ).toLocaleString(),
            })}
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {t('admin.revenue.paidGenerations', { n: data.paidGenerationCount })}
          </Typography>
        </Paper>
      </Grid>
    </Grid>
  );
}

function EmailHealthPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<EmailHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<EmailHealth>('/admin/email-health').then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (!data) return <Typography color="error">{t('admin.failed.email')}</Typography>;

  const pieData = Object.entries(data.byStatus).map(([name, value]) => ({ name, value }));

  return (
    <Stack spacing={3}>
      <Grid container spacing={2}>
        <Grid item xs={6} sm={3}><StatCard label={t('admin.email.totalSent')} value={data.totalSent} icon={<EmailIcon />} /></Grid>
        <Grid item xs={6} sm={3}><StatCard label={t('admin.email.deliveryRate')} value={`${data.deliveryRate}%`} icon={<TrendingUpIcon />} /></Grid>
        <Grid item xs={6} sm={3}><StatCard label={t('admin.email.bounceRate')} value={`${data.bounceRate}%`} icon={<ErrorIcon />} /></Grid>
        <Grid item xs={6} sm={3}><StatCard label={t('admin.email.domains')} value={`${data.verifiedDomains}/${data.totalDomains}`} icon={<StorageIcon />} sub={t('admin.email.verifiedTotal')} /></Grid>
      </Grid>
      {pieData.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} mb={2}>{t('admin.email.breakdown')}</Typography>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <RechartsTooltip contentStyle={{ background: '#1e1b4b', border: '1px solid #3b3077', borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Paper>
      )}
    </Stack>
  );
}

function GenerationsPanel() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<GenerationRow[]>([]);
  const [logs, setLogs] = useState<Record<string, GenerationLogResponse>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ open: boolean; severity: 'success' | 'error'; message: string }>({ open: false, severity: 'success', message: '' });

  const load = (p: number, rpp: number) => {
    setLoading(true);
    api.get<{ sessions: GenerationRow[]; total: number }>(`/admin/generations?page=${p + 1}&limit=${rpp}`)
      .then((d) => { setSessions(d.sessions); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(page, rowsPerPage); }, [page, rowsPerPage]);

  const loadLogs = async (sessionId: string) => {
    const data = await api.get<GenerationLogResponse>(`/admin/generations/${sessionId}/logs`);
    setLogs((prev) => ({ ...prev, [sessionId]: data }));
  };
  const toggleExpanded = async (sessionId: string) => {
    const next = expanded === sessionId ? null : sessionId;
    setExpanded(next);
    if (next && !logs[next]) await loadLogs(next).catch(() => {});
  };
  const stopGeneration = async (sessionId: string) => {
    setActing(sessionId);
    try {
      await api.post(`/admin/generations/${sessionId}/stop`, {});
      setToast({ open: true, severity: 'success', message: t('admin.generations.stopSuccess') });
      await loadLogs(sessionId).catch(() => {});
      load(page, rowsPerPage);
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: t('admin.projects.actionFailed', { message: e?.message ?? '?' }) });
    } finally {
      setActing(null);
    }
  };
  const eventTitle = (payload: unknown): string => {
    const p = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    if (p.type === 'codegen_prompt') return t('admin.generations.codegenPrompt');
    if (p.type === 'runner_log') return t('admin.generations.runnerLog', { step: String(p.step ?? '') });
    return String(p.type ?? p.label ?? 'event');
  };
  const renderPayload = (payload: unknown): string => {
    const p = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    if (p.type === 'codegen_prompt') return String(p.prompt ?? '');
    if (p.type === 'runner_log') return `[${String(p.step ?? 'runner')}] ${p.status ?? (p.success ? 'success' : 'failed')}\n${String(p.log ?? '')}`;
    return JSON.stringify(payload, null, 2);
  };

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">{t('admin.generations.countInfo', { n: total })}</Typography>
      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress size={28} /></Box> : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell align="center" sx={{ ...TH_SX, width: 30 }} />
                <TableCell align="center" sx={TH_SX}>{t('admin.generations.colSession')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.generations.colOwner')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.generations.colStatus')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.generations.colProject')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.generations.colCreated')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.generations.colActions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sessions.map((s) => (
                <Box component="tbody" key={s.id}>
                  <TableRow hover>
                    <TableCell align="center" onClick={() => toggleExpanded(s.id)}>
                      {expanded === s.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </TableCell>
                    <TableCell align="center" sx={{ fontFamily: 'monospace', fontSize: 12 }} onClick={() => toggleExpanded(s.id)}>{s.id.slice(0, 8)}</TableCell>
                    <TableCell align="center" onClick={() => toggleExpanded(s.id)}>{s.user.email}</TableCell>
                    <TableCell align="center" onClick={() => toggleExpanded(s.id)}>
                      <Stack direction="row" gap={0.75} justifyContent="center">
                        <Chip size="small" label={s.status} color={s.status === 'error' ? 'error' : s.active ? 'warning' : 'default'} />
                        {s.active && <Chip size="small" label={t('admin.generations.active')} color="success" variant="outlined" />}
                      </Stack>
                    </TableCell>
                    <TableCell align="center" sx={{ fontFamily: 'monospace', fontSize: 12 }} onClick={() => toggleExpanded(s.id)}>{s.project?.id?.slice(0, 8) ?? '-'}</TableCell>
                    <TableCell align="center" onClick={() => toggleExpanded(s.id)}>{formatDate(s.createdAt)}</TableCell>
                    <TableCell align="center">
                      <Button size="small" color="error" variant="outlined" startIcon={acting === s.id ? <CircularProgress size={14} color="inherit" /> : <StopIcon fontSize="small" />} disabled={acting === s.id || (!s.active && s.status !== 'generating')} onClick={() => stopGeneration(s.id)}>
                        {t('admin.generations.stop')}
                      </Button>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={7} sx={{ p: 0, border: 0 }}>
                      <Collapse in={expanded === s.id}>
                        <Box sx={{ p: 2, bgcolor: 'background.default' }}>
                          {!logs[s.id] ? <CircularProgress size={18} /> : (
                            <Stack spacing={1.5}>
                              {logs[s.id].events.map((ev) => (
                                <Box key={ev.id}>
                                  <Typography variant="caption" fontWeight={800}>{formatDate(ev.createdAt)} - {eventTitle(ev.payload)}</Typography>
                                  <Box component="pre" sx={{ mt: 0.5, p: 1.5, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.3)', fontSize: 11, fontFamily: 'monospace', overflow: 'auto', maxHeight: 260, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderPayload(ev.payload)}</Box>
                                </Box>
                              ))}
                              {logs[s.id].project?.buildLog && <Box><Typography variant="caption" fontWeight={800}>{t('admin.errorsTab.buildLog')}</Typography><Box component="pre" sx={{ mt: 0.5, p: 1.5, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.3)', fontSize: 11, fontFamily: 'monospace', overflow: 'auto', maxHeight: 260, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{logs[s.id].project?.buildLog}</Box></Box>}
                              {logs[s.id].project?.errorLog && <Box><Typography variant="caption" fontWeight={800} color="error.main">{t('admin.errorsTab.errorLog')}</Typography><Box component="pre" sx={{ mt: 0.5, p: 1.5, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.3)', fontSize: 11, fontFamily: 'monospace', overflow: 'auto', maxHeight: 260, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{logs[s.id].project?.errorLog}</Box></Box>}
                            </Stack>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Box>
              ))}
              {sessions.length === 0 && <TableRow><TableCell colSpan={7} align="center">{t('admin.generations.noRows')}</TableCell></TableRow>}
            </TableBody>
          </Table>
          <TablePagination component="div" count={total} page={page} rowsPerPage={rowsPerPage} onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }} rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS} />
        </TableContainer>
      )}
      <Snackbar open={toast.open} autoHideDuration={5000} onClose={() => setToast((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} onClose={() => setToast((s) => ({ ...s, open: false }))} sx={{ width: '100%' }}>{toast.message}</Alert>
      </Snackbar>
    </Stack>
  );
}

function PlansPanel() {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [appType, setAppType] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = (p: number, rpp: number, filter: string) => {
    setLoading(true);
    const q = filter ? `&appType=${encodeURIComponent(filter)}` : '';
    api.get<{ plans: PlanRow[]; total: number }>(`/admin/plans?page=${p + 1}&limit=${rpp}${q}`)
      .then((d) => { setPlans(d.plans); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page, rowsPerPage, appType); }, [page, rowsPerPage, appType]);

  return (
    <Stack spacing={2}>
      <FormControl size="small" sx={{ maxWidth: 200 }}>
        <InputLabel>{t('admin.plans.appTypeLabel')}</InputLabel>
        <Select value={appType} label={t('admin.plans.appTypeLabel')} onChange={(e) => { setAppType(e.target.value); setPage(0); }}>
          <MenuItem value="">{t('admin.common.all')}</MenuItem>
          <MenuItem value="e-shop">{t('admin.plans.appTypeEShop')}</MenuItem>
          <MenuItem value="booking">{t('admin.plans.appTypeBooking')}</MenuItem>
          <MenuItem value="blog">{t('admin.plans.appTypeBlog')}</MenuItem>
          <MenuItem value="portfolio">{t('admin.plans.appTypePortfolio')}</MenuItem>
          <MenuItem value="contact">{t('admin.plans.appTypeContact')}</MenuItem>
        </Select>
      </FormControl>
      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress size={28} /></Box> : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell align="center" sx={{ ...TH_SX, width: 30 }} />
                <TableCell align="center" sx={TH_SX}>{t('admin.plans.colOwner')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.plans.colAppType')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.plans.colLocked')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.plans.colSessionStatus')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.plans.colProject')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.plans.colCreated')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {plans.map((p) => {
                const planData = p.data as Record<string, unknown>;
                return (
                  <Box component="tbody" key={p.id}>
                    <TableRow hover onClick={() => setExpanded(expanded === p.id ? null : p.id)} sx={{ cursor: 'pointer' }}>
                      <TableCell align="center" sx={{ width: 30 }}>
                        {expanded === p.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      </TableCell>
                      <TableCell align="center">{p.session.user.email}</TableCell>
                      <TableCell align="center">
                        {planData.appType ? <Chip label={String(planData.appType)} size="small" color="primary" variant="outlined" /> : '-'}
                      </TableCell>
                      <TableCell align="center">{p.locked ? <Chip label={t('admin.plans.chipLocked')} size="small" color="success" /> : <Chip label={t('admin.plans.chipDraft')} size="small" variant="outlined" />}</TableCell>
                      <TableCell align="center"><Chip label={t(`admin.statusLabels.${p.session.status}`, { defaultValue: p.session.status })} size="small" color={STATUS_COLORS[p.session.status] ?? 'default'} /></TableCell>
                      <TableCell align="center">
                        {p.session.project
                          ? <Chip label={t(`admin.statusLabels.${p.session.project.status}`, { defaultValue: p.session.project.status })} size="small" color={STATUS_COLORS[p.session.project.status] ?? 'default'} />
                          : '-'}
                      </TableCell>
                      <TableCell align="center">{formatDate(p.createdAt)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={7} sx={{ p: 0, border: 0 }}>
                        <Collapse in={expanded === p.id}>
                          <Box sx={{ p: 2, bgcolor: 'background.default' }}>
                            <Typography variant="caption" fontWeight={700} display="block" mb={0.5}>{t('admin.plans.planData')}</Typography>
                            {Boolean(planData.description) && (
                              <Box mb={1}>
                                <Typography variant="caption" fontWeight={600} color="primary.light">{t('admin.plans.description')}</Typography>
                                <Typography variant="body2">{String(planData.description)}</Typography>
                              </Box>
                            )}
                            {Array.isArray(planData.pages) && planData.pages.length > 0 && (
                              <Box mb={1}>
                                <Typography variant="caption" fontWeight={600} color="primary.light">{t('admin.plans.pages')}</Typography>
                                <Stack direction="row" gap={0.5} flexWrap="wrap" mt={0.5}>
                                  {(planData.pages as Array<{ name?: string }>).map((pg, i) => (
                                    <Chip key={i} label={pg.name || t('admin.plans.pageFallback', { n: i + 1 })} size="small" variant="outlined" />
                                  ))}
                                </Stack>
                              </Box>
                            )}
                            {Array.isArray(planData.features) && planData.features.length > 0 && (
                              <Box mb={1}>
                                <Typography variant="caption" fontWeight={600} color="primary.light">{t('admin.plans.features')}</Typography>
                                <Stack direction="row" gap={0.5} flexWrap="wrap" mt={0.5}>
                                  {(planData.features as string[]).map((f, i) => (
                                    <Chip key={i} label={String(f)} size="small" variant="outlined" />
                                  ))}
                                </Stack>
                              </Box>
                            )}
                            {Array.isArray(planData.dataModels) && planData.dataModels.length > 0 && (
                              <Box mb={1}>
                                <Typography variant="caption" fontWeight={600} color="primary.light">{t('admin.plans.dataModels')}</Typography>
                                <Stack direction="row" gap={0.5} flexWrap="wrap" mt={0.5}>
                                  {(planData.dataModels as Array<{ name: string }>).map((m, i) => (
                                    <Chip key={i} label={m.name} size="small" color="secondary" variant="outlined" />
                                  ))}
                                </Stack>
                              </Box>
                            )}
                            {Boolean(planData.colorTheme) && (
                              <Box mb={1}>
                                <Typography variant="caption" fontWeight={600} color="primary.light">{t('admin.plans.colorTheme')}</Typography>
                                <Typography variant="body2" fontFamily="monospace" fontSize={12}>
                                  {JSON.stringify(planData.colorTheme)}
                                </Typography>
                              </Box>
                            )}
                            <Box mt={1}>
                              <Typography variant="caption" fontWeight={600} color="primary.light">{t('admin.plans.fullJson')}</Typography>
                              <Box
                                component="pre"
                                sx={{
                                  mt: 0.5, p: 1.5, borderRadius: 1,
                                  bgcolor: 'rgba(0,0,0,0.3)', fontSize: 11,
                                  fontFamily: 'monospace', overflow: 'auto',
                                  maxHeight: 300, whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {JSON.stringify(planData, null, 2)}
                              </Box>
                            </Box>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Box>
                );
              })}
              {plans.length === 0 && (
                <TableRow><TableCell colSpan={7} align="center">{t('admin.plans.noPlans')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div" count={total} page={page} rowsPerPage={rowsPerPage}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
          />
        </TableContainer>
      )}
    </Stack>
  );
}

function ErrorsPanel() {
  const { t } = useTranslation();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [projects, setProjects] = useState<ErrorProject[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ open: boolean; severity: 'success' | 'error'; message: string }>({ open: false, severity: 'success', message: '' });
  const [repairProject, setRepairProject] = useState<ErrorProject | null>(null);
  const [repairPrompt, setRepairPrompt] = useState('');
  const [importProject, setImportProject] = useState<ErrorProject | null>(null);

  const load = (p: number, rpp: number) => {
    setLoading(true);
    api.get<{ projects: ErrorProject[]; total: number }>(`/admin/errors?page=${p + 1}&limit=${rpp}`)
      .then((d) => { setProjects(d.projects); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page, rowsPerPage); }, [page, rowsPerPage]);

  const openRepair = (project: ErrorProject) => {
    if (project.kind === 'session') return;
    setRepairProject(project);
    setRepairPrompt(project.errorLog || project.buildLog || '');
  };

  const resolveProject = async () => {
    if (!repairProject) return;
    const projectId = repairProject.id;
    setActing(projectId);
    try {
      await api.post(`/admin/projects/${projectId}/resolve`, { prompt: repairPrompt });
      setToast({ open: true, severity: 'success', message: t('admin.errorsTab.resolveSuccess') });
      setRepairProject(null);
      setRepairPrompt('');
      load(page, rowsPerPage);
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: t('admin.projects.actionFailed', { message: e?.message ?? '?' }) });
      load(page, rowsPerPage);
    } finally {
      setActing(null);
    }
  };

  const downloadProject = async (projectId: string) => {
    try {
      await api.download(`/admin/projects/${projectId}/download`, `project-${projectId}.zip`);
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: t('admin.projects.actionFailed', { message: e?.message ?? '?' }) });
    }
  };

  const openImport = (project: ErrorProject) => {
    if (project.kind === 'session') return;
    setImportProject(project);
    importInputRef.current?.click();
  };

  const handleImportFiles = async (fileList: FileList | null) => {
    const project = importProject;
    setImportProject(null);
    if (!project || !fileList || fileList.length === 0) return;
    setActing(project.id);
    try {
      const files = await readAdminImportFiles(fileList);
      if (Object.keys(files).length === 0) {
        throw new Error(t('admin.import.noFiles'));
      }
      await api.post(`/admin/projects/${project.id}/import-files`, { files });
      setToast({ open: true, severity: 'success', message: t('admin.import.success', { n: Object.keys(files).length }) });
      load(page, rowsPerPage);
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: t('admin.projects.actionFailed', { message: e?.message ?? '?' }) });
      load(page, rowsPerPage);
    } finally {
      setActing(null);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  return (
    <Stack spacing={2}>
      <input
        ref={importInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleImportFiles(e.target.files).catch(() => {})}
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
      />
      <Typography variant="body2" color="text.secondary">{t('admin.errorsTab.countInfo', { n: total })}</Typography>
      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress size={28} /></Box> : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell align="center" sx={{ ...TH_SX, width: 30 }} />
                <TableCell align="center" sx={TH_SX}>{t('admin.errorsTab.colId')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.errorsTab.colOwner')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.errorsTab.colFixAttempts')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.errorsTab.colUpdated')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.errorsTab.colActions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.map((p) => (
                <Box component="tbody" key={p.id}>
                  <TableRow hover sx={{ cursor: 'pointer' }}>
                    <TableCell align="center" sx={{ width: 30 }} onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                      {expanded === p.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </TableCell>
                    <TableCell align="center" sx={{ fontFamily: 'monospace', fontSize: 12 }} onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                      {p.id.slice(0, 8)}
                      {p.kind === 'session' && (
                        <Typography variant="caption" color="warning.main" display="block" sx={{ fontFamily: 'inherit' }}>
                          {t('admin.errorsTab.sessionOnly')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>{p.session.user.email}</TableCell>
                    <TableCell align="center" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>{p.fixAttempts}</TableCell>
                    <TableCell align="center" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>{formatDate(p.updatedAt)}</TableCell>
                    <TableCell align="center">
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={acting === p.id ? <CircularProgress size={14} color="inherit" /> : <BuildIcon fontSize="small" />}
                        disabled={acting === p.id || p.kind === 'session'}
                        onClick={() => openRepair(p)}
                      >
                        {t('admin.errorsTab.resolveCta')}
                      </Button>
                      <Tooltip title={t('admin.import.download')}>
                        <IconButton size="small" color="primary" disabled={acting === p.id || p.kind === 'session'} onClick={() => downloadProject(p.id)}>
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('admin.import.upload')}>
                        <IconButton size="small" color="secondary" disabled={acting === p.id || p.kind === 'session'} onClick={() => openImport(p)}>
                          <UploadFileIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={6} sx={{ p: 0, border: 0 }}>
                      <Collapse in={expanded === p.id}>
                        <Box sx={{ p: 2, bgcolor: 'background.default' }}>
                          {p.errorLog && (
                            <Box mb={2}>
                              <Typography variant="caption" fontWeight={700} color="error.main">{t('admin.errorsTab.errorLog')}</Typography>
                              <Box component="pre" sx={{ mt: 0.5, p: 1.5, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.3)', fontSize: 11, fontFamily: 'monospace', overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {p.errorLog}
                              </Box>
                            </Box>
                          )}
                          {p.buildLog && (
                            <Box>
                              <Typography variant="caption" fontWeight={700}>{t('admin.errorsTab.buildLog')}</Typography>
                              <Box component="pre" sx={{ mt: 0.5, p: 1.5, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.3)', fontSize: 11, fontFamily: 'monospace', overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {p.buildLog}
                              </Box>
                            </Box>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Box>
              ))}
              {projects.length === 0 && (
                <TableRow><TableCell colSpan={6} align="center">{t('admin.errorsTab.noErrors')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div" count={total} page={page} rowsPerPage={rowsPerPage}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
          />
        </TableContainer>
      )}
      <Snackbar open={toast.open} autoHideDuration={5000} onClose={() => setToast((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} onClose={() => setToast((s) => ({ ...s, open: false }))} sx={{ width: '100%' }}>{toast.message}</Alert>
      </Snackbar>
      <RepairPromptDialog
        open={!!repairProject}
        project={repairProject}
        prompt={repairPrompt}
        busy={!!repairProject && acting === repairProject.id}
        onPromptChange={setRepairPrompt}
        onClose={() => {
          if (acting) return;
          setRepairProject(null);
          setRepairPrompt('');
        }}
        onSubmit={resolveProject}
      />
    </Stack>
  );
}

interface SupportTicketRow {
  id: string;
  userId: string | null;
  userEmail: string;
  name: string;
  contactEmail: string;
  contactPhone: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function SupportPanel() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const load = (p: number, rpp: number, status: 'all' | 'open' | 'resolved') => {
    setLoading(true);
    api.adminSupportTicketsList({ page: p + 1, limit: rpp, status })
      .then((d) => { setTickets(d.tickets); setTotal(d.total); setOpenCount(d.openCount); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page, rowsPerPage, statusFilter); }, [page, rowsPerPage, statusFilter]);

  const toggleStatus = async (row: SupportTicketRow) => {
    const next: 'open' | 'resolved' = row.status === 'resolved' ? 'open' : 'resolved';
    setBusyId(row.id);
    setErrorMsg('');
    try {
      await api.adminSupportTicketUpdate(row.id, next);
      load(page, rowsPerPage, statusFilter);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ sm: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {t('admin.supportTab.countInfo', { n: total, open: openCount })}
        </Typography>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>{t('admin.supportTab.filterLabel')}</InputLabel>
          <Select
            label={t('admin.supportTab.filterLabel')}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as 'all' | 'open' | 'resolved'); setPage(0); }}
          >
            <MenuItem value="open">{t('admin.supportTab.statusOpen')}</MenuItem>
            <MenuItem value="resolved">{t('admin.supportTab.statusResolved')}</MenuItem>
            <MenuItem value="all">{t('admin.supportTab.statusAll')}</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {errorMsg && <Alert severity="error" onClose={() => setErrorMsg('')}>{errorMsg}</Alert>}

      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress size={28} /></Box> : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell align="center" sx={{ ...TH_SX, width: 30 }} />
                <TableCell align="center" sx={TH_SX}>{t('admin.supportTab.colName')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.supportTab.colEmail')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.supportTab.colStatus')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.supportTab.colCreated')}</TableCell>
                <TableCell align="center" sx={TH_SX}>{t('admin.supportTab.colActions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tickets.map((row) => (
                <Box component="tbody" key={row.id}>
                  <TableRow hover onClick={() => setExpanded(expanded === row.id ? null : row.id)} sx={{ cursor: 'pointer' }}>
                    <TableCell align="center" sx={{ width: 30 }}>
                      {expanded === row.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </TableCell>
                    <TableCell align="center">{row.name}</TableCell>
                    <TableCell align="center" sx={{ fontFamily: 'monospace', fontSize: 12 }}>{row.userEmail}</TableCell>
                    <TableCell align="center">
                      <Chip
                        size="small"
                        label={row.status === 'resolved' ? t('admin.supportTab.statusResolved') : t('admin.supportTab.statusOpen')}
                        color={row.status === 'resolved' ? 'success' : 'warning'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">{formatDate(row.createdAt)}</TableCell>
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={busyId === row.id}
                        onClick={() => toggleStatus(row)}
                      >
                        {busyId === row.id
                          ? '…'
                          : row.status === 'resolved'
                            ? t('admin.supportTab.reopen')
                            : t('admin.supportTab.markResolved')}
                      </Button>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={6} sx={{ p: 0, border: 0 }}>
                      <Collapse in={expanded === row.id}>
                        <Box sx={{ p: 2, bgcolor: 'background.default' }}>
                          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} mb={1.5} flexWrap="wrap">
                            <Box sx={{ minWidth: 180 }}>
                              <Typography variant="caption" fontWeight={700} sx={{ display: 'block' }}>
                                {t('admin.supportTab.contactEmail')}
                              </Typography>
                              <Typography
                                component="a"
                                href={`mailto:${row.contactEmail}`}
                                sx={{ fontSize: 12, fontFamily: 'monospace', color: 'primary.light', wordBreak: 'break-all' }}
                              >
                                {row.contactEmail}
                              </Typography>
                            </Box>
                            <Box sx={{ minWidth: 160 }}>
                              <Typography variant="caption" fontWeight={700} sx={{ display: 'block' }}>
                                {t('admin.supportTab.contactPhone')}
                              </Typography>
                              <Typography
                                component="a"
                                href={`tel:${row.contactPhone.replace(/[^\d+]/g, '')}`}
                                sx={{ fontSize: 12, fontFamily: 'monospace', color: 'primary.light' }}
                              >
                                {row.contactPhone}
                              </Typography>
                            </Box>
                            <Box sx={{ minWidth: 180 }}>
                              <Typography variant="caption" fontWeight={700} sx={{ display: 'block' }}>
                                {t('admin.supportTab.accountEmail')}
                              </Typography>
                              <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: 'text.secondary', wordBreak: 'break-all' }}>
                                {row.userEmail}
                              </Typography>
                            </Box>
                          </Stack>
                          <Typography variant="caption" fontWeight={700}>{t('admin.supportTab.description')}</Typography>
                          <Box
                            component="pre"
                            sx={{
                              mt: 0.5, p: 1.5, borderRadius: 1,
                              bgcolor: 'rgba(0,0,0,0.3)',
                              fontSize: 12, fontFamily: 'inherit',
                              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                              maxHeight: 320, overflow: 'auto',
                            }}
                          >
                            {row.description}
                          </Box>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Box>
              ))}
              {tickets.length === 0 && (
                <TableRow><TableCell colSpan={6} align="center">{t('admin.supportTab.noTickets')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div" count={total} page={page} rowsPerPage={rowsPerPage}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
          />
        </TableContainer>
      )}
    </Stack>
  );
}

function SystemPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get<SystemInfo>('/admin/system').then(setData).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (!data) return <Typography color="error">{t('admin.failed.system')}</Typography>;

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button startIcon={<RefreshIcon />} size="small" onClick={load}>{t('admin.common.refresh')}</Button>
      </Box>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label={t('admin.system.diskUsage')} value={data.diskUsage} icon={<StorageIcon />} sub={t('admin.system.diskUsageSub')} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label={t('admin.system.projectDirs')} value={data.projectDirCount} icon={<FolderIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label={t('admin.system.memoryRss')} value={`${data.memoryUsage.rss} MB`} icon={<StorageIcon />} sub={t('admin.system.memoryRssSub', { used: data.memoryUsage.heapUsed, total: data.memoryUsage.heapTotal })} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label={t('admin.system.uptime')} value={formatUptime(data.uptime)} icon={<TimerIcon />} />
        </Grid>
      </Grid>
    </Stack>
  );
}

/* ─── Main Admin Page ────────────────────────────────────────────────────── */

export default function AdminPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ height: ['100vh', '100dvh'], display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ gap: { xs: 0.5, sm: 1 }, minHeight: { xs: 52, sm: 64 }, px: { xs: 1, sm: 2 } }}>
          <IconButton onClick={() => navigate('/chat')} size="small" sx={{ mr: { xs: 0.5, sm: 1 } }}>
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center' }}>
            <AppLogo size="small" />
            <Box sx={{ mx: 0.5, width: '1px', height: 20, bgcolor: 'divider' }} />
          </Box>
          <AdminPanelSettingsIcon color="primary" sx={{ mr: 0.5 }} />
          <Typography
            variant="h6"
            fontWeight={700}
            sx={{ flex: 1, fontSize: { xs: '1rem', sm: '1.25rem' }, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {t('admin.title')}
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: { xs: 0.5, sm: 2 } }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label={t('admin.tabs.overview')} />
          <Tab label={t('admin.tabs.users')} />
          <Tab label={t('admin.tabs.projects')} />
          <Tab label={t('admin.tabs.revenue')} />
          <Tab label={t('admin.tabs.email')} />
          <Tab label={t('admin.tabs.generations')} />
          <Tab label={t('admin.tabs.plans')} />
          <Tab label={t('admin.tabs.errors')} />
          <Tab label={t('admin.tabs.support')} />
          <Tab label={t('admin.tabs.system')} />
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', p: { xs: 1.5, sm: 3 }, WebkitOverflowScrolling: 'touch' }}>
        {tab === 0 && <OverviewPanel />}
        {tab === 1 && <UsersPanel />}
        {tab === 2 && <ProjectsPanel />}
        {tab === 3 && <RevenuePanel />}
        {tab === 4 && <EmailHealthPanel />}
        {tab === 5 && <GenerationsPanel />}
        {tab === 6 && <PlansPanel />}
        {tab === 7 && <ErrorsPanel />}
        {tab === 8 && <SupportPanel />}
        {tab === 9 && <SystemPanel />}
      </Box>
    </Box>
  );
}
