import type { Code } from '@/domain/types';
import { monthLength, weekdayAbbr, weekdayName } from '@/domain/weekday';

/**
 * What the two answer pads offer, and in what order.
 *
 * The seven weekday buttons keep the pad's contract: exactly seven, fixed
 * positions, one tap per answer. Sunday sits in position 0 and always has,
 * because the shipped tables are Sunday-indexed and the value behind a button
 * is the code itself.
 *
 * There was a setting that moved Monday into position 0. It renamed the seven
 * buttons and changed no number anywhere else, so a user who picked it read
 * "0 = Monday" on the pad while every century anchor, every worked line and
 * every explanation in the app still counted from Sunday. The positions are
 * fixed now in the one sense that matters: they are the same for everybody.
 */

export interface WeekdayOption {
  /** Sunday-indexed weekday code, 0..6. What the tables produce. */
  value: Code;
  /** "Sunday". */
  name: string;
  /** "Sun". The pad's numerals are wide, so the buttons use this. */
  short: string;
}

export function weekdayOptions(): WeekdayOption[] {
  return Array.from({ length: 7 }, (_unused, position) => {
    const value = position as Code;
    return { value, name: weekdayName(value), short: weekdayAbbr(value) };
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
