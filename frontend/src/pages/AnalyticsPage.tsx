import { useEffect, useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, IconButton, Stack,
  CircularProgress, Paper, Grid, Chip, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BarChartIcon from '@mui/icons-material/BarChart';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PeopleIcon from '@mui/icons-material/People';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import TabletIcon from '@mui/icons-material/Tablet';
import ComputerIcon from '@mui/icons-material/Computer';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

interface DailyPoint { date: string; views: number }
interface TopPage { path: string; views: number }
interface DeviceCount { device: string; count: number }
interface TopReferrer { referrer: string; count: number }

interface AnalyticsData {
  totalViews: number;
  uniqueVisitors: number;
  daily: DailyPoint[];
  topPages: TopPage[];
  devices: DeviceCount[];
  topReferrers: TopReferrer[];
}

const DEVICE_COLORS: Record<string, string> = {
  desktop: '#7c3aed',
  mobile: '#06b6d4',
  tablet: '#f59e0b',
};

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  desktop: <ComputerIcon fontSize="small" />,
  mobile: <PhoneAndroidIcon fontSize="small" />,
  tablet: <TabletIcon fontSize="small" />,
};

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      <Stack direction="row" alignItems="center" gap={1.5} mb={1}>
        <Box sx={{ color: 'primary.main' }}>{icon}</Box>
        <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.8}>
          {label}
        </Typography>
      </Stack>
      <Typography variant="h4" fontWeight={700}>{value.toLocaleString()}</Typography>
    </Paper>
  );
}

const DEVICE_LABEL_KEYS: Record<string, string> = {
  desktop: 'analytics.deviceDesktop',
  mobile: 'analytics.deviceMobile',
  tablet: 'analytics.deviceTablet',
};

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<30 | 7>(30);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api
      .get<AnalyticsData>(`/analytics/${projectId}?days=${days}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId, days]);

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('bg-BG', { month: 'short', day: 'numeric' });
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar>
          <IconButton onClick={() => navigate(-1)} size="small" sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <BarChartIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>{t('analytics.title')}</Typography>
          <ToggleButtonGroup
            value={days}
            exclusive
            size="small"
            onChange={(_, v) => v && setDays(v)}
          >
            <ToggleButton value={7}>{t('analytics.period7')}</ToggleButton>
            <ToggleButton value={30}>{t('analytics.period30')}</ToggleButton>
          </ToggleButtonGroup>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && data && (
          <Stack spacing={3}>
            {/* Stat cards */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <StatCard label={t('analytics.totalViews')} value={data.totalViews} icon={<VisibilityIcon />} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <StatCard label={t('analytics.uniqueVisitors')} value={data.uniqueVisitors} icon={<PeopleIcon />} />
              </Grid>
            </Grid>

            {/* Area chart */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} mb={2}>{t('analytics.viewsOverTime')}</Typography>
              {data.daily.every((d) => d.views === 0) ? (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <Typography color="text.secondary" variant="body2">{t('analytics.noPageViewsYet')}</Typography>
                </Box>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={data.daily} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickLine={false}
                      axisLine={false}
                      interval={days === 7 ? 0 : 'preserveStartEnd'}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <RechartsTooltip
                      contentStyle={{ background: '#1e1b4b', border: '1px solid #3b3077', borderRadius: 8, fontSize: 12 }}
                      labelFormatter={formatDate}
                    />
                    <Area type="monotone" dataKey="views" stroke="#7c3aed" strokeWidth={2} fill="url(#pvGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Paper>

            <Grid container spacing={2}>
              {/* Top pages */}
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, height: '100%' }}>
                  <Typography variant="subtitle2" fontWeight={700} mb={1.5}>{t('analytics.topPages')}</Typography>
                  {data.topPages.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">{t('analytics.noDataYet')}</Typography>
                  ) : (
                    <Stack spacing={1}>
                      {data.topPages.map((p) => (
                        <Stack key={p.path} direction="row" alignItems="center" justifyContent="space-between">
                          <Typography variant="body2" noWrap sx={{ maxWidth: 200, fontFamily: 'monospace', fontSize: 12 }}>
                            {p.path}
                          </Typography>
                          <Chip label={p.views} size="small" sx={{ fontSize: 11, height: 20 }} />
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Paper>
              </Grid>

              {/* Device breakdown */}
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, height: '100%' }}>
                  <Typography variant="subtitle2" fontWeight={700} mb={1.5}>{t('analytics.devices')}</Typography>
                  {data.devices.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">{t('analytics.noDataYet')}</Typography>
                  ) : (
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <ResponsiveContainer width={120} height={120}>
                        <PieChart>
                          <Pie data={data.devices} dataKey="count" nameKey="device" cx="50%" cy="50%" outerRadius={50} strokeWidth={0}>
                            {data.devices.map((d) => (
                              <Cell key={d.device} fill={DEVICE_COLORS[d.device] ?? '#6b7280'} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <Stack spacing={0.75}>
                        {data.devices.map((d) => (
                          <Stack key={d.device} direction="row" alignItems="center" gap={0.75}>
                            <Box sx={{ color: DEVICE_COLORS[d.device] ?? 'text.secondary' }}>{DEVICE_ICONS[d.device]}</Box>
                            <Typography variant="body2">
                              {DEVICE_LABEL_KEYS[d.device] ? t(DEVICE_LABEL_KEYS[d.device]) : d.device}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">— {d.count}</Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </Stack>
                  )}
                </Paper>
              </Grid>

              {/* Top referrers */}
              <Grid item xs={12}>
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
                  <Typography variant="subtitle2" fontWeight={700} mb={1.5}>{t('analytics.topReferrers')}</Typography>
                  {data.topReferrers.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">{t('analytics.noReferrerYet')}</Typography>
                  ) : (
                    <Stack spacing={1}>
                      {data.topReferrers.map((r) => (
                        <Stack key={r.referrer} direction="row" alignItems="center" justifyContent="space-between">
                          <Typography variant="body2" noWrap sx={{ maxWidth: 400, fontSize: 12 }}>
                            {r.referrer}
                          </Typography>
                          <Chip label={r.count} size="small" sx={{ fontSize: 11, height: 20 }} />
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Paper>
              </Grid>
            </Grid>
          </Stack>
        )}

        {!loading && !data && (
          <Box sx={{ textAlign: 'center', mt: 8 }}>
            <Typography color="text.secondary">{t('analytics.couldNotLoad')}</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
