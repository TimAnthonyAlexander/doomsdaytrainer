import { describe, expect, it } from 'vitest';
import { answerRun, cleanRun, currentItem, skipCurrent, startRun } from './runs';

const items = [{ answer: 3 }, { answer: 18 }, { answer: 0 }];

describe('startRun', () => {
  it('opens on the first item with nothing recorded', () => {
    const run = startRun(items);
    expect(run.index).toBe(0);
    expect(run.done).toBe(false);
    expect(run.timings).toEqual([null, null, null]);
    expect(run.firstTry).toEqual([true, true, true]);
    expect(currentItem(run)).toBe(items[0]);
  });

  it('is done immediately when there is nothing to ask', () => {
    const run = startRun([]);
    expect(run.done).toBe(true);
    expect(currentItem(run)).toBeNull();
  });
});

describe('answerRun', () => {
  it('advances on a right answer', () => {
    const { state, correct } = answerRun(startRun(items), 3, 900);
    expect(correct).toBe(true);
    expect(state.index).toBe(1);
    expect(state.done).toBe(false);
  });

  it('holds the same item on a wrong answer', () => {
    const { state, correct } = answerRun(startRun(items), 4, 900);
    expect(correct).toBe(false);
    expect(state.index).toBe(0);
    expect(currentItem(state)).toBe(items[0]);
    expect(state.lastWrong).toBe(4);
    expect(state.wrongTotal).toBe(1);
  });

  it('keeps holding until the right answer arrives', () => {
    let run = startRun(items);
    run = answerRun(run, 4, 500).state;
    run = answerRun(run, 5, 500).state;
    expect(run.index).toBe(0);
    expect(run.wrongTotal).toBe(2);
    run = answerRun(run, 3, 500).state;
    expect(run.index).toBe(1);
    expect(run.lastWrong).toBeNull();
  });

  it('times the first answer at an item and ignores the retry', () => {
    let run = startRun(items);
    run = answerRun(run, 4, 4000).state;
    run = answerRun(run, 3, 100).state;
    expect(run.timings[0]).toBe(4000);
  });

  it('rounds and floors a latency rather than storing it raw', () => {
    const run = answerRun(startRun(items), 3, 12.6).state;
    expect(run.timings[0]).toBe(13);
    expect(answerRun(startRun(items), 3, -5).state.timings[0]).toBe(0);
  });

  it('marks the item as not first-try once it has been missed', () => {
    let run = startRun(items);
    run = answerRun(run, 4, 100).state;
    run = answerRun(run, 3, 100).state;
    expect(run.firstTry).toEqual([false, true, true]);
    expect(cleanRun(run)).toBe(false);
  });

  it('finishes after the last item and then ignores further answers', () => {
    let run = startRun(items);
    run = answerRun(run, 3, 100).state;
    run = answerRun(run, 18, 100).state;
    run = answerRun(run, 0, 100).state;
    expect(run.done).toBe(true);
    expect(cleanRun(run)).toBe(true);

    const after = answerRun(run, 0, 100);
    expect(after.correct).toBe(false);
    expect(after.state).toBe(run);
  });
});

describe('skipCurrent', () => {
  it('moves past an item that was answered wrong', () => {
    const wrong = answerRun(startRun(items), 4, 700).state;
    const next = skipCurrent(wrong);
    expect(next.index).toBe(1);
    expect(next.lastWrong).toBeNull();
    // The miss is still on the record; only the position moved.
    expect(next.firstTry[0]).toBe(false);
    expect(next.timings[0]).toBe(700);
  });

  it('finishes when the skipped item was the last one', () => {
    let run = startRun(items);
    run = answerRun(run, 3, 100).state;
    run = answerRun(run, 18, 100).state;
    run = answerRun(run, 6, 100).state;
    expect(skipCurrent(run).done).toBe(true);
  });

  it('does nothing once the run is over', () => {
    const run = startRun([]);
    expect(skipCurrent(run)).toBe(run);
  });
});
