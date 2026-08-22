import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Numeral } from '@/components/ui/Numeral';
import type { DayStepTotals } from '@/domain/types';
import { formatMs } from '@/domain/time';
import { palette } from '@/theme/palette';
import { directionRows, sizeLabel, sizeRows, slowestSize, type DayStepRow } from './dayStepStats';

/**
 * Four columns at 375px: what the row is, right, wrong, median. The three
 * figure columns are fixed width so the two blocks line up with each other and
 * so a number growing a digit never moves the label beside it.
 */
const COLUMNS = {
  display: 'grid',
  gridTemplateColumns: '1fr 34px 40px 56px',
  columnGap: 1.25,
} as const;

function HeaderCell({ children, align }: { children: string; align: 'left' | 'right' }) {
  return (
    <Typography component="span" variant="caption" color="text.secondary" sx={{ textAlign: align }}>
      {children}
    </Typography>
  );
}

function Row({ row, emphasis, total }: { row: DayStepRow; emphasis: boolean; total: boolean }) {
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
      <Numeral
        size={13}
        weight={emphasis ? 600 : 400}
        color={empty ? palette.inkMuted : palette.ink}
      >
        {row.label}
      </Numeral>
      {figure(empty ? '—' : String(row.correct))}
      {figure(empty ? '—' : String(row.wrong))}
      {figure(row.medianMs === null ? '—' : formatMs(row.medianMs))}
    </Box>
  );
}

interface BlockProps {
  title: string;
  note: string;
  /** What the first column holds. Without it "+3" names nothing. */
  columnLabel: string;
  rows: DayStepRow[];
  /** The row to mark, when there is enough of it to mark. */
  emphasise?: string | null;
}

function Block({ title, note, columnLabel, rows, emphasise = null }: BlockProps) {
  const answered = rows.reduce((sum, row) => Math.max(sum, row.answered), 0);
  return (
    <Box>
      <Typography variant="caption" component="h3" color="text.secondary" sx={{ display: 'block' }}>
        {title}
      </Typography>
      {answered === 0 ? (
        <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 0.5 }}>
          No steps answered yet.
        </Typography>
      ) : (
        <>
          <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 0.25, mb: 0.5 }}>
            {note}
          </Typography>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            <Box component="li" sx={{ ...COLUMNS, pb: 0.25 }} aria-hidden>
              <HeaderCell align="left">{columnLabel}</HeaderCell>
              <HeaderCell align="right">Right</HeaderCell>
              <HeaderCell align="right">Wrong</HeaderCell>
              <HeaderCell align="right">Median</HeaderCell>
            </Box>
            {rows.map((row) => (
              <Row
                key={row.label}
                row={row}
                emphasis={row.label === emphasise}
                total={row.label === 'Total'}
              />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

/**
 * Everything the day step has recorded, cut two ways.
 *
 * Both cuts cover every answer, so the two blocks describe the same steps from
 * different angles rather than measuring different things. The slowest step
 * size is marked once there are enough of it to mean something, because that is
 * the one line here anybody can act on.
 */
export function DayStepTotalsView({ lifetime }: { lifetime: DayStepTotals }) {
  const slowest = slowestSize(lifetime);
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Block
        title="All time, by step"
        note="How far past the doomsday, after taking sevens off."
        columnLabel="Step"
        rows={sizeRows(lifetime)}
        emphasise={slowest === null ? null : sizeLabel(slowest)}
      />
      <Block
        title="All time, by direction"
        note="Counting back off the doomsday is the half that turns into a subtraction."
        columnLabel="Direction"
        rows={directionRows(lifetime)}
      />
    </Box>
  );
}
