import { type ReactNode, type CSSProperties } from 'react';
import { keyframes } from '@mui/material/styles';
import { Box } from '@mui/material';

const orbit = keyframes`
  from { transform: rotate(0deg) translateX(var(--star-radius)) rotate(0deg); }
  to   { transform: rotate(360deg) translateX(var(--star-radius)) rotate(-360deg); }
`;

interface StarBorderProps {
  children: ReactNode;
  color?: string;
  speed?: string;
  radius?: string;
  className?: string;
  style?: CSSProperties;
}

export default function StarBorder({
  children,
  color = '#6366f1',
  speed = '6s',
  radius = '120px',
  className = '',
  style,
}: StarBorderProps) {
  const dotStyle: CSSProperties = {
    position: 'absolute',
    width: '300%',
    height: '300%',
    left: '-100%',
    top: '-100%',
    background: `radial-gradient(circle, ${color}, transparent 10%)`,
    animation: `${orbit} ${speed} linear infinite`,
    '--star-radius': radius,
  } as CSSProperties;

  return (
    <Box
      className={className}
      sx={{
        position: 'relative',
        display: 'inline-flex',
        overflow: 'hidden',
        borderRadius: 'inherit',
        p: '1px',
      }}
      style={style}
    >
      <div style={{ ...dotStyle, top: '-100%' }} />
      <div style={{ ...dotStyle, bottom: '-100%', top: 'auto', animationDelay: `-${parseFloat(speed) / 2}s` }} />
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          borderRadius: 'inherit',
          bgcolor: 'background.paper',
          width: '100%',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
