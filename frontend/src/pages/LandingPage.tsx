import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Stack,
  AppBar,
  Toolbar,
  Chip,
  Paper,
} from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PsychologyIcon from '@mui/icons-material/Psychology';
import BoltIcon from '@mui/icons-material/Bolt';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import WebAssetOutlinedIcon from '@mui/icons-material/WebAssetOutlined';
import DynamicFormOutlinedIcon from '@mui/icons-material/DynamicFormOutlined';
import { useTranslation } from 'react-i18next';
import PricingTable from '../components/PricingTable';
import { useAuthStore } from '../store/auth';

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const orbDrift = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(3%, -4%) scale(1.08); }
`;

const subtlePulse = keyframes`
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.55; }
`;

const gradientFlow = keyframes`
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
`;

const softFloat = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
`;

const REVEAL_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const REVEAL_DURATION = '0.6s';
const IO_MARGIN = '0px 0px -8% 0px';

function useRevealOnce(reduceMotion: boolean): readonly [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (reduceMotion) {
      setInView(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.14, rootMargin: IO_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduceMotion]);

  return [ref, inView] as const;
}

function revealStagger(reduceMotion: boolean, inView: boolean, delaySec: number, duration = REVEAL_DURATION) {
  if (reduceMotion) return {};
  if (!inView) return { opacity: 0 };
  return {
    animation: `${fadeUp} ${duration} ${REVEAL_EASE} forwards`,
    animationDelay: `${delaySec}s`,
    opacity: 0,
  };
}

interface Props {
  scrollTo?: string;
}

export default function LandingPage({ scrollTo }: Props) {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [heroRef, heroInView] = useRevealOnce(reduceMotion);
  const [featuresRef, featuresInView] = useRevealOnce(reduceMotion);
  const [siteTypesRef, siteTypesInView] = useRevealOnce(reduceMotion);
  const [howRef, howInView] = useRevealOnce(reduceMotion);
  const [ctaRef, ctaInView] = useRevealOnce(reduceMotion);
  const [pricingRef, pricingInView] = useRevealOnce(reduceMotion);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const handler = () => setReduceMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (scrollTo === 'pricing') {
      pricingRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scrollTo]);

  const features = [
    { Icon: PsychologyIcon, title: t('landing.feat1Title'), desc: t('landing.feat1Desc') },
    { Icon: BoltIcon, title: t('landing.feat2Title'), desc: t('landing.feat2Desc') },
    { Icon: SyncAltIcon, title: t('landing.feat3Title'), desc: t('landing.feat3Desc') },
  ];

  const steps = [
    { n: '1', title: t('landing.how1Title'), desc: t('landing.how1Desc') },
    { n: '2', title: t('landing.how2Title'), desc: t('landing.how2Desc') },
    { n: '3', title: t('landing.how3Title'), desc: t('landing.how3Desc') },
  ];

  const siteTypes = [
    { Icon: EventAvailableIcon, label: t('landing.siteTypeBooking') },
    { Icon: ShoppingBagOutlinedIcon, label: t('landing.siteTypeShop') },
    { Icon: ArticleOutlinedIcon, label: t('landing.siteTypeBlog') },
    { Icon: WebAssetOutlinedIcon, label: t('landing.siteTypeLanding') },
    { Icon: DynamicFormOutlinedIcon, label: t('landing.siteTypeContact') },
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', position: 'relative', overflowX: 'hidden' }}>
      {/* Ambient background */}
      <Box
        aria-hidden
        sx={{
          pointerEvents: 'none',
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          background: `
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.22), transparent 55%),
            radial-gradient(ellipse 60% 40% at 100% 0%, rgba(16, 185, 129, 0.08), transparent 50%),
            radial-gradient(ellipse 50% 30% at 0% 30%, rgba(99, 102, 241, 0.1), transparent 45%)
          `,
        }}
      />
      <Box
        aria-hidden
        sx={{
          pointerEvents: 'none',
          position: 'fixed',
          top: '10%',
          right: '-10%',
          width: { xs: 280, md: 420 },
          height: { xs: 280, md: 420 },
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, transparent 70%)',
          filter: 'blur(40px)',
          zIndex: 0,
          ...(reduceMotion ? {} : { animation: `${orbDrift} 18s ease-in-out infinite` }),
        }}
      />
      <Box
        aria-hidden
        sx={{
          pointerEvents: 'none',
          position: 'fixed',
          bottom: '20%',
          left: '-15%',
          width: { xs: 240, md: 360 },
          height: { xs: 240, md: 360 },
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, transparent 70%)',
          filter: 'blur(48px)',
          zIndex: 0,
          ...(reduceMotion ? {} : { animation: `${orbDrift} 22s ease-in-out infinite reverse` }),
        }}
      />
      <Box
        aria-hidden
        sx={{
          pointerEvents: 'none',
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          opacity: reduceMotion ? 0.2 : undefined,
          backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
          ...(reduceMotion ? {} : { animation: `${subtlePulse} 8s ease-in-out infinite` }),
        }}
      />

      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          zIndex: 10,
          bgcolor: 'rgba(15, 15, 15, 0.72)',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid',
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <Toolbar sx={{ maxWidth: 1200, width: '100%', mx: 'auto', px: { xs: 2, sm: 3 } }}>
          <Stack direction="row" alignItems="center" gap={1.25} sx={{ flex: 1 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.35) 0%, rgba(16,185,129,0.2) 100%)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <AutoAwesomeIcon sx={{ fontSize: 20, color: 'primary.light' }} />
            </Box>
            <Typography variant="h6" fontWeight={800} letterSpacing="-0.02em">
              {t('common.appName')}
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" gap={0.75}>
            <Button href="#pricing" color="inherit" size="small" sx={{ fontWeight: 600 }}>
              {t('landing.pricingNav')}
            </Button>
            {token ? (
              <Button variant="contained" component={RouterLink} to="/chat" size="small" sx={{ px: 2 }}>
                {t('landing.goToApp')}
              </Button>
            ) : (
              <>
                <Button component={RouterLink} to="/login" color="inherit" size="small" sx={{ fontWeight: 600 }}>
                  {t('auth.signIn')}
                </Button>
                <Button variant="contained" component={RouterLink} to="/register" size="small" sx={{ px: 2 }}>
                  {t('landing.getStartedFree')}
                </Button>
              </>
            )}
          </Stack>
        </Toolbar>
      </AppBar>

      <Box sx={{ position: 'relative', zIndex: 1 }}>
        {/* Hero */}
        <Box ref={heroRef}>
          <Container maxWidth="lg" sx={{ pt: { xs: 8, md: 12 }, pb: { xs: 8, md: 10 } }}>
            <Box sx={{ textAlign: 'center', maxWidth: 820, mx: 'auto' }}>
            <Box sx={revealStagger(reduceMotion, heroInView, 0)}>
              <Chip
                label={t('landing.chipAi')}
                size="small"
                sx={{
                  mb: 3,
                  fontWeight: 600,
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                  bgcolor: 'rgba(99, 102, 241, 0.08)',
                  '& .MuiChip-label': { px: 1.5 },
                }}
              />
            </Box>
            <Typography
              variant="h1"
              sx={{
                ...revealStagger(reduceMotion, heroInView, 0.06),
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1.08,
                fontSize: { xs: '2.1rem', sm: '2.75rem', md: '3.35rem' },
                mb: 2.5,
                background: 'linear-gradient(180deg, #f8fafc 0%, #cbd5e1 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {t('landing.heroTitle')}
            </Typography>
            <Typography
              variant="h6"
              color="text.secondary"
              sx={{
                ...revealStagger(reduceMotion, heroInView, 0.12),
                fontWeight: 400,
                lineHeight: 1.65,
                fontSize: { xs: '1rem', md: '1.125rem' },
                maxWidth: 640,
                mx: 'auto',
                mb: 3,
              }}
            >
              {t('landing.heroSubtitle')}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                ...revealStagger(reduceMotion, heroInView, 0.15),
                display: 'block',
                color: 'text.disabled',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                fontWeight: 700,
                mb: 3,
              }}
            >
              {t('landing.trustStack')}
            </Typography>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              gap={1.5}
              justifyContent="center"
              sx={{ ...revealStagger(reduceMotion, heroInView, 0.18) }}
            >
              <Button
                variant="contained"
                size="large"
                component={RouterLink}
                to={token ? '/chat' : '/register'}
                sx={{
                  px: 4,
                  py: 1.35,
                  fontSize: '1rem',
                  borderRadius: 2,
                  boxShadow: '0 8px 32px rgba(99, 102, 241, 0.35)',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  '&:hover': {
                    transform: reduceMotion ? undefined : 'translateY(-2px)',
                    boxShadow: '0 12px 40px rgba(99, 102, 241, 0.45)',
                  },
                }}
              >
                {t('landing.ctaBuild')}
              </Button>
              <Button
                variant="outlined"
                size="large"
                href="#pricing"
                sx={{
                  px: 4,
                  py: 1.35,
                  fontSize: '1rem',
                  borderRadius: 2,
                  borderColor: 'rgba(255,255,255,0.15)',
                  color: 'text.primary',
                  transition: 'transform 0.2s ease, border-color 0.2s ease, bgcolor 0.2s ease',
                  '&:hover': {
                    borderColor: 'rgba(255,255,255,0.28)',
                    bgcolor: 'rgba(255,255,255,0.04)',
                    transform: reduceMotion ? undefined : 'translateY(-2px)',
                  },
                }}
              >
                {t('landing.ctaPricing')}
              </Button>
            </Stack>
          </Box>
        </Container>
        </Box>

        {/* Features */}
        <Box ref={featuresRef}>
          <Container maxWidth="lg" sx={{ py: { xs: 6, md: 8 } }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            gap={3}
            sx={{ alignItems: 'stretch' }}
          >
            {features.map(({ Icon, title, desc }, i) => (
              <Paper
                key={title}
                elevation={0}
                sx={{
                  flex: 1,
                  p: 3,
                  borderRadius: 3,
                  bgcolor: 'rgba(26, 26, 26, 0.65)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(8px)',
                  ...revealStagger(reduceMotion, featuresInView, 0.05 + i * 0.09),
                  transition: 'transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease',
                  '&:hover': reduceMotion
                    ? {}
                    : {
                        transform: 'translateY(-6px)',
                        borderColor: 'rgba(99, 102, 241, 0.25)',
                        boxShadow: '0 20px 48px rgba(0,0,0,0.35)',
                      },
                }}
              >
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mb: 2,
                    bgcolor: 'rgba(99, 102, 241, 0.12)',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                  }}
                >
                  <Icon sx={{ fontSize: 26, color: 'primary.light' }} />
                </Box>
                <Typography variant="h6" fontWeight={800} sx={{ mb: 1, fontSize: '1.1rem' }}>
                  {title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                  {desc}
                </Typography>
              </Paper>
            ))}
          </Stack>
        </Container>
        </Box>

        {/* Site types & control panels */}
        <Box
          component="section"
          ref={siteTypesRef}
          aria-labelledby="landing-site-types-heading"
          sx={{ py: { xs: 7, md: 9 }, borderTop: '1px solid', borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <Container maxWidth="lg">
            <Box
              sx={{
                position: 'relative',
                borderRadius: 4,
                p: { xs: 3, sm: 4, md: 5 },
                overflow: 'hidden',
                background:
                  'linear-gradient(165deg, rgba(99, 102, 241, 0.07) 0%, rgba(26, 26, 26, 0.92) 42%, rgba(16, 185, 129, 0.05) 100%)',
                border: '1px solid rgba(255,255,255,0.07)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
              }}
            >
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.9), rgba(16,185,129,0.85), rgba(99,102,241,0.9), transparent)',
                  backgroundSize: '200% 100%',
                  ...(reduceMotion ? {} : { animation: `${gradientFlow} 5s linear infinite` }),
                }}
              />
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  top: '12%',
                  right: '-8%',
                  width: 200,
                  height: 200,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, transparent 70%)',
                  filter: 'blur(32px)',
                  pointerEvents: 'none',
                }}
              />

              <Stack alignItems="center" sx={{ position: 'relative', mb: 4 }}>
                <Chip
                  label={t('landing.siteTypesChip')}
                  size="small"
                  sx={{
                    mb: 2,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    fontSize: '0.7rem',
                    height: 28,
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    bgcolor: 'rgba(99, 102, 241, 0.1)',
                    ...revealStagger(reduceMotion, siteTypesInView, 0),
                  }}
                />
                <Typography
                  id="landing-site-types-heading"
                  variant="h4"
                  component="h2"
                  fontWeight={800}
                  textAlign="center"
                  sx={{
                    letterSpacing: '-0.03em',
                    lineHeight: 1.15,
                    fontSize: { xs: '1.65rem', sm: '2rem', md: '2.25rem' },
                    mb: 1.25,
                    background: 'linear-gradient(120deg, #f1f5f9 0%, #a5b4fc 45%, #6ee7b7 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    ...revealStagger(reduceMotion, siteTypesInView, 0.06),
                  }}
                >
                  {t('landing.siteTypesTitle')}
                </Typography>
                <Typography
                  variant="subtitle1"
                  textAlign="center"
                  sx={{
                    fontWeight: 600,
                    color: 'text.secondary',
                    fontSize: { xs: '0.95rem', sm: '1.05rem' },
                    maxWidth: 420,
                    ...revealStagger(reduceMotion, siteTypesInView, 0.12),
                  }}
                >
                  {t('landing.siteTypesSubtitle')}
                </Typography>
              </Stack>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: 'repeat(2, minmax(0, 1fr))',
                    sm: 'repeat(3, minmax(0, 1fr))',
                    md: 'repeat(5, minmax(0, 1fr))',
                  },
                  gap: { xs: 1.5, md: 2 },
                  position: 'relative',
                }}
              >
                {siteTypes.map(({ Icon, label }, i) => (
                  <Paper
                    key={label}
                    elevation={0}
                    sx={{
                      position: 'relative',
                      p: 2,
                      minHeight: { xs: 112, md: 128 },
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      gap: 1.25,
                      borderRadius: 3,
                      bgcolor: 'rgba(12, 12, 12, 0.55)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      backdropFilter: 'blur(10px)',
                      transition:
                        'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.25s ease, box-shadow 0.35s ease',
                      ...revealStagger(reduceMotion, siteTypesInView, 0.18 + i * 0.07),
                      '&:hover': reduceMotion
                        ? {
                            borderColor: 'rgba(99, 102, 241, 0.45)',
                          }
                        : {
                            transform: 'translateY(-8px) scale(1.02)',
                            borderColor: 'rgba(99, 102, 241, 0.5)',
                            boxShadow: '0 16px 40px rgba(99, 102, 241, 0.18)',
                            '& .site-type-icon-wrap': {
                              animationPlayState: 'paused',
                              bgcolor: 'rgba(99, 102, 241, 0.22)',
                              borderColor: 'rgba(129, 140, 248, 0.55)',
                            },
                            '& .site-type-icon': {
                              transform: 'scale(1.12) rotate(-4deg)',
                              color: 'primary.light',
                            },
                          },
                    }}
                  >
                    <Box
                      className="site-type-icon-wrap"
                      sx={{
                        width: 52,
                        height: 52,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: 'rgba(99, 102, 241, 0.1)',
                        border: '1px solid rgba(99, 102, 241, 0.25)',
                        transition: 'background-color 0.3s ease, border-color 0.3s ease',
                        ...(!reduceMotion
                          ? {
                              animation: `${softFloat} 5s ease-in-out infinite`,
                              animationDelay: `${i * 0.45}s`,
                            }
                          : {}),
                      }}
                    >
                      <Icon
                        className="site-type-icon"
                        sx={{
                          fontSize: 26,
                          color: 'primary.light',
                          transition: 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), color 0.25s ease',
                        }}
                      />
                    </Box>
                    <Typography variant="body2" fontWeight={800} sx={{ lineHeight: 1.35, fontSize: '0.82rem' }}>
                      {label}
                    </Typography>
                  </Paper>
                ))}
              </Box>
            </Box>
          </Container>
        </Box>

        {/* How it works */}
        <Box ref={howRef} sx={{ py: { xs: 6, md: 9 }, borderTop: '1px solid', borderColor: 'rgba(255,255,255,0.06)' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h4"
              fontWeight={800}
              textAlign="center"
              sx={{
                mb: 5,
                letterSpacing: '-0.02em',
                ...revealStagger(reduceMotion, howInView, 0),
              }}
            >
              {t('landing.howTitle')}
            </Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} gap={{ xs: 3, md: 4 }}>
              {steps.map((s, i) => (
                <Box
                  key={s.n}
                  sx={{
                    flex: 1,
                    ...revealStagger(reduceMotion, howInView, 0.08 + i * 0.1),
                  }}
                >
                  <Stack direction="row" gap={2} alignItems="flex-start">
                    <Typography
                      variant="h5"
                      sx={{
                        width: 48,
                        height: 48,
                        flexShrink: 0,
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        bgcolor: 'rgba(99, 102, 241, 0.15)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        color: 'primary.light',
                      }}
                    >
                      {s.n}
                    </Typography>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={800} mb={0.75}>
                        {s.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                        {s.desc}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Container>
        </Box>

        {/* CTA band */}
        <Box
          ref={ctaRef}
          sx={{
            py: { xs: 6, md: 8 },
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(16, 185, 129, 0.06) 100%)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <Container maxWidth="md" sx={{ textAlign: 'center' }}>
            <Typography
              variant="h5"
              fontWeight={800}
              sx={{ mb: 1.5, letterSpacing: '-0.02em', ...revealStagger(reduceMotion, ctaInView, 0) }}
            >
              {t('landing.ctaBandTitle')}
            </Typography>
            <Typography
              color="text.secondary"
              sx={{
                mb: 3,
                maxWidth: 520,
                mx: 'auto',
                lineHeight: 1.65,
                ...revealStagger(reduceMotion, ctaInView, 0.08),
              }}
            >
              {t('landing.ctaBandSubtitle')}
            </Typography>
            <Button
              variant="contained"
              size="large"
              component={RouterLink}
              to={token ? '/chat' : '/register'}
              sx={{ px: 4, py: 1.25, borderRadius: 2, ...revealStagger(reduceMotion, ctaInView, 0.16) }}
            >
              {t('landing.ctaBuild')}
            </Button>
          </Container>
        </Box>

        <Box ref={pricingRef}>
          <PricingTable reveal={{ inView: pricingInView, reduceMotion }} />
        </Box>

        <Box
          sx={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            py: 4,
            textAlign: 'center',
          }}
        >
          <Typography variant="body2" color="text.disabled">
            {t('landing.footer', { year: new Date().getFullYear() })}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
