import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Numeral } from '@/components/ui/Numeral';
import {
  rowState,
  settledGoals,
  type GuidedGoal,
  type GuidedGoalRow,
  type GuidedWalk,
} from '@/domain/guidedDate';
import { radius, space, stroke } from '@/theme/tokens';

/** Stands in for a number the walk has not reached. */
const PENDING = '–';

/** A value is a number, or one of the two weekday names. Only one is mono. */
function Value({ text, muted = false }: { text: string; muted?: boolean }) {
  const ink = muted ? 'var(--text-muted)' : 'var(--text-primary)';
  if (/^[\d,\s]+$/.test(text)) {
    return (
      <Numeral size={17} weight={500} color={ink}>
        {text}
      </Numeral>
    );
  }
  return (
    <Typography variant="body1" sx={{ color: ink, fontWeight: 500 }}>
      {text}
    </Typography>
  );
}

/**
 * A row that is done, or one that has not come up yet.
 *
 * One line: what the number is, and what it came out at. The sum that produced
 * it is deliberately gone — it mattered while it was being asked and is noise
 * afterwards. A row still to come shows its label alone, which is the shape of
 * what is coming without giving away the answers on the way.
 */
function QuietRow({ row, filled }: { row: GuidedGoalRow; filled: boolean }) {
  return (
    <Box
      data-testid={`row:${row.label}`}
      data-state={filled ? 'filled' : 'pending'}
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: `${space[3]}px`,
        minHeight: 28,
      }}
    >
      <Typography
        variant="body2"
        sx={{ color: filled ? 'var(--text-secondary)' : 'var(--text-muted)' }}
      >
        {row.label}
      </Typography>
      {filled ? (
        <Value text={row.value} />
      ) : (
        <Numeral size={17} color="var(--text-muted)">
          {PENDING}
        </Numeral>
      )}
    </Box>
  );
}

/**
 * The row being answered, and the one thing on the screen that should catch the
 * eye.
 *
 * It is a bounded block rather than another line in the list, because the
 * complaint that produced this design was that nothing said what was being
 * answered right now. Contrast comes from both directions: this is tinted,
 * outlined and set large, and every other row is quiet. The tint is the one the
 * nav rail and the Revise menu already use for the current item, and it is not
 * a grading colour — nothing here is being marked.
 */
function ActiveRow({ row, answered }: { row: GuidedGoalRow; answered: boolean }) {
  return (
    <Box
      data-testid={`row:${row.label}`}
      data-state="active"
      sx={{
        my: `${space[2]}px`,
        px: `${space[3]}px`,
        py: `${space[3]}px`,
        bgcolor: 'var(--brand-tint)',
        borderRadius: `${radius.md}px`,
        boxShadow: 'inset 0 0 0 1px var(--brand)',
      }}
    >
      <Typography variant="body2" sx={{ color: 'var(--brand-on-tint)' }}>
        {row.label}
      </Typography>
      <Box
        sx={{
          mt: `${space[1]}px`,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          gap: `${space[2]}px`,
        }}
      >
        <Typography
          variant="h2"
          component="p"
          data-testid="concept-expression"
          sx={{ color: 'var(--text-primary)', fontWeight: 500 }}
        >
          {row.expression}
        </Typography>
        <Typography variant="h2" component="span" aria-hidden sx={{ color: 'var(--text-muted)' }}>
          =
        </Typography>
        {answered ? (
          <Value text={row.value} />
        ) : (
          <Box
            aria-hidden
            sx={{
              minWidth: 40,
              minHeight: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: `${radius.sm}px`,
              border: `1px dashed var(--brand)`,
            }}
          >
            <Numeral size={22} weight={500} color="var(--brand-on-tint)">
              ?
            </Numeral>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export interface GoalLedgerProps {
  walk: GuidedWalk;
  /** How many steps are behind the user. */
  stepsDone: number;
  /** The goal being worked, or null once the walk is finished. */
  goal: GuidedGoal | null;
  /** True once the current step has been answered correctly. */
  answered: boolean;
}

/**
 * What is being built, and where inside it the user is.
 *
 * Only the goal being worked is on screen. A goal that is finished collapses to
 * one line holding its result, because that result is all the goals after it
 * need. The first version of this screen showed all three equations at once
 * alongside a reference table, the givens, the question and the working, and
 * the person it was built for could not find what he was answering.
 */
export function GoalLedger({ walk, stepsDone, goal, answered }: GoalLedgerProps) {
  const settled = settledGoals(walk, stepsDone).filter((entry) => entry.summary !== null);

  return (
    <Box
      data-testid="concept-ledger"
      sx={{ display: 'flex', flexDirection: 'column', gap: `${space[4]}px` }}
    >
      {settled.length > 0 ? (
        <Box
          data-testid="concept-known"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: `${space[1]}px`,
            pl: `${space[3]}px`,
            borderLeft: stroke.hairline,
          }}
        >
          {settled.map((entry) => (
            <Typography key={entry.id} variant="body2" sx={{ color: 'var(--text-secondary)' }}>
              {entry.summary}
            </Typography>
          ))}
        </Box>
      ) : null}

      {goal ? (
        <Box>
          <Typography variant="h2" component="h2">
            {goal.title}
          </Typography>
          <Typography variant="body2" sx={{ mt: `${space[1]}px`, color: 'var(--text-secondary)' }}>
            {goal.blurb}
          </Typography>

          <Box sx={{ mt: `${space[3]}px` }}>
            {goal.rows.map((row) => {
              const state = rowState(walk, row, stepsDone);
              if (state === 'active') {
                return <ActiveRow key={row.label} row={row} answered={answered} />;
              }
              return <QuietRow key={row.label} row={row} filled={state === 'filled'} />;
            })}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
