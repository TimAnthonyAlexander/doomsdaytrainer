/**
 * The method's two halves, each asked on its own.
 *
 * The whole calculation is
 *
 *     weekday = (century anchor + year code + day - month doomsday) mod 7
 *
 * and it splits cleanly down the middle, because addition mod 7 is
 * associative. The left half needs only the year:
 *
 *     year part = (century anchor + year code) mod 7
 *
 * which is the weekday that year's doomsday falls on. The right half needs
 * only the month and the day:
 *
 *     date part = (day - month doomsday) mod 7
 *
 * which is how many days on from the doomsday the date sits. Add the two and
 * reduce, and you are back at the weekday — `weekdayFor` and nothing else
 * decides that, and a test walks a full Gregorian cycle proving the two halves
 * recombine into it.
 *
 * Both are worth drilling apart, and the full-date trainer cannot tell them
 * apart: an answer that took six seconds spent them somewhere, and "somewhere"
 * is two lookups and two sums. This is the same argument the day-step trainer
 * was built on, one level up — that one isolates the final count given a
 * weekday, these two isolate each half of the arithmetic that produces one.
 *
 * Both answers are Sunday-indexed numbers 0 to 6, like every intermediate
 * number in the app. `settings.indexConvention` renames weekdays and changes
 * no number anywhere (invariant 8), and the century anchors are shipped
 * Sunday-indexed, which is why the Tables drill asks for them as plain digits
 * too. Nothing here is a weekday name, so nothing here reads the convention.
 *
 * Nothing in this file is timed, stored or scheduled. It is arithmetic and the
 * labels that say what each number is.
 */

import type { Code, YearKey } from './types';
import { codeFor, formatYear } from './yearCodes';
import {
  centuryAnchor,
  centuryLabel,
  centuryOf,
  dateStep,
  doomsdayShifts,
  monthDoomsday,
  monthLength,
  monthName,
  trueWeekdayName,
  yearDoomsday,
  yearKeyOf,
} from './weekday';

/** Which half of the method is being asked for. */
export type MethodPart = 'year' | 'date';

/** Both halves, in the order the calculation needs them. */
export const METHOD_PARTS: readonly MethodPart[] = ['year', 'date'];

/* ------------------------------------------------------------------ */
/* Questions                                                           */
/* ------------------------------------------------------------------ */

/** One year, and nothing else. The month and the day are not asked. */
export interface YearPartQuestion {
  /** 1800..2199. */
  fullYear: number;
}

/**
 * One month and one day, and no year at all.
 *
 * `leapYear` is carried even though ten of the twelve months ignore it,
 * because the two that do not are the two the prompt has to disclose. A
 * question is not answerable without it for January and February, and stating
 * it for the other ten would imply it mattered there.
 */
export interface DatePartQuestion {
  /** 1..12, 1 = January. */
  month: number;
  day: number;
  leapYear: boolean;
}

/** Whether the prompt has to say which kind of year it means. Jan and Feb only. */
export function datePartStatesYearKind(month: number): boolean {
  return doomsdayShifts(month);
}

/* ------------------------------------------------------------------ */
/* Answers                                                             */
/* ------------------------------------------------------------------ */

/** The weekday that year's doomsday falls on: anchor plus code, reduced. */
export function yearPartAnswer(question: YearPartQuestion): Code {
  return yearDoomsday(question.fullYear);
}

/** How far the day sits from the month's doomsday, reduced. */
export function datePartAnswer(question: DatePartQuestion): Code {
  return dateStep(question.month, question.day, question.leapYear);
}

/* ------------------------------------------------------------------ */
/* The worked answer                                                   */
/* ------------------------------------------------------------------ */

/** One row of the working. Every value is named by its label (invariant 7). */
export interface MethodPartLine {
  label: string;
  /** Where the value came from. */
  expression: string;
  value: string;
}

export interface YearPartWorking {
  fullYear: number;
  century: number;
  centuryAnchor: Code;
  yy: YearKey;
  yearCode: Code;
  answer: Code;
  lines: MethodPartLine[];
}

export interface DatePartWorking {
  month: number;
  day: number;
  leapYear: boolean;
  monthDoomsday: number;
  /** `day - monthDoomsday`. Signed, and not yet reduced. */
  offset: number;
  answer: Code;
  lines: MethodPartLine[];
}

/**
 * The year half, in three labelled rows.
 *
 * A wrong answer has exactly two places to have come from — the anchor or the
 * code — so both are named before the sum that used them. The weekday name is
 * on the last row because the number this half produces *is* a weekday, and a
 * reader who knows 1973's doomsday was a Wednesday can check the 3 against
 * something they already hold.
 */
export function explainYearPart(question: YearPartQuestion): YearPartWorking {
  const { fullYear } = question;
  const century = centuryOf(fullYear);
  const anchor = centuryAnchor(fullYear);
  const yy = yearKeyOf(fullYear);
  const code = codeFor(yy);
  const answer = yearDoomsday(fullYear);

  return {
    fullYear,
    century,
    centuryAnchor: anchor,
    yy,
    yearCode: code,
    answer,
    lines: [
      { label: 'Century anchor', expression: centuryLabel(century), value: String(anchor) },
      { label: 'Year code', expression: formatYear(yy), value: String(code) },
      {
        label: "The year's doomsday",
        expression: `${anchor} + ${code} mod 7`,
        value: `${answer}  ${trueWeekdayName(answer)}`,
      },
    ],
  };
}

/**
 * The date half, in three labelled rows.
 *
 * The subtraction is shown before the reduction rather than folded into one
 * `(6 - 5) mod 7`, because those are the two separate things that go wrong:
 * reading the month's doomsday off the wrong row, and mishandling a negative.
 * The month row names the leap case only for the two months it moves.
 */
export function explainDatePart(question: DatePartQuestion): DatePartWorking {
  const { month, day, leapYear } = question;
  const doomsday = monthDoomsday(month, leapYear);
  const offset = day - doomsday;
  const answer = dateStep(month, day, leapYear);
  const label = datePartMonthLabel(month, leapYear);

  return {
    month,
    day,
    leapYear,
    monthDoomsday: doomsday,
    offset,
    answer,
    lines: [
      { label: 'Month doomsday', expression: label, value: String(doomsday) },
      {
        label: 'Days from the doomsday',
        expression: `${day} - ${doomsday}`,
        value: String(offset),
      },
      { label: 'Step, mod 7', expression: `${offset} mod 7`, value: String(answer) },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

/** "September", or "February, leap year" for the two months that move. */
export function datePartMonthLabel(month: number, leapYear: boolean): string {
  return leapYear && datePartStatesYearKind(month)
    ? `${monthName(month)}, leap year`
    : monthName(month);
}

/**
 * The prompt itself. "September 6", and "February 6, leap year" where the year
 * kind is load-bearing.
 *
 * Deliberately not an ordinal: the pad below it answers in plain digits and
 * the prompt above it is a date, so "September 6th" beside a row of bare
 * numerals reads as two different kinds of number for no reason.
 */
export function datePartPrompt(question: DatePartQuestion): string {
  const { month, day, leapYear } = question;
  const suffix = leapYear && datePartStatesYearKind(month) ? ', leap year' : '';
  return `${monthName(month)} ${day}${suffix}`;
}

/** Every day the month has, which is every legal question about it. */
export function datePartDays(month: number, leapYear: boolean): number[] {
  return Array.from({ length: monthLength(month, leapYear) }, (_unused, index) => index + 1);
}

/** What each half is called on screen, and what it asks for. */
export function methodPartLabel(part: MethodPart): string {
  return part === 'year' ? 'Year' : 'Date';
}

/** The question, in words, for the line above the pad. */
export function methodPartQuestion(part: MethodPart): string {
  return part === 'year'
    ? "Which weekday is that year's doomsday?"
    : "How many days on from that month's doomsday?";
}
