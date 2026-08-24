import { describe, expect, it } from 'vitest';
import { MONTH_DOOMSDAYS, doomsdayDates, weekdayFor } from '@/domain/weekday';
import { monthPadDays, weekdayOptions } from './weekdayPad';

describe('weekdayOptions', () => {
  it('is always seven, and always the seven days', () => {
    const options = weekdayOptions();
    expect(options).toHaveLength(7);
    expect(new Set(options.map((o) => o.value)).size).toBe(7);
    expect(new Set(options.map((o) => o.name)).size).toBe(7);
  });

  /**
   * Sunday sits at 0 for everybody. A setting used to move Monday there, and
   * all it moved was the labels: every anchor, every code and every worked line
   * stayed Sunday-indexed, so the pad and the rest of the app disagreed about
   * what 0 meant. There is one order now and the pad's positions are fixed in
   * the sense that matters, which is that they are the same for every user.
   */
  it('starts on Sunday, and the value under a button is the code itself', () => {
    const options = weekdayOptions();
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

  it('keeps the value that matches the method', () => {
    // 14 March 1987 was a Saturday.
    const saturday = weekdayOptions().find((o) => o.name === 'Saturday');
    expect(saturday?.value).toBe(weekdayFor(1987, 3, 14));
  });

  it('abbreviates to three letters, all distinct', () => {
    const shorts = weekdayOptions().map((o) => o.short);
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
