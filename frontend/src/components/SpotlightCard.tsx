import { useRef, type ReactNode, type MouseEvent, type CSSProperties } from 'react';

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
  style?: CSSProperties;
}

export default function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(99, 102, 241, 0.25)',
  style,
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
    el.style.setProperty('--spot-color', spotlightColor);
  }

  return (
    <div
      ref={ref}
      className={`rb-spotlight-card ${className}`}
      onMouseMove={handleMouseMove}
      style={{
        position: 'relative',
        height: '100%',
        ...style,
      }}
    >
      {children}
      <div
        className="rb-spotlight"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          borderRadius: 'inherit',
          zIndex: 2,
          opacity: 0,
          transition: 'opacity 0.3s ease',
          background:
            'radial-gradient(640px circle at var(--spot-x, 50%) var(--spot-y, 50%), var(--spot-color, rgba(99,102,241,0.25)), transparent 40%)',
        }}
      />
      <style>{`.rb-spotlight-card:hover > .rb-spotlight { opacity: 1; }`}</style>
    </div>
  );
}
