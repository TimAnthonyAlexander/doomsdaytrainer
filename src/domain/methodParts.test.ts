import { describe, expect, it } from 'vitest';
import {
  datePartAnswer,
  datePartDays,
  datePartPrompt,
  datePartStatesYearKind,
  explainDatePart,
  explainYearPart,
  yearPartAnswer,
} from './methodParts';
import {
  ALL_MONTHS,
  MAX_YEAR,
  MIN_YEAR,
  dateStep,
  daysInMonth,
  doomsdayDates,
  isLeapYear,
  monthDoomsday,
  monthLength,
  weekdayFor,
  yearDoomsday,
} from './weekday';

/**
 * The two halves exist to be practised apart, so the one thing that must never
 * drift is that they still add up to the method. Everything else here is a
 * consequence of that.
 */

describe('the halves recombine into the method', () => {
  it('adds to the same weekday for every date in a full Gregorian cycle', () => {
    // 1800-01-01 to 2199-12-31 is 146,097 days, which is exactly one cycle:
    // 400 years is 146,097 days and divides by 7 with no remainder, so this is
    // not a large sample, it is every distinct case the calendar can produce.
    let checked = 0;
    for (let year = MIN_YEAR; year <= MAX_YEAR; year += 1) {
      const leap = isLeapYear(year);
      const yearHalf = yearDoomsday(year);
      for (const month of ALL_MONTHS) {
        const length = daysInMonth(year, month);
        for (let day = 1; day <= length; day += 1) {
          const dateHalf = dateStep(month, day, leap);
          expect((yearHalf + dateHalf) % 7).toBe(weekdayFor(year, month, day));
          checked += 1;
        }
      }
    }
    expect(checked).toBe(146_097);
  });

  it('is the same sum through the question types the trainers use', () => {
    const year = 1973;
    const half = yearPartAnswer({ fullYear: year });
    const step = datePartAnswer({ month: 9, day: 6, leapYear: isLeapYear(year) });
    expect((half + step) % 7).toBe(weekdayFor(year, 9, 6));
  });
});

describe('the date half', () => {
  /**
   * The reason the answer is reduced rather than counted from the taught date.
   * A month has three to five doomsdays and they are a whole number of weeks
   * apart, so it cannot matter which one the reader anchors on — and a trainer
   * that only accepted the counted-from-the-taught-date answer would be
   * marking a correct method wrong.
   */
  it('gives the same answer from any of the month doomsdays', () => {
    for (const month of ALL_MONTHS) {
      for (const leapYear of [false, true]) {
        const anchors = doomsdayDates(month, leapYear);
        expect(anchors.length).toBeGreaterThanOrEqual(3);
        for (let day = 1; day <= monthLength(month, leapYear); day += 1) {
          const answer = dateStep(month, day, leapYear);
          for (const anchor of anchors) {
            expect((((day - anchor) % 7) + 7) % 7).toBe(answer);
          }
        }
      }
    }
  });

  it('is 1 for September 6, which is the example the trainer was asked for', () => {
    expect(datePartAnswer({ month: 9, day: 6, leapYear: false })).toBe(1);
    expect(datePartAnswer({ month: 9, day: 6, leapYear: true })).toBe(1);
  });

  it('is 0 on the month doomsday itself, which is an answer and not an absence', () => {
    for (const month of ALL_MONTHS) {
      for (const leapYear of [false, true]) {
        expect(datePartAnswer({ month, day: monthDoomsday(month, leapYear), leapYear })).toBe(0);
      }
    }
  });

  it('moves with the leap flag in January and February, and nowhere else', () => {
    for (const month of ALL_MONTHS) {
      const shifts = datePartStatesYearKind(month);
      expect(shifts).toBe(month === 1 || month === 2);
      // The 1st exists in every month in both kinds of year, so it is the one
      // day that can be compared across the flag for all twelve.
      const common = datePartAnswer({ month, day: 1, leapYear: false });
      const leap = datePartAnswer({ month, day: 1, leapYear: true });
      if (shifts) expect(leap).not.toBe(common);
      else expect(leap).toBe(common);
    }
  });

  it('refuses a day the month does not have', () => {
    expect(() => datePartAnswer({ month: 2, day: 29, leapYear: false })).toThrow(RangeError);
    expect(() => datePartAnswer({ month: 2, day: 30, leapYear: true })).toThrow(RangeError);
    expect(() => datePartAnswer({ month: 4, day: 31, leapYear: false })).toThrow(RangeError);
    expect(() => datePartAnswer({ month: 1, day: 0, leapYear: false })).toThrow(RangeError);
  });

  it('offers every day the month has and no others', () => {
    expect(datePartDays(2, false)).toHaveLength(28);
    expect(datePartDays(2, true)).toHaveLength(29);
    expect(datePartDays(9, false)).toEqual(Array.from({ length: 30 }, (_u, i) => i + 1));
  });

  /** The year kind is stated only where it changes the answer. */
  it('names the leap case in the prompt for January and February alone', () => {
    expect(datePartPrompt({ month: 9, day: 6, leapYear: true })).toBe('September 6');
    expect(datePartPrompt({ month: 2, day: 6, leapYear: true })).toBe('February 6, leap year');
    expect(datePartPrompt({ month: 2, day: 6, leapYear: false })).toBe('February 6');
    expect(datePartPrompt({ month: 1, day: 3, leapYear: true })).toBe('January 3, leap year');
  });
});

describe('the year half', () => {
  it('is the century anchor plus the year code, reduced', () => {
    for (let year = MIN_YEAR; year <= MAX_YEAR; year += 1) {
      const working = explainYearPart({ fullYear: year });
      expect((working.centuryAnchor + working.yearCode) % 7).toBe(working.answer);
      expect(working.answer).toBe(yearPartAnswer({ fullYear: year }));
    }
  });

  it('gives 3 for 1973, whose doomsday was a Wednesday', () => {
    const working = explainYearPart({ fullYear: 1973 });
    expect(working.centuryAnchor).toBe(3);
    expect(working.yearCode).toBe(0);
    expect(working.answer).toBe(3);
    expect(working.lines[2].value).toContain('Wednesday');
  });

  it('refuses a year outside the supported range', () => {
    expect(() => yearPartAnswer({ fullYear: MIN_YEAR - 1 })).toThrow(RangeError);
    expect(() => yearPartAnswer({ fullYear: MAX_YEAR + 1 })).toThrow(RangeError);
  });
});

describe('the working', () => {
  /**
   * Invariant 7. Every number the user is shown after a wrong tap carries the
   * label that says what it is, and the last row is the answer.
   */
  it('labels every row and ends on the answer', () => {
    const year = explainYearPart({ fullYear: 1987 });
    const date = explainDatePart({ month: 3, day: 22, leapYear: false });
    for (const working of [year, date]) {
      expect(working.lines.length).toBeGreaterThanOrEqual(3);
      for (const line of working.lines) {
        expect(line.label.trim()).not.toBe('');
        expect(line.value.trim()).not.toBe('');
      }
      expect(working.lines[working.lines.length - 1].value).toContain(String(working.answer));
    }
  });

  it('shows the subtraction before the reduction, signed as it really is', () => {
    // February 6 in a common year is three weeks and a day *before* the 28th,
    // so the honest intermediate is negative and the reduction is what fixes it.
    const working = explainDatePart({ month: 2, day: 6, leapYear: false });
    expect(working.monthDoomsday).toBe(28);
    expect(working.offset).toBe(-22);
    expect(working.answer).toBe(6);
    expect(working.lines[1].expression).toBe('6 - 28');
    expect(working.lines[2].expression).toBe('-22 mod 7');
  });
});
