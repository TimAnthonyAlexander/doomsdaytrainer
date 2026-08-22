import { describe, expect, it } from 'vitest';
import type { Code, YearKey } from '@/domain/types';
import { codeFor } from '@/domain/yearCodes';
import { DECADES, introBatches } from './blocks';
import {
  answerStudy,
  currentStudyYear,
  startStudy,
  studyProgress,
  type StudyState,
} from './study';

const BATCH: YearKey[] = [40, 43, 46, 49];

function right(state: StudyState): StudyState {
  const yy = currentStudyYear(state);
  if (yy === null) throw new Error('nothing on screen');
  return answerStudy(state, codeFor(yy)).state;
}

function wrong(state: StudyState): StudyState {
  const yy = currentStudyYear(state);
  if (yy === null) throw new Error('nothing on screen');
  return answerStudy(state, (((codeFor(yy) + 1) % 7) as Code)).state;
}

describe('the study trial', () => {
  it('shows the pair before it ever asks for it', () => {
    // Seabrooke et al. (2019): guessing before feedback on pairs with no
    // pre-existing association improves memory for the items and impairs cued
    // recall of the link. The link is the only thing this app builds.
    let state = startStudy(BATCH);
    expect(state.trial).toBe('show');
    expect(currentStudyYear(state)).toBe(40);

    state = right(state);
    expect(state.trial).toBe('test');
    expect(currentStudyYear(state)).toBe(40);
  });

  it('asks the same pair it just showed, then moves on', () => {
    let state = startStudy(BATCH);
    state = right(state);
    state = right(state);
    expect(currentStudyYear(state)).toBe(43);
    expect(state.trial).toBe('show');
  });

  it('never advances on a wrong tap, on either trial', () => {
    let state = startStudy(BATCH);
    state = wrong(state);
    expect(currentStudyYear(state)).toBe(40);
    expect(state.trial).toBe('show');
    expect(state.wrongTaps).toBe(1);
    expect(state.lastWrongYear).toBe(40);

    state = right(state);
    state = wrong(state);
    expect(currentStudyYear(state)).toBe(40);
    expect(state.trial).toBe('test');
    expect(state.wrongTaps).toBe(2);
  });

  it('clears the miss once the right code lands', () => {
    let state = wrong(startStudy(BATCH));
    expect(state.lastWrong).not.toBeNull();
    state = right(state);
    expect(state.lastWrong).toBeNull();
    expect(state.lastWrongYear).toBeNull();
  });

  it('finishes after two trials per pair', () => {
    let state = startStudy(BATCH);
    for (let i = 0; i < BATCH.length * 2; i += 1) {
      expect(state.done).toBe(false);
      state = right(state);
    }
    expect(state.done).toBe(true);
    expect(currentStudyYear(state)).toBeNull();
  });

  it('never mutates the state it is given', () => {
    const state = startStudy(BATCH);
    Object.freeze(state);
    Object.freeze(state.years);
    expect(() => answerStudy(state, codeFor(40))).not.toThrow();
    expect(state.trial).toBe('show');
  });

  it('is done immediately for an empty batch', () => {
    const state = startStudy([]);
    expect(state.done).toBe(true);
    expect(currentStudyYear(state)).toBeNull();
    expect(answerStudy(state, 0).state).toBe(state);
  });

  it('counts trials, not years', () => {
    const state = startStudy(BATCH);
    expect(studyProgress(state)).toEqual({ position: 1, total: 8 });
    expect(studyProgress(right(state))).toEqual({ position: 2, total: 8 });
    expect(studyProgress(right(right(state)))).toEqual({ position: 3, total: 8 });
  });
});

describe('what the teaching step can have on screen', () => {
  it('holds exactly one year at any moment, over every decade', () => {
    // The replaced screen laid a decade out as a grid of its leap runs with a
    // +1 drawn between every adjacent pair. One pair at a time is Wozniak's
    // minimum information principle, and it is what makes the batch impossible
    // to walk: there is no neighbour on screen to step from.
    for (const decade of DECADES) {
      for (const batch of introBatches(decade)) {
        let state = startStudy(batch);
        const seen: YearKey[] = [];
        while (!state.done) {
          const yy = currentStudyYear(state);
          expect(yy).not.toBeNull();
          seen.push(yy as YearKey);
          state = right(state);
        }
        // Consecutive trials are the same year twice (show then test) or a
        // jump of at least two. Never a neighbour, ever.
        for (let i = 1; i < seen.length; i += 1) {
          expect(Math.abs(seen[i] - seen[i - 1])).not.toBe(1);
        }
      }
    }
  });

  it('teaches every year of the decade across the three batches, and no year twice', () => {
    for (const decade of DECADES) {
      const taught = introBatches(decade).flatMap((batch) => {
        let state = startStudy(batch);
        const years: YearKey[] = [];
        while (!state.done) {
          const yy = currentStudyYear(state) as YearKey;
          if (state.trial === 'show') years.push(yy);
          state = right(state);
        }
        return years;
      });
      expect([...taught].sort((a, b) => a - b)).toEqual(
        Array.from({ length: 10 }, (_unused, i) => decade * 10 + i),
      );
    }
  });
});
