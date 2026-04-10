import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, IconButton, Stack,
  CircularProgress, Paper, Grid, Chip, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, TextField, Select, MenuItem, FormControl, InputLabel,
  Collapse, Button,
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
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { api } from '../lib/api';

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
  _count: { sessions: number };
}

interface ProjectRow {
  id: string;
  status: string;
  paid: boolean;
  hosted: boolean;
  customDomain: string | null;
  fixAttempts: number;
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
  totalIterationCredits: number;
  estimatedGenerationRevenue: number;
  estimatedMonthlyHostingRevenue: number;
  estimatedIterationRevenue: number;
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
  errorLog: string | null;
  buildLog: string | null;
  fixAttempts: number;
  createdAt: string;
  updatedAt: string;
  session: { id: string; user: { email: string } };
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

function StatCard({ label, value, icon, sub }: { label: string; value: string | number; icon: ReactNode; sub?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      <Stack direction="row" alignItems="center" gap={1.5} mb={1}>
        <Box sx={{ color: 'primary.main' }}>{icon}</Box>
        <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.8}>
          {label}
        </Typography>
      </Stack>
      <Typography variant="h4" fontWeight={700}>{typeof value === 'number' ? value.toLocaleString() : value}</Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Paper>
  );
}

const STATUS_COLORS: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  running: 'success',
  error: 'error',
  generating: 'warning',
  building: 'info',
  planning: 'default',
};

const PIE_COLORS = ['#7c3aed', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#8b5cf6'];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatSeconds(s: number | null): string {
  if (s == null) return 'N/A';
  const mins = Math.floor(s / 60);
  const secs = Math.round(s % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatUptime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/* ─── Tab Panels ─────��────────────────────────���──────────────────────────── */

function OverviewPanel() {
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
  if (!stats) return <Typography color="error">Failed to load stats</Typography>;

  const chartData = daily
    ? daily.dailyUsers.map((u, i) => ({
        date: u.date,
        users: u.count,
        projects: daily.dailyProjects[i]?.count ?? 0,
      }))
    : [];

  const statusData = Object.entries(stats.projectsByStatus).map(([name, value]) => ({ name, value }));

  return (
    <Stack spacing={3}>
      <Grid container spacing={2}>
        <Grid item xs={6} sm={4} md={3}><StatCard label="Total Users" value={stats.totalUsers} icon={<PeopleIcon />} sub={`+${stats.usersLast7d} last 7d`} /></Grid>
        <Grid item xs={6} sm={4} md={3}><StatCard label="Total Projects" value={stats.totalProjects} icon={<FolderIcon />} sub={`+${stats.projectsLast7d} last 7d`} /></Grid>
        <Grid item xs={6} sm={4} md={3}><StatCard label="Paid Projects" value={stats.paidProjects} icon={<AttachMoneyIcon />} /></Grid>
        <Grid item xs={6} sm={4} md={3}><StatCard label="Hosted" value={stats.hostedProjects} icon={<CloudIcon />} /></Grid>
        <Grid item xs={6} sm={4} md={3}><StatCard label="Errors" value={stats.errorProjects} icon={<ErrorIcon />} /></Grid>
        <Grid item xs={6} sm={4} md={3}><StatCard label="Avg Gen Time" value={formatSeconds(stats.avgGenerationSeconds)} icon={<TimerIcon />} /></Grid>
        <Grid item xs={6} sm={4} md={3}><StatCard label="Paid Generations" value={stats.paidGenerations} icon={<TrendingUpIcon />} sub={`${stats.retryGenerations} retries`} /></Grid>
        <Grid item xs={6} sm={4} md={3}><StatCard label="Total Sessions" value={stats.totalSessions} icon={<DescriptionIcon />} /></Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} mb={2}>Daily Activity (30 days)</Typography>
            {chartData.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}><Typography color="text.secondary" variant="body2">No data yet</Typography></Box>
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
                  <Area type="monotone" dataKey="users" stroke="#7c3aed" fill="url(#gradUsers)" name="Users" />
                  <Area type="monotone" dataKey="projects" stroke="#10b981" fill="url(#gradProjects)" name="Projects" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, height: '100%' }}>
            <Typography variant="subtitle2" fontWeight={700} mb={2}>Projects by Status</Typography>
            {statusData.length === 0 ? (
              <Typography color="text.secondary" variant="body2">No projects</Typography>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
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
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = (p: number, s: string) => {
    setLoading(true);
    api.get<{ users: UserRow[]; total: number }>(`/admin/users?page=${p + 1}&limit=20&search=${encodeURIComponent(s)}`)
      .then((d) => { setUsers(d.users); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page, search); }, [page, search]);

  return (
    <Stack spacing={2}>
      <TextField
        size="small" placeholder="Search by email..." value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        sx={{ maxWidth: 350 }}
      />
      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress size={28} /></Box> : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Email</TableCell>
                <TableCell>Admin</TableCell>
                <TableCell>Sessions</TableCell>
                <TableCell>Free Used</TableCell>
                <TableCell>Joined</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.isAdmin ? <Chip label="Admin" size="small" color="primary" /> : '-'}</TableCell>
                  <TableCell>{u._count.sessions}</TableCell>
                  <TableCell>{u.freeProjectUsed ? 'Yes' : 'No'}</TableCell>
                  <TableCell>{formatDate(u.createdAt)}</TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow><TableCell colSpan={5} align="center">No users found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div" count={total} page={page} rowsPerPage={20}
            onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[20]}
          />
        </TableContainer>
      )}
    </Stack>
  );
}

function ProjectsPanel() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = (p: number, s: string) => {
    setLoading(true);
    const q = s ? `&status=${s}` : '';
    api.get<{ projects: ProjectRow[]; total: number }>(`/admin/projects?page=${p + 1}&limit=20${q}`)
      .then((d) => { setProjects(d.projects); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page, status); }, [page, status]);

  return (
    <Stack spacing={2}>
      <FormControl size="small" sx={{ maxWidth: 200 }}>
        <InputLabel>Status</InputLabel>
        <Select value={status} label="Status" onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="running">Running</MenuItem>
          <MenuItem value="error">Error</MenuItem>
          <MenuItem value="generating">Generating</MenuItem>
          <MenuItem value="building">Building</MenuItem>
        </Select>
      </FormControl>
      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress size={28} /></Box> : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>ID</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Paid</TableCell>
                <TableCell>Hosted</TableCell>
                <TableCell>Iterations</TableCell>
                <TableCell>Fix Attempts</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.map((p) => (
                <Box component="tbody" key={p.id}>
                  <TableRow hover onClick={() => setExpanded(expanded === p.id ? null : p.id)} sx={{ cursor: 'pointer' }}>
                    <TableCell sx={{ width: 30 }}>
                      {expanded === p.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{p.id.slice(0, 8)}</TableCell>
                    <TableCell>{p.session.user.email}</TableCell>
                    <TableCell><Chip label={p.status} size="small" color={STATUS_COLORS[p.status] ?? 'default'} /></TableCell>
                    <TableCell>{p.paid ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{p.hosted ? 'Yes' : 'No'}{p.customDomain ? ` (${p.customDomain})` : ''}</TableCell>
                    <TableCell>{p._count.iterationLogs} ({p.paidIterationCredits} paid)</TableCell>
                    <TableCell>{p.fixAttempts}</TableCell>
                    <TableCell>{formatDate(p.createdAt)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={9} sx={{ p: 0, border: 0 }}>
                      <Collapse in={expanded === p.id}>
                        <Box sx={{ p: 2, bgcolor: 'background.default' }}>
                          <Typography variant="caption" fontWeight={700}>Session ID:</Typography>
                          <Typography variant="body2" fontFamily="monospace" mb={1}>{p.session.id}</Typography>
                          {p.runPort && <><Typography variant="caption" fontWeight={700}>Port:</Typography><Typography variant="body2" mb={1}>{p.runPort}</Typography></>}
                          <Typography variant="caption" fontWeight={700}>Updated:</Typography>
                          <Typography variant="body2">{formatDate(p.updatedAt)}</Typography>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Box>
              ))}
              {projects.length === 0 && (
                <TableRow><TableCell colSpan={9} align="center">No projects found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div" count={total} page={page} rowsPerPage={20}
            onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[20]}
          />
        </TableContainer>
      )}
    </Stack>
  );
}

function RevenuePanel() {
  const [data, setData] = useState<Revenue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Revenue>('/admin/revenue').then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (!data) return <Typography color="error">Failed to load revenue data</Typography>;

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={4}>
        <StatCard
          label="Generation Revenue"
          value={`€${data.estimatedGenerationRevenue.toLocaleString()}`}
          icon={<AttachMoneyIcon />}
          sub={`${data.paidProjectCount} paid projects`}
        />
      </Grid>
      <Grid item xs={12} sm={4}>
        <StatCard
          label="Monthly Hosting"
          value={`€${data.estimatedMonthlyHostingRevenue.toLocaleString()}/mo`}
          icon={<CloudIcon />}
          sub={`${data.hostedProjectCount} hosted`}
        />
      </Grid>
      <Grid item xs={12} sm={4}>
        <StatCard
          label="Iteration Revenue"
          value={`���${data.estimatedIterationRevenue.toLocaleString()}`}
          icon={<TrendingUpIcon />}
          sub={`${data.totalIterationCredits} credits sold`}
        />
      </Grid>
      <Grid item xs={12}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} mb={1}>Summary</Typography>
          <Typography variant="body2" color="text.secondary">
            Total estimated revenue: €{(data.estimatedGenerationRevenue + data.estimatedIterationRevenue).toLocaleString()} (one-time)
            + €{data.estimatedMonthlyHostingRevenue.toLocaleString()}/mo (recurring)
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Paid generations: {data.paidGenerationCount}
          </Typography>
        </Paper>
      </Grid>
    </Grid>
  );
}

function EmailHealthPanel() {
  const [data, setData] = useState<EmailHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<EmailHealth>('/admin/email-health').then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (!data) return <Typography color="error">Failed to load email data</Typography>;

  const pieData = Object.entries(data.byStatus).map(([name, value]) => ({ name, value }));

  return (
    <Stack spacing={3}>
      <Grid container spacing={2}>
        <Grid item xs={6} sm={3}><StatCard label="Total Sent" value={data.totalSent} icon={<EmailIcon />} /></Grid>
        <Grid item xs={6} sm={3}><StatCard label="Delivery Rate" value={`${data.deliveryRate}%`} icon={<TrendingUpIcon />} /></Grid>
        <Grid item xs={6} sm={3}><StatCard label="Bounce Rate" value={`${data.bounceRate}%`} icon={<ErrorIcon />} /></Grid>
        <Grid item xs={6} sm={3}><StatCard label="Domains" value={`${data.verifiedDomains}/${data.totalDomains}`} icon={<StorageIcon />} sub="verified / total" /></Grid>
      </Grid>
      {pieData.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} mb={2}>Email Status Breakdown</Typography>
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

function PlansPanel() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [appType, setAppType] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = (p: number, t: string) => {
    setLoading(true);
    const q = t ? `&appType=${encodeURIComponent(t)}` : '';
    api.get<{ plans: PlanRow[]; total: number }>(`/admin/plans?page=${p + 1}&limit=20${q}`)
      .then((d) => { setPlans(d.plans); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page, appType); }, [page, appType]);

  return (
    <Stack spacing={2}>
      <FormControl size="small" sx={{ maxWidth: 200 }}>
        <InputLabel>App Type</InputLabel>
        <Select value={appType} label="App Type" onChange={(e) => { setAppType(e.target.value); setPage(0); }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="e-shop">E-Shop</MenuItem>
          <MenuItem value="booking">Booking</MenuItem>
          <MenuItem value="blog">Blog</MenuItem>
          <MenuItem value="portfolio">Portfolio</MenuItem>
          <MenuItem value="contact">Contact</MenuItem>
        </Select>
      </FormControl>
      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress size={28} /></Box> : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>Owner</TableCell>
                <TableCell>App Type</TableCell>
                <TableCell>Locked</TableCell>
                <TableCell>Session Status</TableCell>
                <TableCell>Project</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {plans.map((p) => {
                const planData = p.data as Record<string, unknown>;
                return (
                  <Box component="tbody" key={p.id}>
                    <TableRow hover onClick={() => setExpanded(expanded === p.id ? null : p.id)} sx={{ cursor: 'pointer' }}>
                      <TableCell sx={{ width: 30 }}>
                        {expanded === p.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      </TableCell>
                      <TableCell>{p.session.user.email}</TableCell>
                      <TableCell>
                        {planData.appType ? <Chip label={String(planData.appType)} size="small" color="primary" variant="outlined" /> : '-'}
                      </TableCell>
                      <TableCell>{p.locked ? <Chip label="Locked" size="small" color="success" /> : <Chip label="Draft" size="small" variant="outlined" />}</TableCell>
                      <TableCell><Chip label={p.session.status} size="small" color={STATUS_COLORS[p.session.status] ?? 'default'} /></TableCell>
                      <TableCell>
                        {p.session.project
                          ? <Chip label={p.session.project.status} size="small" color={STATUS_COLORS[p.session.project.status] ?? 'default'} />
                          : '-'}
                      </TableCell>
                      <TableCell>{formatDate(p.createdAt)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={7} sx={{ p: 0, border: 0 }}>
                        <Collapse in={expanded === p.id}>
                          <Box sx={{ p: 2, bgcolor: 'background.default' }}>
                            <Typography variant="caption" fontWeight={700} display="block" mb={0.5}>Plan Data</Typography>
                            {planData.description && (
                              <Box mb={1}>
                                <Typography variant="caption" fontWeight={600} color="primary.light">Description:</Typography>
                                <Typography variant="body2">{String(planData.description)}</Typography>
                              </Box>
                            )}
                            {Array.isArray(planData.pages) && planData.pages.length > 0 && (
                              <Box mb={1}>
                                <Typography variant="caption" fontWeight={600} color="primary.light">Pages:</Typography>
                                <Stack direction="row" gap={0.5} flexWrap="wrap" mt={0.5}>
                                  {(planData.pages as Array<{ name?: string }>).map((pg, i) => (
                                    <Chip key={i} label={pg.name || `Page ${i + 1}`} size="small" variant="outlined" />
                                  ))}
                                </Stack>
                              </Box>
                            )}
                            {Array.isArray(planData.features) && planData.features.length > 0 && (
                              <Box mb={1}>
                                <Typography variant="caption" fontWeight={600} color="primary.light">Features:</Typography>
                                <Stack direction="row" gap={0.5} flexWrap="wrap" mt={0.5}>
                                  {(planData.features as string[]).map((f, i) => (
                                    <Chip key={i} label={String(f)} size="small" variant="outlined" />
                                  ))}
                                </Stack>
                              </Box>
                            )}
                            {Array.isArray(planData.dataModels) && planData.dataModels.length > 0 && (
                              <Box mb={1}>
                                <Typography variant="caption" fontWeight={600} color="primary.light">Data Models:</Typography>
                                <Stack direction="row" gap={0.5} flexWrap="wrap" mt={0.5}>
                                  {(planData.dataModels as Array<{ name: string }>).map((m, i) => (
                                    <Chip key={i} label={m.name} size="small" color="secondary" variant="outlined" />
                                  ))}
                                </Stack>
                              </Box>
                            )}
                            {planData.colorTheme && (
                              <Box mb={1}>
                                <Typography variant="caption" fontWeight={600} color="primary.light">Color Theme:</Typography>
                                <Typography variant="body2" fontFamily="monospace" fontSize={12}>
                                  {JSON.stringify(planData.colorTheme)}
                                </Typography>
                              </Box>
                            )}
                            <Box mt={1}>
                              <Typography variant="caption" fontWeight={600} color="primary.light">Full JSON:</Typography>
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
                <TableRow><TableCell colSpan={7} align="center">No plans found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div" count={total} page={page} rowsPerPage={20}
            onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[20]}
          />
        </TableContainer>
      )}
    </Stack>
  );
}

function ErrorsPanel() {
  const [projects, setProjects] = useState<ErrorProject[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = (p: number) => {
    setLoading(true);
    api.get<{ projects: ErrorProject[]; total: number }>(`/admin/errors?page=${p + 1}&limit=20`)
      .then((d) => { setProjects(d.projects); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page); }, [page]);

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">{total} project(s) in error state</Typography>
      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress size={28} /></Box> : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>ID</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell>Fix Attempts</TableCell>
                <TableCell>Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.map((p) => (
                <Box component="tbody" key={p.id}>
                  <TableRow hover onClick={() => setExpanded(expanded === p.id ? null : p.id)} sx={{ cursor: 'pointer' }}>
                    <TableCell sx={{ width: 30 }}>
                      {expanded === p.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{p.id.slice(0, 8)}</TableCell>
                    <TableCell>{p.session.user.email}</TableCell>
                    <TableCell>{p.fixAttempts}</TableCell>
                    <TableCell>{formatDate(p.updatedAt)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} sx={{ p: 0, border: 0 }}>
                      <Collapse in={expanded === p.id}>
                        <Box sx={{ p: 2, bgcolor: 'background.default' }}>
                          {p.errorLog && (
                            <Box mb={2}>
                              <Typography variant="caption" fontWeight={700} color="error.main">Error Log:</Typography>
                              <Box component="pre" sx={{ mt: 0.5, p: 1.5, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.3)', fontSize: 11, fontFamily: 'monospace', overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {p.errorLog}
                              </Box>
                            </Box>
                          )}
                          {p.buildLog && (
                            <Box>
                              <Typography variant="caption" fontWeight={700}>Build Log:</Typography>
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
                <TableRow><TableCell colSpan={5} align="center">No errors</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div" count={total} page={page} rowsPerPage={20}
            onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[20]}
          />
        </TableContainer>
      )}
    </Stack>
  );
}

function SystemPanel() {
  const [data, setData] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get<SystemInfo>('/admin/system').then(setData).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (!data) return <Typography color="error">Failed to load system info</Typography>;

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button startIcon={<RefreshIcon />} size="small" onClick={load}>Refresh</Button>
      </Box>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Disk Usage" value={data.diskUsage} icon={<StorageIcon />} sub="generated-apps volume" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Project Dirs" value={data.projectDirCount} icon={<FolderIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Memory (RSS)" value={`${data.memoryUsage.rss} MB`} icon={<StorageIcon />} sub={`Heap: ${data.memoryUsage.heapUsed}/${data.memoryUsage.heapTotal} MB`} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Uptime" value={formatUptime(data.uptime)} icon={<TimerIcon />} />
        </Grid>
      </Grid>
    </Stack>
  );
}

/* ─── Main Admin Page ───────────��────────────────────────────────────────── */

export default function AdminPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar>
          <IconButton onClick={() => navigate('/chat')} size="small" sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <AdminPanelSettingsIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>Admin Portal</Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Overview" />
          <Tab label="Users" />
          <Tab label="Projects" />
          <Tab label="Revenue" />
          <Tab label="Email" />
          <Tab label="Plans" />
          <Tab label="Errors" />
          <Tab label="System" />
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        {tab === 0 && <OverviewPanel />}
        {tab === 1 && <UsersPanel />}
        {tab === 2 && <ProjectsPanel />}
        {tab === 3 && <RevenuePanel />}
        {tab === 4 && <EmailHealthPanel />}
        {tab === 5 && <PlansPanel />}
        {tab === 6 && <ErrorsPanel />}
        {tab === 7 && <SystemPanel />}
      </Box>
    </Box>
  );
}
