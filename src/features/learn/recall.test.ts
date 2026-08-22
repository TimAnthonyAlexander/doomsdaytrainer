import { describe, expect, it } from 'vitest';
import type { Code } from '@/domain/types';
import { codeFor } from '@/domain/yearCodes';
import { decadeYears } from './blocks';
import { answerRecall, currentYear, startRecall, type RecallState } from './recall';

const wrongCodeFor = (yy: number): Code => (((codeFor(yy) + 1) % 7) as Code);

function answerAll(state: RecallState): RecallState {
  let current = state;
  while (!current.done) {
    const yy = currentYear(current);
    if (yy === null) break;
    current = answerRecall(current, codeFor(yy)).state;
  }
  return current;
}

describe('recall pass', () => {
  it('starts on the first year of the block', () => {
    const state = startRecall(decadeYears(4));
    expect(state.index).toBe(0);
    expect(state.done).toBe(false);
    expect(state.wrongTaps).toBe(0);
    expect(currentYear(state)).toBe(40);
  });

  it('advances on a correct tap', () => {
    const { state, correct } = answerRecall(startRecall(decadeYears(4)), codeFor(40));
    expect(correct).toBe(true);
    expect(state.index).toBe(1);
    expect(currentYear(state)).toBe(41);
    expect(state.wrongTaps).toBe(0);
  });

  it('stays on the same year after a wrong tap and remembers what was tapped', () => {
    const start = startRecall(decadeYears(7));
    const { state, correct } = answerRecall(start, wrongCodeFor(70));
    expect(correct).toBe(false);
    expect(state.index).toBe(0);
    expect(currentYear(state)).toBe(70);
    expect(state.wrongTaps).toBe(1);
    expect(state.lastWrong).toBe(wrongCodeFor(70));
    expect(state.done).toBe(false);
  });

  it('allows unlimited retries and cannot fail out', () => {
    let state = startRecall(decadeYears(2));
    for (let i = 0; i < 25; i++) {
      state = answerRecall(state, wrongCodeFor(20)).state;
    }
    expect(state.wrongTaps).toBe(25);
    expect(state.index).toBe(0);
    expect(state.done).toBe(false);

    state = answerRecall(state, codeFor(20)).state;
    expect(state.index).toBe(1);
    expect(state.wrongTaps).toBe(25);
  });

  it('clears the last wrong tap once the year is answered', () => {
    let state = startRecall(decadeYears(3));
    state = answerRecall(state, wrongCodeFor(30)).state;
    expect(state.lastWrong).not.toBeNull();
    state = answerRecall(state, codeFor(30)).state;
    expect(state.lastWrong).toBeNull();
  });

  it('finishes after the tenth correct answer, keeping the wrong count', () => {
    let state = startRecall(decadeYears(8));
    state = answerRecall(state, wrongCodeFor(80)).state;
    state = answerAll(state);
    expect(state.done).toBe(true);
    expect(state.index).toBe(10);
    expect(state.wrongTaps).toBe(1);
    expect(currentYear(state)).toBeNull();
  });

  it('ignores taps once the pass is done', () => {
    const finished = answerAll(startRecall(decadeYears(5)));
    const after = answerRecall(finished, 0);
    expect(after.correct).toBe(false);
    expect(after.state).toBe(finished);
  });

  it('never mutates the state it is given', () => {
    const state = startRecall(decadeYears(6));
    const snapshot = JSON.stringify(state);
    answerRecall(state, codeFor(60));
    answerRecall(state, wrongCodeFor(60));
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
