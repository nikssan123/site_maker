import { useEffect, useMemo, useRef, useState } from 'react';
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
  Link as MuiLink,
} from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import PublicIcon from '@mui/icons-material/Public';
import PaymentIcon from '@mui/icons-material/Payment';
import GroupsIcon from '@mui/icons-material/Groups';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import SpaIcon from '@mui/icons-material/Spa';
import StorefrontIcon from '@mui/icons-material/Storefront';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import StoreMallDirectoryIcon from '@mui/icons-material/StoreMallDirectory';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Accordion, AccordionDetails, AccordionSummary, Divider } from '@mui/material';
import { useTranslation } from 'react-i18next';
import PricingTable from '../components/PricingTable';
import { useAuthStore } from '../store/auth';
import Waves from '../components/Waves';
import ScrollFloat from '../components/ScrollFloat';
import AnimatedContent from '../components/AnimatedContent';
import SpotlightCard from '../components/SpotlightCard';
import StarBorder from '../components/StarBorder';
import ShinyText from '../components/ShinyText';
import LanguageSwitcher from '../components/LanguageSwitcher';
import Seo from '../components/Seo';
import BrandMark from '../components/BrandMark';
import { SITE_URL } from '../lib/seo';

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
`;

interface Props {
  scrollTo?: string;
}

export default function LandingPage({ scrollTo }: Props) {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const pageRef = useRef<HTMLDivElement>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const pricingRef = useRef<HTMLDivElement>(null);
  const heroCtaRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const stickyCtaRef = useRef<HTMLDivElement>(null);
  const [pricingInView, setPricingInView] = useState(false);
  const [showStickyCta, setShowStickyCta] = useState(false);

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

  useEffect(() => {
    const el = pricingRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setPricingInView(true); obs.disconnect(); } },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = heroCtaRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowStickyCta(!entry.isIntersecting),
      { threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let rafId = 0;

    // Position the sticky CTA imperatively so styles apply in the same frame
    // as the scroll paint. Using React state caused a 1-frame lag where the
    // fixed CTA briefly painted over the footer before re-docking above it.
    const apply = () => {
      rafId = 0;
      const pageEl = pageRef.current;
      const footerEl = footerRef.current;
      const stickyEl = stickyCtaRef.current;
      if (!pageEl || !footerEl || !stickyEl) return;
      const footerRect = footerEl.getBoundingClientRect();
      const pageRect = pageEl.getBoundingClientRect();
      const stickyGap = 24;
      const stickyHeight = stickyEl.offsetHeight;
      const barrierY = window.innerHeight - stickyHeight - stickyGap;
      if (footerRect.top <= barrierY) {
        const dockTop = footerRect.top - pageRect.top - stickyHeight - stickyGap;
        stickyEl.style.position = 'absolute';
        stickyEl.style.top = `${dockTop}px`;
        stickyEl.style.bottom = 'auto';
      } else {
        stickyEl.style.position = 'fixed';
        stickyEl.style.top = 'auto';
        stickyEl.style.bottom = '0';
      }
    };

    const schedule = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

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

  const audienceCards = [
    { Icon: StoreMallDirectoryIcon, title: t('landing.audience1Title'), desc: t('landing.audience1Desc') },
    { Icon: PersonOutlineIcon, title: t('landing.audience2Title'), desc: t('landing.audience2Desc') },
    { Icon: RocketLaunchIcon, title: t('landing.audience3Title'), desc: t('landing.audience3Desc') },
  ];

  const faqs = [
    { q: t('landing.faq1Q'), a: t('landing.faq1A') },
    { q: t('landing.faq2Q'), a: t('landing.faq2A') },
    { q: t('landing.faq3Q'), a: t('landing.faq3A') },
    { q: t('landing.faq4Q'), a: t('landing.faq4A') },
    { q: t('landing.faq5Q'), a: t('landing.faq5A') },
    { q: t('landing.faq6Q'), a: t('landing.faq6A') },
    { q: t('landing.faq7Q'), a: t('landing.faq7A') },
  ];

  const faqJsonLd = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  const primaryTo = token ? '/chat' : '/register';

  const heroAnim = (delaySec: number) =>
    reduceMotion
      ? {}
      : { opacity: 0, animation: `${fadeUp} 0.7s cubic-bezier(0.22,1,0.36,1) ${delaySec}s forwards` };

  const faqSeoPayload = useMemo(
    () => ({ id: 'landing-faq', data: faqJsonLd as Record<string, unknown> }),
    [faqJsonLd],
  );

  return (
    <Box ref={pageRef} sx={{ minHeight: '100vh', bgcolor: 'background.default', position: 'relative', overflowX: 'hidden' }}>
      <Seo
        title={t('seo.landingTitle')}
        description={t('seo.landingDesc')}
        path={scrollTo === 'pricing' ? '/pricing' : '/'}
        jsonLd={faqSeoPayload}
      />
      {/* Waves background */}
      {!reduceMotion && (
        <Waves
          lineColor="rgba(99, 102, 241, 0.18)"
          waveSpeedX={0.0125}
          waveSpeedY={0.005}
          waveAmpX={32}
          waveAmpY={16}
          style={{ position: 'fixed', zIndex: 0 }}
        />
      )}

      <AppBar
        component="header"
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
        <Toolbar component="nav" aria-label="Главна навигация" sx={{ maxWidth: 1200, width: '100%', mx: 'auto', px: { xs: 2, sm: 3 } }}>
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
              <BrandMark size={20} color="#fff" strokeWidth={5} />
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
            <Box
              sx={{
                display: { xs: 'none', sm: 'block' },
                width: '1px',
                height: 22,
                mx: 1.25,
                background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.18), transparent)',
              }}
            />
            <Box sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
              <LanguageSwitcher />
            </Box>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ position: 'relative', zIndex: 1 }}>
        {/* Hero — uses CSS keyframe animation (not scroll-triggered) since it's above the fold */}
        <Container component="section" aria-labelledby="landing-hero-heading" maxWidth="lg" sx={{ pt: { xs: 8, md: 12 }, pb: { xs: 8, md: 10 } }}>
          <Box sx={{ textAlign: 'center', maxWidth: 860, mx: 'auto' }}>
            <Box sx={{ ...heroAnim(0), mb: 3, display: 'inline-flex' }}>
              <StarBorder color="rgba(16, 185, 129, 0.6)" speed="4s" radius="80px" style={{ borderRadius: 16 }}>
                <Chip
                  label={t('landing.chipService')}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    border: 'none',
                    bgcolor: 'rgba(16, 185, 129, 0.08)',
                    '& .MuiChip-label': { px: 1.5 },
                  }}
                />
              </StarBorder>
            </Box>
            <Typography
              id="landing-hero-heading"
              variant="h1"
              component="h1"
              sx={{
                ...heroAnim(0.1),
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
                ...heroAnim(0.2),
                fontWeight: 400,
                lineHeight: 1.65,
                fontSize: { xs: '1rem', md: '1.125rem' },
                maxWidth: 640,
                mx: 'auto',
                mb: 4,
              }}
            >
              <ShinyText color="rgba(148,163,184,1)" shineColor="rgba(255,255,255,0.85)" speed="4s">
                {t('landing.heroSubtitle')}
              </ShinyText>
            </Typography>
            <Box ref={heroCtaRef} sx={heroAnim(0.3)}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                gap={1.5}
                justifyContent="center"
                alignItems="center"
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
          </Box>
        </Container>

        {/* What you get */}
        <Box
          component="section"
          aria-labelledby="landing-whatget-heading"
          sx={{ py: { xs: 6, md: 8 }, borderTop: '1px solid', borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <Container maxWidth="lg">
            <AnimatedContent distance={50}>
              <Typography
                id="landing-whatget-heading"
                variant="h4"
                component="h2"
                fontWeight={800}
                textAlign="center"
                sx={{ mb: 4, letterSpacing: '-0.02em' }}
              >
                {t('landing.whatYouGetTitle')}
              </Typography>
            </AnimatedContent>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                gap: 3,
              }}
            >
              {whatYouGetBlocks.map(({ Icon, title, bullets }, i) => (
                <AnimatedContent key={title} distance={60} delay={i * 0.1}>
                  <SpotlightCard style={{ borderRadius: 12 }}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 3,
                      height: '100%',
                      borderRadius: 3,
                      bgcolor: 'rgba(26, 26, 26, 0.65)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      backdropFilter: 'blur(8px)',
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
                    <Typography variant="h6" component="h3" fontWeight={800} sx={{ mb: 1.5, fontSize: '1.1rem' }}>
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
                  </SpotlightCard>
                </AnimatedContent>
              ))}
            </Box>
          </Container>
        </Box>

        {/* Example sites */}
        <Box
          id="examples"
          component="section"
          aria-labelledby="landing-examples-heading"
          sx={{
            py: { xs: 7, md: 9 },
            borderTop: '1px solid',
            borderColor: 'rgba(255,255,255,0.06)',
            ...(!reduceMotion && { '.example-card-lift:hover': { transform: 'translateY(-6px)' } }),
          }}
        >
          <Container maxWidth="lg">
            <AnimatedContent distance={50}>
              <Typography
                id="landing-examples-heading"
                variant="h4"
                component="h2"
                fontWeight={800}
                textAlign="center"
                sx={{ mb: 1.5, letterSpacing: '-0.02em' }}
              >
                {t('landing.examplesTitle')}
              </Typography>
            </AnimatedContent>
            <AnimatedContent distance={40} delay={0.1}>
              <Typography
                variant="body1"
                color="text.secondary"
                textAlign="center"
                sx={{ mb: 4, maxWidth: 560, mx: 'auto' }}
              >
                {t('landing.examplesSubtitle')}
              </Typography>
            </AnimatedContent>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                gap: 3,
              }}
            >
              {exampleCards.map(({ Icon, title, desc }, i) => (
                <AnimatedContent key={title} distance={60} delay={0.15 + i * 0.12}>
                  <SpotlightCard
                    spotlightColor="rgba(16, 185, 129, 0.2)"
                    style={{
                      borderRadius: 12,
                      transition: 'transform 0.25s ease',
                    }}
                    className="example-card-lift"
                  >
                  <Paper
                    elevation={0}
                    sx={{
                      p: 3,
                      borderRadius: 3,
                      textAlign: 'center',
                      bgcolor: 'rgba(12, 12, 12, 0.55)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      transition: 'border-color 0.25s ease',
                      '.example-card-lift:hover &': reduceMotion
                        ? { borderColor: 'rgba(99, 102, 241, 0.35)' }
                        : { borderColor: 'rgba(99, 102, 241, 0.4)' },
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
                    <Typography variant="h6" component="h3" fontWeight={800} sx={{ mb: 1 }}>
                      {title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                      {desc}
                    </Typography>
                  </Paper>
                  </SpotlightCard>
                </AnimatedContent>
              ))}
            </Box>
          </Container>
        </Box>

        {/* For whom */}
        <Box
          component="section"
          aria-labelledby="landing-audience-heading"
          sx={{ py: { xs: 6, md: 8 }, borderTop: '1px solid', borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <Container maxWidth="lg">
            <AnimatedContent distance={50}>
              <Typography
                id="landing-audience-heading"
                variant="h4"
                component="h2"
                fontWeight={800}
                textAlign="center"
                sx={{ mb: 1.5, letterSpacing: '-0.02em' }}
              >
                {t('landing.audienceTitle')}
              </Typography>
            </AnimatedContent>
            <AnimatedContent distance={40} delay={0.1}>
              <Typography
                variant="body1"
                color="text.secondary"
                textAlign="center"
                sx={{ mb: 4, maxWidth: 640, mx: 'auto' }}
              >
                {t('landing.audienceSubtitle')}
              </Typography>
            </AnimatedContent>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                gap: 3,
              }}
            >
              {audienceCards.map(({ Icon, title, desc }, i) => (
                <AnimatedContent key={title} distance={50} delay={0.12 + i * 0.1}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 3,
                      height: '100%',
                      borderRadius: 3,
                      bgcolor: 'rgba(12, 12, 12, 0.55)',
                      border: '1px solid rgba(255,255,255,0.08)',
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
                        bgcolor: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                      }}
                    >
                      <Icon sx={{ fontSize: 24, color: 'secondary.light' }} />
                    </Box>
                    <Typography variant="h6" component="h3" fontWeight={800} sx={{ mb: 1, fontSize: '1.05rem' }}>
                      {title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                      {desc}
                    </Typography>
                  </Paper>
                </AnimatedContent>
              ))}
            </Box>
          </Container>
        </Box>

        {/* Trust */}
        <Box
          component="section"
          aria-labelledby="landing-trust-heading"
          sx={{ py: { xs: 6, md: 8 }, borderTop: '1px solid', borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <Container maxWidth="md">
            <AnimatedContent distance={50}>
              <Typography
                id="landing-trust-heading"
                variant="h4"
                component="h2"
                fontWeight={800}
                textAlign="center"
                sx={{ mb: 4, letterSpacing: '-0.02em' }}
              >
                {t('landing.trustTitle')}
              </Typography>
            </AnimatedContent>
            <Stack gap={2}>
              {trustItems.map((line, i) => (
                <AnimatedContent key={line} distance={40} delay={0.08 + i * 0.07}>
                  <Stack direction="row" alignItems="center" gap={2}>
                    <CheckCircleOutlineIcon sx={{ color: 'secondary.light', flexShrink: 0 }} />
                    <Typography variant="body1" fontWeight={600} sx={{ lineHeight: 1.5 }}>
                      {line}
                    </Typography>
                  </Stack>
                </AnimatedContent>
              ))}
            </Stack>
          </Container>
        </Box>

        {/* How it works */}
        <Box
          component="section"
          aria-labelledby="landing-how-heading"
          sx={{ py: { xs: 6, md: 9 }, borderTop: '1px solid', borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <Container maxWidth="lg">
            <Typography id="landing-how-heading" component="h2" sx={{ position: 'absolute', left: '-9999px' }}>
              {t('landing.howTitle')}
            </Typography>
            <Box
              sx={{
                mb: 5,
                '& span': {
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  fontSize: { xs: '1.6rem', sm: '2rem', md: '2.125rem' },
                },
              }}
            >
              <ScrollFloat
                animationDuration={1}
                ease="back.inOut(2)"
                scrollStart="center bottom+=50%"
                scrollEnd="bottom bottom-=40%"
                stagger={0.03}
                containerClassName=""
                textClassName=""
              >
                {t('landing.howTitle')}
              </ScrollFloat>
            </Box>
            <Stack direction={{ xs: 'column', md: 'row' }} gap={{ xs: 3, md: 4 }}>
              {steps.map((s, i) => (
                <AnimatedContent key={s.n} distance={50} delay={0.1 + i * 0.12} style={{ flex: 1 }}>
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
                </AnimatedContent>
              ))}
            </Stack>
          </Container>
        </Box>

        {/* CTA band */}
        <AnimatedContent distance={50}>
          <Box
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
                sx={{ mb: 1.5, letterSpacing: '-0.02em' }}
              >
                {t('landing.ctaBandTitle')}
              </Typography>
              <Typography
                color="text.secondary"
                sx={{ mb: 3, maxWidth: 560, mx: 'auto', lineHeight: 1.65 }}
              >
                {t('landing.ctaBandSubtitle')}
              </Typography>
              <Button
                variant="contained"
                size="large"
                component={RouterLink}
                to={primaryTo}
                sx={{ px: 5, py: 1.75, fontSize: '1.05rem', fontWeight: 800, borderRadius: 2 }}
              >
                {t('landing.ctaBuild')}
              </Button>
            </Container>
          </Box>
        </AnimatedContent>

        <Box ref={pricingRef} id="pricing" component="section" aria-labelledby="pricing-heading">
          <PricingTable reveal={{ inView: pricingInView, reduceMotion }} />
        </Box>

        {/* FAQ */}
        <Box
          id="faq"
          component="section"
          aria-labelledby="landing-faq-heading"
          sx={{ py: { xs: 6, md: 9 }, borderTop: '1px solid', borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <Container maxWidth="md">
            <AnimatedContent distance={50}>
              <Typography
                id="landing-faq-heading"
                variant="h4"
                component="h2"
                fontWeight={800}
                textAlign="center"
                sx={{ mb: 1.5, letterSpacing: '-0.02em' }}
              >
                {t('landing.faqTitle')}
              </Typography>
            </AnimatedContent>
            <AnimatedContent distance={40} delay={0.08}>
              <Typography
                variant="body1"
                color="text.secondary"
                textAlign="center"
                sx={{ mb: 4, maxWidth: 640, mx: 'auto' }}
              >
                {t('landing.faqSubtitle')}
              </Typography>
            </AnimatedContent>
            <Stack gap={1.5}>
              {faqs.map((f, i) => (
                <Accordion
                  key={f.q}
                  disableGutters
                  elevation={0}
                  sx={{
                    bgcolor: 'rgba(12, 12, 12, 0.55)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 2,
                    '&:before': { display: 'none' },
                    '&.Mui-expanded': { borderColor: 'rgba(99, 102, 241, 0.35)' },
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    aria-controls={`faq-${i}-content`}
                    id={`faq-${i}-header`}
                    sx={{ px: 2.5, py: 1, minHeight: 56 }}
                  >
                    <Typography variant="subtitle1" component="h3" fontWeight={700}>
                      {f.q}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ px: 2.5, pb: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                      {f.a}
                    </Typography>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Stack>
          </Container>
        </Box>

      </Box>

      {/* Footer — dedicated black surface, visually separated from the page content */}
      <Box
        component="footer"
        ref={footerRef}
        sx={{
          position: 'relative',
          zIndex: 1,
          bgcolor: '#000',
          color: 'rgba(255,255,255,0.72)',
          pt: { xs: 7, md: 9 },
          pb: { xs: 15, md: 5 },
          mt: { xs: 4, md: 6 },
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '1px',
            background:
              'linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.45) 30%, rgba(16,185,129,0.45) 70%, transparent 100%)',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            top: 1,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(760px, 90%)',
            height: '140px',
            pointerEvents: 'none',
            background:
              'radial-gradient(ellipse at top, rgba(99,102,241,0.12) 0%, rgba(16,185,129,0.06) 40%, transparent 70%)',
            filter: 'blur(8px)',
          },
        }}
      >
        <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: '1.6fr 1fr 1fr 1fr' },
              gap: { xs: 4.5, md: 6 },
              mb: { xs: 5, md: 6 },
            }}
          >
            <Box>
              <Stack direction="row" alignItems="center" gap={1.25} sx={{ mb: 1.75 }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background:
                      'linear-gradient(135deg, rgba(99,102,241,0.4) 0%, rgba(16,185,129,0.28) 100%)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 0 24px rgba(99,102,241,0.22)',
                  }}
                >
                  <BrandMark size={20} color="#fff" strokeWidth={5} />
                </Box>
                <Typography variant="h6" fontWeight={800} sx={{ color: '#fff', letterSpacing: '-0.01em' }}>
                  {t('common.appName')}
                </Typography>
              </Stack>
              <Typography
                variant="body2"
                sx={{ lineHeight: 1.7, mb: 2.5, maxWidth: 340, color: 'rgba(255,255,255,0.6)' }}
              >
                {t('footerNav.tagline')}
              </Typography>
              <Typography
                variant="overline"
                sx={{
                  display: 'block',
                  letterSpacing: '0.1em',
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.4)',
                  mb: 0.5,
                }}
              >
                {t('footerNav.supportTitle')}
              </Typography>
              <MuiLink
                href="mailto:support@webwork.bg"
                variant="body1"
                underline="none"
                aria-label="Имейл за поддръжка — support@webwork.bg"
                sx={{
                  color: '#fff',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderBottom: '1px solid rgba(255,255,255,0.15)',
                  pb: 0.25,
                  transition: 'color 0.2s ease, border-color 0.2s ease',
                  '&:hover': { color: 'primary.light', borderColor: 'primary.light' },
                }}
              >
                support@webwork.bg
              </MuiLink>
            </Box>

            {[
              {
                title: t('footerNav.product'),
                links: [
                  { label: t('footerNav.examples'), href: '#examples' },
                  { label: t('footerNav.pricing'), to: '/pricing' },
                  { label: t('footerNav.faq'), href: '#faq' },
                  { label: t('footerNav.createSite'), to: primaryTo },
                ] as Array<{ label: string; to?: string; href?: string }>,
              },
              {
                title: t('footerNav.resources'),
                links: [
                  { label: t('footerNav.connectDomain'), to: '/docs/connect-domain' },
                  { label: t('footerNav.login'), to: '/login' },
                ] as Array<{ label: string; to?: string; href?: string }>,
              },
              {
                title: t('footerNav.legalCol'),
                links: [
                  { label: t('legal.termsLink'), to: '/terms' },
                  { label: t('legal.privacyLink'), to: '/privacy' },
                ] as Array<{ label: string; to?: string; href?: string }>,
              },
            ].map((col) => (
              <Box key={col.title}>
                <Typography
                  variant="overline"
                  sx={{
                    letterSpacing: '0.12em',
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.45)',
                  }}
                >
                  {col.title}
                </Typography>
                <Stack gap={1.25} sx={{ mt: 1.5 }}>
                  {col.links.map((l) =>
                    l.to ? (
                      <MuiLink
                        key={l.label}
                        component={RouterLink}
                        to={l.to}
                        variant="body2"
                        underline="none"
                        sx={{
                          color: 'rgba(255,255,255,0.65)',
                          transition: 'color 0.2s ease',
                          '&:hover': { color: '#fff' },
                        }}
                      >
                        {l.label}
                      </MuiLink>
                    ) : (
                      <MuiLink
                        key={l.label}
                        href={l.href!}
                        variant="body2"
                        underline="none"
                        sx={{
                          color: 'rgba(255,255,255,0.65)',
                          transition: 'color 0.2s ease',
                          '&:hover': { color: '#fff' },
                        }}
                      >
                        {l.label}
                      </MuiLink>
                    ),
                  )}
                </Stack>
              </Box>
            ))}
          </Box>

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2.5 }} />

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            gap={1}
          >
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>
              {t('landing.footer', { year: new Date().getFullYear() })}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>
              <MuiLink
                href={SITE_URL}
                underline="hover"
                sx={{ color: 'inherit', '&:hover': { color: '#fff' } }}
              >
                webwork.bg
              </MuiLink>
            </Typography>
          </Stack>
        </Container>
      </Box>

      {/* Sticky CTA — slides in when the hero CTA scrolls out of view */}
      <Box
        ref={stickyCtaRef}
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          p: { xs: 2, md: 2 },
          pb: 'max(16px, env(safe-area-inset-bottom))',
          opacity: showStickyCta ? 1 : 0,
          transform: showStickyCta ? 'translateY(0)' : 'translateY(calc(100% + 16px))',
          visibility: showStickyCta ? 'visible' : 'hidden',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
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
