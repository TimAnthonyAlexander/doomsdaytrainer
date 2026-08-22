import { describe, expect, it } from 'vitest';
import type { Attempt, AttemptSource, ItemState, Scope, SessionDay } from '@/domain/types';
import { createItem, introduce } from '@/domain/scheduler';
import { SCOPES } from '@/domain/scope';
import { addDays, dayKey, startOfDay } from '@/domain/time';
import {
  accuracyOverLast,
  contiguousRuns,
  dailyLatencySeries,
  dueCounts,
  dueLabel,
  itemReviewAttempts,
  medianItemLatency,
  medianLatencyByDecade,
  medianReviewLatency,
  niceLatencyCeiling,
  recentAttempts,
  reviewAttempts,
  reviewStreak,
} from './statsSelectors';

const NOW = new Date(2026, 4, 20, 10, 0, 0).getTime();
const FULL: Scope = SCOPES[0];
const MODERN: Scope = SCOPES[2];

function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    timestamp: NOW,
    correct: true,
    latencyMs: 1000,
    answered: 0,
    hintUsed: false,
    source: 'review',
    ...over,
  };
}

function item(yy: number, over: Partial<ItemState> = {}): ItemState {
  return { ...introduce(createItem(yy), NOW), ...over };
}

function withAttempts(yy: number, attempts: Attempt[], over: Partial<ItemState> = {}): ItemState {
  return item(yy, { attemptHistory: attempts, ...over });
}

function day(date: string, reviewsCompleted: number): SessionDay {
  return { date, reviewsCompleted, newItemsIntroduced: 0 };
}

function daysFrom(entries: [number, number][]): Record<string, SessionDay> {
  const out: Record<string, SessionDay> = {};
  for (const [back, reviews] of entries) {
    const date = dayKey(addDays(NOW, -back));
    out[date] = day(date, reviews);
  }
  return out;
}

/* ------------------------------------------------------------------ */

describe('reviewAttempts', () => {
  it('merges every item and sorts by timestamp', () => {
    const items = [
      withAttempts(10, [attempt({ timestamp: 300 }), attempt({ timestamp: 100 })]),
      withAttempts(20, [attempt({ timestamp: 200 })]),
    ];
    expect(reviewAttempts(items).map((a) => a.timestamp)).toEqual([100, 200, 300]);
  });

  it('keeps review attempts only', () => {
    const sources: AttemptSource[] = ['review', 'learn', 'sprint', 'gauntlet', 'decade', 'trouble'];
    const items = [withAttempts(10, sources.map((source, i) => attempt({ source, timestamp: i })))];
    expect(reviewAttempts(items)).toHaveLength(1);
    expect(reviewAttempts(items)[0].source).toBe('review');
  });

  it('is empty for a fresh install', () => {
    expect(reviewAttempts([createItem(0), createItem(1)])).toEqual([]);
  });
});

describe('itemReviewAttempts', () => {
  it('filters and sorts one item', () => {
    const one = withAttempts(10, [
      attempt({ timestamp: 500, source: 'sprint' }),
      attempt({ timestamp: 400 }),
      attempt({ timestamp: 200 }),
    ]);
    expect(itemReviewAttempts(one).map((a) => a.timestamp)).toEqual([200, 400]);
  });
});

/* ------------------------------------------------------------------ */

describe('accuracyOverLast', () => {
  it('reports null rather than zero when nothing has been reviewed', () => {
    expect(accuracyOverLast([createItem(0)])).toEqual({ correct: 0, total: 0, ratio: null });
  });

  it('reports over what exists when there are fewer than 100 attempts', () => {
    const attempts = Array.from({ length: 12 }, (_unused, i) =>
      attempt({ timestamp: NOW + i, correct: i % 4 !== 0 }),
    );
    const result = accuracyOverLast([withAttempts(10, attempts)]);
    expect(result.total).toBe(12);
    expect(result.correct).toBe(9);
    expect(result.ratio).toBeCloseTo(9 / 12, 10);
  });

  it('windows to the newest 100 across items, ignoring older ones', () => {
    // 60 old attempts, all wrong. 100 newer ones, all correct.
    const old = Array.from({ length: 60 }, (_unused, i) =>
      attempt({ timestamp: NOW - 10_000 + i, correct: false }),
    );
    const fresh = Array.from({ length: 100 }, (_unused, i) =>
      attempt({ timestamp: NOW + i, correct: true }),
    );
    const result = accuracyOverLast([withAttempts(10, old), withAttempts(20, fresh)]);
    expect(result).toEqual({ correct: 100, total: 100, ratio: 1 });
  });

  it('excludes drill attempts, which would otherwise dominate the window', () => {
    const drills = Array.from({ length: 50 }, (_unused, i) =>
      attempt({ timestamp: NOW + i, correct: false, source: 'gauntlet' }),
    );
    const reviews = [
      attempt({ timestamp: NOW + 100, correct: true }),
      attempt({ timestamp: NOW + 101, correct: false }),
    ];
    const result = accuracyOverLast([withAttempts(10, [...drills, ...reviews])]);
    expect(result).toEqual({ correct: 1, total: 2, ratio: 0.5 });
  });

  it('honours a custom window size', () => {
    const attempts = [
      attempt({ timestamp: 1, correct: false }),
      attempt({ timestamp: 2, correct: true }),
      attempt({ timestamp: 3, correct: true }),
    ];
    expect(accuracyOverLast([withAttempts(10, attempts)], 2)).toEqual({
      correct: 2,
      total: 2,
      ratio: 1,
    });
  });
});

/* ------------------------------------------------------------------ */

describe('medianReviewLatency', () => {
  it('is null with no review attempts', () => {
    expect(medianReviewLatency([createItem(0)])).toBeNull();
    expect(medianReviewLatency([withAttempts(10, [attempt({ source: 'sprint' })])])).toBeNull();
  });

  it('takes the median across every item', () => {
    const items = [
      withAttempts(10, [attempt({ latencyMs: 400 }), attempt({ latencyMs: 800 })]),
      withAttempts(20, [attempt({ latencyMs: 1200 })]),
    ];
    expect(medianReviewLatency(items)).toBe(800);
  });
});

describe('medianItemLatency', () => {
  it('is null before the item has been reviewed', () => {
    expect(medianItemLatency(createItem(7))).toBeNull();
  });

  it('averages the middle pair for an even count', () => {
    const one = withAttempts(7, [attempt({ latencyMs: 1000 }), attempt({ latencyMs: 2000 })]);
    expect(medianItemLatency(one)).toBe(1500);
  });
});

describe('medianLatencyByDecade', () => {
  it('always returns ten decades in order', () => {
    const rows = medianLatencyByDecade([]);
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.decade)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(rows.map((r) => r.label)).toEqual([
      '00–09',
      '10–19',
      '20–29',
      '30–39',
      '40–49',
      '50–59',
      '60–69',
      '70–79',
      '80–89',
      '90–99',
    ]);
  });

  it('leaves an untouched decade null rather than zero', () => {
    const rows = medianLatencyByDecade([withAttempts(73, [attempt({ latencyMs: 900 })])]);
    expect(rows[7]).toMatchObject({ medianMs: 900, attempts: 1 });
    for (const decade of [0, 1, 2, 3, 4, 5, 6, 8, 9]) {
      expect(rows[decade].medianMs).toBeNull();
      expect(rows[decade].attempts).toBe(0);
    }
  });

  it('pools every item in the decade', () => {
    const rows = medianLatencyByDecade([
      withAttempts(40, [attempt({ latencyMs: 1000 })]),
      withAttempts(47, [attempt({ latencyMs: 3000 }), attempt({ latencyMs: 5000 })]),
    ]);
    expect(rows[4]).toMatchObject({ medianMs: 3000, attempts: 3 });
  });

  it('excludes drill attempts', () => {
    const rows = medianLatencyByDecade([
      withAttempts(55, [
        attempt({ latencyMs: 9000, source: 'sprint' }),
        attempt({ latencyMs: 1000 }),
      ]),
    ]);
    expect(rows[5]).toMatchObject({ medianMs: 1000, attempts: 1 });
  });
});

/* ------------------------------------------------------------------ */

describe('dueCounts', () => {
  const endOfToday = startOfDay(addDays(NOW, 1));
  const endOfWeek = startOfDay(addDays(NOW, 7));

  it('is all zeroes on a fresh install', () => {
    expect(dueCounts([createItem(0), createItem(1)], FULL, NOW)).toEqual({ today: 0, week: 0 });
  });

  it('counts an overdue item and one due later today', () => {
    const items = [
      item(10, { dueAt: NOW - 86_400_000 }),
      item(11, { dueAt: endOfToday - 1 }),
    ];
    expect(dueCounts(items, FULL, NOW)).toEqual({ today: 2, week: 2 });
  });

  it('excludes an item that becomes due at the first instant of tomorrow', () => {
    const items = [item(10, { dueAt: endOfToday })];
    expect(dueCounts(items, FULL, NOW)).toEqual({ today: 0, week: 1 });
  });

  it('includes the last instant before the week boundary and excludes the boundary itself', () => {
    const items = [item(10, { dueAt: endOfWeek - 1 }), item(11, { dueAt: endOfWeek })];
    expect(dueCounts(items, FULL, NOW)).toEqual({ today: 0, week: 1 });
  });

  it('ignores items that were never introduced', () => {
    const items = [{ ...createItem(10), dueAt: NOW - 1000 }];
    expect(dueCounts(items, FULL, NOW)).toEqual({ today: 0, week: 0 });
  });

  it('ignores items outside the scope', () => {
    const items = [item(10, { dueAt: NOW }), item(60, { dueAt: NOW })];
    expect(dueCounts(items, MODERN, NOW)).toEqual({ today: 1, week: 1 });
  });
});

/* ------------------------------------------------------------------ */

describe('reviewStreak', () => {
  it('is zero with no history', () => {
    expect(reviewStreak({}, NOW)).toBe(0);
  });

  it('counts a run ending today', () => {
    expect(reviewStreak(daysFrom([[0, 4], [1, 9], [2, 3]]), NOW)).toBe(3);
  });

  it('still counts the run when today has not been reviewed yet', () => {
    expect(reviewStreak(daysFrom([[1, 9], [2, 3], [3, 1]]), NOW)).toBe(3);
  });

  it('stops at a break in the middle', () => {
    const days = daysFrom([[0, 2], [1, 5], [3, 7], [4, 7]]);
    expect(reviewStreak(days, NOW)).toBe(2);
  });

  it('is zero once both today and yesterday are missing', () => {
    expect(reviewStreak(daysFrom([[2, 5], [3, 5]]), NOW)).toBe(0);
  });

  it('does not count a day that was opened but produced no reviews', () => {
    const days = daysFrom([[0, 0], [1, 6], [2, 6]]);
    expect(reviewStreak(days, NOW)).toBe(2);
  });

  it('is zero when today is empty and yesterday recorded nothing', () => {
    expect(reviewStreak(daysFrom([[0, 0], [1, 0], [2, 9]]), NOW)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */

describe('dailyLatencySeries', () => {
  it('returns one point per day, oldest first, ending today', () => {
    const points = dailyLatencySeries([], NOW);
    expect(points).toHaveLength(30);
    expect(points[29].date).toBe(dayKey(NOW));
    expect(points[0].date).toBe(dayKey(addDays(NOW, -29)));
    expect(points[0].ts).toBe(startOfDay(addDays(NOW, -29)));
  });

  it('leaves days without reviews as gaps, not zeroes', () => {
    const points = dailyLatencySeries([withAttempts(10, [attempt({ timestamp: NOW })])], NOW);
    const withData = points.filter((p) => p.medianMs !== null);
    expect(withData).toHaveLength(1);
    expect(withData[0].medianMs).toBe(1000);
    for (const point of points.slice(0, 29)) {
      expect(point.medianMs).toBeNull();
      expect(point.attempts).toBe(0);
    }
  });

  it('takes a median within each day', () => {
    const twoDaysAgo = addDays(NOW, -2);
    const points = dailyLatencySeries(
      [
        withAttempts(10, [
          attempt({ timestamp: twoDaysAgo, latencyMs: 500 }),
          attempt({ timestamp: twoDaysAgo + 1000, latencyMs: 1500 }),
          attempt({ timestamp: twoDaysAgo + 2000, latencyMs: 4000 }),
        ]),
      ],
      NOW,
    );
    expect(points[27]).toMatchObject({ medianMs: 1500, attempts: 3 });
  });

  it('drops attempts older than the window', () => {
    const points = dailyLatencySeries(
      [withAttempts(10, [attempt({ timestamp: addDays(NOW, -40), latencyMs: 8000 })])],
      NOW,
    );
    expect(points.every((p) => p.medianMs === null)).toBe(true);
  });

  it('excludes drill attempts from the daily median', () => {
    const points = dailyLatencySeries(
      [
        withAttempts(10, [
          attempt({ timestamp: NOW, latencyMs: 9000, source: 'gauntlet' }),
          attempt({ timestamp: NOW, latencyMs: 700 }),
        ]),
      ],
      NOW,
    );
    expect(points[29]).toMatchObject({ medianMs: 700, attempts: 1 });
  });

  it('honours a shorter window', () => {
    expect(dailyLatencySeries([], NOW, 7)).toHaveLength(7);
  });
});

describe('contiguousRuns', () => {
  it('is empty when nothing has data', () => {
    expect(contiguousRuns([null, null, null])).toEqual([]);
  });

  it('breaks a run at every gap instead of bridging it', () => {
    expect(contiguousRuns([1, 2, null, 3, 4, 5, null, 6])).toEqual([[0, 1], [3, 4, 5], [7]]);
  });

  it('keeps a single unbroken run whole', () => {
    expect(contiguousRuns([1, 2, 3])).toEqual([[0, 1, 2]]);
  });

  it('treats zero as data, not as a gap', () => {
    expect(contiguousRuns([0, null, 0])).toEqual([[0], [2]]);
  });

  it('lines up with the gaps a real series produces', () => {
    const points = dailyLatencySeries(
      [
        withAttempts(10, [
          attempt({ timestamp: NOW, latencyMs: 800 }),
          attempt({ timestamp: addDays(NOW, -2), latencyMs: 1200 }),
        ]),
      ],
      NOW,
    );
    expect(contiguousRuns(points.map((p) => p.medianMs))).toEqual([[27], [29]]);
  });
});

describe('niceLatencyCeiling', () => {
  it('falls back to one second for an empty chart', () => {
    expect(niceLatencyCeiling(0)).toBe(1000);
    expect(niceLatencyCeiling(Number.NaN)).toBe(1000);
  });

  it('rounds up to half seconds in the fast range', () => {
    expect(niceLatencyCeiling(1200)).toBe(1500);
    expect(niceLatencyCeiling(1500)).toBe(1500);
  });

  it('rounds up to whole seconds in the middle range', () => {
    expect(niceLatencyCeiling(7300)).toBe(8000);
  });

  it('rounds up to five seconds once the numbers are large', () => {
    expect(niceLatencyCeiling(41_000)).toBe(45_000);
  });
});

/* ------------------------------------------------------------------ */

describe('recentAttempts', () => {
  it('returns the newest first, capped', () => {
    const attempts = Array.from({ length: 40 }, (_unused, i) => attempt({ timestamp: i }));
    const recent = recentAttempts(withAttempts(10, attempts));
    expect(recent).toHaveLength(20);
    expect(recent[0].timestamp).toBe(39);
    expect(recent[19].timestamp).toBe(20);
  });

  it('keeps drill attempts, because the item detail shows every attempt', () => {
    const one = withAttempts(10, [attempt({ timestamp: 1, source: 'sprint' })]);
    expect(recentAttempts(one)).toHaveLength(1);
  });

  it('does not mutate the stored history', () => {
    const attempts = [attempt({ timestamp: 2 }), attempt({ timestamp: 1 })];
    const one = withAttempts(10, attempts);
    recentAttempts(one);
    expect(one.attemptHistory.map((a) => a.timestamp)).toEqual([2, 1]);
  });
});

describe('dueLabel', () => {
  it('says so when the item has never been introduced', () => {
    expect(dueLabel(createItem(3), NOW)).toBe('Not started');
  });

  it('reads due now for anything at or before today', () => {
    expect(dueLabel(item(10, { dueAt: NOW }), NOW)).toBe('Due now');
    expect(dueLabel(item(10, { dueAt: addDays(NOW, -3) }), NOW)).toBe('Due now');
  });

  it('names tomorrow and counts days beyond it', () => {
    expect(dueLabel(item(10, { dueAt: addDays(NOW, 1) }), NOW)).toBe('Tomorrow');
    expect(dueLabel(item(10, { dueAt: addDays(NOW, 9) }), NOW)).toBe('In 9 days');
  });
});
