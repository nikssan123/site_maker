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
import PublicIcon from '@mui/icons-material/Public';
import PaymentIcon from '@mui/icons-material/Payment';
import GroupsIcon from '@mui/icons-material/Groups';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import SpaIcon from '@mui/icons-material/Spa';
import StorefrontIcon from '@mui/icons-material/Storefront';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
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
  const [whatRef, whatInView] = useRevealOnce(reduceMotion);
  const [examplesRef, examplesInView] = useRevealOnce(reduceMotion);
  const [trustRef, trustInView] = useRevealOnce(reduceMotion);
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

  const whatYouGetBlocks = [
    {
      Icon: PublicIcon,
      title: t('landing.whatGet1Title'),
      bullets: [t('landing.whatGet1a'), t('landing.whatGet1b'), t('landing.whatGet1c')],
    },
    {
      Icon: PaymentIcon,
      title: t('landing.whatGet2Title'),
      bullets: [t('landing.whatGet2a'), t('landing.whatGet2b')],
    },
    {
      Icon: GroupsIcon,
      title: t('landing.whatGet3Title'),
      bullets: [t('landing.whatGet3a'), t('landing.whatGet3b')],
    },
    {
      Icon: MailOutlineIcon,
      title: t('landing.whatGet4Title'),
      bullets: [t('landing.whatGet4a'), t('landing.whatGet4b')],
    },
  ];

  const steps = [
    { n: '1', title: t('landing.how1Title'), desc: t('landing.how1Desc') },
    { n: '2', title: t('landing.how2Title'), desc: t('landing.how2Desc') },
    { n: '3', title: t('landing.how3Title'), desc: t('landing.how3Desc') },
  ];

  const trustItems = [
    t('landing.trust1'),
    t('landing.trust2'),
    t('landing.trust3'),
    t('landing.trust4'),
    t('landing.trust5'),
  ];

  const exampleCards = [
    { Icon: RestaurantIcon, title: t('landing.exampleRestaurantTitle'), desc: t('landing.exampleRestaurantDesc') },
    { Icon: SpaIcon, title: t('landing.exampleSalonTitle'), desc: t('landing.exampleSalonDesc') },
    { Icon: StorefrontIcon, title: t('landing.exampleShopTitle'), desc: t('landing.exampleShopDesc') },
  ];

  const primaryTo = token ? '/chat' : '/register';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', position: 'relative', overflowX: 'hidden', pb: { xs: 11, md: 10 } }}>
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
              <Button variant="contained" component={RouterLink} to="/chat" size="small" sx={{ px: 2, fontWeight: 700 }}>
                {t('landing.goToApp')}
              </Button>
            ) : (
              <>
                <Button component={RouterLink} to="/login" color="inherit" size="small" sx={{ fontWeight: 600 }}>
                  {t('auth.signIn')}
                </Button>
                <Button variant="contained" component={RouterLink} to="/register" size="small" sx={{ px: 2, fontWeight: 700 }}>
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
            <Box sx={{ textAlign: 'center', maxWidth: 860, mx: 'auto' }}>
              <Box sx={revealStagger(reduceMotion, heroInView, 0)}>
                <Chip
                  label={t('landing.chipService')}
                  size="small"
                  sx={{
                    mb: 3,
                    fontWeight: 600,
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    bgcolor: 'rgba(16, 185, 129, 0.08)',
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
                  fontSize: { xs: '1.95rem', sm: '2.5rem', md: '3.1rem' },
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
                  mb: 4,
                }}
              >
                {t('landing.heroSubtitle')}
              </Typography>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                gap={1.5}
                justifyContent="center"
                alignItems="center"
                sx={{ ...revealStagger(reduceMotion, heroInView, 0.18) }}
              >
                <Button
                  variant="contained"
                  size="large"
                  component={RouterLink}
                  to={primaryTo}
                  sx={{
                    px: { xs: 3, sm: 5 },
                    py: 1.75,
                    fontSize: '1.05rem',
                    fontWeight: 800,
                    minWidth: { sm: 280 },
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
                  href="#examples"
                  sx={{
                    px: { xs: 3, sm: 4 },
                    py: 1.75,
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    minWidth: { sm: 200 },
                    borderRadius: 2,
                    borderColor: 'rgba(255,255,255,0.2)',
                    color: 'text.primary',
                    '&:hover': {
                      borderColor: 'rgba(255,255,255,0.35)',
                      bgcolor: 'rgba(255,255,255,0.04)',
                    },
                  }}
                >
                  {t('landing.ctaExample')}
                </Button>
              </Stack>
            </Box>
          </Container>
        </Box>

        {/* What you get */}
        <Box ref={whatRef} sx={{ py: { xs: 6, md: 8 }, borderTop: '1px solid', borderColor: 'rgba(255,255,255,0.06)' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h4"
              component="h2"
              fontWeight={800}
              textAlign="center"
              sx={{
                mb: 4,
                letterSpacing: '-0.02em',
                ...revealStagger(reduceMotion, whatInView, 0),
              }}
            >
              {t('landing.whatYouGetTitle')}
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                gap: 3,
              }}
            >
              {whatYouGetBlocks.map(({ Icon, title, bullets }, i) => (
                <Paper
                  key={title}
                  elevation={0}
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    bgcolor: 'rgba(26, 26, 26, 0.65)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    backdropFilter: 'blur(8px)',
                    ...revealStagger(reduceMotion, whatInView, 0.06 + i * 0.08),
                    transition: 'border-color 0.25s ease, box-shadow 0.25s ease',
                    '&:hover': {
                      borderColor: 'rgba(99, 102, 241, 0.25)',
                      boxShadow: '0 16px 40px rgba(0,0,0,0.3)',
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
                  <Typography variant="h6" fontWeight={800} sx={{ mb: 1.5, fontSize: '1.1rem' }}>
                    {title}
                  </Typography>
                  <Stack component="ul" sx={{ m: 0, pl: 2.25, color: 'text.secondary' }} gap={0.75}>
                    {bullets.map((b) => (
                      <Typography key={b} component="li" variant="body2" sx={{ lineHeight: 1.65 }}>
                        {b}
                      </Typography>
                    ))}
                  </Stack>
                </Paper>
              ))}
            </Box>
          </Container>
        </Box>

        {/* Example sites */}
        <Box
          id="examples"
          component="section"
          ref={examplesRef}
          aria-labelledby="landing-examples-heading"
          sx={{ py: { xs: 7, md: 9 }, borderTop: '1px solid', borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <Container maxWidth="lg">
            <Typography
              id="landing-examples-heading"
              variant="h4"
              component="h2"
              fontWeight={800}
              textAlign="center"
              sx={{ mb: 1.5, letterSpacing: '-0.02em', ...revealStagger(reduceMotion, examplesInView, 0) }}
            >
              {t('landing.examplesTitle')}
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              textAlign="center"
              sx={{ mb: 4, maxWidth: 560, mx: 'auto', ...revealStagger(reduceMotion, examplesInView, 0.08) }}
            >
              {t('landing.examplesSubtitle')}
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                gap: 3,
              }}
            >
              {exampleCards.map(({ Icon, title, desc }, i) => (
                <Paper
                  key={title}
                  elevation={0}
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    textAlign: 'center',
                    bgcolor: 'rgba(12, 12, 12, 0.55)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    ...revealStagger(reduceMotion, examplesInView, 0.14 + i * 0.1),
                    transition: 'transform 0.25s ease, border-color 0.25s ease',
                    '&:hover': reduceMotion
                      ? { borderColor: 'rgba(99, 102, 241, 0.35)' }
                      : {
                          transform: 'translateY(-6px)',
                          borderColor: 'rgba(99, 102, 241, 0.4)',
                        },
                  }}
                >
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      mx: 'auto',
                      mb: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'rgba(99, 102, 241, 0.12)',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                    }}
                  >
                    <Icon sx={{ fontSize: 28, color: 'primary.light' }} />
                  </Box>
                  <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
                    {title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                    {desc}
                  </Typography>
                </Paper>
              ))}
            </Box>
          </Container>
        </Box>

        {/* Trust */}
        <Box ref={trustRef} sx={{ py: { xs: 6, md: 8 }, borderTop: '1px solid', borderColor: 'rgba(255,255,255,0.06)' }}>
          <Container maxWidth="md">
            <Typography
              variant="h4"
              component="h2"
              fontWeight={800}
              textAlign="center"
              sx={{ mb: 4, letterSpacing: '-0.02em', ...revealStagger(reduceMotion, trustInView, 0) }}
            >
              {t('landing.trustTitle')}
            </Typography>
            <Stack gap={2}>
              {trustItems.map((line, i) => (
                <Stack
                  key={line}
                  direction="row"
                  alignItems="center"
                  gap={2}
                  sx={{ ...revealStagger(reduceMotion, trustInView, 0.08 + i * 0.06) }}
                >
                  <CheckCircleOutlineIcon sx={{ color: 'secondary.light', flexShrink: 0 }} />
                  <Typography variant="body1" fontWeight={600} sx={{ lineHeight: 1.5 }}>
                    {line}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Container>
        </Box>

        {/* How it works */}
        <Box ref={howRef} sx={{ py: { xs: 6, md: 9 }, borderTop: '1px solid', borderColor: 'rgba(255,255,255,0.06)' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h4"
              component="h2"
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
                maxWidth: 560,
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
              to={primaryTo}
              sx={{
                px: 5,
                py: 1.75,
                fontSize: '1.05rem',
                fontWeight: 800,
                borderRadius: 2,
                ...revealStagger(reduceMotion, ctaInView, 0.16),
              }}
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

      {/* Sticky CTA — full width on phone, floating bar on larger screens */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          p: { xs: 2, md: 2 },
          pb: 'max(16px, env(safe-area-inset-bottom))',
          background: {
            xs: 'linear-gradient(to top, rgba(10,10,12,0.96) 55%, transparent)',
            md: 'transparent',
          },
          pointerEvents: 'none',
          '& > *': { pointerEvents: 'auto' },
        }}
      >
        <Box sx={{ maxWidth: 480, mx: 'auto' }}>
          <Button
            variant="contained"
            fullWidth
            size="large"
            component={RouterLink}
            to={primaryTo}
            sx={{
              py: { xs: 1.5, md: 1.35 },
              fontWeight: 800,
              fontSize: { xs: '1rem', md: '0.95rem' },
              borderRadius: 2,
              boxShadow: { md: '0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)' },
            }}
          >
            {t('landing.stickyCta')}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
