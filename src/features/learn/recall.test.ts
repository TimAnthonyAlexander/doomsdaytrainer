import { describe, expect, it } from 'vitest';
import type { Code, YearKey } from '@/domain/types';
import { codeFor, decadeOf } from '@/domain/yearCodes';
import {
  REINSERT_GAP,
  VARIED_STREAK,
  answerRecall,
  currentYear,
  isSettled,
  progress,
  remainingCount,
  startRecall,
  type RecallState,
} from './recall';

const DECADE: YearKey[] = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69];

/** Answer the year on screen correctly. */
function right(state: RecallState): RecallState {
  const yy = currentYear(state);
  if (yy === null) throw new Error('nothing on screen');
  return answerRecall(state, codeFor(yy)).state;
}

/** Answer the year on screen with something that is not its code. */
function wrong(state: RecallState): RecallState {
  const yy = currentYear(state);
  if (yy === null) throw new Error('nothing on screen');
  return answerRecall(state, (((codeFor(yy) + 1) % 7) as Code)).state;
}

/** Every year the pass put on screen, in order, answering everything right. */
function walk(state: RecallState, limit = 500): YearKey[] {
  const seen: YearKey[] = [];
  let current = state;
  while (!current.done && seen.length < limit) {
    seen.push(currentYear(current) as YearKey);
    current = right(current);
  }
  if (!current.done) throw new Error('pass did not finish');
  return seen;
}

describe('the ordered pass', () => {
  it('asks the block in ascending order, once each', () => {
    let state = startRecall(DECADE);
    const seen: YearKey[] = [];
    for (let i = 0; i < DECADE.length; i += 1) {
      seen.push(currentYear(state) as YearKey);
      state = right(state);
    }
    expect(seen).toEqual(DECADE);
  });

  it('keeps the year on screen after a wrong tap instead of restarting', () => {
    // The old rule sent the user back to the first year of the block, which
    // rehearsed the run from its start and is exactly what built the chain.
    let state = startRecall(DECADE);
    state = right(state);
    state = right(state);
    expect(currentYear(state)).toBe(62);

    state = wrong(state);
    expect(currentYear(state)).toBe(62);
    expect(state.queue[0]).toBe(62);
    expect(state.wrongTaps).toBe(1);
    expect(state.lastWrongYear).toBe(62);

    state = right(state);
    expect(currentYear(state)).toBe(63);
  });

  it('switches to varied order once every year has been right once', () => {
    // Battig, Brown & Nelson (1963): the switch point is first correct, per
    // item, and switching there keeps the whole benefit of constant order.
    let state = startRecall(DECADE);
    for (let i = 0; i < DECADE.length; i += 1) {
      expect(state.phase).toBe('ordered');
      state = right(state);
    }
    expect(state.phase).toBe('varied');
  });
});

describe('the varied pass', () => {
  function intoVaried(years = DECADE, seed = 7, mixIn: YearKey[] = []): RecallState {
    let state = startRecall(years, seed, mixIn);
    for (let i = 0; i < years.length; i += 1) state = right(state);
    expect(state.phase).toBe('varied');
    return state;
  }

  it('never asks a year immediately after its neighbour', () => {
    for (const seed of [0, 3, 11, 40]) {
      const order = walk(intoVaried(DECADE, seed));
      for (let i = 1; i < order.length; i += 1) {
        expect(Math.abs(order[i] - order[i - 1])).not.toBe(1);
      }
    }
  });

  it('never asks the same year twice in a row', () => {
    for (const seed of [0, 3, 11, 40]) {
      const order = walk(intoVaried(DECADE, seed));
      for (let i = 1; i < order.length; i += 1) {
        expect(order[i]).not.toBe(order[i - 1]);
      }
    }
  });

  it('does not finish until every year has its streak', () => {
    const state = intoVaried();
    const finished = walk(state);
    const counts = new Map<YearKey, number>();
    for (const yy of finished) counts.set(yy, (counts.get(yy) ?? 0) + 1);
    for (const yy of DECADE) expect(counts.get(yy) ?? 0).toBeGreaterThanOrEqual(VARIED_STREAK);
  });

  it('costs a year its streak when it is missed, and only that year', () => {
    let state = intoVaried();
    state = right(state);
    const settledSoFar = { ...state.streaks };
    const yy = currentYear(state) as YearKey;

    state = wrong(state);
    expect(state.streaks[yy]).toBe(0);
    for (const other of DECADE) {
      if (other === yy) continue;
      expect(state.streaks[other]).toBe(settledSoFar[other]);
    }
  });

  it('puts a missed year back with a real gap rather than straight away', () => {
    let state = intoVaried();
    const yy = currentYear(state) as YearKey;
    state = right(state);
    // One clean answer, still short of the streak, so it comes back — but not next.
    expect(isSettled(state, yy)).toBe(false);
    expect(state.queue.indexOf(yy)).toBeGreaterThanOrEqual(1);
    expect(state.queue[0]).not.toBe(yy);
  });

  it('keeps that gap even for the last year left, using settled years as spacers', () => {
    // Without spacers the tail of a block degenerates into asking one year over
    // and over, where the answer just given carries the next retrieval.
    let state = intoVaried();
    let guard = 0;
    while (remainingCount(state) > 1 && guard < 400) {
      state = right(state);
      guard += 1;
    }
    const order = walk(state);
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]).not.toBe(order[i - 1]);
    }
    expect(REINSERT_GAP).toBeGreaterThan(0);
  });

  it('asks mixed-in years but never waits on them', () => {
    const mixIn: YearKey[] = [12, 34, 47, 81];
    const state = intoVaried(DECADE, 5, mixIn);
    const order = walk(state);
    expect(order.some((yy) => mixIn.includes(yy))).toBe(true);
    // Finishing is decided by the block's own years.
    for (const yy of DECADE) expect(isSettled(state, yy)).toBe(false);
    const finished = order.filter((yy) => DECADE.includes(yy));
    expect(finished.length).toBeGreaterThanOrEqual(DECADE.length * VARIED_STREAK);
  });

  it('spreads the mixed-in years through the pass rather than clumping them', () => {
    const mixIn: YearKey[] = [12, 34, 47, 81, 5, 28, 93, 76];
    const order = walk(intoVaried(DECADE, 9, mixIn));
    const half = Math.floor(order.length / 2);
    const isMix = (yy: YearKey) => mixIn.includes(yy);
    expect(order.slice(0, half).some(isMix)).toBe(true);
    expect(order.slice(half).some(isMix)).toBe(true);
    // And they come from elsewhere, so a mix-in genuinely breaks the decade.
    expect(order.filter(isMix).every((yy) => decadeOf(yy) !== 6)).toBe(true);
  });
});

describe('a pass over years already produced once', () => {
  it('opens mixed rather than asking ascending a second time', () => {
    // The block's final pass over all ten: every year was produced correctly in
    // its group pass, so its ordered ask is spent. Battig's switch point is per
    // pair, not per pass.
    const state = startRecall(DECADE, 4, [], true);
    expect(state.phase).toBe('varied');
    const order = walk(state);
    expect(order.slice(0, 10)).not.toEqual(DECADE);
    for (let i = 1; i < order.length; i += 1) {
      expect(Math.abs(order[i] - order[i - 1])).not.toBe(1);
    }
  });

  it('still requires the full streak from every year', () => {
    const order = walk(startRecall(DECADE, 4, [], true));
    for (const yy of DECADE) {
      expect(order.filter((seen) => seen === yy).length).toBeGreaterThanOrEqual(VARIED_STREAK);
    }
  });
});

describe('a batch-sized pass', () => {
  // Learn no longer hands this file a whole decade first. It hands it an
  // introduction batch: three or four years, none of them adjacent, every pair
  // already produced once in its study trial. The tests above walk ten; these
  // walk what the app actually passes.
  const BATCHES: YearKey[][] = [
    [40, 43, 46, 49],
    [41, 44, 47],
    [42, 45, 48],
  ];

  it('finishes every batch of every decade, at every seed', () => {
    for (let decade = 0; decade < 10; decade += 1) {
      for (const shape of BATCHES) {
        const batch = shape.map((yy) => (yy % 10) + decade * 10);
        for (const seed of [0, 5, 31]) {
          const order = walk(startRecall(batch, seed, [], true));
          for (const yy of batch) {
            expect(order.filter((seen) => seen === yy).length).toBeGreaterThanOrEqual(
              VARIED_STREAK,
            );
          }
        }
      }
    }
  });

  it('never asks the same year twice running, even in a pool of three', () => {
    for (const seed of [0, 5, 31]) {
      const order = walk(startRecall([41, 44, 47], seed, [], true));
      for (let i = 1; i < order.length; i += 1) {
        expect(order[i]).not.toBe(order[i - 1]);
      }
    }
  });
});

describe('progress and counters', () => {
  it('counts the ordered pass as one step per year', () => {
    const state = startRecall(DECADE);
    expect(progress(state)).toEqual({ position: 1, total: 10 });
    expect(progress(right(state))).toEqual({ position: 2, total: 10 });
  });

  it('counts the varied pass in clean answers, not in years', () => {
    let state = startRecall(DECADE, 3);
    for (let i = 0; i < DECADE.length; i += 1) state = right(state);
    expect(progress(state).total).toBe(DECADE.length * VARIED_STREAK);
  });

  it('tallies every wrong tap across both passes', () => {
    let state = startRecall(DECADE);
    state = wrong(state);
    state = wrong(state);
    expect(state.wrongTaps).toBe(2);
  });

  it('never mutates the state it is given', () => {
    const state = startRecall(DECADE);
    Object.freeze(state);
    Object.freeze(state.queue);
    expect(() => answerRecall(state, codeFor(60))).not.toThrow();
    expect(state.queue).toHaveLength(10);
  });

  it('is done immediately for an empty block', () => {
    const state = startRecall([]);
    expect(state.done).toBe(true);
    expect(currentYear(state)).toBeNull();
    expect(answerRecall(state, 0).state).toBe(state);
  });
});
