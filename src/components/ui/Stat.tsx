import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { radius, space, typeScale } from '@/theme/tokens';
import { Numeral } from './Numeral';

type StatSize = 'sm' | 'md' | 'lg';

/**
 * `md` is the styleguide's `--type-stat`. The other two exist because the item
 * detail sheet packs six of these into a phone width and the weekday screen
 * leads with one; both are the same card at a different value size.
 */
const VALUE_SIZE: Record<StatSize, number> = { sm: 18, md: typeScale.stat.size, lg: 34 };

interface StatProps {
  label: string;
  /** Rendered in mono with tabular figures. Pass the formatted string. */
  value: ReactNode;
  size?: StatSize;
  /**
   * @deprecated STYLEGUIDE.md §2 keeps the grading colours out of everything
   * that is not the feedback flash or the latency histogram, and a stat card is
   * neither. Reads as the default tone.
   */
  tone?: 'default' | 'error';
}

/**
 * The stat card from §8: a tinted panel, no border, label above value.
 *
 * The tint is what groups it. Nothing is drawn around it, and the cards in a row
 * line up because the value is mono and tabular, not because a column was set.
 */
export function Stat({ label, value, size = 'md' }: StatProps) {
  return (
    <Box
      sx={{
        minWidth: 0,
        bgcolor: 'var(--surface-1)',
        border: 'none',
        borderRadius: `${radius.md}px`,
        p: `${space[4]}px`,
      }}
    >
      <Typography
        variant="body2"
        component="div"
        sx={{ color: 'var(--text-secondary)', mb: `${space[2]}px` }}
      >
        {label}
      </Typography>
      <Numeral
        size={VALUE_SIZE[size]}
        weight={400}
        color="var(--text-primary)"
        lineHeight={typeScale.stat.lineHeight}
        sx={{ letterSpacing: typeScale.stat.tracking }}
      >
        {value}
      </Numeral>
    </Box>
  );
}
