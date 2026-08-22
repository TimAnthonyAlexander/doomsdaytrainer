import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { radius, space, stroke } from '@/theme/tokens';

interface CardProps {
  children: ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * The §8 card: `--surface-2`, one hairline, `--radius-lg`, 16px over 24px.
 *
 * A card is for a bounded object — the item detail sheet, a settings group.
 * Everything else groups with whitespace and proximity. Nesting one inside
 * another is always wrong; the inner thing needs a gap, not a second frame.
 */
export function Card({ children, sx }: CardProps) {
  return (
    <Box
      sx={[
        {
          bgcolor: 'var(--surface-2)',
          border: stroke.hairline,
          borderRadius: `${radius.lg}px`,
          px: `${space[5]}px`,
          py: `${space[4]}px`,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
