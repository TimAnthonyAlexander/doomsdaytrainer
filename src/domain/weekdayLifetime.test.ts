import { describe, expect, it } from 'vitest';
import type { WeekdayAttempt, WeekdayMode } from './types';
import { median } from './time';
import {
  WEEKDAY_BUCKET_COUNT,
  WEEKDAY_LATENCY_EDGES,
  accuracyOf,
  addWeekdayAttempt,
  bucketLowerEdge,
  bucketUpperEdge,
  buildWeekdayTotals,
  combineModeTotals,
  emptyModeTotals,
  emptyWeekdayTotals,
  estimateMedianMs,
  latencyBucket,
  overallModeTotals,
  repairWeekdayTotals,
  wrongCount,
} from './weekdayLifetime';

function attempt(mode: WeekdayMode, correct: boolean, latencyMs: number): WeekdayAttempt {
  return { timestamp: 1, fullYear: 1987, month: 3, day: 14, mode, correct, latencyMs, answered: 6 };
}

/** The bucket width around a latency. The estimate may never miss by more. */
function widthAround(latencyMs: number): number {
  const index = latencyBucket(latencyMs);
  const upper = bucketUpperEdge(index);
  return Number.isFinite(upper) ? upper - bucketLowerEdge(index) : Infinity;
}

/** An aggregate holding exactly these latencies, all assisted, all correct. */
function totalsOf(latencies: readonly number[]) {
  let totals = emptyModeTotals();
  for (const ms of latencies) {
    totals = combineModeTotals(totals, addWeekdayAttempt(emptyWeekdayTotals(), attempt('assisted', true, ms)).assisted);
  }
  return totals;
}

/**
 * The estimate has to sit in the bucket the true median falls in. For an even
 * count the median is the average of the two middle values, which can land in
 * the gap between two buckets, so the window spans both of their buckets.
 */
function expectNearMedian(latencies: readonly number[]): void {
  const sorted = [...latencies].sort((a, b) => a - b);
  const hi = sorted[sorted.length >> 1];
  const lo = sorted.length % 2 === 1 ? hi : sorted[(sorted.length >> 1) - 1];
  const estimate = estimateMedianMs(totalsOf(latencies));
  expect(estimate).not.toBeNull();
  expect(estimate as number).toBeGreaterThanOrEqual(bucketLowerEdge(latencyBucket(lo)));
  expect(estimate as number).toBeLessThanOrEqual(bucketUpperEdge(latencyBucket(hi)));
}

describe('bucket edges', () => {
  it('ascends, and ends open', () => {
    for (let i = 1; i < WEEKDAY_LATENCY_EDGES.length; i += 1) {
      expect(WEEKDAY_LATENCY_EDGES[i]).toBeGreaterThan(WEEKDAY_LATENCY_EDGES[i - 1]);
    }
    expect(WEEKDAY_LATENCY_EDGES[WEEKDAY_LATENCY_EDGES.length - 1]).toBe(Infinity);
  });

  it('is dense where sub-second recall lives', () => {
    // Everything under two seconds resolves to a quarter of a second.
    for (const ms of [100, 400, 900, 1400, 1900]) {
      expect(widthAround(ms)).toBeLessThanOrEqual(250);
    }
  });

  it('files a latency in the bucket that contains it', () => {
    expect(latencyBucket(0)).toBe(0);
    expect(latencyBucket(249)).toBe(0);
    expect(latencyBucket(250)).toBe(1);
    expect(latencyBucket(1999)).toBe(7);
    expect(latencyBucket(2000)).toBe(8);
    expect(latencyBucket(1_000_000)).toBe(WEEKDAY_BUCKET_COUNT - 1);
  });

  it('pins nonsense into range instead of losing the attempt', () => {
    expect(latencyBucket(Number.NaN)).toBe(0);
    expect(latencyBucket(-5)).toBe(0);
    expect(latencyBucket(Infinity)).toBe(WEEKDAY_BUCKET_COUNT - 1);
  });
});

describe('adding an attempt', () => {
  it('counts every answer, and never mutates what it was given', () => {
    const before = emptyWeekdayTotals();
    const after = addWeekdayAttempt(before, attempt('assisted', true, 800));

    expect(before.assisted.answered).toBe(0);
    expect(after.assisted).toMatchObject({ answered: 1, correct: 1 });
    expect(after.assisted.latencyBuckets[latencyBucket(800)]).toBe(1);
  });

  it('counts a wrong answer as answered but not correct', () => {
    const after = addWeekdayAttempt(emptyWeekdayTotals(), attempt('assisted', false, 3000));
    expect(after.assisted).toMatchObject({ answered: 1, correct: 0 });
    expect(wrongCount(after.assisted)).toBe(1);
  });

  it('keeps the two modes apart', () => {
    let totals = emptyWeekdayTotals();
    totals = addWeekdayAttempt(totals, attempt('assisted', true, 700));
    totals = addWeekdayAttempt(totals, attempt('assisted', true, 900));
    totals = addWeekdayAttempt(totals, attempt('unassisted', false, 9000));

    expect(totals.assisted).toMatchObject({ answered: 2, correct: 2 });
    expect(totals.unassisted).toMatchObject({ answered: 1, correct: 0 });
    // An assisted answer is nowhere near the unassisted median, which is the
    // whole reason the two are kept apart.
    expect(estimateMedianMs(totals.assisted)).toBeLessThan(1500);
    expect(estimateMedianMs(totals.unassisted)).toBeGreaterThan(6000);
  });

  it('is the same whether folded one at a time or built from the log', () => {
    const attempts = [
      attempt('assisted', true, 640),
      attempt('unassisted', false, 12_000),
      attempt('assisted', false, 2400),
      attempt('unassisted', true, 3300),
    ];
    let folded = emptyWeekdayTotals();
    for (const one of attempts) folded = addWeekdayAttempt(folded, one);
    expect(folded).toEqual(buildWeekdayTotals(attempts));
  });

  it('skips entries in a log that are not attempts at all', () => {
    const totals = buildWeekdayTotals([null, attempt('assisted', true, 500), 7] as unknown as WeekdayAttempt[]);
    expect(totals.assisted.answered).toBe(1);
  });
});

describe('the lifetime numbers surviving a trimmed log', () => {
  it('does not move when the raw attempts are capped', () => {
    const all: WeekdayAttempt[] = [];
    let raw: WeekdayAttempt[] = [];
    let totals = emptyWeekdayTotals();
    const cap = 10;

    for (let i = 0; i < 200; i += 1) {
      const one = attempt(i % 3 === 0 ? 'unassisted' : 'assisted', i % 4 !== 0, 300 + i * 37);
      all.push(one);
      // Exactly what the provider does on every answer: cap the log, fold the
      // aggregate.
      raw = [...raw, one].slice(-cap);
      totals = addWeekdayAttempt(totals, one);
    }

    expect(raw).toHaveLength(cap);
    expect(overallModeTotals(totals).answered).toBe(200);
    // The aggregate still describes all 200, not the 10 that are left.
    expect(totals).toEqual(buildWeekdayTotals(all));
    expect(estimateMedianMs(totals.assisted)).not.toBe(estimateMedianMs(buildWeekdayTotals(raw).assisted));
  });
});

describe('estimateMedianMs', () => {
  it('reports nothing rather than zero for an empty aggregate', () => {
    expect(estimateMedianMs(emptyModeTotals())).toBeNull();
  });

  const distributions: Array<[string, number[]]> = [
    ['one answer', [820]],
    ['fast and tight', [610, 640, 680, 700, 730, 760, 790]],
    ['fast with a long tail', [520, 560, 590, 640, 700, 900, 4200, 9800, 26_000]],
    ['bimodal, assisted against unassisted', [430, 460, 500, 3800, 4100, 4400]],
    ['everything slow', [7100, 8300, 9400, 11_000, 13_500]],
    ['spread over the whole range', [90, 300, 800, 1600, 2400, 3600, 5500, 9000, 18_000]],
    ['all identical', [1500, 1500, 1500, 1500]],
    ['even count straddling a bucket edge', [960, 1040]],
  ];

  it.each(distributions)('lands within its bucket of the true median: %s', (_label, latencies) => {
    expectNearMedian(latencies);
  });

  it('is accurate to a quarter of a second where the answers are fast', () => {
    // The case the app actually cares about: everything under two seconds.
    const latencies = [610, 640, 680, 700, 730, 760, 790, 1100, 1450, 1900, 240];
    const estimate = estimateMedianMs(totalsOf(latencies)) as number;
    expect(Math.abs(estimate - median(latencies))).toBeLessThanOrEqual(250);
  });

  it('holds over a hundred random draws', () => {
    // Deterministic pseudo-random: a fixed sequence, so a failure is repeatable.
    let seed = 20260822;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let run = 0; run < 100; run += 1) {
      const latencies = Array.from({ length: 1 + Math.floor(next() * 40) }, () =>
        Math.round(200 + next() * next() * 12_000),
      );
      expectNearMedian(latencies);
    }
  });

  it('reports the lower edge for the open-ended top bucket rather than inventing one', () => {
    expect(estimateMedianMs(totalsOf([40_000, 60_000, 90_000]))).toBe(bucketLowerEdge(WEEKDAY_BUCKET_COUNT - 1));
  });
});

describe('accuracy and totals', () => {
  it('is null for an empty aggregate, never zero', () => {
    expect(accuracyOf(emptyModeTotals())).toBeNull();
  });

  it('adds the two modes for the combined row', () => {
    let totals = emptyWeekdayTotals();
    totals = addWeekdayAttempt(totals, attempt('assisted', true, 700));
    totals = addWeekdayAttempt(totals, attempt('unassisted', false, 5200));
    const both = overallModeTotals(totals);
    expect(both).toMatchObject({ answered: 2, correct: 1 });
    expect(accuracyOf(both)).toBe(0.5);
    expect(both.latencyBuckets.reduce((sum, n) => sum + n, 0)).toBe(2);
  });
});

describe('repairWeekdayTotals', () => {
  it('rebuilds from the raw log when there is no aggregate at all', () => {
    const attempts = [attempt('assisted', true, 800), attempt('unassisted', false, 4000)];
    expect(repairWeekdayTotals(undefined, attempts)).toEqual(buildWeekdayTotals(attempts));
    expect(repairWeekdayTotals(null, attempts)).toEqual(buildWeekdayTotals(attempts));
    expect(repairWeekdayTotals([], [])).toEqual(emptyWeekdayTotals());
  });

  it('leaves a good aggregate exactly as it was', () => {
    const attempts = [attempt('assisted', true, 800), attempt('assisted', false, 2600)];
    const totals = buildWeekdayTotals(attempts);
    expect(repairWeekdayTotals(totals)).toEqual(totals);
  });

  it('turns every unusable number into a zero', () => {
    const repaired = repairWeekdayTotals({
      assisted: { answered: Number.NaN, correct: 'six', latencyBuckets: [2, Number.NaN, -1, undefined, 4] },
      unassisted: 'gone',
    });

    expect(repaired.assisted.latencyBuckets).toHaveLength(WEEKDAY_BUCKET_COUNT);
    for (const count of repaired.assisted.latencyBuckets) expect(Number.isFinite(count)).toBe(true);
    expect(repaired.assisted.latencyBuckets[0]).toBe(2);
    expect(repaired.assisted.latencyBuckets[4]).toBe(4);
    expect(repaired.assisted.correct).toBe(0);
    // Six samples are really there, so the count is raised to cover them.
    expect(repaired.assisted.answered).toBe(6);
    expect(repaired.unassisted).toEqual(emptyModeTotals());
    // And nothing it produces can put a NaN on a screen.
    expect(Number.isFinite(estimateMedianMs(repaired.assisted) as number)).toBe(true);
    expect(accuracyOf(repaired.unassisted)).toBeNull();
  });

  it('never lets accuracy come out above 100%', () => {
    const repaired = repairWeekdayTotals({
      assisted: { answered: 2, correct: 40, latencyBuckets: [1, 1] },
      unassisted: emptyModeTotals(),
    });
    expect(repaired.assisted.correct).toBe(2);
    expect(accuracyOf(repaired.assisted)).toBe(1);
  });

  it('pads a bucket array written by a build with fewer buckets', () => {
    const repaired = repairWeekdayTotals({
      assisted: { answered: 3, correct: 3, latencyBuckets: [3] },
      unassisted: emptyModeTotals(),
    });
    expect(repaired.assisted.latencyBuckets).toHaveLength(WEEKDAY_BUCKET_COUNT);
    expect(repaired.assisted.latencyBuckets[0]).toBe(3);
    expect(estimateMedianMs(repaired.assisted)).toBe(125);
  });
});
