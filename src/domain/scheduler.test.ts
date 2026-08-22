import { describe, expect, it } from 'vitest';
import type { Attempt, AttemptSource, ItemState, Settings } from './types';
import {
  LEECH_THRESHOLD,
  applyReview,
  createItem,
  dueItems,
  gradeFor,
  introduce,
  isDue,
  isLeech,
  masteryBucket,
} from './scheduler';
import { SCOPES, resolveScope } from './scope';
import { addDays } from './time';

const settings: Settings = {
  indexConvention: 'sunday',
  scopeId: 'full',
  customScope: { from: 0, to: 99 },
  newItemsPerDay: 20,
  fastThresholdMs: 2000,
  mediumThresholdMs: 5000,
  hintType: 'structural',
  autoAdvanceMs: 250,
  keyboardInput: false,
  reminderEnabled: false,
  reminderTime: '19:00',
  eveningReminderEnabled: false,
  onboardingComplete: true,
};

const FULL = SCOPES[0];
const NOW = new Date(2026, 4, 20, 10, 0, 0).getTime();

function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    timestamp: NOW,
    correct: true,
    latencyMs: 900,
    answered: 0,
    hintUsed: false,
    source: 'review',
    ...over,
  };
}

/** An introduced item sitting at the given point in its schedule. */
function reviewing(over: Partial<ItemState> = {}): ItemState {
  return { ...introduce(createItem(over.yy ?? 73), NOW), ...over };
}

describe('createItem', () => {
  it('matches the documented defaults', () => {
    expect(createItem(42)).toEqual({
      yy: 42,
      easeFactor: 2.5,
      interval: 0,
      dueAt: 0,
      repetitions: 0,
      lapses: 0,
      introduced: false,
      introducedAt: null,
      consecutiveFailures: 0,
      leech: false,
      attemptHistory: [],
    });
  });

  it('gives each item its own history array', () => {
    expect(createItem(1).attemptHistory).not.toBe(createItem(2).attemptHistory);
  });
});

describe('gradeFor', () => {
  it('grades an incorrect answer 1 regardless of speed or hint', () => {
    expect(gradeFor(false, 10, false, settings)).toBe(1);
    expect(gradeFor(false, 99_999, true, settings)).toBe(1);
  });

  it('grades a fast correct answer 5', () => {
    expect(gradeFor(true, 0, false, settings)).toBe(5);
    expect(gradeFor(true, 1999, false, settings)).toBe(5);
  });

  it('treats the fast threshold itself as not fast', () => {
    expect(gradeFor(true, 2000, false, settings)).toBe(4);
  });

  it('grades a medium correct answer 4', () => {
    expect(gradeFor(true, 4999, false, settings)).toBe(4);
  });

  it('treats the medium threshold itself as slow', () => {
    expect(gradeFor(true, 5000, false, settings)).toBe(3);
    expect(gradeFor(true, 30_000, false, settings)).toBe(3);
  });

  it('caps a hinted answer at 3 however fast it was', () => {
    expect(gradeFor(true, 0, true, settings)).toBe(3);
    expect(gradeFor(true, 4999, true, settings)).toBe(3);
  });

  it('reads the thresholds from settings, not from constants', () => {
    const strict: Settings = { ...settings, fastThresholdMs: 800, mediumThresholdMs: 1500 };
    expect(gradeFor(true, 700, false, strict)).toBe(5);
    expect(gradeFor(true, 900, false, strict)).toBe(4);
    expect(gradeFor(true, 1500, false, strict)).toBe(3);
  });
});

describe('applyReview source guard', () => {
  it.each(['sprint', 'gauntlet', 'decade'] as AttemptSource[])('throws for %s attempts', (source) => {
    const item = reviewing();
    expect(() => applyReview(item, attempt({ source }), settings, NOW)).toThrow(/drill/i);
  });

  it.each(['review', 'learn', 'trouble'] as AttemptSource[])('accepts %s attempts', (source) => {
    const item = reviewing();
    expect(() => applyReview(item, attempt({ source }), settings, NOW)).not.toThrow();
  });

  it('leaves the item untouched when it throws', () => {
    const item = reviewing();
    const snapshot = structuredClone(item);
    expect(() => applyReview(item, attempt({ source: 'gauntlet' }), settings, NOW)).toThrow();
    expect(item).toEqual(snapshot);
  });
});

describe('applyReview immutability', () => {
  it('returns a new object and never mutates the input', () => {
    const item = reviewing({ attemptHistory: [attempt({ latencyMs: 111 })] });
    Object.freeze(item);
    Object.freeze(item.attemptHistory);
    const snapshot = structuredClone(item);

    const result = applyReview(item, attempt(), settings, NOW);

    expect(item).toEqual(snapshot);
    expect(result.next).not.toBe(item);
    expect(result.next.attemptHistory).not.toBe(item.attemptHistory);
    expect(item.attemptHistory).toHaveLength(1);
  });

  it('appends the attempt to the history in order', () => {
    const first = attempt({ latencyMs: 500 });
    const second = attempt({ latencyMs: 900, correct: false });
    const afterFirst = applyReview(reviewing(), first, settings, NOW).next;
    const afterSecond = applyReview(afterFirst, second, settings, NOW).next;
    expect(afterSecond.attemptHistory).toEqual([first, second]);
  });

  it('reports the grade and correctness of the attempt', () => {
    const result = applyReview(reviewing(), attempt({ latencyMs: 100 }), settings, NOW);
    expect(result.grade).toBe(5);
    expect(result.correct).toBe(true);

    const wrong = applyReview(reviewing(), attempt({ correct: false }), settings, NOW);
    expect(wrong.grade).toBe(1);
    expect(wrong.correct).toBe(false);
  });
});

describe('applyReview interval progression', () => {
  it('goes 1 day, then 6 days, then interval times ease', () => {
    let item = reviewing();
    const fast = attempt({ latencyMs: 300 });

    item = applyReview(item, fast, settings, NOW).next;
    expect(item.repetitions).toBe(1);
    expect(item.interval).toBe(1);
    expect(item.dueAt).toBe(addDays(NOW, 1));

    item = applyReview(item, fast, settings, NOW).next;
    expect(item.repetitions).toBe(2);
    expect(item.interval).toBe(6);
    expect(item.dueAt).toBe(addDays(NOW, 6));

    const easeAtThird = item.easeFactor;
    const prevInterval = item.interval;
    item = applyReview(item, fast, settings, NOW).next;
    expect(item.repetitions).toBe(3);
    expect(item.interval).toBe(Math.round(prevInterval * (easeAtThird + 0.1)));
    expect(item.dueAt).toBe(addDays(NOW, item.interval));
  });

  it('rounds the interval to whole days', () => {
    let item = reviewing();
    const medium = attempt({ latencyMs: 3000 });
    for (let i = 0; i < 4; i++) item = applyReview(item, medium, settings, NOW).next;
    expect(item.easeFactor).toBe(2.5);
    expect(item.interval).toBe(38); // round(15 * 2.5)
    expect(Number.isInteger(item.interval)).toBe(true);
  });

  it('clears consecutive failures on any pass', () => {
    const item = reviewing({ consecutiveFailures: 3 });
    const next = applyReview(item, attempt({ latencyMs: 6000 }), settings, NOW).next;
    expect(next.consecutiveFailures).toBe(0);
    expect(next.lapses).toBe(0);
  });

  it('leaves lapses and the leech flag alone on a pass', () => {
    const item = reviewing({ lapses: 4, leech: false });
    const next = applyReview(item, attempt(), settings, NOW).next;
    expect(next.lapses).toBe(4);
    expect(next.leech).toBe(false);
  });
});

describe('applyReview ease factor', () => {
  it('applies the SM-2 formula for every grade', () => {
    const ef = (grade: 1 | 3 | 4 | 5) => 2.5 + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));

    const g5 = applyReview(reviewing(), attempt({ latencyMs: 100 }), settings, NOW).next;
    expect(g5.easeFactor).toBeCloseTo(ef(5), 10);

    const g4 = applyReview(reviewing(), attempt({ latencyMs: 3000 }), settings, NOW).next;
    expect(g4.easeFactor).toBeCloseTo(ef(4), 10);
    expect(g4.easeFactor).toBeCloseTo(2.5, 10);

    const g3 = applyReview(reviewing(), attempt({ latencyMs: 7000 }), settings, NOW).next;
    expect(g3.easeFactor).toBeCloseTo(ef(3), 10);
    expect(g3.easeFactor).toBeLessThan(2.5);

    const g1 = applyReview(reviewing(), attempt({ correct: false }), settings, NOW).next;
    expect(g1.easeFactor).toBeCloseTo(ef(1), 10);
  });

  it('floors the ease factor at 1.3 under repeated failure', () => {
    let item = reviewing();
    const wrong = attempt({ correct: false });
    const seen: number[] = [];
    for (let i = 0; i < 10; i++) {
      item = applyReview(item, wrong, settings, NOW).next;
      seen.push(item.easeFactor);
    }
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(1.3);
    expect(item.easeFactor).toBe(1.3);
  });

  it('recovers above the floor once answers come back fast', () => {
    let item = reviewing({ easeFactor: 1.3 });
    item = applyReview(item, attempt({ latencyMs: 100 }), settings, NOW).next;
    expect(item.easeFactor).toBeCloseTo(1.4, 10);
  });
});

describe('applyReview failure handling', () => {
  it('resets the schedule and makes the item due again in this session', () => {
    const item = reviewing({ repetitions: 4, interval: 38, dueAt: NOW - 1000 });
    const next = applyReview(item, attempt({ correct: false }), settings, NOW).next;
    expect(next.repetitions).toBe(0);
    expect(next.interval).toBe(0);
    expect(next.dueAt).toBe(NOW);
    expect(isDue(next, NOW)).toBe(true);
  });

  it('counts lapses and consecutive failures', () => {
    let item = reviewing();
    const wrong = attempt({ correct: false });
    item = applyReview(item, wrong, settings, NOW).next;
    expect(item.lapses).toBe(1);
    expect(item.consecutiveFailures).toBe(1);
    item = applyReview(item, wrong, settings, NOW).next;
    expect(item.lapses).toBe(2);
    expect(item.consecutiveFailures).toBe(2);
  });

  it('flags a leech exactly when lapses reach the threshold', () => {
    let item = reviewing();
    const wrong = attempt({ correct: false });
    for (let i = 1; i < LEECH_THRESHOLD; i++) {
      item = applyReview(item, wrong, settings, NOW).next;
      expect(item.lapses).toBe(i);
      expect(item.leech).toBe(false);
      expect(isLeech(item)).toBe(false);
    }
    item = applyReview(item, wrong, settings, NOW).next;
    expect(item.lapses).toBe(LEECH_THRESHOLD);
    expect(item.leech).toBe(true);
    expect(isLeech(item)).toBe(true);
  });

  it('keeps the leech flag once set, even after a perfect answer', () => {
    const item = reviewing({ lapses: LEECH_THRESHOLD, leech: true });
    const next = applyReview(item, attempt({ latencyMs: 100 }), settings, NOW).next;
    expect(next.leech).toBe(true);
    expect(isLeech(next)).toBe(true);
  });
});

describe('introduce', () => {
  it('moves an item into the review queue due now', () => {
    const item = createItem(31);
    const next = introduce(item, NOW);
    expect(next.introduced).toBe(true);
    expect(next.introducedAt).toBe(NOW);
    expect(next.interval).toBe(0);
    expect(next.dueAt).toBe(NOW);
    expect(isDue(next, NOW)).toBe(true);
  });

  it('does not mutate the input', () => {
    const item = createItem(31);
    Object.freeze(item);
    introduce(item, NOW);
    expect(item.introduced).toBe(false);
    expect(item.dueAt).toBe(0);
  });

  it('keeps the original introduction time on a re-run', () => {
    const first = introduce(createItem(31), NOW);
    const second = introduce(first, NOW + 86_400_000);
    expect(second.introducedAt).toBe(NOW);
  });
});

describe('isDue', () => {
  it('is false for an item that was never introduced', () => {
    expect(isDue(createItem(5), NOW)).toBe(false);
  });

  it('is true at the due moment and false one millisecond earlier', () => {
    const item = reviewing({ dueAt: NOW });
    expect(isDue(item, NOW)).toBe(true);
    expect(isDue(item, NOW - 1)).toBe(false);
    expect(isDue(item, NOW + 1)).toBe(true);
  });
});

describe('dueItems', () => {
  const build = (yy: number, over: Partial<ItemState> = {}) =>
    ({ ...introduce(createItem(yy), NOW), ...over }) as ItemState;

  it('returns only introduced, in-scope, due items', () => {
    const items = [
      build(10, { dueAt: NOW - 5000 }),
      build(20, { dueAt: NOW + 5000 }), // not yet due
      { ...createItem(30), dueAt: NOW - 5000 }, // never introduced
      build(80, { dueAt: NOW - 5000 }),
    ];
    const scope = resolveScope({ ...settings, scopeId: 'current' }); // 0..49
    expect(dueItems(items, scope, NOW).map((i) => i.yy)).toEqual([10]);
  });

  it('sorts by dueAt then by year', () => {
    const items = [
      build(9, { dueAt: NOW - 1000 }),
      build(4, { dueAt: NOW - 2000 }),
      build(2, { dueAt: NOW - 1000 }),
      build(7, { dueAt: NOW - 2000 }),
    ];
    expect(dueItems(items, FULL, NOW).map((i) => i.yy)).toEqual([4, 7, 2, 9]);
  });

  it('is deterministic regardless of input order', () => {
    const items = [
      build(50, { dueAt: NOW }),
      build(3, { dueAt: NOW }),
      build(77, { dueAt: NOW - 10 }),
    ];
    const forwards = dueItems(items, FULL, NOW).map((i) => i.yy);
    const backwards = dueItems([...items].reverse(), FULL, NOW).map((i) => i.yy);
    expect(forwards).toEqual([77, 3, 50]);
    expect(backwards).toEqual(forwards);
  });

  it('does not mutate or reorder the input array', () => {
    const items = [build(9, { dueAt: NOW }), build(1, { dueAt: NOW })];
    const order = items.map((i) => i.yy);
    dueItems(items, FULL, NOW);
    expect(items.map((i) => i.yy)).toEqual(order);
  });

  it('returns an empty list when nothing is due', () => {
    expect(dueItems([build(1, { dueAt: NOW + 1 })], FULL, NOW)).toEqual([]);
    expect(dueItems([], FULL, NOW)).toEqual([]);
  });
});

describe('masteryBucket', () => {
  it('is 0 for anything not introduced, whatever its interval says', () => {
    expect(masteryBucket(createItem(1))).toBe(0);
    expect(masteryBucket({ ...createItem(1), interval: 200 })).toBe(0);
  });

  it.each([
    [0, 1],
    [1, 2],
    [3, 2],
    [4, 3],
    [9, 3],
    [10, 4],
    [29, 4],
    [30, 5],
    [89, 5],
    [90, 6],
    [400, 6],
  ])('interval %i is bucket %i', (interval, bucket) => {
    expect(masteryBucket(reviewing({ interval }))).toBe(bucket);
  });

  it('never leaves the 0..6 ramp', () => {
    for (let interval = 0; interval < 500; interval++) {
      const bucket = masteryBucket(reviewing({ interval }));
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThanOrEqual(6);
    }
  });
});

describe('isLeech', () => {
  it('is true from the flag or from the lapse count alone', () => {
    expect(isLeech(createItem(1))).toBe(false);
    expect(isLeech({ ...createItem(1), lapses: LEECH_THRESHOLD - 1 })).toBe(false);
    expect(isLeech({ ...createItem(1), lapses: LEECH_THRESHOLD })).toBe(true);
    expect(isLeech({ ...createItem(1), leech: true })).toBe(true);
  });
});
