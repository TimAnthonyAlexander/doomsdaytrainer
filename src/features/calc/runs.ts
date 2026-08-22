/**
 * The question machine every calculation screen runs on.
 *
 * A lesson drill, a whole derivation and the working half of the verify screen
 * are the same shape: a fixed list of questions, one on screen at a time, a
 * wrong answer holding the list where it is until the right one arrives. That
 * holding rule is the teaching: a screen that moves on after a wrong answer has
 * taught the user that the wrong answer was good enough.
 *
 * Pure. No React, no timers, no domain import — the caller passes whatever it
 * wants asked, as long as each item carries the single number that answers it.
 */

/** Anything askable: a lesson item, a `CalcStep`, a code from memory. */
export interface RunItem {
  answer: number;
}

export interface RunState<T extends RunItem> {
  items: readonly T[];
  /** Which item is on screen. Equals `items.length` once the run is done. */
  index: number;
  /**
   * Millis to the **first** answer at each item, right or wrong, or null where
   * nothing has been answered yet. First answer, because the second one is
   * timed against a screen that is already showing the working.
   */
  timings: (number | null)[];
  /** True where the item was answered correctly at the first attempt. */
  firstTry: boolean[];
  /** What was last answered wrong at the current item, or null. */
  lastWrong: number | null;
  /** Wrong answers across the whole run. */
  wrongTotal: number;
  done: boolean;
}

export function startRun<T extends RunItem>(items: readonly T[]): RunState<T> {
  return {
    items,
    index: 0,
    timings: items.map(() => null),
    firstTry: items.map(() => true),
    lastWrong: null,
    wrongTotal: 0,
    done: items.length === 0,
  };
}

/** The item being asked, or null once the run is finished. */
export function currentItem<T extends RunItem>(state: RunState<T>): T | null {
  return state.done ? null : (state.items[state.index] ?? null);
}

export interface RunAnswer<T extends RunItem> {
  state: RunState<T>;
  correct: boolean;
}

/**
 * One answer at the current item.
 *
 * Right advances. Wrong stays put and records itself, so the screen above can
 * show the working for the step the user is still standing on. An answer after
 * the run is done changes nothing.
 */
export function answerRun<T extends RunItem>(
  state: RunState<T>,
  value: number,
  latencyMs: number,
): RunAnswer<T> {
  const item = currentItem(state);
  if (item === null) return { state, correct: false };

  const correct = value === item.answer;
  const timings =
    state.timings[state.index] === null
      ? state.timings.map((ms, i) => (i === state.index ? Math.max(0, Math.round(latencyMs)) : ms))
      : state.timings;

  if (!correct) {
    return {
      state: {
        ...state,
        timings,
        firstTry: state.firstTry.map((ok, i) => (i === state.index ? false : ok)),
        lastWrong: value,
        wrongTotal: state.wrongTotal + 1,
      },
      correct: false,
    };
  }

  const index = state.index + 1;
  return {
    state: { ...state, timings, index, lastWrong: null, done: index >= state.items.length },
    correct: true,
  };
}

/**
 * Moves past the current item whether or not it was answered right.
 *
 * Verify mode needs this. There the user's own wrong answer has to survive to
 * the comparison at the end — an outcome of "the working was wrong" cannot
 * exist on a screen that refuses to move until the working is right. Practice
 * mode never calls it.
 */
export function skipCurrent<T extends RunItem>(state: RunState<T>): RunState<T> {
  if (state.done) return state;
  const index = state.index + 1;
  return { ...state, index, lastWrong: null, done: index >= state.items.length };
}

/** True when every item was answered right at the first attempt. */
export function cleanRun<T extends RunItem>(state: RunState<T>): boolean {
  return state.firstTry.every(Boolean);
}
