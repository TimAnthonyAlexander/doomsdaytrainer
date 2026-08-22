/**
 * One date walked all the way to its weekday, nine steps, every step answered
 * by the user.
 *
 * The rest of the app trains the pieces: `calc.ts` derives a year code,
 * `dayStep.ts` times the last count, `weekday.ts` holds the tables. This file
 * puts the whole chain on one rail so somebody who knows none of it can produce
 * the weekday of their own birthday. It computes nothing new — every number
 * comes out of the functions those files already export — and its only real
 * work is saying, in order, what is being asked and which numbers the asking
 * rests on.
 *
 * Two rules shape it.
 *
 * **Nothing is revealed that the user could work out.** The year code in
 * particular is derived here, never handed over, because handing it over turns
 * the whole walk into a lookup with extra steps.
 *
 * **No step is dropped.** Some dates make a step a no-op: a year under 28 has
 * no whole 28s to take off, and a day that *is* the month's doomsday is nothing
 * to count. Those steps stay, as a line to read rather than a question whose
 * answer is forced. The count is nine for every date in range, so the walk is
 * one shape and the user is never quietly skipped past a piece of the method.
 *
 * The leap-day step is asked even when it answers zero. That is not an
 * oversight: `calc.ts`'s own leap step has no degenerate branch, because
 * "3 ÷ 4 = 0 remainder 3, so 0" is a division and a discarding, both of which
 * are work. What `reduce` does for a year under 28 is nothing at all, and
 * `stepDirection` in `dayStep.ts` goes further and *throws* when the target is
 * the doomsday itself, which is that file saying a zero-day move is not a step.
 * Those two are the no-ops; the leap count is not one.
 *
 * Pure and framework-free. No `Math.random`, no `Date.now` — `guidedClosingLine`
 * takes the clock as an argument so the tense of one sentence cannot smuggle a
 * dependency in here.
 */

import { cyclesRemoved, leapDays, rawSum, reduce28, sevenStep } from './calc';
import { anchorMonthLabel, ordinal, stepSize } from './dayStep';
import type { CalendarDate, Code, YearKey } from './types';
import {
  CENTURY_ANCHORS,
  MAX_YEAR,
  MIN_YEAR,
  centuryAnchor,
  centuryLabel,
  centuryOf,
  daysInMonth,
  formatDate,
  isLeapYear,
  monthDoomsday,
  monthName,
  trueWeekdayName,
  weekdayFor,
  yearKeyOf,
} from './weekday';
import { formatYear } from './yearCodes';

/* ------------------------------------------------------------------ */
/* Shape                                                               */
/* ------------------------------------------------------------------ */

export type GuidedStepId =
  | 'anchor'
  | 'reduce'
  | 'leap'
  | 'yearCode'
  | 'yearDoomsday'
  | 'monthDoomsday'
  | 'dayStep'
  | 'final'
  | 'weekday';

/** In the order they are worked. Nine, for every date in range. */
export const GUIDED_STEP_IDS: readonly GuidedStepId[] = [
  'anchor',
  'reduce',
  'leap',
  'yearCode',
  'yearDoomsday',
  'monthDoomsday',
  'dayStep',
  'final',
  'weekday',
];

export const GUIDED_STEP_COUNT = GUIDED_STEP_IDS.length;

/**
 * Which control can take the answer.
 *
 * `code` is the shared seven-button pad, 0-6. `weekday` is the same pad with
 * the seven weekday names on it. `monthDate` is the twelve-button month pad.
 * `count` is a typed field, for the two answers no pad can hold: a year reduced
 * below 28, and the one date the month pad has no button for (see the note on
 * February in a leap year, below).
 */
export type GuidedInput = 'code' | 'count' | 'monthDate' | 'weekday';

/** The reference table this step needs on screen, or null. */
export type GuidedTable = 'century' | 'month' | null;

export interface GuidedGiven {
  label: string;
  value: string;
  /**
   * The step whose answer this value is, or null when the date itself supplies
   * it. This is what makes the chain assertable: a given that claims to carry
   * an earlier answer must actually equal it, or the user has been handed a
   * number that contradicts what they just said.
   */
  from: GuidedStepId | null;
}

export interface GuidedStep {
  id: GuidedStepId;
  /** 1-based, and always 1..9. No date changes the count. */
  position: number;
  /** Two or three words naming the step. */
  title: string;
  /**
   * True when this date makes the step a no-op. The screen states `question`
   * and moves on rather than asking it.
   */
  noop: boolean;
  /** The ask, or for a no-op step the statement that stands in its place. */
  question: string;
  /** Every number the step rests on, each with the label naming it. */
  givens: readonly GuidedGiven[];
  table: GuidedTable;
  input: GuidedInput;
  /** The largest answer this kind of step can have. Only `count` reads it. */
  max: number;
  answer: number;
  /** What the answer is. Never omitted; a bare number teaches nothing. */
  answerLabel: string;
  /** The worked line, shown after a wrong answer and after a right one. */
  working: string;
  /** Why the step exists, in one or two plain sentences. */
  why: string;
  /** One sentence naming what the answer has just produced, or null. */
  result: string | null;
  /** Something about this date that changes the step, or null. */
  note: string | null;
}

export interface GuidedWalk {
  date: CalendarDate;
  leapYear: boolean;
  /** Sunday-indexed, like every code in the app. */
  weekday: Code;
  /** "Friday". The convention never changes this — see `trueWeekdayName`. */
  weekdayName: string;
  /** "20 March 1987". */
  dateLabel: string;
  /** Exactly `GUIDED_STEP_COUNT`, in `GUIDED_STEP_IDS` order. */
  steps: readonly GuidedStep[];
}

/* ------------------------------------------------------------------ */
/* Copy helpers                                                        */
/* ------------------------------------------------------------------ */

/** "7 × 3 = 21. 23 − 21 = 2." Or, under seven, that nothing comes off. */
function sevensLine(sum: number): string {
  const { multiple, remainder } = sevenStep(sum);
  if (multiple === 0) return `${sum} is under 7 already, so nothing comes off and the answer is ${sum}.`;
  return `7 × ${multiple / 7} = ${multiple}. ${sum} − ${multiple} = ${remainder}.`;
}

/**
 * A signed number with a real minus sign in front of it. The arithmetic above
 * uses U+2212 throughout, and a hyphen next to it reads as a shorter dash on
 * the same line.
 */
function signed(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

/** "once", "twice", "3 times". A month is 31 days, so this never runs past 4. */
function times(n: number): string {
  if (n === 1) return 'once';
  if (n === 2) return 'twice';
  return `${n} times`;
}

/** "3 + 0 = 3. 3 is under 7 already, ..." */
function addAndReduce(a: number, b: number): string {
  return `${a} + ${b} = ${a + b}. ${sevensLine(a + b)}`;
}

/**
 * A week is seven days, so this reason is the same one four times over. It is
 * repeated rather than cross-referenced because a user on step 8 should not
 * have to remember what step 4 said.
 */
const SEVENS_WHY =
  'A week is 7 days long, so taking a whole 7 away lands on the same weekday. Only what is left over counts.';

/* ------------------------------------------------------------------ */
/* The steps                                                           */
/* ------------------------------------------------------------------ */

function anchorStep(fullYear: number): GuidedStep {
  const century = centuryOf(fullYear);
  const anchor = centuryAnchor(fullYear);
  return {
    id: 'anchor',
    position: 1,
    title: 'Century anchor',
    noop: false,
    question: `Which anchor does ${fullYear} use?`,
    givens: [{ label: 'Your year', value: String(fullYear), from: null }],
    table: 'century',
    input: 'code',
    max: 6,
    answer: anchor,
    answerLabel: 'Century anchor',
    working: `${fullYear} is in the ${centuryLabel(century)}. That century's anchor is ${anchor}.`,
    why: 'Each century counts from its own weekday. The four repeat every 400 years, so there are only ever these four.',
    result: `The anchor for the ${centuryLabel(century)} is ${anchor}.`,
    note: null,
  };
}

function reduceStep(yy: YearKey): GuidedStep {
  const cycles = cyclesRemoved(yy);
  const reduced = reduce28(yy);
  const noop = cycles === 0;
  return {
    id: 'reduce',
    position: 2,
    title: 'Take off the 28s',
    noop,
    question: noop
      ? `${formatYear(yy)} is under 28 already, so there are no whole 28s to take off. The year to work with is ${reduced}.`
      : `Take whole 28s out of ${formatYear(yy)}. What is left?`,
    givens: [{ label: 'Year, last two digits', value: formatYear(yy), from: null }],
    table: null,
    input: 'count',
    max: 27,
    answer: reduced,
    answerLabel: 'Year to work with',
    working: noop
      ? `${formatYear(yy)} is under 28 on its own, so ${reduced}.`
      : `${yy} − ${cycles} × 28 = ${reduced}.`,
    why: 'The codes repeat every 28 years. Twenty-eight years hold exactly 7 leap days, and 28 + 7 = 35, which is five whole weeks. So the smaller year has the same code as the bigger one.',
    result: null,
    note: null,
  };
}

function leapStep(reduced: YearKey): GuidedStep {
  const leaps = leapDays(reduced);
  const over = reduced % 4;
  return {
    id: 'leap',
    position: 3,
    title: 'Leap days',
    noop: false,
    question: `How many leap days have gone by in ${reduced} years? Divide by 4 and drop the remainder.`,
    givens: [{ label: 'Year to work with', value: String(reduced), from: 'reduce' }],
    table: null,
    input: 'code',
    max: 6,
    answer: leaps,
    answerLabel: 'Leap days',
    working:
      over === 0
        ? `${reduced} ÷ 4 = ${leaps} exactly, so ${leaps}.`
        : `${reduced} ÷ 4 = ${leaps} remainder ${over}, so ${leaps}.`,
    why: 'Every fourth year carries an extra day, and that day pushes the weekday one further on. Part of a fourth year does not, so the remainder is dropped.',
    result: null,
    note: null,
  };
}

function yearCodeStep(yy: YearKey, reduced: YearKey): GuidedStep {
  const leaps = leapDays(reduced);
  const sum = rawSum(reduced);
  const code = sevenStep(sum).remainder;
  return {
    id: 'yearCode',
    position: 4,
    title: 'The year code',
    noop: false,
    question: `Add them, then take the sevens off: ${reduced} + ${leaps}.`,
    givens: [
      { label: 'Year to work with', value: String(reduced), from: 'reduce' },
      { label: 'Leap days', value: String(leaps), from: 'leap' },
    ],
    table: null,
    input: 'code',
    max: 6,
    answer: code,
    answerLabel: 'Year code',
    working: addAndReduce(reduced, leaps),
    why: `Each year moves the weekday on by one, and each leap day moves it on once more. ${SEVENS_WHY}`,
    result: `The year code for ${formatYear(yy)} is ${code}.`,
    note: null,
  };
}

function yearDoomsdayStep(fullYear: number): GuidedStep {
  const century = centuryOf(fullYear);
  const anchor = centuryAnchor(fullYear);
  const yy = yearKeyOf(fullYear);
  const code = sevenStep(rawSum(reduce28(yy))).remainder;
  const doomsday = sevenStep(anchor + code).remainder;
  return {
    id: 'yearDoomsday',
    position: 5,
    title: "The year's doomsday",
    noop: false,
    question: `Add them, then take the sevens off: ${anchor} + ${code}.`,
    givens: [
      { label: `Century anchor, ${centuryLabel(century)}`, value: String(anchor), from: 'anchor' },
      { label: `Year code, ${formatYear(yy)}`, value: String(code), from: 'yearCode' },
    ],
    table: null,
    input: 'code',
    max: 6,
    answer: doomsday,
    answerLabel: `Doomsday in ${fullYear}`,
    working: addAndReduce(anchor, code),
    why: `The anchor says where the century starts and the year code says how far into it you are. ${SEVENS_WHY}`,
    result: `Every doomsday in ${fullYear} falls on ${doomsday}.`,
    note: null,
  };
}

/**
 * February in a leap year answers the 29th, and the twelve-button month pad has
 * no 29 on it: its buttons are the twelve values the shipped table takes, and
 * the leap doomsdays are the two that move off that table. Rather than growing
 * a thirteenth button — which would change the shape of a pad that exists
 * everywhere else at twelve — that one case is typed, which is what the typed
 * field is for.
 */
function monthDoomsdayStep(fullYear: number, month: number, leapYear: boolean): GuidedStep {
  const doomsday = monthDoomsday(month, leapYear);
  const moves = leapYear && month <= 2;
  return {
    id: 'monthDoomsday',
    position: 6,
    title: 'The month doomsday',
    noop: false,
    question: `Which date in ${monthName(month)} falls on that doomsday?`,
    givens: [{ label: 'Your month', value: monthName(month), from: null }],
    table: 'month',
    input: moves && month === 2 ? 'count' : 'monthDate',
    max: 29,
    answer: doomsday,
    answerLabel: `${monthName(month)} doomsday`,
    working: `In ${anchorMonthLabel({ month, leapYear, anchorDay: doomsday, anchorWeekday: 0, targetDay: doomsday })}, the doomsday is the ${ordinal(doomsday)}.`,
    why: 'Every month has one date that lands on the year doomsday. The twelve are on the table, and the table is the same every year.',
    result: null,
    note: moves
      ? `${fullYear} is a leap year. The extra day sits behind January and February, so the dates the table gives for those two months do not hold this year.`
      : null,
  };
}

function dayStepStep(month: number, leapYear: boolean, day: number): GuidedStep {
  const anchorDay = monthDoomsday(month, leapYear);
  const offset = day - anchorDay;
  const size = anchorDay === day ? 0 : stepSize(anchorDay, day);
  const givens: GuidedGiven[] = [
    { label: `${monthName(month)} doomsday`, value: String(anchorDay), from: 'monthDoomsday' },
    { label: 'Day you want', value: String(day), from: null },
  ];

  if (offset === 0) {
    return {
      id: 'dayStep',
      position: 7,
      title: 'Days from the doomsday',
      noop: true,
      question: `The ${ordinal(day)} is ${monthName(month)}'s doomsday itself, so there is nothing to count. The step is 0.`,
      givens,
      table: null,
      input: 'code',
      max: 6,
      answer: 0,
      answerLabel: 'Days from the doomsday',
      working: `${day} − ${anchorDay} = 0.`,
      why: 'Seven days on, or seven days back, is the same weekday. So only what is left after the sevens matters.',
      result: null,
      note: null,
    };
  }

  const sevens = offset > 0 ? Math.floor(offset / 7) : Math.ceil(-offset / 7);
  const working =
    offset > 0
      ? sevens === 0
        ? `${day} − ${anchorDay} = ${offset}. That is already between 0 and 6, so the step is ${size}.`
        : `${day} − ${anchorDay} = ${offset}. Take 7 away ${times(sevens)}: ${offset} − ${sevens * 7} = ${size}.`
      : `${day} − ${anchorDay} = ${signed(offset)}. Add 7 ${times(sevens)}: ${signed(offset)} + ${sevens * 7} = ${size}.`;

  return {
    id: 'dayStep',
    position: 7,
    title: 'Days from the doomsday',
    noop: false,
    question: `Work out ${day} − ${anchorDay}, then add or take away sevens until you have a number from 0 to 6.`,
    givens,
    table: null,
    input: 'code',
    max: 6,
    answer: size,
    answerLabel: 'Days from the doomsday',
    working,
    why: 'Seven days on, or seven days back, is the same weekday. So only what is left after the sevens matters.',
    result: null,
    note: null,
  };
}

function finalStep(fullYear: number, month: number, leapYear: boolean, day: number): GuidedStep {
  const anchor = centuryAnchor(fullYear);
  const code = sevenStep(rawSum(reduce28(yearKeyOf(fullYear)))).remainder;
  const doomsday = sevenStep(anchor + code).remainder;
  const anchorDay = monthDoomsday(month, leapYear);
  const size = anchorDay === day ? 0 : stepSize(anchorDay, day);
  const weekday = sevenStep(doomsday + size).remainder;
  return {
    id: 'final',
    position: 8,
    title: 'The weekday number',
    noop: false,
    question: `Add them, then take the sevens off: ${doomsday} + ${size}.`,
    givens: [
      { label: `Doomsday in ${fullYear}`, value: String(doomsday), from: 'yearDoomsday' },
      { label: 'Days from the doomsday', value: String(size), from: 'dayStep' },
    ],
    table: null,
    input: 'code',
    max: 6,
    answer: weekday,
    answerLabel: 'Weekday number',
    working: addAndReduce(doomsday, size),
    why: `The doomsday number says where the year sits, and the step moves you off it to your day. ${SEVENS_WHY}`,
    result: null,
    note: null,
  };
}

function weekdayStep(fullYear: number, month: number, day: number): GuidedStep {
  const weekday = weekdayFor(fullYear, month, day);
  return {
    id: 'weekday',
    position: 9,
    title: 'The day',
    noop: false,
    question: `Which day is ${weekday}?`,
    givens: [{ label: 'Weekday number', value: String(weekday), from: 'final' }],
    table: null,
    input: 'weekday',
    max: 6,
    answer: weekday,
    answerLabel: 'The day',
    working: `${weekday} is ${trueWeekdayName(weekday)}.`,
    why: 'Every number in these steps counts from Sunday, so 0 is Sunday and 6 is Saturday. The buttons can start the week on Sunday or on Monday. That moves the buttons and nothing else.',
    result: null,
    note: null,
  };
}

/* ------------------------------------------------------------------ */
/* The walk                                                            */
/* ------------------------------------------------------------------ */

/**
 * The whole method for one date, as nine labelled steps.
 *
 * Throws for a date outside 1800-2199 or for a day the month does not have,
 * which is `weekdayFor`'s range and the only range the calendar maths is tested
 * across. Callers take dates from a control that clamps; this is the backstop.
 */
export function guidedWalk(date: CalendarDate): GuidedWalk {
  const { fullYear, month, day } = date;
  const weekday = weekdayFor(fullYear, month, day);
  const leapYear = isLeapYear(fullYear);
  const yy = yearKeyOf(fullYear);
  const reduced = reduce28(yy);

  return {
    date,
    leapYear,
    weekday,
    weekdayName: trueWeekdayName(weekday),
    dateLabel: formatDate(fullYear, month, day),
    steps: [
      anchorStep(fullYear),
      reduceStep(yy),
      leapStep(reduced),
      yearCodeStep(yy, reduced),
      yearDoomsdayStep(fullYear),
      monthDoomsdayStep(fullYear, month, leapYear),
      dayStepStep(month, leapYear, day),
      finalStep(fullYear, month, leapYear, day),
      weekdayStep(fullYear, month, day),
    ],
  };
}

/**
 * "20 March 1987 was a Friday."
 *
 * The tense is the only thing the clock is needed for, and the range runs to
 * 2199, so "was" would be wrong for most of it. `now` is passed in rather than
 * read, because nothing in this layer reads a clock.
 */
export function guidedClosingLine(walk: GuidedWalk, now: number): string {
  const today = new Date(now);
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const dateMs = Date.UTC(walk.date.fullYear, walk.date.month - 1, walk.date.day);
  const verb = dateMs < todayMs ? 'was' : dateMs > todayMs ? 'will be' : 'is';
  return `${walk.dateLabel} ${verb} a ${walk.weekdayName}.`;
}

/** The four century anchors, in order, for the table on step 1. */
export function centuryAnchorRows(): { century: number; label: string; anchor: Code }[] {
  return Object.keys(CENTURY_ANCHORS)
    .map(Number)
    .sort((a, b) => a - b)
    .map((century) => ({ century, label: centuryLabel(century), anchor: CENTURY_ANCHORS[century] }));
}

/** True when the date is one this walk can take: in range, and a real day. */
export function isWalkableDate(date: CalendarDate): boolean {
  const { fullYear, month, day } = date;
  if (!Number.isInteger(fullYear) || fullYear < MIN_YEAR || fullYear > MAX_YEAR) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  return Number.isInteger(day) && day >= 1 && day <= daysInMonth(fullYear, month);
}
