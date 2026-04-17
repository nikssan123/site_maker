import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, IconButton, Stack,
  CircularProgress, Paper, Grid, Chip, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BarChartIcon from '@mui/icons-material/BarChart';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PeopleIcon from '@mui/icons-material/People';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import EventIcon from '@mui/icons-material/Event';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import TabletIcon from '@mui/icons-material/Tablet';
import ComputerIcon from '@mui/icons-material/Computer';
import ArticleIcon from '@mui/icons-material/Article';
import StorefrontIcon from '@mui/icons-material/Storefront';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import AppLogo from '../components/AppLogo';
import { api } from '../lib/api';

interface DailyPoint { date: string; views: number; visitors: number }
interface DeviceCount { device: string; count: number }
interface TopReferrer { referrer: string; count: number }
interface PopularItem { title: string; slug: string; views: number }

interface AnalyticsData {
  totalViews: number;
  uniqueVisitors: number;
  daily: DailyPoint[];
  devices: DeviceCount[];
  topReferrers: TopReferrer[];
  popularBlogPosts: PopularItem[];
  popularProducts: PopularItem[];
}

interface BusinessSummary {
  orders: number | null;
  revenue: number | null;
  currency: string | null;
  inquiries: number | null;
  bookings: number | null;
}

const DEVICE_COLORS: Record<string, string> = { desktop: '#7c3aed', mobile: '#06b6d4', tablet: '#f59e0b' };
const DEVICE_ICONS: Record<string, React.ReactNode> = { desktop: <ComputerIcon fontSize="small" />, mobile: <PhoneAndroidIcon fontSize="small" />, tablet: <TabletIcon fontSize="small" /> };
const DEVICE_LABEL_KEYS: Record<string, string> = { desktop: 'analytics.deviceDesktop', mobile: 'analytics.deviceMobile', tablet: 'analytics.deviceTablet' };

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

function fetchAppData(projectId: string, model: string): Promise<unknown[]> {
  return fetch(`/preview-app/${projectId}/api/${model}`)
    .then((r) => (r.ok ? r.json() : []))
    .then((d) => (Array.isArray(d) ? d : []))
    .catch(() => []);
}

async function loadBusinessSummary(projectId: string): Promise<BusinessSummary> {
  const [orders, inquiries, bookings] = await Promise.all([
    fetchAppData(projectId, 'orders'),
    fetchAppData(projectId, 'inquiries'),
    fetchAppData(projectId, 'bookings').then((b) =>
      b.length > 0 ? b : fetchAppData(projectId, 'takenSlots'),
    ),
  ]);

  let revenue: number | null = null;
  let currency: string | null = null;
  if (orders.length > 0) {
    revenue = 0;
    for (const o of orders as Array<Record<string, unknown>>) {
      const amount = Number(o.total ?? o.amount ?? o.price ?? 0);
      if (Number.isFinite(amount)) revenue += amount;
      if (!currency && typeof o.currency === 'string') currency = o.currency.toUpperCase();
    }
  }

  return {
    orders: orders.length > 0 ? orders.length : null,
    revenue,
    currency,
    inquiries: inquiries.length > 0 ? inquiries.length : null,
    bookings: bookings.length > 0 ? bookings.length : null,
  };
}

export default function AnalyticsPage() {
  const { t, i18n } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [business, setBusiness] = useState<BusinessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<30 | 7>(30);

  const formatDate = useCallback(
    (d: string) => new Date(d).toLocaleDateString(i18n.language === 'bg' ? 'bg-BG' : 'en-US', { month: 'short', day: 'numeric' }),
    [i18n.language],
  );

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      api.get<AnalyticsData>(`/analytics/${projectId}?days=${days}`),
      loadBusinessSummary(projectId),
    ])
      .then(([a, b]) => { setData(a); setBusiness(b); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId, days]);

  const hasBusinessData = business && (business.orders !== null || business.inquiries !== null || business.bookings !== null);

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar>
          <IconButton onClick={() => navigate(-1)} size="small" sx={{ mr: 1 }}><ArrowBackIcon /></IconButton>
          <AppLogo size="small" />
          <Box sx={{ mx: 0.5, width: '1px', height: 20, bgcolor: 'divider' }} />
          <BarChartIcon color="primary" sx={{ mr: 0.5 }} />
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>{t('analytics.title')}</Typography>
          <ToggleButtonGroup value={days} exclusive size="small" onChange={(_, v) => v && setDays(v)}>
            <ToggleButton value={7}>{t('analytics.period7')}</ToggleButton>
            <ToggleButton value={30}>{t('analytics.period30')}</ToggleButton>
          </ToggleButtonGroup>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>}

        {!loading && data && (
          <Stack spacing={3}>
            {/* Stat cards */}
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}><StatCard label={t('analytics.uniqueVisitors')} value={data.uniqueVisitors} icon={<PeopleIcon />} /></Grid>
              <Grid item xs={6} sm={3}><StatCard label={t('analytics.totalViews')} value={data.totalViews} icon={<VisibilityIcon />} /></Grid>
              {business?.orders != null && <Grid item xs={6} sm={3}><StatCard label={t('analytics.totalOrders')} value={business.orders} icon={<ShoppingCartIcon />} /></Grid>}
              {business?.inquiries != null && <Grid item xs={6} sm={3}><StatCard label={t('analytics.totalInquiries')} value={business.inquiries} icon={<MailOutlineIcon />} /></Grid>}
              {business?.bookings != null && <Grid item xs={6} sm={3}><StatCard label={t('analytics.totalBookings')} value={business.bookings} icon={<EventIcon />} /></Grid>}
              {business?.revenue != null && business.revenue > 0 && (
                <Grid item xs={6} sm={3}>
                  <StatCard
                    label={t('analytics.totalRevenue')}
                    value={`${business.revenue.toLocaleString()} ${business.currency ?? ''}`}
                    icon={<AttachMoneyIcon />}
                  />
                </Grid>
              )}
            </Grid>

            {/* Visitors over time */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} mb={2}>{t('analytics.visitorsOverTime')}</Typography>
              {data.daily.every((d) => d.visitors === 0 && d.views === 0) ? (
                <Box sx={{ py: 4, textAlign: 'center' }}><Typography color="text.secondary" variant="body2">{t('analytics.noVisitsYet')}</Typography></Box>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={data.daily} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pvGradV" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="pvGradPv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} interval={days === 7 ? 0 : 'preserveStartEnd'} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <RechartsTooltip contentStyle={{ background: '#1e1b4b', border: '1px solid #3b3077', borderRadius: 8, fontSize: 12 }} labelFormatter={formatDate} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="visitors" stroke="#7c3aed" strokeWidth={2} fill="url(#pvGradV)" name={t('analytics.chartVisitors')} />
                    <Area type="monotone" dataKey="views" stroke="#10b981" strokeWidth={1.5} fill="url(#pvGradPv)" name={t('analytics.chartViews')} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Paper>

            <Grid container spacing={2}>
              {/* Popular blog posts */}
              {data.popularBlogPosts.length > 0 && (
                <Grid item xs={12} md={6}>
                  <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, height: '100%' }}>
                    <Stack direction="row" alignItems="center" gap={1} mb={1.5}>
                      <ArticleIcon fontSize="small" sx={{ color: 'primary.main' }} />
                      <Typography variant="subtitle2" fontWeight={700}>{t('analytics.popularBlogPosts')}</Typography>
                    </Stack>
                    <Stack spacing={1}>
                      {data.popularBlogPosts.map((p) => (
                        <Stack key={p.slug} direction="row" alignItems="center" justifyContent="space-between">
                          <Typography variant="body2" noWrap sx={{ maxWidth: 220 }}>{p.title}</Typography>
                          <Chip label={t('analytics.viewsLabel', { n: p.views })} size="small" sx={{ fontSize: 11, height: 20 }} />
                        </Stack>
                      ))}
                    </Stack>
                  </Paper>
                </Grid>
              )}

              {/* Popular products */}
              {data.popularProducts.length > 0 && (
                <Grid item xs={12} md={6}>
                  <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, height: '100%' }}>
                    <Stack direction="row" alignItems="center" gap={1} mb={1.5}>
                      <StorefrontIcon fontSize="small" sx={{ color: 'primary.main' }} />
                      <Typography variant="subtitle2" fontWeight={700}>{t('analytics.popularProducts')}</Typography>
                    </Stack>
                    <Stack spacing={1}>
                      {data.popularProducts.map((p) => (
                        <Stack key={p.slug} direction="row" alignItems="center" justifyContent="space-between">
                          <Typography variant="body2" noWrap sx={{ maxWidth: 220 }}>{p.title}</Typography>
                          <Chip label={t('analytics.viewsLabel', { n: p.views })} size="small" sx={{ fontSize: 11, height: 20 }} />
                        </Stack>
                      ))}
                    </Stack>
                  </Paper>
                </Grid>
              )}

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
                            {data.devices.map((d) => <Cell key={d.device} fill={DEVICE_COLORS[d.device] ?? '#6b7280'} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <Stack spacing={0.75}>
                        {data.devices.map((d) => (
                          <Stack key={d.device} direction="row" alignItems="center" gap={0.75}>
                            <Box sx={{ color: DEVICE_COLORS[d.device] ?? 'text.secondary' }}>{DEVICE_ICONS[d.device]}</Box>
                            <Typography variant="body2">{DEVICE_LABEL_KEYS[d.device] ? t(DEVICE_LABEL_KEYS[d.device]) : d.device}</Typography>
                            <Typography variant="body2" color="text.secondary">— {d.count}</Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </Stack>
                  )}
                </Paper>
              </Grid>

              {/* Top referrers */}
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, height: '100%' }}>
                  <Typography variant="subtitle2" fontWeight={700} mb={1.5}>{t('analytics.topReferrers')}</Typography>
                  {data.topReferrers.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">{t('analytics.noReferrerYet')}</Typography>
                  ) : (
                    <Stack spacing={1}>
                      {data.topReferrers.map((r) => (
                        <Stack key={r.referrer} direction="row" alignItems="center" justifyContent="space-between">
                          <Typography variant="body2" noWrap sx={{ maxWidth: 280, fontSize: 12 }}>{r.referrer}</Typography>
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
