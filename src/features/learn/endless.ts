import type { Code, YearKey } from '@/domain/types';
import { isCousin, orderVaried } from '@/domain/rotation';
import { codeFor } from '@/domain/yearCodes';

/**
 * The pass that comes after the block is taught and does not end.
 *
 * A block stops the moment every year has its clean run, which is the right
 * place to stop *teaching* — the criterion is what makes "introduced" mean
 * something. It is the wrong place to stop *practising*, and the first user to
 * finish a decade said so immediately: the codes were nearly there and the
 * screen took them away.
 *
 * So this introduces nothing. Every year it asks has already been introduced,
 * the daily new-item cap is untouched, and no scheduling state moves — the same
 * contract the rest of Learn works under. It only keeps asking.
 *
 * The order is the same varied rotation the rest of the app uses, one full pass
 * over the pool at a time. Cycles matter: a plain "draw at random forever" would
 * hand the same year twice in a row eventually and leave others unasked for a
 * long stretch, and a cycle guarantees every year comes up once before any comes
 * up twice. The seam between two cycles is the one place the rotation's own
 * guarantee does not reach, so it is checked explicitly.
 */

export interface EndlessState {
  /** Every year this pass draws from. Never changes. */
  pool: YearKey[];
  /** What is left of the current cycle. The head is on screen. */
  queue: YearKey[];
  /** How many full passes over the pool have been started. */
  cycle: number;
  seed: number;
  /** Correct answers given. */
  answered: number;
  /** Wrong taps, which never advance. */
  wrong: number;
  lastWrong: Code | null;
  lastWrongYear: YearKey | null;
}

export function startEndless(pool: readonly YearKey[], seed = 0): EndlessState {
  const years = [...new Set(pool)].sort((a, b) => a - b);
  return {
    pool: years,
    queue: years.length === 0 ? [] : orderVaried(years, seed),
    cycle: 0,
    seed,
    answered: 0,
    wrong: 0,
    lastWrong: null,
    lastWrongYear: null,
  };
}

export function currentYear(state: EndlessState): YearKey | null {
  return state.queue[0] ?? null;
}

/** The year after the one on screen, for preloading its audio. Null at a seam. */
export function upcomingYear(state: EndlessState): YearKey | null {
  return state.queue[1] ?? null;
}

/**
 * The next cycle, rotated if it would open on a cousin of the year that just
 * closed the previous one. Within a cycle the rotation already guarantees no
 * neighbour and no same-decade year follows another; this is the join it cannot
 * see, and without it a decade-sized pool hands over a `+1` step every tenth
 * answer.
 */
export function nextCycle(state: EndlessState, after: YearKey): YearKey[] {
  const cycle = orderVaried(state.pool, state.seed + state.cycle + 1);
  if (cycle.length < 2) return cycle;

  // Re-rolled rather than rotated. Rotating looks like the cheap fix and is
  // wrong: `orderVaried` only constrains each step of the list it returns, so
  // the join between its last year and its first is unconstrained, and rotating
  // promotes exactly that join into the middle of the sequence. A fresh seed
  // keeps the guarantee intact and only the head has to be checked.
  //
  // Graded, because the strongest rule is not always satisfiable: a pool that
  // is a single decade has no year that is not a cousin of `after`.
  const preferences: ((yy: YearKey) => boolean)[] = [
    (yy) => !isCousin(yy, after),
    (yy) => yy !== after && Math.abs(yy - after) !== 1,
    (yy) => yy !== after,
  ];

  for (const acceptable of preferences) {
    for (let attempt = 0; attempt < CYCLE_ATTEMPTS; attempt += 1) {
      const candidate =
        attempt === 0 ? cycle : orderVaried(state.pool, state.seed + state.cycle + 1 + attempt);
      if (acceptable(candidate[0])) return candidate;
    }
  }
  return cycle;
}

/** Seeds tried per preference before falling back to a weaker one. */
const CYCLE_ATTEMPTS = 12;

export interface EndlessAnswer {
  state: EndlessState;
  correct: boolean;
}

/**
 * Apply one tap. Never mutates.
 *
 * A wrong answer does not advance, the same rule the rest of the app follows:
 * the way on is tapping the code the year actually has, so the last thing the
 * hand does before the next prompt is the right pairing.
 */
export function answerEndless(state: EndlessState, chosen: Code): EndlessAnswer {
  const yy = currentYear(state);
  if (yy === null) return { state, correct: false };

  if (chosen !== codeFor(yy)) {
    return {
      state: { ...state, wrong: state.wrong + 1, lastWrong: chosen, lastWrongYear: yy },
      correct: false,
    };
  }

  const rest = state.queue.slice(1);
  const cleared = {
    ...state,
    answered: state.answered + 1,
    lastWrong: null,
    lastWrongYear: null,
  };
  if (rest.length > 0) return { state: { ...cleared, queue: rest }, correct: true };

  return {
    state: { ...cleared, queue: nextCycle(state, yy), cycle: state.cycle + 1 },
    correct: true,
  };
}
