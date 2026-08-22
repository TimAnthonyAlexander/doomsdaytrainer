import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Fragment } from 'react';
import { Numeral } from '@/components/ui/Numeral';
import { space } from '@/theme/tokens';
import type { WorkedLine } from './lessons';

interface LabelledValuesProps {
  lines: readonly WorkedLine[];
  /** The size of the numbers. The default matches the review screen's hints. */
  size?: number;
}

/**
 * Every number the calculation screens show goes through here, with the name of
 * what it is beside it.
 *
 * The same shape as the review screen's hint steps, and for the same reason: a
 * row reading `73 + 18 = 91` teaches nothing, because nothing on it says the 18
 * is the leap-day count. Naming the parts is what makes the working repeatable.
 */
export function LabelledValues({ lines, size = 15 }: LabelledValuesProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        columnGap: `${space[4]}px`,
        rowGap: `${space[1]}px`,
        alignItems: 'baseline',
      }}
    >
      {lines.map((line) => (
        <Fragment key={`${line.label}-${line.value}`}>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
            {line.label}
          </Typography>
          <Numeral size={size} weight={500} color="var(--text-primary)">
            {line.value}
          </Numeral>
        </Fragment>
      ))}
    </Box>
  );
}
