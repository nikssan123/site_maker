import { useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  Box, Typography, Stack, CircularProgress, Grid, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PeopleIcon from '@mui/icons-material/People';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import TabletIcon from '@mui/icons-material/Tablet';
import ComputerIcon from '@mui/icons-material/Computer';
import ArticleIcon from '@mui/icons-material/Article';
import StorefrontIcon from '@mui/icons-material/Storefront';
import BarChartIcon from '@mui/icons-material/BarChart';
import DevicesIcon from '@mui/icons-material/Devices';
import ShareIcon from '@mui/icons-material/Share';
import TimelineIcon from '@mui/icons-material/Timeline';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import {
  AdminPageHeader,
  AdminPanelLayout,
  AdminSection,
  AdminStatusChip,
} from './AdminUI';

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

const DEVICE_COLORS: Record<string, string> = {
  desktop: '#7c3aed',
  mobile: '#06b6d4',
  tablet: '#f59e0b',
};

const DEVICE_ICONS: Record<string, ReactNode> = {
  desktop: <ComputerIcon fontSize="small" />,
  mobile: <PhoneAndroidIcon fontSize="small" />,
  tablet: <TabletIcon fontSize="small" />,
};

const DEVICE_LABEL_KEYS: Record<string, string> = {
  desktop: 'analytics.deviceDesktop',
  mobile: 'analytics.deviceMobile',
  tablet: 'analytics.deviceTablet',
};

function StatCard({ label, value, icon, tone }: { label: string; value: string | number; icon: ReactNode; tone: string }) {
  return (
    <Box
      sx={{
        p: 2.25,
        borderRadius: 3,
        border: '1px solid rgba(255,255,255,0.07)',
        bgcolor: 'rgba(255,255,255,0.02)',
        height: '100%',
      }}
    >
      <Stack direction="row" alignItems="center" gap={1.25} mb={1.25}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: `${tone}26`,
            color: tone,
          }}
        >
          {icon}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {label}
        </Typography>
      </Stack>
      <Typography variant="h4" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </Typography>
    </Box>
  );
}

export default function AnalyticsPanel({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<30 | 7>(30);

  const formatDate = useCallback(
    (d: string) => new Date(d).toLocaleDateString(i18n.language === 'bg' ? 'bg-BG' : 'en-US', { month: 'short', day: 'numeric' }),
    [i18n.language],
  );

  useEffect(() => {
    setLoading(true);
    api
      .get<AnalyticsData>(`/analytics/${projectId}?days=${days}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [projectId, days]);

  return (
    <AdminPanelLayout>
      <AdminPageHeader
        icon={<BarChartIcon fontSize="small" />}
        title={t(`adminWorkspace.titles.analytics`)}
        subtitle={t('analytics.title')}
        actions={
          <ToggleButtonGroup
            value={days}
            exclusive
            size="small"
            onChange={(_, v) => v && setDays(v)}
            sx={{
              '& .MuiToggleButton-root': {
                px: 1.5,
                py: 0.4,
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'none',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'text.secondary',
                '&.Mui-selected': {
                  bgcolor: 'rgba(99,102,241,0.18)',
                  color: 'primary.main',
                  borderColor: 'rgba(99,102,241,0.4)',
                  '&:hover': { bgcolor: 'rgba(99,102,241,0.24)' },
                },
              },
            }}
          >
            <ToggleButton value={7}>{t('analytics.period7')}</ToggleButton>
            <ToggleButton value={30}>{t('analytics.period30')}</ToggleButton>
          </ToggleButtonGroup>
        }
      />

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && data && (
        <>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <StatCard
                label={t('analytics.uniqueVisitors')}
                value={data.uniqueVisitors}
                icon={<PeopleIcon />}
                tone="#6366f1"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <StatCard
                label={t('analytics.totalViews')}
                value={data.totalViews}
                icon={<VisibilityIcon />}
                tone="#10b981"
              />
            </Grid>
          </Grid>

          <AdminSection
            icon={<TimelineIcon sx={{ fontSize: 16 }} />}
            title={t('analytics.visitorsOverTime')}
          >
            {data.daily.every((d) => d.visitors === 0 && d.views === 0) ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography color="text.secondary" variant="body2">{t('analytics.noVisitsYet')}</Typography>
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data.daily} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="adminPvGradV" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="adminPvGradPv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
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
                  <Area type="monotone" dataKey="visitors" stroke="#7c3aed" strokeWidth={2} fill="url(#adminPvGradV)" name={t('analytics.chartVisitors')} />
                  <Area type="monotone" dataKey="views" stroke="#10b981" strokeWidth={1.5} fill="url(#adminPvGradPv)" name={t('analytics.chartViews')} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </AdminSection>

          <Grid container spacing={2}>
            {data.popularBlogPosts.length > 0 && (
              <Grid item xs={12} md={6}>
                <AdminSection
                  icon={<ArticleIcon sx={{ fontSize: 16 }} />}
                  title={t('analytics.popularBlogPosts')}
                >
                  <Stack gap={0.75}>
                    {data.popularBlogPosts.map((p) => (
                      <Stack
                        key={p.slug}
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        gap={1}
                        sx={{
                          px: 1,
                          py: 0.75,
                          borderRadius: 1.5,
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                        }}
                      >
                        <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>{p.title}</Typography>
                        <AdminStatusChip tone="primary" label={t('analytics.viewsLabel', { n: p.views })} />
                      </Stack>
                    ))}
                  </Stack>
                </AdminSection>
              </Grid>
            )}

            {data.popularProducts.length > 0 && (
              <Grid item xs={12} md={6}>
                <AdminSection
                  icon={<StorefrontIcon sx={{ fontSize: 16 }} />}
                  title={t('analytics.popularProducts')}
                >
                  <Stack gap={0.75}>
                    {data.popularProducts.map((p) => (
                      <Stack
                        key={p.slug}
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        gap={1}
                        sx={{
                          px: 1,
                          py: 0.75,
                          borderRadius: 1.5,
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                        }}
                      >
                        <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>{p.title}</Typography>
                        <AdminStatusChip tone="secondary" label={t('analytics.viewsLabel', { n: p.views })} />
                      </Stack>
                    ))}
                  </Stack>
                </AdminSection>
              </Grid>
            )}

            <Grid item xs={12} md={6}>
              <AdminSection
                icon={<DevicesIcon sx={{ fontSize: 16 }} />}
                title={t('analytics.devices')}
              >
                {data.devices.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">{t('analytics.noDataYet')}</Typography>
                ) : (
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <ResponsiveContainer width={120} height={120}>
                      <PieChart>
                        <Pie data={data.devices} dataKey="count" nameKey="device" cx="50%" cy="50%" innerRadius={28} outerRadius={50} strokeWidth={0}>
                          {data.devices.map((d) => (
                            <Cell key={d.device} fill={DEVICE_COLORS[d.device] ?? '#6b7280'} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <Stack spacing={0.75} sx={{ flex: 1 }}>
                      {data.devices.map((d) => (
                        <Stack key={d.device} direction="row" alignItems="center" gap={1}>
                          <Box sx={{ color: DEVICE_COLORS[d.device] ?? 'text.secondary', display: 'flex' }}>
                            {DEVICE_ICONS[d.device]}
                          </Box>
                          <Typography variant="body2" sx={{ flex: 1 }}>
                            {DEVICE_LABEL_KEYS[d.device] ? t(DEVICE_LABEL_KEYS[d.device]) : d.device}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                            {d.count}
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>
                  </Stack>
                )}
              </AdminSection>
            </Grid>

            <Grid item xs={12} md={6}>
              <AdminSection
                icon={<ShareIcon sx={{ fontSize: 16 }} />}
                title={t('analytics.topReferrers')}
              >
                {data.topReferrers.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">{t('analytics.noReferrerYet')}</Typography>
                ) : (
                  <Stack gap={0.75}>
                    {data.topReferrers.map((r) => (
                      <Stack
                        key={r.referrer}
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        gap={1}
                        sx={{
                          px: 1,
                          py: 0.75,
                          borderRadius: 1.5,
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                        }}
                      >
                        <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 12 }}>
                          {r.referrer}
                        </Typography>
                        <AdminStatusChip tone="neutral" label={r.count} />
                      </Stack>
                    ))}
                  </Stack>
                )}
              </AdminSection>
            </Grid>
          </Grid>
        </>
      )}

      {!loading && !data && (
        <AdminSection>
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary">{t('analytics.couldNotLoad')}</Typography>
          </Box>
        </AdminSection>
      )}
    </AdminPanelLayout>
  );
}
