import { describe, expect, it } from 'vitest';
import { MONTH_DOOMSDAYS, doomsdayDates, weekdayFor } from '@/domain/weekday';
import { monthPadDays, weekdayOptions } from './weekdayPad';

describe('weekdayOptions', () => {
  it('is always seven, and always the seven days', () => {
    for (const convention of ['sunday', 'monday'] as const) {
      const options = weekdayOptions(convention);
      expect(options).toHaveLength(7);
      expect(new Set(options.map((o) => o.value)).size).toBe(7);
      expect(new Set(options.map((o) => o.name)).size).toBe(7);
    }
  });

  it('starts on Sunday when the user is Sunday-indexed', () => {
    const options = weekdayOptions('sunday');
    expect(options.map((o) => o.name)).toEqual([
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ]);
    expect(options.map((o) => o.value)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('starts on Monday when the user is Monday-indexed, without renaming a day', () => {
    const options = weekdayOptions('monday');
    expect(options.map((o) => o.name)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    // Reordered, not relabelled: Saturday still carries the code the tables give it.
    expect(options.map((o) => o.value)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('keeps the value that matches the method under either convention', () => {
    // 14 March 1987 was a Saturday.
    const code = weekdayFor(1987, 3, 14);
    for (const convention of ['sunday', 'monday'] as const) {
      const saturday = weekdayOptions(convention).find((o) => o.name === 'Saturday');
      expect(saturday?.value).toBe(code);
    }
  });

  it('abbreviates to three letters, all distinct', () => {
    const shorts = weekdayOptions('sunday').map((o) => o.short);
    expect(shorts).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(new Set(shorts).size).toBe(7);
  });
});

describe('monthPadDays', () => {
  it('is every day the month has, ascending, and nothing else', () => {
    expect(monthPadDays(1, false)).toHaveLength(31);
    expect(monthPadDays(2, false)).toHaveLength(28);
    expect(monthPadDays(2, true)).toHaveLength(29);
    expect(monthPadDays(4, false)).toHaveLength(30);
    expect(monthPadDays(2, false)[0]).toBe(1);
    expect(monthPadDays(2, false)[27]).toBe(28);
  });

  /**
   * The pad used to be the twelve distinct doomsday values, which meant a
   * February answer of 7 — the same weekday as the 28th, and a perfectly good
   * anchor — could not be given at all. Every date the method accepts has to
   * be reachable, or the drill is grading its own pad rather than the user.
   */
  it('can express every date that falls on the doomsday', () => {
    for (const leapYear of [false, true]) {
      for (let month = 1; month <= 12; month += 1) {
        for (const day of doomsdayDates(month, leapYear)) {
          expect(monthPadDays(month, leapYear)).toContain(day);
        }
      }
    }
  });

  it('offers the taught date of every month', () => {
    for (const [index, doomsday] of MONTH_DOOMSDAYS.entries()) {
      expect(monthPadDays(index + 1, false)).toContain(doomsday);
    }
  });
});
