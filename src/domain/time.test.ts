import { describe, expect, it } from 'vitest';
import { addDays, dayKey, daysBetween, formatInterval, formatMs, median, startOfDay } from './time';

/** Local midnights of every day in `year`, plus the day before it. */
function localMidnights(year: number): number[] {
  const out: number[] = [];
  const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) {
    out.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Days in the current runtime zone whose UTC offset differs from the day before. */
function dstTransitions(year: number): number[] {
  const midnights = localMidnights(year);
  const out: number[] = [];
  for (let i = 1; i < midnights.length; i++) {
    const prev = new Date(midnights[i - 1]).getTimezoneOffset();
    const curr = new Date(midnights[i]).getTimezoneOffset();
    if (prev !== curr) out.push(midnights[i]);
  }
  return out;
}

describe('dayKey', () => {
  it('formats the local calendar date, zero padded', () => {
    expect(dayKey(new Date(2026, 0, 5, 12, 0).getTime())).toBe('2026-01-05');
    expect(dayKey(new Date(2026, 11, 31, 23, 59, 59).getTime())).toBe('2026-12-31');
    expect(dayKey(new Date(1999, 8, 9, 0, 0).getTime())).toBe('1999-09-09');
  });

  it('rolls over at local midnight, not at UTC midnight', () => {
    const lastMinute = new Date(2026, 2, 14, 23, 59, 0).getTime();
    expect(dayKey(lastMinute)).toBe('2026-03-14');
    expect(dayKey(lastMinute + 60_000)).toBe('2026-03-15');
    expect(dayKey(lastMinute + 60_000 - 1)).toBe('2026-03-14');
  });

  it('agrees with startOfDay for both ends of a day', () => {
    const noon = new Date(2026, 5, 17, 12, 30).getTime();
    const start = startOfDay(noon);
    expect(dayKey(start)).toBe(dayKey(noon));
    expect(dayKey(start - 1)).not.toBe(dayKey(noon));
  });
});

describe('startOfDay', () => {
  it('returns local midnight', () => {
    const d = new Date(startOfDay(new Date(2026, 3, 9, 17, 42, 13, 500).getTime()));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
    expect(d.getDate()).toBe(9);
  });

  it('is idempotent', () => {
    const once = startOfDay(new Date(2026, 3, 9, 17, 42).getTime());
    expect(startOfDay(once)).toBe(once);
  });
});

describe('addDays', () => {
  it('keeps the local wall-clock time', () => {
    const from = new Date(2026, 0, 30, 9, 15).getTime();
    const to = new Date(addDays(from, 3));
    expect(to.getFullYear()).toBe(2026);
    expect(to.getMonth()).toBe(1);
    expect(to.getDate()).toBe(2);
    expect(to.getHours()).toBe(9);
    expect(to.getMinutes()).toBe(15);
  });

  it('handles zero and negative shifts', () => {
    const ts = new Date(2026, 6, 1, 8, 0).getTime();
    expect(addDays(ts, 0)).toBe(ts);
    expect(dayKey(addDays(ts, -1))).toBe('2026-06-30');
  });

  it('crosses a leap day', () => {
    expect(dayKey(addDays(new Date(2024, 1, 28, 12, 0).getTime(), 1))).toBe('2024-02-29');
    expect(dayKey(addDays(new Date(2025, 1, 28, 12, 0).getTime(), 1))).toBe('2025-03-01');
  });
});

describe('daysBetween', () => {
  it('is zero within one local day', () => {
    const a = new Date(2026, 4, 4, 0, 0, 1).getTime();
    const b = new Date(2026, 4, 4, 23, 59, 59).getTime();
    expect(daysBetween(a, b)).toBe(0);
    expect(daysBetween(b, a)).toBe(0);
  });

  it('counts one day across midnight even for a two-minute gap', () => {
    const a = new Date(2026, 4, 4, 23, 59).getTime();
    const b = new Date(2026, 4, 5, 0, 1).getTime();
    expect(daysBetween(a, b)).toBe(1);
    expect(daysBetween(b, a)).toBe(-1);
  });

  it('counts calendar days over longer spans', () => {
    const a = new Date(2026, 0, 1, 6, 0).getTime();
    expect(daysBetween(a, new Date(2026, 1, 1, 22, 0).getTime())).toBe(31);
    expect(daysBetween(a, new Date(2027, 0, 1, 6, 0).getTime())).toBe(365);
  });
});

describe('DST behaviour in the runtime timezone', () => {
  const transitions = dstTransitions(2025);

  it('still counts a 23h or 25h day as exactly one day', () => {
    for (const midnight of transitions) {
      const dayBefore = addDays(midnight, -1);
      expect(daysBetween(dayBefore, midnight)).toBe(1);
      expect(daysBetween(midnight, addDays(midnight, 1))).toBe(1);
    }
  });

  it('gives the transition day its own dayKey', () => {
    for (const midnight of transitions) {
      const before = addDays(midnight, -1);
      expect(dayKey(before)).not.toBe(dayKey(midnight));
      expect(daysBetween(before, midnight)).toBe(1);
      // Midday is unambiguous in every zone: no gap, no repeat.
      const noon = midnight + 12 * 3_600_000;
      expect(dayKey(noon)).toBe(dayKey(midnight));
    }
  });

  it('shifts by whole calendar days across the transition', () => {
    for (const midnight of transitions) {
      const noonBefore = new Date(midnight);
      noonBefore.setDate(noonBefore.getDate() - 1);
      noonBefore.setHours(12, 0, 0, 0);
      const next = new Date(addDays(noonBefore.getTime(), 1));
      expect(next.getHours()).toBe(12);
      expect(dayKey(next.getTime())).toBe(dayKey(midnight));
    }
  });
});

describe('median', () => {
  it('is 0 for an empty list', () => {
    expect(median([])).toBe(0);
  });

  it('takes the middle of an odd-length list', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([7])).toBe(7);
  });

  it('averages the two middles of an even-length list', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([10, 20])).toBe(15);
  });

  it('sorts numerically, not lexically', () => {
    expect(median([9, 10, 100, 1000, 2])).toBe(10);
  });

  it('does not mutate the input', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });

  it('handles negatives', () => {
    expect(median([-5, -1, -3])).toBe(-3);
  });
});

describe('formatMs', () => {
  it('uses two decimals below a second', () => {
    expect(formatMs(840)).toBe('0.84s');
    expect(formatMs(1)).toBe('0.00s');
    expect(formatMs(999)).toBe('1.0s');
  });

  it('uses one decimal from 1 to 10 seconds', () => {
    expect(formatMs(1200)).toBe('1.2s');
    expect(formatMs(1000)).toBe('1.0s');
    expect(formatMs(9940)).toBe('9.9s');
  });

  it('drops decimals from 10 seconds up', () => {
    expect(formatMs(12_000)).toBe('12s');
    expect(formatMs(9999)).toBe('10s');
    expect(formatMs(65_400)).toBe('65s');
  });

  it('clamps nonsense to zero', () => {
    expect(formatMs(0)).toBe('0.00s');
    expect(formatMs(-500)).toBe('0.00s');
    expect(formatMs(Number.NaN)).toBe('0.00s');
  });
});

describe('formatInterval', () => {
  it('calls a zero or negative interval new', () => {
    expect(formatInterval(0)).toBe('new');
    expect(formatInterval(-3)).toBe('new');
  });

  it('singularises one day', () => {
    expect(formatInterval(1)).toBe('1 day');
    expect(formatInterval(2)).toBe('2 days');
    expect(formatInterval(12)).toBe('12 days');
    expect(formatInterval(29)).toBe('29 days');
  });

  it('switches to months at 30 days', () => {
    expect(formatInterval(30)).toBe('1 month');
    expect(formatInterval(90)).toBe('3 months');
    expect(formatInterval(180)).toBe('6 months');
  });

  it('switches to years at a year', () => {
    expect(formatInterval(365)).toBe('1 year');
    expect(formatInterval(730)).toBe('2 years');
  });
});
