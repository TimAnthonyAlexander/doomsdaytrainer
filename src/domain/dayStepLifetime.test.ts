import { describe, expect, it } from 'vitest';
import type { DayStepAttempt, DayStepDirection, DayStepSize } from './types';
import { DAY_STEP_DIRECTIONS, DAY_STEP_SIZES } from './dayStep';
import {
  addDayStepAttempt,
  buildDayStepTotals,
  combineDayStepTotals,
  dayStepAccuracy,
  dayStepMedianMs,
  dayStepWrong,
  emptyDayStepBucketTotals,
  emptyDayStepTotals,
  isDayStepAttemptShaped,
  overallDayStepTotals,
  repairDayStepTotals,
} from './dayStepLifetime';
import { median } from './time';
import { WEEKDAY_BUCKET_COUNT, bucketLowerEdge, bucketUpperEdge, latencyBucket } from './weekdayLifetime';

function attempt(
  size: DayStepSize,
  direction: DayStepDirection,
  correct: boolean,
  latencyMs: number,
): DayStepAttempt {
  return {
    timestamp: 1000,
    month: 3,
    leapYear: false,
    anchorDay: 14,
    anchorWeekday: 2,
    targetDay: direction === 'forward' ? 14 + size : 14 - size,
    size,
    direction,
    correct,
    latencyMs,
    answered: 0,
  };
}

describe('emptyDayStepTotals', () => {
  it('has a cell for every step size and both directions', () => {
    const totals = emptyDayStepTotals();
    for (const size of DAY_STEP_SIZES) {
      expect(totals.bySize[size]).toEqual({
        answered: 0,
        correct: 0,
        buckets: new Array<number>(WEEKDAY_BUCKET_COUNT).fill(0),
      });
    }
    for (const direction of DAY_STEP_DIRECTIONS) {
      expect(totals.byDirection[direction].answered).toBe(0);
    }
  });
});

describe('addDayStepAttempt', () => {
  it('counts one answer into both cuts and nowhere else', () => {
    const totals = addDayStepAttempt(emptyDayStepTotals(), attempt(3, 'backward', true, 900));
    expect(totals.bySize[3]).toMatchObject({ answered: 1, correct: 1 });
    expect(totals.bySize[2].answered).toBe(0);
    expect(totals.byDirection.backward).toMatchObject({ answered: 1, correct: 1 });
    expect(totals.byDirection.forward.answered).toBe(0);
  });

  it('never mutates the totals it was handed', () => {
    const before = emptyDayStepTotals();
    addDayStepAttempt(before, attempt(1, 'forward', true, 500));
    expect(before.bySize[1].answered).toBe(0);
    expect(before.byDirection.forward.answered).toBe(0);
  });

  it('skips an attempt whose size or direction this build does not know', () => {
    const totals = emptyDayStepTotals();
    const bogus = { ...attempt(1, 'forward', true, 500), size: 9 as DayStepSize };
    expect(addDayStepAttempt(totals, bogus)).toBe(totals);
    const sideways = { ...attempt(1, 'forward', true, 500), direction: 'sideways' as DayStepDirection };
    expect(addDayStepAttempt(totals, sideways)).toBe(totals);
  });

  it('keeps a zero-size step, which is an answer and not an absence', () => {
    const totals = addDayStepAttempt(emptyDayStepTotals(), attempt(0, 'forward', true, 400));
    expect(totals.bySize[0].answered).toBe(1);
    expect(overallDayStepTotals(totals).answered).toBe(1);
  });
});

describe('the two cuts', () => {
  const attempts = [
    attempt(0, 'forward', true, 400),
    attempt(1, 'forward', true, 800),
    attempt(3, 'backward', false, 4000),
    attempt(5, 'backward', true, 2500),
    attempt(5, 'forward', true, 1200),
  ];

  it('both cover every attempt, so they add up to the same totals', () => {
    const totals = buildDayStepTotals(attempts);
    let bySize = emptyDayStepBucketTotals();
    for (const size of DAY_STEP_SIZES) bySize = combineDayStepTotals(bySize, totals.bySize[size]);
    let byDirection = emptyDayStepBucketTotals();
    for (const direction of DAY_STEP_DIRECTIONS) {
      byDirection = combineDayStepTotals(byDirection, totals.byDirection[direction]);
    }
    expect(bySize).toEqual(byDirection);
    expect(bySize).toEqual(overallDayStepTotals(totals));
    expect(bySize.answered).toBe(attempts.length);
    expect(bySize.correct).toBe(4);
  });

  it('reports accuracy and wrong counts per cell rather than overall', () => {
    const totals = buildDayStepTotals(attempts);
    expect(dayStepAccuracy(totals.byDirection.forward)).toBe(1);
    expect(dayStepAccuracy(totals.byDirection.backward)).toBe(0.5);
    expect(dayStepWrong(totals.byDirection.backward)).toBe(1);
    expect(dayStepAccuracy(totals.bySize[2])).toBeNull();
  });

  it('estimates a median back out of the histogram to within one bucket', () => {
    const latencies = [600, 700, 800, 900, 1000, 5000];
    let totals = emptyDayStepTotals();
    for (const latencyMs of latencies) {
      totals = addDayStepAttempt(totals, attempt(1, 'forward', true, latencyMs));
    }
    const estimate = dayStepMedianMs(totals.bySize[1]);
    const truth = median(latencies);
    const bucket = latencyBucket(truth);
    const width = bucketUpperEdge(bucket) - bucketLowerEdge(bucket);
    expect(estimate).not.toBeNull();
    expect(Math.abs((estimate as number) - truth)).toBeLessThanOrEqual(width);
  });

  it('has no median at all before anything is answered, rather than zero', () => {
    expect(dayStepMedianMs(emptyDayStepBucketTotals())).toBeNull();
  });
});

describe('trim-proofing', () => {
  it('keeps every lifetime number when the raw log is thrown away', () => {
    const history = Array.from({ length: 500 }, (_unused, i) =>
      attempt((i % 7) as DayStepSize, i % 2 === 0 ? 'forward' : 'backward', i % 5 !== 0, 300 + i),
    );
    const full = buildDayStepTotals(history);

    // The oldest four hundred are gone, exactly as `MAX_DAY_STEP_ATTEMPTS`
    // eventually drops them. The aggregate is not rebuilt from the tail; it
    // keeps being added to.
    const trimmed = history.slice(400);
    const rebuiltFromTail = buildDayStepTotals(trimmed);

    expect(overallDayStepTotals(full).answered).toBe(500);
    expect(overallDayStepTotals(rebuiltFromTail).answered).toBe(100);
    // And the aggregate that was kept still reports all five hundred.
    expect(repairDayStepTotals(full, trimmed)).toEqual(full);
  });
});

describe('repairDayStepTotals', () => {
  it('rebuilds from the raw log when there is no aggregate at all', () => {
    const attempts = [attempt(2, 'forward', true, 700), attempt(4, 'backward', false, 3000)];
    expect(repairDayStepTotals(undefined, attempts)).toEqual(buildDayStepTotals(attempts));
    expect(repairDayStepTotals(null, attempts)).toEqual(buildDayStepTotals(attempts));
  });

  it('keeps NaN and negatives off the screen without inventing counts', () => {
    const repaired = repairDayStepTotals({
      bySize: {
        1: { answered: Number.NaN, correct: -4, buckets: ['nonsense', 3, null] },
        2: { answered: 2, correct: 9, buckets: [] },
      },
      byDirection: { forward: { answered: 1, correct: 1, buckets: [1] } },
    });

    // One real sample survives in bucket 1; the string and the null do not.
    expect(repaired.bySize[1].buckets[1]).toBe(3);
    expect(repaired.bySize[1].answered).toBe(3);
    expect(repaired.bySize[1].correct).toBe(0);
    // `correct` can never exceed `answered`, so accuracy cannot pass 100%.
    expect(repaired.bySize[2].correct).toBe(2);
    expect(dayStepAccuracy(repaired.bySize[2])).toBe(1);
    // A missing direction becomes an empty cell rather than undefined.
    expect(repaired.byDirection.backward).toEqual(emptyDayStepBucketTotals());
    expect(repaired.bySize[1].buckets).toHaveLength(WEEKDAY_BUCKET_COUNT);
  });
});

describe('isDayStepAttemptShaped', () => {
  it('accepts what the trainer writes', () => {
    expect(isDayStepAttemptShaped(attempt(3, 'forward', true, 900))).toBe(true);
    // A miss: the window ran out and nothing was tapped.
    expect(isDayStepAttemptShaped({ ...attempt(3, 'forward', false, 4000), answered: null })).toBe(true);
  });

  it('rejects anything a breakdown could not place', () => {
    expect(isDayStepAttemptShaped(null)).toBe(false);
    expect(isDayStepAttemptShaped({})).toBe(false);
    expect(isDayStepAttemptShaped({ ...attempt(3, 'forward', true, 900), size: 8 })).toBe(false);
    expect(isDayStepAttemptShaped({ ...attempt(3, 'forward', true, 900), direction: 'up' })).toBe(false);
    expect(isDayStepAttemptShaped({ ...attempt(3, 'forward', true, 900), month: 13 })).toBe(false);
    expect(isDayStepAttemptShaped({ ...attempt(3, 'forward', true, 900), latencyMs: Number.NaN })).toBe(false);
    expect(isDayStepAttemptShaped({ ...attempt(3, 'forward', true, 900), correct: 'yes' })).toBe(false);
  });
});
