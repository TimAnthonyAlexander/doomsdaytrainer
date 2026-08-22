import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { SCREEN_PADDING_X, space } from '@/theme/tokens';

interface ScreenProps {
  children: ReactNode;
  /** Vertical rhythm between direct children, in theme spacing units. */
  gap?: number;
  /** Widen only for the mastery grid, which needs ten columns of numerals. */
  maxWidth?: number;
  sx?: SxProps<Theme>;
}

/**
 * The layout primitive every route sits in. Routes never set their own page
 * padding; if a screen needs different spacing it changes `gap`, not `px`.
 *
 * §4 fixes the horizontal padding at 24px on every screen and every breakpoint,
 * so it does not change with the viewport. A phone and a desktop put the first
 * character of a heading the same distance from the edge of the column.
 */
export function Screen({ children, gap = 3, maxWidth = 560, sx }: ScreenProps) {
  return (
    <Box
      sx={[
        {
          width: '100%',
          maxWidth,
          mx: 'auto',
          px: `${SCREEN_PADDING_X}px`,
          py: { xs: `${space[5]}px`, sm: `${space[6]}px` },
          display: 'flex',
          flexDirection: 'column',
          gap,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
