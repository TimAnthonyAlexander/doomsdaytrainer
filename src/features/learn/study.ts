import type { Code, YearKey } from '@/domain/types';
import { codeFor } from '@/domain/yearCodes';

/**
 * The teaching step of a learn block: one pair at a time, shown and then
 * immediately asked for.
 *
 * What this replaces was the real defect. The old recognition pass laid a
 * decade out as its leap runs in a grid, drew a `+1` between every adjacent
 * pair and a ruled `+2` across each boundary, and made the user tap the ten in
 * ascending order. The questions had already been fixed to ask in varied order,
 * but the app was still *teaching* the string first, so the varied questions
 * were being answered by walking the string that had just been handed over.
 *
 * Two rules shape what is here instead.
 *
 * One pair on screen at a time. Wozniak's minimum information principle: avoid
 * enumerations, because a list of ten is one item the user cannot half-know and
 * cannot be graded on. A year, its code, and nothing else on the screen to
 * derive either from.
 *
 * Show before ask, always. Seabrooke et al. (2019, JML 104) had people guess
 * before feedback on pairs with no pre-existing association: guessing improved
 * memory for the individual items and **impaired** cued recall of the link
 * between them. Cued recall of the link is the only thing this app builds, so
 * a pair is never asked for before its first reveal. The `show` trial still
 * takes a tap, and the code it asks for is the code on screen — that cannot be
 * a guess, and it makes the pairing a motor act rather than something read.
 *
 * A wrong tap never advances, on either trial, the same rule Review and Recall
 * follow: the last thing the hand does before the next prompt is the correct
 * pairing.
 */

export type StudyTrial = 'show' | 'test';

export interface StudyState {
  /** The batch, in the order it is taught. Never reordered. */
  years: YearKey[];
  /** Index into `years`. */
  index: number;
  trial: StudyTrial;
  /** Wrong taps across every trial of this batch. */
  wrongTaps: number;
  /** Last wrong code tapped, and the year it was tapped for. Cleared on advance. */
  lastWrong: Code | null;
  lastWrongYear: YearKey | null;
  done: boolean;
}

export function startStudy(years: readonly YearKey[]): StudyState {
  return {
    years: [...years],
    index: 0,
    trial: 'show',
    wrongTaps: 0,
    lastWrong: null,
    lastWrongYear: null,
    done: years.length === 0,
  };
}

export function currentStudyYear(state: StudyState): YearKey | null {
  return state.done ? null : (state.years[state.index] ?? null);
}

/** Trials answered out of trials in the batch. Two per pair: show, then test. */
export function studyProgress(state: StudyState): { position: number; total: number } {
  const total = state.years.length * 2;
  const answered = state.index * 2 + (state.trial === 'test' ? 1 : 0);
  return { position: Math.min(answered + 1, total), total };
}

export interface StudyAnswer {
  state: StudyState;
  correct: boolean;
}

/** Apply one tap. Never mutates. Answering a finished batch changes nothing. */
export function answerStudy(state: StudyState, chosen: Code): StudyAnswer {
  if (state.done) return { state, correct: false };

  const yy = state.years[state.index];
  if (yy === undefined) return { state, correct: false };

  if (chosen !== codeFor(yy)) {
    return {
      state: {
        ...state,
        wrongTaps: state.wrongTaps + 1,
        lastWrong: chosen,
        lastWrongYear: yy,
      },
      correct: false,
    };
  }

  const cleared = { ...state, lastWrong: null, lastWrongYear: null };

  // The pair was just shown, so the ask that follows is the same pair with the
  // code taken away — the shortest possible gap between seeing it and having to
  // produce it, and the first retrieval it ever gets.
  if (state.trial === 'show') return { state: { ...cleared, trial: 'test' }, correct: true };

  const index = state.index + 1;
  return {
    state: { ...cleared, index, trial: 'show', done: index >= state.years.length },
    correct: true,
  };
}
