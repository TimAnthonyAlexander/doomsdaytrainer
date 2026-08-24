import { describe, expect, it } from 'vitest';
import { codeFor } from './yearCodes';
import {
  ALL_CENTURIES,
  ALL_MONTHS,
  CENTURY_ANCHORS,
  MAX_YEAR,
  MIN_YEAR,
  MONTH_DOOMSDAYS,
  WEEKDAY_NAMES,
  centuryAnchor,
  centuryLabel,
  centuryOf,
  daysInMonth,
  doomsdayDates,
  doomsdayShifts,
  explainWeekday,
  formatDate,
  isDoomsdayDate,
  isLeapYear,
  monthDoomsday,
  monthLength,
  monthName,
  ordinalDay,
  weekdayAbbr,
  weekdayFor,
  weekdayName,
  yearDoomsday,
} from './weekday';
import type { Code } from './types';

/** The reference calendar. UTC only, so no timezone or DST can shift a day. */
function realWeekday(fullYear: number, month: number, day: number): number {
  return new Date(Date.UTC(fullYear, month - 1, day)).getUTCDay();
}

describe('isLeapYear', () => {
  it('applies the century exception', () => {
    expect(isLeapYear(1800)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
  });

  it('handles the ordinary cases', () => {
    expect(isLeapYear(1987)).toBe(false);
    expect(isLeapYear(1988)).toBe(true);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
  });

  it('matches the platform calendar across the whole range', () => {
    for (let year = MIN_YEAR; year <= MAX_YEAR; year += 1) {
      // 29 February exists exactly when the year is a leap year.
      const feb29 = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
      expect(isLeapYear(year)).toBe(feb29);
    }
  });
});

describe('daysInMonth', () => {
  it('gives February its extra day only in a leap year', () => {
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
  });

  it('knows the short months', () => {
    expect(daysInMonth(2001, 1)).toBe(31);
    expect(daysInMonth(2001, 4)).toBe(30);
    expect(daysInMonth(2001, 6)).toBe(30);
    expect(daysInMonth(2001, 9)).toBe(30);
    expect(daysInMonth(2001, 11)).toBe(30);
    expect(daysInMonth(2001, 12)).toBe(31);
  });

  it('rejects a month outside 1-12', () => {
    expect(() => daysInMonth(2001, 0)).toThrow(/Month outside/);
    expect(() => daysInMonth(2001, 13)).toThrow(/Month outside/);
  });

  it('matches the platform calendar for every month in the range', () => {
    for (let year = MIN_YEAR; year <= MAX_YEAR; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        // Day 0 of the next month is the last day of this one.
        const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
        expect(daysInMonth(year, month)).toBe(last);
      }
    }
  });
});

describe('the shipped tables', () => {
  it('has twelve month doomsdays in the order the spec lists them', () => {
    expect(MONTH_DOOMSDAYS).toEqual([3, 28, 14, 4, 9, 6, 11, 8, 5, 10, 7, 12]);
  });

  it('shifts January and February in a leap year and nothing else', () => {
    expect(monthDoomsday(1, false)).toBe(3);
    expect(monthDoomsday(1, true)).toBe(4);
    expect(monthDoomsday(2, false)).toBe(28);
    expect(monthDoomsday(2, true)).toBe(29);
    for (let month = 3; month <= 12; month += 1) {
      expect(monthDoomsday(month, true)).toBe(monthDoomsday(month, false));
    }
  });

  it('numbers months from 1, so 1 is January and 12 is December', () => {
    expect(monthName(1)).toBe('January');
    expect(monthName(12)).toBe('December');
    expect(monthDoomsday(1, false)).toBe(3);
    expect(monthDoomsday(12, false)).toBe(12);
    expect(() => monthName(0)).toThrow(/Month outside/);
    expect(() => monthDoomsday(13, false)).toThrow(/Month outside/);
  });

  it('names the two months whose doomsday moves, and only those two', () => {
    expect(doomsdayShifts(1)).toBe(true);
    expect(doomsdayShifts(2)).toBe(true);
    for (let month = 3; month <= 12; month += 1) expect(doomsdayShifts(month)).toBe(false);
    expect(() => doomsdayShifts(0)).toThrow(/Month outside/);
  });

  it('carries the four century anchors from the spec', () => {
    expect(CENTURY_ANCHORS).toEqual({ 18: 5, 19: 3, 20: 2, 21: 0 });
    expect(centuryAnchor(1800)).toBe(5);
    expect(centuryAnchor(1899)).toBe(5);
    expect(centuryAnchor(1987)).toBe(3);
    expect(centuryAnchor(2000)).toBe(2);
    expect(centuryAnchor(2199)).toBe(0);
  });

  it('agrees with the modular form of the anchor', () => {
    for (const century of ALL_CENTURIES) {
      expect(CENTURY_ANCHORS[century]).toBe((5 * (century % 4) + 2) % 7);
    }
  });

  it('covers 1..12 and 18..21', () => {
    expect(ALL_MONTHS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(ALL_CENTURIES).toEqual([18, 19, 20, 21]);
  });

  it('labels a century the way the spec writes it', () => {
    expect(centuryOf(1987)).toBe(19);
    expect(centuryLabel(19)).toBe('1900s');
    expect(centuryLabel(21)).toBe('2100s');
  });

  it('rejects a year outside the supported range', () => {
    expect(() => weekdayFor(1799, 12, 31)).toThrow(/1800-2199/);
    expect(() => weekdayFor(2200, 1, 1)).toThrow(/1800-2199/);
    expect(() => centuryAnchor(1799)).toThrow(/1800-2199/);
  });

  it('rejects a day that is not in the month', () => {
    expect(() => weekdayFor(1900, 2, 29)).toThrow(/Day outside/);
    expect(() => weekdayFor(2001, 4, 31)).toThrow(/Day outside/);
    expect(() => weekdayFor(2001, 1, 0)).toThrow(/Day outside/);
    expect(() => weekdayFor(2000, 2, 29)).not.toThrow();
  });
});

describe('doomsdayDates', () => {
  it('starts from the taught date and steps back a week at a time', () => {
    expect(doomsdayDates(1, false)).toEqual([3, 10, 17, 24, 31]);
    expect(doomsdayDates(1, true)).toEqual([4, 11, 18, 25]);
    expect(doomsdayDates(2, false)).toEqual([7, 14, 21, 28]);
    expect(doomsdayDates(2, true)).toEqual([1, 8, 15, 22, 29]);
    expect(doomsdayDates(3, false)).toEqual([7, 14, 21, 28]);
    expect(doomsdayDates(12, false)).toEqual([5, 12, 19, 26]);
  });

  it('always contains the taught date and stays inside the month', () => {
    for (const leapYear of [false, true]) {
      for (const month of ALL_MONTHS) {
        const dates = doomsdayDates(month, leapYear);
        expect(dates).toContain(monthDoomsday(month, leapYear));
        expect(dates[0]).toBeGreaterThanOrEqual(1);
        expect(dates[dates.length - 1]).toBeLessThanOrEqual(monthLength(month, leapYear));
        expect(dates.length).toBeGreaterThanOrEqual(4);
      }
    }
  });

  /**
   * The claim the drill now grades on: February's 7th really is a doomsday, so
   * marking it wrong was the app being wrong about the calendar. Checked the
   * only way that settles it — against every date of every month of the whole
   * supported range, in both directions. Every listed date falls on the year's
   * doomsday, and every date that falls on it is listed.
   */
  it('is exactly the dates that land on the doomsday, every month of the range', () => {
    for (let year = MIN_YEAR; year <= MAX_YEAR; year += 1) {
      const leapYear = isLeapYear(year);
      const doomsday = yearDoomsday(year);
      for (const month of ALL_MONTHS) {
        const listed = doomsdayDates(month, leapYear);
        for (let day = 1; day <= daysInMonth(year, month); day += 1) {
          const lands = weekdayFor(year, month, day) === doomsday;
          expect(listed.includes(day)).toBe(lands);
          expect(isDoomsdayDate(month, leapYear, day)).toBe(lands);
        }
      }
    }
  });

  it('refuses a day the month does not have', () => {
    expect(isDoomsdayDate(2, false, 29)).toBe(false);
    expect(isDoomsdayDate(2, true, 29)).toBe(true);
    expect(isDoomsdayDate(4, false, 31)).toBe(false);
    expect(isDoomsdayDate(1, false, 0)).toBe(false);
    expect(isDoomsdayDate(1, false, 1.5)).toBe(false);
  });
});

describe('yearDoomsday', () => {
  it('is the anchor plus the year code', () => {
    // 4 April 1987 was a Saturday, and Saturday is 6 Sunday-indexed.
    expect(yearDoomsday(1987)).toBe(6);
    expect(yearDoomsday(1987)).toBe((centuryAnchor(1987) + codeFor(87)) % 7);
    expect(yearDoomsday(2000)).toBe(2);
  });

  it('lands on every month doomsday of that year', () => {
    for (const year of [1804, 1900, 1987, 2000, 2023, 2024, 2100, 2199]) {
      const expected = yearDoomsday(year);
      for (let month = 1; month <= 12; month += 1) {
        expect(weekdayFor(year, month, monthDoomsday(month, isLeapYear(year)))).toBe(expected);
      }
    }
  });
});

describe('weekdayFor', () => {
  it('matches known dates', () => {
    expect(weekdayFor(1987, 3, 14)).toBe(6); // Saturday
    expect(weekdayFor(2000, 1, 1)).toBe(6); // Saturday
    expect(weekdayFor(1969, 7, 20)).toBe(0); // Sunday, Apollo 11
    expect(weekdayFor(2001, 9, 11)).toBe(2); // Tuesday
    expect(weekdayFor(1800, 1, 1)).toBe(3); // Wednesday
    expect(weekdayFor(2199, 12, 31)).toBe(realWeekday(2199, 12, 31));
  });

  it('handles the 29 February boundary in every leap-century case', () => {
    for (const year of [1804, 1896, 2000, 2004, 2096, 2104, 2196]) {
      expect(weekdayFor(year, 2, 29)).toBe(realWeekday(year, 2, 29));
      expect(weekdayFor(year, 3, 1)).toBe(realWeekday(year, 3, 1));
      expect(weekdayFor(year, 2, 28)).toBe(realWeekday(year, 2, 28));
      expect(weekdayFor(year, 1, 31)).toBe(realWeekday(year, 1, 31));
    }
    // The centuries that are divisible by 100 but not 400 have no 29 February.
    for (const year of [1800, 1900, 2100]) {
      expect(() => weekdayFor(year, 2, 29)).toThrow(/Day outside/);
      expect(weekdayFor(year, 2, 28)).toBe(realWeekday(year, 2, 28));
      expect(weekdayFor(year, 3, 1)).toBe(realWeekday(year, 3, 1));
    }
  });

  it('agrees with the real calendar on every date from 1800-01-01 to 2199-12-31', () => {
    let checked = 0;
    let mismatch = '';
    for (let year = MIN_YEAR; year <= MAX_YEAR; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const last = daysInMonth(year, month);
        for (let day = 1; day <= last; day += 1) {
          const actual = weekdayFor(year, month, day);
          const expected = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
          if (actual !== expected) {
            // One line, not 146,000. The first disagreement is the bug.
            if (mismatch === '') mismatch = `${year}-${month}-${day}: got ${actual}, want ${expected}`;
          }
          checked += 1;
        }
      }
    }
    expect(mismatch).toBe('');
    expect(checked).toBe(146_097);
  });
});

describe('explainWeekday', () => {
  it('reports every step for a non-leap date', () => {
    expect(explainWeekday(1987, 3, 14)).toEqual({
      fullYear: 1987,
      month: 3,
      day: 14,
      leapYear: false,
      century: 19,
      centuryAnchor: 3,
      yy: 87,
      yearCode: 3,
      yearDoomsday: 6,
      monthDoomsday: 14,
      offset: 0,
      weekday: 6,
    });
  });

  it('uses the leap value for January in a leap year', () => {
    const working = explainWeekday(2024, 1, 1);
    expect(working.leapYear).toBe(true);
    expect(working.monthDoomsday).toBe(4);
    expect(working.offset).toBe(-3);
    expect(working.weekday).toBe(weekdayFor(2024, 1, 1));
  });

  it('keeps the offset signed and unreduced so the arithmetic reads back', () => {
    const working = explainWeekday(2023, 12, 31);
    expect(working.offset).toBe(31 - 12);
    expect((working.yearDoomsday + working.offset + 70) % 7).toBe(working.weekday);
  });
});

describe('formatting', () => {
  it('spells the month out', () => {
    expect(formatDate(1987, 3, 14)).toBe('14 March 1987');
    expect(formatDate(2000, 12, 1)).toBe('1 December 2000');
  });

  it('ordinals every day a month can have, teens included', () => {
    const all = Array.from({ length: 31 }, (_unused, index) => ordinalDay(index + 1));
    expect(all.slice(0, 4)).toEqual(['1st', '2nd', '3rd', '4th']);
    expect(all.slice(10, 13)).toEqual(['11th', '12th', '13th']);
    expect(all.slice(20, 23)).toEqual(['21st', '22nd', '23rd']);
    expect(all[30]).toBe('31st');
  });

  it('abbreviates weekdays to three unambiguous letters', () => {
    const days = [0, 1, 2, 3, 4, 5, 6].map((c) => weekdayAbbr(c as 0));
    expect(days).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(new Set(days).size).toBe(7);
  });
});

/**
 * There were two of these, Sunday-indexed and Monday-indexed, and a setting to
 * choose. The setting renamed the seven buttons and moved no number: every
 * century anchor, every year code and every intermediate sum in the method is
 * Sunday-indexed, so a user who picked Monday read "0 = Monday" on the pad and
 * "the 1900s anchor is 3" everywhere else. One convention now, and it is the
 * one the shipped tables are written in.
 */
describe('weekday names', () => {
  it('lists the seven days from Sunday', () => {
    expect(WEEKDAY_NAMES).toHaveLength(7);
    expect(WEEKDAY_NAMES[0]).toBe('Sunday');
    expect(WEEKDAY_NAMES[6]).toBe('Saturday');
  });

  it('resolves a code to the day the tables give it', () => {
    expect(weekdayName(0)).toBe('Sunday');
    expect(weekdayName(3)).toBe('Wednesday');
    expect(weekdayName(6)).toBe('Saturday');
  });

  it('agrees with the method on a date whose weekday is known', () => {
    // 14 March 1987 was a Saturday.
    expect(weekdayName(weekdayFor(1987, 3, 14))).toBe('Saturday');
  });

  it('rejects codes outside 0..6', () => {
    expect(() => weekdayName(7 as unknown as Code)).toThrow(RangeError);
    expect(() => weekdayName(-1 as unknown as Code)).toThrow(RangeError);
  });
});
