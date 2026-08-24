import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Numeral } from '@/components/ui/Numeral';
import {
  rowState,
  settledGoals,
  type GuidedGoal,
  type GuidedGoalRow,
  type GuidedWalk,
} from '@/domain/guidedDate';
import { dur, transition, useReducedMotion } from '@/theme/motion';
import { duration as motionMs, easing as motionEasing, radius, space, stroke } from '@/theme/tokens';

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

type ValueRef = (node: HTMLElement | null) => void;

/**
 * The value, wrapped so its screen position can be measured and its
 * transform animated.
 *
 * `transformOrigin: 'top left'` matters: it is what makes the plain
 * `left`/`top` delta below line up with the scale, so the wrapper's own
 * top-left corner is exactly where the FLIP maths puts it rather than
 * drifting toward whichever corner the browser would otherwise pick.
 */
function TravelingValue({
  row,
  muted,
  registerValue,
}: {
  row: GuidedGoalRow;
  muted?: boolean;
  registerValue: (label: string) => ValueRef;
}) {
  return (
    <Box
      component="span"
      ref={registerValue(row.label)}
      sx={{ display: 'inline-block', transformOrigin: 'top left' }}
    >
      <Value text={row.value} muted={muted} />
    </Box>
  );
}

/**
 * Measures every value on screen after each render and animates the ones that
 * moved since the last one, keyed by row label.
 *
 * This is a FLIP: on the render where a row settles from `ActiveRow`'s big
 * numeral to `QuietRow`'s small one, both wrap the same label through
 * `TravelingValue`, so the node this hook sees for that label simply changes
 * size and position between two commits. Reading the old rect and the new one
 * and animating the delta is what makes it read as one number shrinking into
 * place rather than one number disappearing and a different one appearing.
 *
 * A row becoming active for the first time has no previous rect for its label
 * — its value was a dashed "?" a moment ago, not a number — so nothing travels
 * in from there, which is correct: there is nothing to travel from.
 *
 * `transform` only, per STYLEGUIDE.md §7, and it never touches layout: the row
 * list's total height is unchanged by a within-goal step (the row that shrinks
 * and the row right after it that grows are the same size difference), so the
 * pad below the ledger never moves.
 */
function useValueFlip(reducedMotion: boolean) {
  const nodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const rectsRef = useRef<Map<string, DOMRect>>(new Map());

  const register = (label: string): ValueRef => {
    return (node) => {
      if (node) nodesRef.current.set(label, node);
      else nodesRef.current.delete(label);
    };
  };

  // No dependency array: this has to re-measure after every commit, including
  // the ones where a row's value node was swapped for a differently sized one
  // at the same label.
  useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>();
    for (const [label, node] of nodesRef.current) {
      const rect = node.getBoundingClientRect();
      const prev = rectsRef.current.get(label);
      if (!reducedMotion && prev && typeof node.animate === 'function' && rect.width > 0 && rect.height > 0) {
        const dx = prev.left - rect.left;
        const dy = prev.top - rect.top;
        const sx = prev.width / rect.width;
        const sy = prev.height / rect.height;
        if (dx !== 0 || dy !== 0 || sx !== 1 || sy !== 1) {
          node.animate(
            [
              { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
              { transform: 'none' },
            ],
            { duration: motionMs.ui, easing: motionEasing.out },
          );
        }
      }
      nextRects.set(label, rect);
    }
    rectsRef.current = nextRects;
  });

  return register;
}

/** Starts transparent and ramps to full opacity on the next frame. */
function useFadeIn(reducedMotion: boolean): boolean {
  const [visible, setVisible] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion || visible) return;
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion, visible]);
  return visible;
}

/**
 * Starts at full opacity when `active` and ramps to transparent on the next
 * frame — the reverse of `useFadeIn`, and only ever run once: `active` is read
 * at mount, so a row that is already settled when it (re-)renders does not
 * flash the tint back on.
 */
function useFadeOutOnce(active: boolean, reducedMotion: boolean): boolean {
  const [visible, setVisible] = useState(() => active && !reducedMotion);
  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => setVisible(false));
    return () => cancelAnimationFrame(raf);
  }, [visible]);
  return visible;
}

/**
 * A row that is done, or one that has not come up yet.
 *
 * One line: what the number is, and what it came out at. The sum that produced
 * it is deliberately gone — it mattered while it was being asked and is noise
 * afterwards. A row still to come shows its label alone, which is the shape of
 * what is coming without giving away the answers on the way.
 *
 * A row that has just settled out of `ActiveRow` briefly carries the same tint
 * that block had, fading to nothing over `dur.flash` — the visual hand-off that
 * pairs with the value's own move. `row.from === null` marks a row the app
 * simply states (the anchor, the doomsday dates) rather than one a step fills,
 * and those are filled from the moment their goal opens rather than settling
 * out of anything, so they never carry the tint at all.
 */
function QuietRow({
  row,
  filled,
  registerValue,
}: {
  row: GuidedGoalRow;
  filled: boolean;
  registerValue: (label: string) => ValueRef;
}) {
  const reducedMotion = useReducedMotion();
  const settling = filled && row.from !== null;
  const tinted = useFadeOutOnce(settling, reducedMotion);

  return (
    <Box
      data-testid={`row:${row.label}`}
      data-state={filled ? 'filled' : 'pending'}
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: `${space[3]}px`,
        minHeight: 28,
      }}
    >
      {settling ? (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: '-2px -4px',
            borderRadius: `${radius.sm}px`,
            bgcolor: 'var(--brand-tint)',
            opacity: tinted ? 1 : 0,
            transition: transition(['opacity'], dur.flash),
          }}
        />
      ) : null}
      <Typography
        variant="body2"
        sx={{ position: 'relative', color: filled ? 'var(--text-secondary)' : 'var(--text-muted)' }}
      >
        {row.label}
      </Typography>
      {filled ? (
        <Box sx={{ position: 'relative' }}>
          <TravelingValue row={row} registerValue={registerValue} />
        </Box>
      ) : (
        <Numeral size={17} color="var(--text-muted)" sx={{ position: 'relative' }}>
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
 *
 * The tint is its own layer behind the content rather than the block's own
 * background, so it can fade in on `opacity` alone without the label or the
 * value fading with it: every mount of this component is a new step, and the
 * tint ramping in over `dur.flash` is what makes the highlight arrive on the
 * new step rather than simply being there.
 */
function ActiveRow({
  row,
  answered,
  registerValue,
}: {
  row: GuidedGoalRow;
  answered: boolean;
  registerValue: (label: string) => ValueRef;
}) {
  const reducedMotion = useReducedMotion();
  const tinted = useFadeIn(reducedMotion);

  return (
    <Box
      data-testid={`row:${row.label}`}
      data-state="active"
      sx={{
        position: 'relative',
        my: `${space[2]}px`,
        px: `${space[3]}px`,
        py: `${space[3]}px`,
        borderRadius: `${radius.md}px`,
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          bgcolor: 'var(--brand-tint)',
          boxShadow: 'inset 0 0 0 1px var(--brand)',
          opacity: tinted ? 1 : 0,
          transition: transition(['opacity'], dur.flash),
        }}
      />
      <Box sx={{ position: 'relative' }}>
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
            <TravelingValue row={row} registerValue={registerValue} />
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
 *
 * The value answered in `ActiveRow` travels to its resting place in `QuietRow`
 * when the walk advances — see `useValueFlip` — which is the one animation this
 * screen carries. Every given names the step whose answer it is (`guidedDate.ts`
 * enforces that structurally), and this is what makes that relationship visible
 * rather than asserted: the number the user just produced is the same number
 * that reappears above it, because it is the same DOM node, shrinking into
 * place.
 */
export function GoalLedger({ walk, stepsDone, goal, answered }: GoalLedgerProps) {
  const reducedMotion = useReducedMotion();
  const registerValue = useValueFlip(reducedMotion);
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
                return (
                  <ActiveRow key={row.label} row={row} answered={answered} registerValue={registerValue} />
                );
              }
              return (
                <QuietRow
                  key={row.label}
                  row={row}
                  filled={state === 'filled'}
                  registerValue={registerValue}
                />
              );
            })}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
