import { useRef, useEffect, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface AnimatedContentProps {
  children: ReactNode;
  distance?: number;
  direction?: 'vertical' | 'horizontal';
  reverse?: boolean;
  duration?: number;
  ease?: string;
  initialOpacity?: number;
  scale?: number;
  threshold?: number;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function AnimatedContent({
  children,
  distance = 80,
  direction = 'vertical',
  reverse = false,
  duration = 0.8,
  ease = 'power3.out',
  initialOpacity = 0,
  scale = 1,
  threshold = 0.1,
  delay = 0,
  className = '',
  style,
}: AnimatedContentProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const axis = direction === 'horizontal' ? 'x' : 'y';
    const offset = reverse ? -distance : distance;
    const startPct = (1 - threshold) * 100;

    gsap.set(el, {
      [axis]: offset,
      scale,
      opacity: initialOpacity,
      visibility: 'visible',
    });

    const tl = gsap.timeline({ paused: true, delay });
    tl.to(el, { [axis]: 0, scale: 1, opacity: 1, duration, ease });

    const st = ScrollTrigger.create({
      trigger: el,
      start: `top ${startPct}%`,
      once: true,
      onEnter: () => tl.play(),
    });

    return () => { st.kill(); tl.kill(); };
  }, [distance, direction, reverse, duration, ease, initialOpacity, scale, threshold, delay]);

  return (
    <div ref={ref} className={className} style={{ visibility: 'hidden', ...style }}>
      {children}
    </div>
  );
}
