/**
 * The Doomsday method itself: century anchors, month doomsdays, and the sum
 * that turns a full date into a weekday.
 *
 * MONTHS ARE 1-BASED HERE. 1 = January, 12 = December. The shipped tables are
 * plain 0-indexed arrays, so they are read as `[month - 1]`; go through the
 * accessors below rather than indexing them by hand.
 *
 * Nothing in this file asks the platform what day a date fell on. The whole
 * point of the app is that the answer comes out of the tables the user is
 * memorising, the same way it comes out of their head.
 */

import type { Code, IndexConvention, YearKey } from './types';
import { codeFor, weekdayName } from './yearCodes';

/** Julian dates are out of scope. 1800 is the floor precisely so they never come up. */
export const MIN_YEAR = 1800;
export const MAX_YEAR = 2199;

/**
 * The date in each month that falls on the year's doomsday, index 0..11.
 * These are the non-leap values; January and February shift in a leap year.
 */
export const MONTH_DOOMSDAYS: readonly number[] = [
  3, // Jan
  28, // Feb
  14, // Mar, "pi day"
  4, // Apr
  9, // May
  6, // Jun
  11, // Jul
  8, // Aug
  5, // Sep
  10, // Oct
  7, // Nov
  12, // Dec
];

/** Index 0..11. */
export const MONTH_NAMES: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * The four Gregorian century anchors, keyed by the century number
 * (18 = the 1800s). They cycle every 400 years; the supported range covers
 * exactly one cycle, so a table is clearer here than the modular formula.
 */
export const CENTURY_ANCHORS: Readonly<Record<number, Code>> = {
  18: 5,
  19: 3,
  20: 2,
  21: 0,
};

/** 1..12, in order. */
export const ALL_MONTHS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** 18..21, in order. */
export const ALL_CENTURIES: readonly number[] = [18, 19, 20, 21];

/** The two months whose doomsday moves in a leap year, and the only two. */
export function doomsdayShifts(month: number): boolean {
  assertMonth(month);
  return month === 1 || month === 2;
}

/* ------------------------------------------------------------------ */
/* Guards                                                              */
/* ------------------------------------------------------------------ */

function assertYear(fullYear: number): void {
  if (!Number.isInteger(fullYear) || fullYear < MIN_YEAR || fullYear > MAX_YEAR) {
    throw new RangeError(`Year outside ${MIN_YEAR}-${MAX_YEAR}: ${fullYear}`);
  }
}

function assertMonth(month: number): void {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Month outside 1-12: ${month}`);
  }
}

/* ------------------------------------------------------------------ */
/* Calendar rules                                                      */
/* ------------------------------------------------------------------ */

/** The full Gregorian rule, century exception included. */
export function isLeapYear(fullYear: number): boolean {
  if (!Number.isInteger(fullYear)) throw new RangeError(`Year is not an integer: ${fullYear}`);
  if (fullYear % 4 !== 0) return false;
  if (fullYear % 100 !== 0) return true;
  return fullYear % 400 === 0;
}

/** 28..31, from the leap flag rather than from a year. Month is 1-based. */
export function monthLength(month: number, leapYear: boolean): number {
  assertMonth(month);
  if (month === 2) return leapYear ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** 28..31. Month is 1-based. */
export function daysInMonth(fullYear: number, month: number): number {
  return monthLength(month, isLeapYear(fullYear));
}

/**
 * The month's doomsday date. January and February are the only two that move:
 * an extra day sits behind them in a leap year, so Jan 3 becomes Jan 4 and the
 * last of February becomes the 29th.
 */
export function monthDoomsday(month: number, leapYear: boolean): number {
  assertMonth(month);
  if (leapYear) {
    if (month === 1) return 4;
    if (month === 2) return 29;
  }
  return MONTH_DOOMSDAYS[month - 1];
}

/**
 * Every date in the month that falls on the year's doomsday, ascending.
 *
 * The table teaches one date per month, but a month has three, four or five of
 * them: dates a whole number of weeks apart are the same weekday, so February's
 * 7th, 14th and 21st sit on the doomsday exactly as its 28th does, and any of
 * them works as the anchor the day step counts from. The taught date is the one
 * with a mnemonic attached, not the only correct one, and a drill that marks
 * the 7th wrong is stating something false about the calendar.
 */
export function doomsdayDates(month: number, leapYear: boolean): readonly number[] {
  const anchor = monthDoomsday(month, leapYear);
  const length = monthLength(month, leapYear);
  const dates: number[] = [];
  for (let day = ((anchor - 1) % 7) + 1; day <= length; day += 7) dates.push(day);
  return dates;
}

/** Whether that date falls on the year's doomsday. Out-of-month days are false. */
export function isDoomsdayDate(month: number, leapYear: boolean, day: number): boolean {
  if (!Number.isInteger(day) || day < 1 || day > monthLength(month, leapYear)) return false;
  return (day - monthDoomsday(month, leapYear)) % 7 === 0;
}

/**
 * How far a day sits from its own month's doomsday, reduced mod 7.
 *
 * The second half of the method, and the half that needs no year: September's
 * doomsday is the 5th, so the 6th is one step past it and the answer is 1. It
 * does not matter which of the month's doomsdays the reader anchors on, which
 * is the point of reducing — the 5th, the 12th, the 19th and the 26th are a
 * whole number of weeks apart, so `6 - 5`, `6 - 12` and `6 - 26` are 1, -6 and
 * -20, and all three are 1 mod 7.
 *
 * The leap flag is not decoration and cannot be defaulted. January and
 * February are the only two months whose doomsday moves, and it moves by a
 * day, so `dateStep(2, 6, false)` is 6 and `dateStep(2, 6, true)` is 5. Any
 * caller asking about those two months has to know which year kind it means.
 */
export function dateStep(month: number, day: number, leapYear: boolean): Code {
  assertMonth(month);
  const length = monthLength(month, leapYear);
  if (!Number.isInteger(day) || day < 1 || day > length) {
    throw new RangeError(`Day outside the month: month ${month}, day ${day}`);
  }
  return ((((day - monthDoomsday(month, leapYear)) % 7) + 7) % 7) as Code;
}

/** 18..21 for the supported range. */
export function centuryOf(fullYear: number): number {
  assertYear(fullYear);
  return Math.floor(fullYear / 100);
}

export function centuryAnchor(fullYear: number): Code {
  return CENTURY_ANCHORS[centuryOf(fullYear)];
}

/** "1900s". */
export function centuryLabel(century: number): string {
  return `${century}00s`;
}

/** The two-digit part of the year, 0..99. */
export function yearKeyOf(fullYear: number): YearKey {
  assertYear(fullYear);
  return fullYear % 100;
}

/** The weekday the year's doomsday falls on: century anchor plus year code. */
export function yearDoomsday(fullYear: number): Code {
  return ((centuryAnchor(fullYear) + codeFor(yearKeyOf(fullYear))) % 7) as Code;
}

/**
 * The whole method in one line: anchor + year code + how far the day sits from
 * that month's doomsday, mod 7.
 */
export function weekdayFor(fullYear: number, month: number, day: number): Code {
  assertYear(fullYear);
  assertMonth(month);
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(fullYear, month)) {
    throw new RangeError(`Day outside the month: ${fullYear}-${month}-${day}`);
  }
  const anchor = CENTURY_ANCHORS[Math.floor(fullYear / 100)];
  const code = codeFor(fullYear % 100);
  const doomsday = monthDoomsday(month, isLeapYear(fullYear));
  return ((((anchor + code + day - doomsday) % 7) + 7) % 7) as Code;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** Month is 1-based. "March". */
export function monthName(month: number): string {
  assertMonth(month);
  return MONTH_NAMES[month - 1];
}

/** "1st", "2nd", "3rd", "4th" … "21st", "31st". Days of a month only, so 1..31. */
export function ordinalDay(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  if (day % 10 === 1) return `${day}st`;
  if (day % 10 === 2) return `${day}nd`;
  if (day % 10 === 3) return `${day}rd`;
  return `${day}th`;
}

/** "14 March 1987". Spelled out, so no reader has to guess day/month order. */
export function formatDate(fullYear: number, month: number, day: number): string {
  return `${day} ${monthName(month)} ${fullYear}`;
}

/** "Sun", "Mon", ... Three letters is unambiguous for all seven. */
export function weekdayAbbr(code: Code, convention: IndexConvention): string {
  return weekdayName(code, convention).slice(0, 3);
}

/**
 * The real name of the day a code stands for.
 *
 * The shipped tables are Sunday-indexed, so a code always names the same day
 * whatever the user's index convention. The convention reorders the seven
 * buttons and nothing else, which is why the worked answer reads its name from
 * here rather than through `weekdayName`.
 */
export function trueWeekdayName(code: Code): string {
  return weekdayName(code, 'sunday');
}

/* ------------------------------------------------------------------ */
/* The worked answer                                                   */
/* ------------------------------------------------------------------ */

export interface WeekdayWorking {
  fullYear: number;
  /** 1-based. */
  month: number;
  day: number;
  leapYear: boolean;
  century: number;
  centuryAnchor: Code;
  yy: YearKey;
  yearCode: Code;
  /** (centuryAnchor + yearCode) mod 7. */
  yearDoomsday: Code;
  monthDoomsday: number;
  /** day − monthDoomsday. Signed, and not yet reduced mod 7. */
  offset: number;
  weekday: Code;
}

/**
 * Every intermediate number for one date. After a wrong answer this is the only
 * thing that tells the user which of the four steps actually failed.
 */
export function explainWeekday(fullYear: number, month: number, day: number): WeekdayWorking {
  const weekday = weekdayFor(fullYear, month, day);
  const leapYear = isLeapYear(fullYear);
  const doomsday = monthDoomsday(month, leapYear);
  return {
    fullYear,
    month,
    day,
    leapYear,
    century: centuryOf(fullYear),
    centuryAnchor: centuryAnchor(fullYear),
    yy: yearKeyOf(fullYear),
    yearCode: codeFor(yearKeyOf(fullYear)),
    yearDoomsday: yearDoomsday(fullYear),
    monthDoomsday: doomsday,
    offset: day - doomsday,
    weekday,
  };
}
