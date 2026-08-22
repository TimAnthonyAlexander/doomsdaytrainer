import type { Code, YearKey } from '@/domain/types';
import { codeFor } from '@/domain/yearCodes';

/**
 * Pass 2 of a learn block: same ten years, codes hidden.
 *
 * A wrong tap sends the user back to the first year of the block. That is the
 * whole point: finishing the pass therefore means ten right answers in a row,
 * so "introduced" cannot mean "guessed through it". There is still no grade and
 * no way to fail out — the block can be attempted as many times as it takes.
 */
export interface RecallState {
  years: YearKey[];
  /** Position in `years`. Equals `years.length` once done. */
  index: number;
  /** Wrong taps across the whole pass, including the ones that caused a restart. */
  wrongTaps: number;
  /** How many times a wrong tap sent the user back to the start. */
  restarts: number;
  /** Last wrong code tapped, and the year it was tapped for. Cleared on advance. */
  lastWrong: Code | null;
  lastWrongYear: YearKey | null;
  done: boolean;
}

export function startRecall(years: YearKey[]): RecallState {
  return {
    years: [...years],
    index: 0,
    wrongTaps: 0,
    restarts: 0,
    lastWrong: null,
    lastWrongYear: null,
    done: years.length === 0,
  };
}

export function currentYear(state: RecallState): YearKey | null {
  return state.done ? null : state.years[state.index];
}

export interface RecallAnswer {
  state: RecallState;
  correct: boolean;
}

/** Apply one tap. Never mutates. Answering a finished pass changes nothing. */
export function answerRecall(state: RecallState, chosen: Code): RecallAnswer {
  if (state.done) return { state, correct: false };

  const yy = state.years[state.index];
  if (chosen === codeFor(yy)) {
    const index = state.index + 1;
    return {
      state: {
        ...state,
        index,
        lastWrong: null,
        lastWrongYear: null,
        done: index >= state.years.length,
      },
      correct: true,
    };
  }

  // Back to the first year of the block.
  return {
    state: {
      ...state,
      index: 0,
      wrongTaps: state.wrongTaps + 1,
      restarts: state.restarts + 1,
      lastWrong: chosen,
      lastWrongYear: yy,
    },
    correct: false,
  };
}
