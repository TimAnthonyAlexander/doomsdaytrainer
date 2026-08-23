import type { Code, IndexConvention } from '@/domain/types';
import { weekdayName } from '@/domain/yearCodes';
import { monthLength, weekdayAbbr } from '@/domain/weekday';

/**
 * What the two answer pads offer, and in what order.
 *
 * The seven weekday buttons keep the pad's contract: exactly seven, fixed
 * positions, one tap per answer. `settings.indexConvention` decides which day
 * sits in position 0 — Sunday-indexed puts Sunday first, Monday-indexed puts
 * Monday first — and that is the only thing it changes. The *value* behind a
 * button is always the Sunday-indexed code, because the shipped tables are.
 */

export interface WeekdayOption {
  /** Sunday-indexed weekday code, 0..6. What the tables produce. */
  value: Code;
  /** "Sunday". */
  name: string;
  /** "Sun". The pad's numerals are wide, so the buttons use this. */
  short: string;
}

export function weekdayOptions(convention: IndexConvention): WeekdayOption[] {
  return Array.from({ length: 7 }, (_unused, position) => {
    // Position 0 is Sunday (code 0) or Monday (code 1) depending on convention.
    const value = ((convention === 'monday' ? position + 1 : position) % 7) as Code;
    return {
      value,
      name: weekdayName(value, 'sunday'),
      short: weekdayAbbr(value, 'sunday'),
    };
  });
}

/**
 * The month-doomsday pad: every day the month actually has, 1 to 28, 29, 30 or
 * 31, laid out seven to a row.
 *
 * It used to be the twelve distinct doomsday values — 3, 4, 5, 6, 7, 8, 9, 10,
 * 11, 12, 14 and 28 — on the argument that a permutation of the answers is a
 * forced choice rather than multiple choice with invented distractors. That
 * argument was wrong twice. The set gives February and March away outright,
 * because 28 and 14 are the only two answers nothing else can be; and it
 * cannot express the other correct dates at all, so February's 7th, 14th and
 * 21st were unreachable rather than wrong. Asking over the whole month is the
 * question the method actually poses.
 *
 * Seven columns, so the days a whole week apart line up in one column and the
 * dates that share the doomsday's weekday read as the vertical line they are.
 */
export function monthPadDays(month: number, leapYear: boolean): number[] {
  return Array.from({ length: monthLength(month, leapYear) }, (_unused, index) => index + 1);
}
