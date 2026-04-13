import { type ReactNode } from 'react';
import { keyframes } from '@mui/material/styles';
import { Box } from '@mui/material';

const shine = keyframes`
  0%   { background-position: 100% center; }
  100% { background-position: -100% center; }
`;

interface ShinyTextProps {
  children: ReactNode;
  color?: string;
  shineColor?: string;
  speed?: string;
  className?: string;
}

export default function ShinyText({
  children,
  color = '#b5b5b5a6',
  shineColor = 'rgba(255,255,255,0.9)',
  speed = '3s',
  className = '',
}: ShinyTextProps) {
  return (
    <Box
      component="span"
      className={className}
      sx={{
        display: 'inline-block',
        backgroundImage: `linear-gradient(120deg, ${color} 0%, ${color} 40%, ${shineColor} 50%, ${color} 60%, ${color} 100%)`,
        backgroundSize: '200% auto',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        animation: `${shine} ${speed} linear infinite`,
      }}
    >
      {children}
    </Box>
  );
}
