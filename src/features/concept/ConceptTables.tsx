import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Numeral } from '@/components/ui/Numeral';
import { centuryAnchorRows } from '@/domain/guidedDate';
import { ALL_MONTHS, MONTH_DOOMSDAYS, monthName } from '@/domain/weekday';
import { space, stroke } from '@/theme/tokens';

/**
 * The two shipped tables, on screen for the one step that needs each.
 *
 * They are handed over rather than asked for, and that is the whole difference
 * between this screen and the trainers: the anchors and the month doomsdays are
 * lookups, so reading one off a table is the real skill on a first pass. The
 * year code is not a lookup here — it is derived, four steps at a time — which
 * is why there is no year-code table in this file.
 */

function TableFrame({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Box
      sx={{
        border: stroke.hairline,
        borderRadius: `${space[3]}px`,
        px: `${space[4]}px`,
        py: `${space[3]}px`,
      }}
    >
      <Typography
        component="h3"
        variant="body2"
        sx={{ color: 'var(--text-secondary)', mb: `${space[2]}px` }}
      >
        {heading}
      </Typography>
      {children}
    </Box>
  );
}

/** Four rows. Every value carries the century it belongs to. */
export function CenturyAnchorTable() {
  return (
    <TableFrame heading="Century anchors">
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          columnGap: `${space[4]}px`,
          rowGap: `${space[2]}px`,
        }}
      >
        {centuryAnchorRows().map((row) => (
          <Box
            key={row.century}
            sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}
          >
            <Typography component="span" variant="body2" sx={{ color: 'var(--text-secondary)' }}>
              {row.label}
            </Typography>
            <Numeral size={17} weight={500}>
              {row.anchor}
            </Numeral>
          </Box>
        ))}
      </Box>
    </TableFrame>
  );
}

/**
 * The twelve month doomsdays, always the shipped non-leap values.
 *
 * January and February move in a leap year, and the step that uses this table
 * says so in its own words when it applies. Quietly printing the moved value
 * here would teach a table that does not exist.
 */
export function MonthDoomsdayTable() {
  return (
    <TableFrame heading="Month doomsdays">
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)' },
          columnGap: `${space[3]}px`,
          rowGap: `${space[2]}px`,
        }}
      >
        {ALL_MONTHS.map((month) => (
          <Box
            key={month}
            sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}
          >
            <Typography component="span" variant="body2" sx={{ color: 'var(--text-secondary)' }}>
              {monthName(month).slice(0, 3)}
            </Typography>
            <Numeral size={17} weight={500}>
              {MONTH_DOOMSDAYS[month - 1]}
            </Numeral>
          </Box>
        ))}
      </Box>
    </TableFrame>
  );
}
