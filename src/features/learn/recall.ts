import type { Code, YearKey } from '@/domain/types';
import { codeFor } from '@/domain/yearCodes';

/**
 * Pass 2 of a learn block: same ten years, codes hidden, unlimited retries.
 *
 * There is no scoring and no way to fail out. A wrong tap is counted so the
 * completion line can state it, and nothing else happens: the same year stays
 * on screen until it is answered.
 */
export interface RecallState {
  years: YearKey[];
  /** Position in `years`. Equals `years.length` once done. */
  index: number;
  /** Wrong taps across the whole pass. */
  wrongTaps: number;
  /** Last wrong code tapped for the current year, cleared on advance. */
  lastWrong: Code | null;
  done: boolean;
}

export function startRecall(years: YearKey[]): RecallState {
  return {
    years: [...years],
    index: 0,
    wrongTaps: 0,
    lastWrong: null,
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
      state: { ...state, index, lastWrong: null, done: index >= state.years.length },
      correct: true,
    };
  }

  return {
    state: { ...state, wrongTaps: state.wrongTaps + 1, lastWrong: chosen },
    correct: false,
  };
}
