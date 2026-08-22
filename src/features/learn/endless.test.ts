import { describe, expect, it } from 'vitest';
import type { Code, YearKey } from '@/domain/types';
import { codeFor, decadeOf } from '@/domain/yearCodes';
import {
  answerEndless,
  currentYear,
  startEndless,
  upcomingYear,
  type EndlessState,
} from './endless';

const DECADE: YearKey[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function right(state: EndlessState): EndlessState {
  const yy = currentYear(state);
  if (yy === null) throw new Error('nothing on screen');
  return answerEndless(state, codeFor(yy)).state;
}

function wrong(state: EndlessState): EndlessState {
  const yy = currentYear(state);
  if (yy === null) throw new Error('nothing on screen');
  return answerEndless(state, (((codeFor(yy) + 1) % 7) as Code)).state;
}

/** The years asked over `n` correct answers. */
function walk(state: EndlessState, n: number): YearKey[] {
  const seen: YearKey[] = [];
  let current = state;
  for (let i = 0; i < n; i += 1) {
    seen.push(currentYear(current) as YearKey);
    current = right(current);
  }
  return seen;
}

describe('startEndless', () => {
  it('draws from the pool it is given and introduces nothing', () => {
    const state = startEndless(DECADE, 3);
    expect([...state.queue].sort((a, b) => a - b)).toEqual(DECADE);
    expect(state.pool).toEqual(DECADE);
  });

  it('drops duplicates rather than asking a year twice per cycle', () => {
    expect(startEndless([5, 5, 9, 9, 9], 1).pool).toEqual([5, 9]);
  });

  it('has nothing on screen for an empty pool', () => {
    const state = startEndless([], 1);
    expect(currentYear(state)).toBeNull();
    expect(answerEndless(state, 0).state).toBe(state);
  });
});

describe('it does not end', () => {
  it('keeps asking well past the size of the pool', () => {
    // The whole point: a block stops at its criterion, this does not stop.
    const seen = walk(startEndless(DECADE, 7), 250);
    expect(seen).toHaveLength(250);
    expect(currentYear(startEndless(DECADE, 7))).not.toBeNull();
  });

  it('asks every year once before asking any year twice', () => {
    const seen = walk(startEndless(DECADE, 4), DECADE.length);
    expect([...seen].sort((a, b) => a - b)).toEqual(DECADE);
  });

  it('keeps cycling evenly over many passes', () => {
    const seen = walk(startEndless(DECADE, 2), 200);
    const counts = DECADE.map((yy) => seen.filter((s) => s === yy).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});

describe('ordering', () => {
  it('never steps to a neighbour, across cycle seams included', () => {
    for (const seed of [0, 5, 19, 44]) {
      const seen = walk(startEndless(DECADE, seed), 200);
      for (let i = 1; i < seen.length; i += 1) {
        expect(Math.abs(seen[i] - seen[i - 1])).not.toBe(1);
      }
    }
  });

  it('never asks the same year twice running, seams included', () => {
    for (const seed of [0, 5, 19, 44]) {
      const seen = walk(startEndless(DECADE, seed), 200);
      for (let i = 1; i < seen.length; i += 1) expect(seen[i]).not.toBe(seen[i - 1]);
    }
  });

  it('does not repeat a decade across a seam when the pool spans several', () => {
    const wide = [3, 12, 27, 34, 48, 51, 66, 79, 85, 91];
    for (const seed of [1, 8, 30]) {
      const seen = walk(startEndless(wide, seed), 120);
      for (let i = 1; i < seen.length; i += 1) {
        expect(decadeOf(seen[i])).not.toBe(decadeOf(seen[i - 1]));
      }
    }
  });

  it('does not give two cycles the same order', () => {
    const state = startEndless(DECADE, 6);
    const first = walk(state, 10);
    let after = state;
    for (let i = 0; i < 10; i += 1) after = right(after);
    expect(walk(after, 10)).not.toEqual(first);
  });
});

describe('answering', () => {
  it('holds the year on screen after a wrong tap', () => {
    let state = startEndless(DECADE, 9);
    const yy = currentYear(state) as YearKey;
    state = wrong(state);
    expect(currentYear(state)).toBe(yy);
    expect(state.wrong).toBe(1);
    expect(state.answered).toBe(0);
    expect(state.lastWrongYear).toBe(yy);

    state = right(state);
    expect(currentYear(state)).not.toBe(yy);
    expect(state.answered).toBe(1);
  });

  it('clears the last wrong once the year is answered', () => {
    let state = startEndless(DECADE, 9);
    state = right(wrong(state));
    expect(state.lastWrong).toBeNull();
    expect(state.lastWrongYear).toBeNull();
  });

  it('counts correct answers and wrong taps separately', () => {
    let state = startEndless(DECADE, 9);
    state = wrong(state);
    state = wrong(state);
    state = right(state);
    state = right(state);
    expect(state.answered).toBe(2);
    expect(state.wrong).toBe(2);
  });

  it('never mutates the state it is given', () => {
    const state = startEndless(DECADE, 9);
    Object.freeze(state);
    Object.freeze(state.queue);
    expect(() => answerEndless(state, 0)).not.toThrow();
    expect(state.answered).toBe(0);
  });
});

describe('upcomingYear', () => {
  it('names the year after the one on screen', () => {
    const state = startEndless(DECADE, 3);
    expect(upcomingYear(state)).toBe(state.queue[1]);
  });

  it('is null at the last year of a cycle, where the next one is not built yet', () => {
    let state = startEndless(DECADE, 3);
    for (let i = 0; i < DECADE.length - 1; i += 1) state = right(state);
    expect(upcomingYear(state)).toBeNull();
  });
});
