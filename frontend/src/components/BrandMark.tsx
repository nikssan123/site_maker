import type { SxProps, Theme } from '@mui/material';
import { Box } from '@mui/material';

interface Props {
  size?: number;
  color?: string;
  strokeWidth?: number;
  sx?: SxProps<Theme>;
}

/**
 * WW monogram: two clean, interlocked W strokes.
 * Transparent background; the calling container supplies the surface.
 */
export default function BrandMark({
  size = 20,
  color = '#fff',
  strokeWidth = 4.5,
  sx,
}: Props) {
  return (
    <Box
      component="svg"
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
      sx={{ width: size, height: size, display: 'block', ...sx }}
    >
      <path
        d="M12 19 L18 45 L24 30 L30 45 L35 19"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M29 19 L35 45 L40 30 L46 45 L52 19"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Box>
  );
}
