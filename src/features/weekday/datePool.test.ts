import { describe, expect, it } from 'vitest';
import { MAX_YEAR, MIN_YEAR, weekdayFor } from '@/domain/weekday';
import {
  dateFromDayNumber,
  dateKey,
  dayNumber,
  inRange,
  nextDate,
  rangeById,
  rangeSize,
  randomDateIn,
  sameDate,
  weekdayRanges,
} from './datePool';

const NOW = Date.UTC(2026, 7, 22, 12); // 22 August 2026, midday

/** Deterministic stand-in for Math.random. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

describe('day numbers', () => {
  it('round-trips every kind of boundary', () => {
    for (const date of [
      { fullYear: 1800, month: 1, day: 1 },
      { fullYear: 1900, month: 2, day: 28 },
      { fullYear: 2000, month: 2, day: 29 },
      { fullYear: 2026, month: 8, day: 22 },
      { fullYear: 2199, month: 12, day: 31 },
    ]) {
      expect(dateFromDayNumber(dayNumber(date))).toEqual(date);
    }
  });

  it('counts consecutive days as consecutive numbers', () => {
    expect(dayNumber({ fullYear: 2000, month: 3, day: 1 }) - dayNumber({ fullYear: 2000, month: 2, day: 29 })).toBe(1);
    expect(dayNumber({ fullYear: 1900, month: 3, day: 1 }) - dayNumber({ fullYear: 1900, month: 2, day: 28 })).toBe(1);
  });

  it('zero-pads the key', () => {
    expect(dateKey({ fullYear: 1987, month: 3, day: 14 })).toBe('1987-03-14');
    expect(dateKey({ fullYear: 2000, month: 12, day: 1 })).toBe('2000-12-01');
  });

  it('compares dates by value', () => {
    expect(sameDate({ fullYear: 1987, month: 3, day: 14 }, { fullYear: 1987, month: 3, day: 14 })).toBe(true);
    expect(sameDate({ fullYear: 1987, month: 3, day: 14 }, { fullYear: 1987, month: 4, day: 14 })).toBe(false);
  });
});

describe('ranges', () => {
  it('offers the three the spec names, in order', () => {
    expect(weekdayRanges(NOW).map((r) => r.id)).toEqual(['century', 'living', 'full']);
    expect(weekdayRanges(NOW).map((r) => r.label)).toEqual(['This century', 'Living memory', 'Full range']);
  });

  it('bounds this century at 2000 and 2099', () => {
    const range = rangeById('century', NOW);
    expect(range.start).toEqual({ fullYear: 2000, month: 1, day: 1 });
    expect(range.end).toEqual({ fullYear: 2099, month: 12, day: 31 });
  });

  it('ends living memory today, not at the end of the year', () => {
    const range = rangeById('living', NOW);
    expect(range.start).toEqual({ fullYear: 1925, month: 1, day: 1 });
    const now = new Date(NOW);
    expect(range.end).toEqual({
      fullYear: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    });
  });

  it('covers exactly the supported years at full range', () => {
    const range = rangeById('full', NOW);
    expect(range.start.fullYear).toBe(MIN_YEAR);
    expect(range.end.fullYear).toBe(MAX_YEAR);
    // 400 Gregorian years, the same count the calendar sweep checks.
    expect(rangeSize(range)).toBe(146_097);
  });

  it('falls back to the full range for an id it does not know', () => {
    expect(rangeById('nonsense' as 'full', NOW).id).toBe('full');
  });

  it('tests membership at both ends', () => {
    const range = rangeById('century', NOW);
    expect(inRange({ fullYear: 2000, month: 1, day: 1 }, range)).toBe(true);
    expect(inRange({ fullYear: 2099, month: 12, day: 31 }, range)).toBe(true);
    expect(inRange({ fullYear: 1999, month: 12, day: 31 }, range)).toBe(false);
    expect(inRange({ fullYear: 2100, month: 1, day: 1 }, range)).toBe(false);
  });
});

describe('randomDateIn', () => {
  it('returns the first day at 0 and the last at just under 1', () => {
    const range = rangeById('century', NOW);
    expect(randomDateIn(range, () => 0)).toEqual({ fullYear: 2000, month: 1, day: 1 });
    expect(randomDateIn(range, () => 0.999999999)).toEqual({ fullYear: 2099, month: 12, day: 31 });
  });

  it('clamps a generator that hands back exactly 1', () => {
    const range = rangeById('full', NOW);
    expect(randomDateIn(range, () => 1)).toEqual({ fullYear: MAX_YEAR, month: 12, day: 31 });
  });

  it('only ever produces dates the domain layer will accept', () => {
    const range = rangeById('full', NOW);
    for (let i = 0; i < 2000; i += 1) {
      const date = randomDateIn(range);
      expect(inRange(date, range)).toBe(true);
      expect(() => weekdayFor(date.fullYear, date.month, date.day)).not.toThrow();
    }
  });

  it('samples days uniformly, so a 31-day month gets more dates than February', () => {
    const range = rangeById('century', NOW);
    const byMonth = new Array<number>(13).fill(0);
    for (let i = 0; i < 60_000; i += 1) byMonth[randomDateIn(range).month] += 1;
    // January has 31 days and February 28: roughly a tenth more draws, and
    // nothing like the equal split a month-first draw would give.
    expect(byMonth[1]).toBeGreaterThan(byMonth[2] * 1.05);
    expect(byMonth[1]).toBeLessThan(byMonth[2] * 1.2);
  });
});

describe('nextDate', () => {
  it('never repeats a date already seen', () => {
    const range = rangeById('century', NOW);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const date = nextDate(range, seen);
      expect(seen.has(dateKey(date))).toBe(false);
      seen.add(dateKey(date));
    }
    expect(seen.size).toBe(500);
  });

  it('walks forward once random draws keep landing on a seen date', () => {
    // A one-week range with six of the seven days used up.
    const range = {
      id: 'full' as const,
      label: 'Week',
      start: { fullYear: 2000, month: 1, day: 1 },
      end: { fullYear: 2000, month: 1, day: 7 },
    };
    const seen = new Set(['2000-01-01', '2000-01-02', '2000-01-03', '2000-01-05', '2000-01-06', '2000-01-07']);
    expect(nextDate(range, seen, sequence([0]))).toEqual({ fullYear: 2000, month: 1, day: 4 });
  });

  it('gives up gracefully when the whole range has been asked', () => {
    const range = {
      id: 'full' as const,
      label: 'Day',
      start: { fullYear: 2000, month: 1, day: 1 },
      end: { fullYear: 2000, month: 1, day: 1 },
    };
    const seen = new Set(['2000-01-01']);
    expect(nextDate(range, seen, sequence([0]))).toEqual({ fullYear: 2000, month: 1, day: 1 });
  });
});
