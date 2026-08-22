import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Numeral } from '@/components/ui/Numeral';
import type { WeekdayTotals } from '@/domain/types';
import { formatMs } from '@/domain/time';
import { palette } from '@/theme/palette';
import { lifetimeRows, sessionRows, type TotalsRow, type WeekdaySessionResult } from './weekdayStats';

/**
 * Four columns at 375px: mode, right, wrong, median. The three figure columns
 * are fixed width so the two blocks line up with each other and so a number
 * growing a digit never moves the label next to it.
 */
const COLUMNS = { display: 'grid', gridTemplateColumns: '1fr 34px 40px 56px', columnGap: 1.25 } as const;

function HeaderCell({ children }: { children: string }) {
  return (
    <Typography component="span" variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>
      {children}
    </Typography>
  );
}

function Row({ row, total }: { row: TotalsRow; total: boolean }) {
  const empty = row.answered === 0;
  const figure = (value: string) => (
    <Numeral size={13} color={empty ? palette.inkFaint : palette.ink} sx={{ textAlign: 'right' }}>
      {value}
    </Numeral>
  );
  return (
    <Box
      component="li"
      sx={{
        ...COLUMNS,
        alignItems: 'baseline',
        py: 0.5,
        ...(total ? { borderTop: `1px solid ${palette.rule}`, mt: 0.25, pt: 0.75 } : {}),
      }}
    >
      <Typography component="span" variant="body2" color={empty ? 'text.secondary' : 'text.primary'}>
        {row.label}
      </Typography>
      {figure(empty ? '—' : String(row.correct))}
      {figure(empty ? '—' : String(row.wrong))}
      {figure(row.medianMs === null ? '—' : formatMs(row.medianMs))}
    </Box>
  );
}

/**
 * One set of numbers. Before anything has been answered the whole block
 * collapses to the plain empty line rather than showing three zeroes, because
 * a zero here would read as a measurement rather than as an absence.
 */
function Block({ title, rows }: { title: string; rows: TotalsRow[] }) {
  const answered = rows.reduce((sum, row) => Math.max(sum, row.answered), 0);
  return (
    <Box>
      <Typography variant="caption" component="h3" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
        {title}
      </Typography>
      {answered === 0 ? (
        <Numeral size={12} color={palette.inkMuted}>
          No dates answered yet.
        </Numeral>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          <Box component="li" sx={{ ...COLUMNS, pb: 0.25 }} aria-hidden>
            <span />
            <HeaderCell>Right</HeaderCell>
            <HeaderCell>Wrong</HeaderCell>
            <HeaderCell>Median</HeaderCell>
          </Box>
          {rows.map((row) => (
            <Row key={row.label} row={row} total={row.label === 'Total'} />
          ))}
        </Box>
      )}
    </Box>
  );
}

interface WeekdayTotalsViewProps {
  /** Everything answered since the screen opened. */
  session: readonly WeekdaySessionResult[];
  /** Everything ever answered, read from the persisted histogram. */
  lifetime: WeekdayTotals;
}

/**
 * The two sets of numbers under the pad.
 *
 * Assisted and unassisted stay on separate lines everywhere. An answer with the
 * year code handed over and an answer without it are different tasks, so one
 * median over both would describe neither of them.
 */
export function WeekdayTotalsView({ session, lifetime }: WeekdayTotalsViewProps) {
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Block title="This session" rows={sessionRows(session)} />
      <Block title="All time" rows={lifetimeRows(lifetime)} />
    </Box>
  );
}
