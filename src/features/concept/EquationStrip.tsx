import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Numeral } from '@/components/ui/Numeral';
import {
  filledSlots,
  type GuidedPart,
  type GuidedSlotId,
  type GuidedTerm,
  type GuidedWalk,
} from '@/domain/guidedDate';
import { radius, space } from '@/theme/tokens';

/** Stands in for a number that has not been produced yet. */
const EMPTY = '–';

export interface EquationStripProps {
  walk: GuidedWalk;
  /** How many steps are behind the user. Decides which slots read as filled. */
  stepsDone: number;
  /** The slot the current question is working toward, or null when finished. */
  active: GuidedSlotId | null;
}

/**
 * One term: what the number is, above the number itself.
 *
 * The label is never dropped, filled or empty. Half the screen is digits and
 * two of them stacked with nothing naming them teach nothing (invariant 7).
 */
function Term({ term, filled, active }: { term: GuidedTerm; filled: boolean; active: boolean }) {
  const shown = filled ? term.value : (term.pending ?? EMPTY);
  const ink = active
    ? 'var(--brand-on-tint)'
    : filled
      ? 'var(--text-primary)'
      : 'var(--text-muted)';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '2px',
        px: '6px',
        py: '4px',
        borderRadius: `${radius.sm}px`,
        // The brand tint marks the current item on the nav rail and in the
        // Revise menu, and it means the same thing here. No grading colour: this
        // is not feedback.
        bgcolor: active ? 'var(--brand-tint)' : 'transparent',
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: active ? 'var(--brand-on-tint)' : 'var(--text-muted)',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
        }}
      >
        {term.label}
      </Typography>
      <Numeral size={17} weight={500} color={ink}>
        {shown}
      </Numeral>
    </Box>
  );
}

function Operator({ text }: { text: string }) {
  return (
    <Typography
      component="span"
      variant="body2"
      aria-hidden
      sx={{ color: 'var(--text-muted)', pb: '5px', whiteSpace: 'nowrap' }}
    >
      {text}
    </Typography>
  );
}

/**
 * The whole computation, from the first screen, with the pieces that are not
 * known yet standing empty.
 *
 * Without it the walk is blind arithmetic: twelve correct sums and no sense of
 * what they are building. With it the user can see the shape of the answer and
 * where inside it they are. Which slot holds what is decided in
 * `guidedDate.ts` — see `filledSlots` — so it is assertable without rendering.
 *
 * Mono numerals, which are tabular, so a slot filling in never shifts the line.
 * The rows wrap rather than shrink, because the type sizes are fixed and 375px
 * is a supported width.
 */
export function EquationStrip({ walk, stepsDone, active }: EquationStripProps) {
  const filled = filledSlots(walk, stepsDone);

  const render = (part: GuidedPart, index: number) =>
    part.kind === 'op' ? (
      <Operator key={`op-${index}`} text={part.text} />
    ) : (
      <Term
        key={part.slot}
        term={part}
        filled={filled.has(part.slot)}
        active={part.slot === active}
      />
    );

  return (
    <Box
      data-testid="concept-equations"
      sx={{ display: 'flex', flexDirection: 'column', gap: `${space[1]}px` }}
    >
      {walk.equations.map((equation) => (
        <Box
          key={equation.result.slot}
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            columnGap: `${space[1]}px`,
            rowGap: 0,
          }}
        >
          {render(equation.result, -1)}
          <Operator text="=" />
          {equation.parts.map(render)}
        </Box>
      ))}
    </Box>
  );
}
