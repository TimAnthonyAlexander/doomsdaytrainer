import { describe, expect, it } from 'vitest';
import {
  addMethodPartAttempt,
  buildMethodPartTotals,
  emptyMethodPartTotals,
  isMethodPartAttemptShaped,
  overallMethodPartTotals,
  repairMethodPartTotals,
} from './methodPartLifetime';
import type { MethodPartAttempt } from './types';

function yearAttempt(fullYear: number, correct = true, latencyMs = 1200): MethodPartAttempt {
  return { part: 'year', timestamp: 1_700_000_000_000, fullYear, correct, latencyMs, answered: 3 };
}

function dateAttempt(
  month: number,
  day: number,
  correct = true,
  latencyMs = 1200,
): MethodPartAttempt {
  return {
    part: 'date',
    timestamp: 1_700_000_000_000,
    month,
    day,
    leapYear: false,
    correct,
    latencyMs,
    answered: 1,
  };
}

describe('emptyMethodPartTotals', () => {
  it('has a cell for all four centuries and all twelve months', () => {
    const totals = emptyMethodPartTotals();
    expect(Object.keys(totals.yearByCentury).sort()).toEqual(['18', '19', '20', '21']);
    expect(Object.keys(totals.dateByMonth)).toHaveLength(12);
    expect(overallMethodPartTotals(totals, 'year').answered).toBe(0);
    expect(overallMethodPartTotals(totals, 'date').answered).toBe(0);
  });
});

describe('addMethodPartAttempt', () => {
  it('puts a year in its own century and touches nothing else', () => {
    const totals = addMethodPartAttempt(emptyMethodPartTotals(), yearAttempt(1973));
    expect(totals.yearByCentury['19'].answered).toBe(1);
    expect(totals.yearByCentury['19'].correct).toBe(1);
    expect(totals.yearByCentury['20'].answered).toBe(0);
    expect(overallMethodPartTotals(totals, 'date').answered).toBe(0);
  });

  it('puts a date in its own month and touches nothing else', () => {
    const totals = addMethodPartAttempt(emptyMethodPartTotals(), dateAttempt(9, 6));
    expect(totals.dateByMonth['9'].answered).toBe(1);
    expect(totals.dateByMonth['3'].answered).toBe(0);
    expect(overallMethodPartTotals(totals, 'year').answered).toBe(0);
  });

  it('counts a wrong answer as answered but not as correct', () => {
    const totals = addMethodPartAttempt(emptyMethodPartTotals(), dateAttempt(9, 6, false));
    expect(totals.dateByMonth['9'].answered).toBe(1);
    expect(totals.dateByMonth['9'].correct).toBe(0);
  });

  it('never mutates the totals handed to it', () => {
    const before = emptyMethodPartTotals();
    addMethodPartAttempt(before, yearAttempt(2001));
    expect(before.yearByCentury['20'].answered).toBe(0);
  });

  /**
   * A document from a newer build is still worth opening, and counting an
   * attempt into a cell it does not belong in is worse than not counting it.
   */
  it('skips an attempt it cannot place rather than throwing', () => {
    const empty = emptyMethodPartTotals();
    const unknownPart = { part: 'weekday', timestamp: 1, correct: true, latencyMs: 10 };
    expect(addMethodPartAttempt(empty, unknownPart as unknown as MethodPartAttempt)).toBe(empty);
    // 1700 is outside the shipped century table, which stops at the 1800s.
    expect(addMethodPartAttempt(empty, yearAttempt(1700))).toBe(empty);
    expect(addMethodPartAttempt(empty, dateAttempt(13, 1))).toBe(empty);
  });
});

describe('overallMethodPartTotals', () => {
  /**
   * The cut is the only stored copy. If the overall figures were stored too
   * they could fall out of step with it; summing means they cannot.
   */
  it('is the sum of that half own cut, and only that half', () => {
    let totals = emptyMethodPartTotals();
    totals = addMethodPartAttempt(totals, yearAttempt(1850, true, 900));
    totals = addMethodPartAttempt(totals, yearAttempt(1973, false, 4000));
    totals = addMethodPartAttempt(totals, yearAttempt(2024, true, 1100));
    totals = addMethodPartAttempt(totals, dateAttempt(3, 14));

    const year = overallMethodPartTotals(totals, 'year');
    expect(year.answered).toBe(3);
    expect(year.correct).toBe(2);
    expect(year.buckets.reduce((sum, n) => sum + n, 0)).toBe(3);

    const date = overallMethodPartTotals(totals, 'date');
    expect(date.answered).toBe(1);
  });
});

describe('buildMethodPartTotals', () => {
  it('replays a raw log into the same totals adding them one by one gives', () => {
    const log = [yearAttempt(1901), dateAttempt(5, 9), yearAttempt(2050, false)];
    const built = buildMethodPartTotals(log);
    let folded = emptyMethodPartTotals();
    for (const attempt of log) folded = addMethodPartAttempt(folded, attempt);
    expect(built).toEqual(folded);
  });
});

describe('repairMethodPartTotals', () => {
  it('rebuilds from the raw log when there is no aggregate at all', () => {
    const log = [yearAttempt(1973), dateAttempt(9, 6)];
    expect(repairMethodPartTotals(undefined, log)).toEqual(buildMethodPartTotals(log));
  });

  it('keeps a stored aggregate rather than replacing it with the trimmed log', () => {
    // The whole point of the aggregate: the raw log has been trimmed to one
    // entry and the lifetime count must not fall to one with it.
    const stored = buildMethodPartTotals(
      Array.from({ length: 40 }, () => yearAttempt(1973)),
    );
    const repaired = repairMethodPartTotals(stored, [yearAttempt(1973)]);
    expect(overallMethodPartTotals(repaired, 'year').answered).toBe(40);
  });

  it('clamps a corrupt cell instead of discarding it', () => {
    const broken = {
      yearByCentury: { '19': { answered: -5, correct: 99, buckets: [2, 'x', null] } },
      dateByMonth: {},
    };
    const repaired = repairMethodPartTotals(broken);
    const cell = repaired.yearByCentury['19'];
    // `answered` is raised to cover the samples that really exist, and
    // `correct` can never exceed it, so accuracy cannot come out above 100%.
    expect(cell.answered).toBe(2);
    expect(cell.correct).toBe(2);
    expect(cell.buckets[0]).toBe(2);
    expect(cell.buckets[1]).toBe(0);
  });
});

describe('isMethodPartAttemptShaped', () => {
  it('accepts a real attempt of either half', () => {
    expect(isMethodPartAttemptShaped(yearAttempt(1973))).toBe(true);
    expect(isMethodPartAttemptShaped(dateAttempt(9, 6))).toBe(true);
  });

  /** A stored impossible date would reach a screen that computes its offset. */
  it('rejects a day the month it names does not have', () => {
    expect(isMethodPartAttemptShaped({ ...dateAttempt(2, 1), day: 30 })).toBe(false);
    expect(isMethodPartAttemptShaped({ ...dateAttempt(2, 1), day: 29, leapYear: false })).toBe(false);
    expect(isMethodPartAttemptShaped({ ...dateAttempt(2, 1), day: 29, leapYear: true })).toBe(true);
  });

  it('rejects a year outside the supported range and a missing part', () => {
    expect(isMethodPartAttemptShaped(yearAttempt(1700))).toBe(false);
    expect(isMethodPartAttemptShaped({ ...yearAttempt(1973), part: undefined })).toBe(false);
    expect(isMethodPartAttemptShaped({ ...yearAttempt(1973), latencyMs: Number.NaN })).toBe(false);
    expect(isMethodPartAttemptShaped(null)).toBe(false);
  });
});
