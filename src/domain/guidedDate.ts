/**
 * One date walked all the way to its weekday, twelve steps, every one of them
 * answered by the user.
 *
 * This is a demonstration, not a trainer. Somebody who has never heard of the
 * Doomsday method has to be able to finish it, so **every question is either
 * arithmetic on numbers already on the screen, or "which weekday is N"**. The
 * app supplies every lookup, every table value and every name. The user
 * supplies sums.
 *
 * That rule is structural rather than a matter of care. Each step carries a
 * `GuidedAsk` — the sum itself, as data — and the step's `answer` is
 * `askAnswer(ask)` rather than a number written out beside it. `askOperands`
 * then names exactly which numbers the question rests on, and every one of them
 * appears in `givens`, which is what the screen prints. A step that asked for
 * something the user could not see would fail that check rather than merely
 * read badly. See `guidedDate.test.ts`.
 *
 * Two more rules shape it.
 *
 * **The rhythm never changes.** Add, then take the sevens off, as two separate
 * questions, even when the sum is already under seven. A step that sometimes
 * disappears is a step the hand stops expecting.
 *
 * **No step is dropped.** A year under 28 has no whole 28s to take off. That
 * step stays, as a line to read rather than a question whose answer is forced.
 * The count is twelve for every date in range, so the progress indicator never
 * lies and the user is never quietly skipped past a piece of the method.
 *
 * The one question that is not arithmetic is step 8, and it is a comparison of
 * four or five numbers printed on the screen rather than a concept: which of
 * this month's doomsday dates is closest to your date without going past it.
 *
 * Pure and framework-free. No `Math.random`, no `Date.now` — `guidedClosingLine`
 * takes the clock as an argument so the tense of one sentence cannot smuggle a
 * dependency in here.
 */

import { CYCLE, cyclesRemoved, leapDays, reduce28, sevenStep } from './calc';
import { ordinal } from './dayStep';
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
  | 'reduce'
  | 'leap'
  | 'sum'
  | 'yearCode'
  | 'anchorSum'
  | 'yearDoomsday'
  | 'doomsdayName'
  | 'nearest'
  | 'daysOn'
  | 'weekdaySum'
  | 'weekdayCode'
  | 'weekdayName';

/** In the order they are worked. Twelve, for every date in range. */
export const GUIDED_STEP_IDS: readonly GuidedStepId[] = [
  'reduce',
  'leap',
  'sum',
  'yearCode',
  'anchorSum',
  'yearDoomsday',
  'doomsdayName',
  'nearest',
  'daysOn',
  'weekdaySum',
  'weekdayCode',
  'weekdayName',
];

export const GUIDED_STEP_COUNT = GUIDED_STEP_IDS.length;

/**
 * Which control can take the answer.
 *
 * `code` is the shared seven-button pad, 0-6. `weekday` is the same pad with
 * the seven weekday names on it. `choice` is one button per doomsday date in
 * the month, four or five of them. `count` is a typed field, for the four sums
 * that can run past six.
 */
export type GuidedInput = 'code' | 'count' | 'choice' | 'weekday';

/** The reference table this step needs on screen, or null. */
export type GuidedTable = 'century' | 'month' | null;

/**
 * The question itself, as data rather than as a sentence.
 *
 * `question` is what the screen prints; this is what the screen prints *about*.
 * Keeping the two separate is what lets a test assert that no question ever
 * needs a number the user cannot see: the operands are enumerable.
 *
 * The divisor in `quarter` and the modulus in `sevens` are part of the
 * operation rather than operands taken off the screen. Four is in "divide by
 * four" and seven is in "a week is seven days"; neither is a value the user has
 * to have produced.
 */
export type GuidedAsk =
  | { kind: 'add'; left: number; right: number }
  | { kind: 'subtract'; left: number; right: number }
  | { kind: 'quarter'; left: number }
  | { kind: 'sevens'; left: number }
  | { kind: 'name'; code: Code }
  | { kind: 'nearest'; options: readonly number[]; ceiling: number };

/** What a question comes out at. Every step's `answer` is this and nothing else. */
export function askAnswer(ask: GuidedAsk): number {
  switch (ask.kind) {
    case 'add':
      return ask.left + ask.right;
    case 'subtract':
      return ask.left - ask.right;
    case 'quarter':
      return Math.floor(ask.left / 4);
    case 'sevens':
      return sevenStep(ask.left).remainder;
    case 'name':
      return ask.code;
    case 'nearest': {
      const under = ask.options.filter((option) => option <= ask.ceiling);
      if (under.length === 0) throw new RangeError(`No option at or below ${ask.ceiling}`);
      return Math.max(...under);
    }
  }
}

/**
 * Every number the question rests on. All of them must be printed by the step
 * that asks it, or the user is being asked to supply something the app never
 * gave them. That is the property `guidedDate.test.ts` pins.
 */
export function askOperands(ask: GuidedAsk): number[] {
  switch (ask.kind) {
    case 'add':
    case 'subtract':
      return [ask.left, ask.right];
    case 'quarter':
    case 'sevens':
      return [ask.left];
    case 'name':
      return [ask.code];
    case 'nearest':
      return [...ask.options, ask.ceiling];
  }
}

export interface GuidedGiven {
  label: string;
  /** One number, or a comma-separated list of them. Always printed. */
  value: string;
  /**
   * The step whose answer this value is, or null when the date or a shipped
   * table supplies it. This is what makes the chain assertable: a given that
   * claims to carry an earlier answer must actually equal it, or the user has
   * been handed a number that contradicts what they just said.
   */
  from: GuidedStepId | null;
}

export interface GuidedStep {
  id: GuidedStepId;
  /** 1-based, and always 1..12. No date changes the count. */
  position: number;
  /** Two or three words naming the step. */
  title: string;
  /**
   * True when this date makes the step a no-op. The screen states `question`
   * and moves on rather than asking it. Exactly the steps with no `ask`.
   */
  noop: boolean;
  /** The ask, or for a no-op step the statement that stands in its place. */
  question: string;
  /** The sum behind `question`, or null when the step is a line to read. */
  ask: GuidedAsk | null;
  /** Every number the step puts on screen, each with the label naming it. */
  givens: readonly GuidedGiven[];
  table: GuidedTable;
  input: GuidedInput;
  /** The largest answer this kind of step can have. `count` and `choice` read it. */
  max: number;
  /** The buttons, for a `choice` step. Empty for every other input. */
  choices: readonly number[];
  answer: number;
  /** What the answer is. Never omitted; a bare number teaches nothing. */
  answerLabel: string;
  /** The worked line, shown after a wrong answer and after a right one. */
  working: string;
  /** One short line of narration, before the question. */
  why: string;
  /** One sentence naming what the answer has just produced, or null. */
  result: string | null;
  /** Something about this date that changes the step, or null. */
  note: string | null;
  /** The equation slot this step completes, or null when it is a middle sum. */
  fills: GuidedSlotId | null;
  /** The slot the step is working toward. The equation strip marks it. */
  solving: GuidedSlotId;
}

/* ------------------------------------------------------------------ */
/* The equations                                                       */
/* ------------------------------------------------------------------ */

/**
 * A named place in the three equations.
 *
 * The strip shows the whole computation from the first screen, with the pieces
 * that are not known yet standing empty, so the user can always see the shape
 * of what they are building and where inside it they are. Which slot holds what,
 * and when, is derived from the step sequence rather than decided by the
 * component — the same reason table maths lives here and not in a screen.
 */
export type GuidedSlotId =
  | 'reduced'
  | 'leapDays'
  | 'yearCode'
  | 'day'
  | 'nearest'
  | 'daysOn'
  | 'anchor'
  | 'weekday';

export interface GuidedTerm {
  kind: 'term';
  slot: GuidedSlotId;
  /** Names the number, per invariant 7. Never empty, filled or not. */
  label: string;
  value: string;
  /** What stands in the slot before it is produced, or null for a plain dash. */
  pending: string | null;
  /** The step that produces it, or null when the date or a table supplies it. */
  from: GuidedStepId | null;
}

export interface GuidedOperator {
  kind: 'op';
  text: string;
}

export type GuidedPart = GuidedTerm | GuidedOperator;

/** `result = parts`. The result sits on the left, as the three lines read. */
export interface GuidedEquation {
  result: GuidedTerm;
  parts: readonly GuidedPart[];
}

function isTerm(part: GuidedPart): part is GuidedTerm {
  return part.kind === 'term';
}

/** Every slot an equation names, the result first. */
export function equationTerms(equation: GuidedEquation): GuidedTerm[] {
  return [equation.result, ...equation.parts.filter(isTerm)];
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
  /** Year code, days on, weekday. All three visible from the first screen. */
  equations: readonly GuidedEquation[];
}

/**
 * Which slots stand filled once `stepsDone` steps have been answered.
 *
 * A slot the date supplies is filled from the start. Everything else appears
 * exactly when the step that produces it is behind the user, which is the whole
 * contract of the strip: never filled early, never empty late.
 */
export function filledSlots(walk: GuidedWalk, stepsDone: number): Set<GuidedSlotId> {
  const done = new Set(walk.steps.slice(0, Math.max(0, stepsDone)).map((step) => step.id));
  const filled = new Set<GuidedSlotId>();
  for (const equation of walk.equations) {
    for (const term of equationTerms(equation)) {
      if (term.from === null || done.has(term.from)) filled.add(term.slot);
    }
  }
  return filled;
}

/* ------------------------------------------------------------------ */
/* Copy helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * A week is seven days, so this line is the same one three times over. It is
 * repeated rather than cross-referenced because a user on step 11 should not
 * have to remember what step 4 said.
 */
const SEVENS_WHY = 'A week is 7 days, so whole sevens change nothing.';

const NAMING_WHY = 'The numbers count from Sunday, so 0 is Sunday and 6 is Saturday.';

/** "12 − 7 = 5.", or that nothing comes off. */
function sevensLine(sum: number): string {
  const { multiple, remainder } = sevenStep(sum);
  if (multiple === 0) return `${sum} is under 7, so ${sum}.`;
  return `${sum} − ${multiple} = ${remainder}.`;
}

/** "3 ÷ 4 = 0 remainder 3, so 0." */
function quarterLine(n: number): string {
  const whole = Math.floor(n / 4);
  const over = n % 4;
  return over === 0 ? `${n} ÷ 4 = ${whole}.` : `${n} ÷ 4 = ${whole} remainder ${over}, so ${whole}.`;
}

/** "7, 14, 21, 28". Commas only, so the numbers parse straight back out. */
function numberList(values: readonly number[]): string {
  return values.join(', ');
}

/* ------------------------------------------------------------------ */
/* The maths behind one walk                                           */
/* ------------------------------------------------------------------ */

/**
 * The first doomsday date in a month: the month's doomsday brought down by
 * whole weeks until it will not go again. March's doomsday is the 14th, so the
 * 7th is the first.
 */
function firstDoomsdayDate(anchorDay: number): number {
  return ((anchorDay - 1) % 7) + 1;
}

/** Every date in the month that falls on the year's doomsday, ascending. */
function doomsdayDates(fullYear: number, month: number, anchorDay: number): number[] {
  const length = daysInMonth(fullYear, month);
  const dates: number[] = [];
  for (let day = firstDoomsdayDate(anchorDay); day <= length; day += 7) dates.push(day);
  return dates;
}

interface WalkNumbers {
  yy: YearKey;
  cycles: number;
  /** 0, 28, 56 or 84. What comes off the year. */
  taken: number;
  reduced: YearKey;
  leaps: number;
  /** reduced + leaps, before the sevens come off. Never past 33. */
  sum: number;
  code: Code;
  anchor: Code;
  /** anchor + code, before the sevens come off. Never past 12. */
  anchorSum: number;
  doomsday: Code;
  leapYear: boolean;
  anchorDay: number;
  dates: number[];
  /**
   * True when the day sits below every doomsday date in the month, so a week is
   * added to it first. A week either way is the same weekday, and adding one
   * keeps the subtraction non-negative without introducing direction.
   */
  shifted: boolean;
  /** The day the count is actually done from: the day, or a week on from it. */
  target: number;
  nearest: number;
  daysOn: number;
  /** doomsday + daysOn, before the sevens come off. Never past 12. */
  weekdaySum: number;
  weekday: Code;
}

function walkNumbers(date: CalendarDate): WalkNumbers {
  const { fullYear, month, day } = date;
  const yy = yearKeyOf(fullYear);
  const cycles = cyclesRemoved(yy);
  const reduced = reduce28(yy);
  const leaps = leapDays(reduced);
  const sum = reduced + leaps;
  const code = sevenStep(sum).remainder as Code;
  const anchor = centuryAnchor(fullYear);
  const anchorSum = anchor + code;
  const doomsday = sevenStep(anchorSum).remainder as Code;
  const leapYear = isLeapYear(fullYear);
  const anchorDay = monthDoomsday(month, leapYear);
  const dates = doomsdayDates(fullYear, month, anchorDay);
  const shifted = day < dates[0];
  const target = shifted ? day + 7 : day;
  const nearest = Math.max(...dates.filter((candidate) => candidate <= target));
  const daysOn = target - nearest;
  const weekdaySum = doomsday + daysOn;

  return {
    yy,
    cycles,
    taken: cycles * CYCLE,
    reduced,
    leaps,
    sum,
    code,
    anchor,
    anchorSum,
    doomsday,
    leapYear,
    anchorDay,
    dates,
    shifted,
    target,
    nearest,
    daysOn,
    weekdaySum,
    weekday: sevenStep(weekdaySum).remainder as Code,
  };
}

/* ------------------------------------------------------------------ */
/* The steps                                                           */
/* ------------------------------------------------------------------ */

/** Builds a step around its ask, so the answer can only ever be the sum's own. */
function asked(
  step: Omit<GuidedStep, 'answer' | 'noop'> & { ask: GuidedAsk },
): GuidedStep {
  return { ...step, noop: false, answer: askAnswer(step.ask) };
}

function reduceStep(n: WalkNumbers): GuidedStep {
  const year = formatYear(n.yy);
  if (n.cycles === 0) {
    return {
      id: 'reduce',
      position: 1,
      title: 'Take the 28s off',
      noop: true,
      question: `${year} is under 28, so no 28s come off. The year to work with is ${n.reduced}.`,
      ask: null,
      givens: [{ label: 'Year, last two digits', value: year, from: null }],
      table: null,
      input: 'count',
      max: CYCLE - 1,
      choices: [],
      answer: n.reduced,
      answerLabel: 'Year, 28s off',
      working: `${year} is under 28, so ${n.reduced}.`,
      why: 'The codes repeat every 28 years.',
      result: null,
      note: null,
      fills: 'reduced',
      solving: 'reduced',
    };
  }

  return asked({
    id: 'reduce',
    position: 1,
    title: 'Take the 28s off',
    question: `${n.yy} − ${n.taken} = ?`,
    ask: { kind: 'subtract', left: n.yy, right: n.taken },
    givens: [
      { label: 'Year, last two digits', value: year, from: null },
      { label: '28s to take off', value: String(n.taken), from: null },
    ],
    table: null,
    input: 'count',
    max: CYCLE - 1,
    choices: [],
    answerLabel: 'Year, 28s off',
    working: `${n.yy} − ${n.taken} = ${n.reduced}.`,
    why: `The codes repeat every 28 years. 28 × ${n.cycles} = ${n.taken}.`,
    result: null,
    note: null,
    fills: 'reduced',
    solving: 'reduced',
  });
}

function leapStep(n: WalkNumbers): GuidedStep {
  return asked({
    id: 'leap',
    position: 2,
    title: 'Leap days',
    question: `${n.reduced} ÷ 4 = ?`,
    ask: { kind: 'quarter', left: n.reduced },
    givens: [{ label: 'Year, 28s off', value: String(n.reduced), from: 'reduce' }],
    table: null,
    input: 'code',
    max: 6,
    choices: [],
    answerLabel: 'Leap days',
    working: quarterLine(n.reduced),
    why: 'A leap day lands every fourth year. Divide by four and drop the remainder.',
    result: null,
    note: null,
    fills: 'leapDays',
    solving: 'leapDays',
  });
}

function sumStep(n: WalkNumbers): GuidedStep {
  return asked({
    id: 'sum',
    position: 3,
    title: 'Add them',
    question: `${n.reduced} + ${n.leaps} = ?`,
    ask: { kind: 'add', left: n.reduced, right: n.leaps },
    givens: [
      { label: 'Year, 28s off', value: String(n.reduced), from: 'reduce' },
      { label: 'Leap days', value: String(n.leaps), from: 'leap' },
    ],
    table: null,
    input: 'count',
    max: CYCLE - 1 + 6,
    choices: [],
    answerLabel: 'Year plus leap days',
    working: `${n.reduced} + ${n.leaps} = ${n.sum}.`,
    why: 'Each year moves the weekday on by one, and each leap day by one more.',
    result: null,
    note: null,
    fills: null,
    solving: 'yearCode',
  });
}

function yearCodeStep(n: WalkNumbers): GuidedStep {
  return asked({
    id: 'yearCode',
    position: 4,
    title: 'Take the sevens off',
    question: `${n.sum} mod 7 = ?`,
    ask: { kind: 'sevens', left: n.sum },
    givens: [{ label: 'Year plus leap days', value: String(n.sum), from: 'sum' }],
    table: null,
    input: 'code',
    max: 6,
    choices: [],
    answerLabel: 'Year code',
    working: sevensLine(n.sum),
    why: SEVENS_WHY,
    result: `That is the year code for ${formatYear(n.yy)}.`,
    note: null,
    fills: 'yearCode',
    solving: 'yearCode',
  });
}

function anchorSumStep(fullYear: number, n: WalkNumbers): GuidedStep {
  const century = centuryLabel(centuryOf(fullYear));
  return asked({
    id: 'anchorSum',
    position: 5,
    title: 'Add the anchor',
    question: `${n.anchor} + ${n.code} = ?`,
    ask: { kind: 'add', left: n.anchor, right: n.code },
    givens: [
      { label: `Century anchor, ${century}`, value: String(n.anchor), from: null },
      { label: `Year code, ${formatYear(n.yy)}`, value: String(n.code), from: 'yearCode' },
    ],
    table: 'century',
    input: 'count',
    max: 12,
    choices: [],
    answerLabel: 'Anchor plus year code',
    working: `${n.anchor} + ${n.code} = ${n.anchorSum}.`,
    why: `The ${century} anchor is ${n.anchor}.`,
    result: null,
    note: null,
    fills: null,
    solving: 'weekday',
  });
}

function yearDoomsdayStep(fullYear: number, n: WalkNumbers): GuidedStep {
  return asked({
    id: 'yearDoomsday',
    position: 6,
    title: 'Take the sevens off',
    question: `${n.anchorSum} mod 7 = ?`,
    ask: { kind: 'sevens', left: n.anchorSum },
    givens: [{ label: 'Anchor plus year code', value: String(n.anchorSum), from: 'anchorSum' }],
    table: null,
    input: 'code',
    max: 6,
    choices: [],
    answerLabel: `Doomsday in ${fullYear}`,
    working: sevensLine(n.anchorSum),
    why: SEVENS_WHY,
    result: `Every doomsday in ${fullYear} falls on ${n.doomsday}.`,
    note: null,
    fills: null,
    solving: 'weekday',
  });
}

function doomsdayNameStep(fullYear: number, n: WalkNumbers): GuidedStep {
  return asked({
    id: 'doomsdayName',
    position: 7,
    title: 'Name it',
    question: `Which weekday is ${n.doomsday}?`,
    ask: { kind: 'name', code: n.doomsday },
    givens: [{ label: `Doomsday in ${fullYear}`, value: String(n.doomsday), from: 'yearDoomsday' }],
    table: null,
    input: 'weekday',
    max: 6,
    choices: [],
    answerLabel: `Doomsday in ${fullYear}`,
    working: `${n.doomsday} is ${trueWeekdayName(n.doomsday)}.`,
    why: NAMING_WHY,
    result: `Every doomsday in ${fullYear} is a ${trueWeekdayName(n.doomsday)}.`,
    note: null,
    fills: null,
    solving: 'weekday',
  });
}

/**
 * The one question in the walk that is not arithmetic, and it is a comparison
 * of numbers on the screen rather than a concept.
 *
 * A day below every doomsday date in the month — 3 March, where the doomsdays
 * are the 7th, 14th, 21st and 28th — gets a week added to it first, stated as a
 * line rather than asked. The alternative is counting backwards, and direction
 * is exactly the kind of idea this screen exists not to require.
 */
function nearestStep(month: number, day: number, n: WalkNumbers): GuidedStep {
  const name = monthName(month);
  const givens: GuidedGiven[] = [
    { label: `${name} doomsday`, value: String(n.anchorDay), from: null },
    { label: `Doomsdays in ${name}`, value: numberList(n.dates), from: null },
    { label: 'Your date', value: String(day), from: null },
  ];
  if (n.shifted) {
    givens.push({ label: 'Date, a week on', value: String(n.target), from: null });
  }

  return asked({
    id: 'nearest',
    position: 8,
    title: 'The nearest doomsday',
    question: `Which of those is closest to the ${ordinal(n.target)} without going past it?`,
    ask: { kind: 'nearest', options: n.dates, ceiling: n.target },
    givens,
    table: 'month',
    input: 'choice',
    max: n.dates[n.dates.length - 1],
    choices: n.dates,
    answerLabel: 'Nearest doomsday',
    working: `The ${ordinal(n.nearest)} is the closest doomsday at or before the ${ordinal(n.target)}.`,
    why: `${name}'s doomsday is the ${ordinal(n.anchorDay)}, and every 7 days from it is another one.`,
    result: null,
    note: n.shifted
      ? `The ${ordinal(day)} has no doomsday at or before it. A week either way is the same weekday, so use the ${ordinal(n.target)}.`
      : null,
    fills: 'nearest',
    solving: 'nearest',
  });
}

function daysOnStep(n: WalkNumbers): GuidedStep {
  return asked({
    id: 'daysOn',
    position: 9,
    title: 'Count on',
    question: `${n.target} − ${n.nearest} = ?`,
    ask: { kind: 'subtract', left: n.target, right: n.nearest },
    givens: [
      {
        label: n.shifted ? 'Date, a week on' : 'Your date',
        value: String(n.target),
        from: null,
      },
      { label: 'Nearest doomsday', value: String(n.nearest), from: 'nearest' },
    ],
    table: null,
    input: 'code',
    max: 6,
    choices: [],
    answerLabel: 'Days on',
    working: `${n.target} − ${n.nearest} = ${n.daysOn}.`,
    why: 'Count on from that doomsday to your date.',
    result: null,
    note: null,
    fills: 'daysOn',
    solving: 'daysOn',
  });
}

function weekdaySumStep(fullYear: number, n: WalkNumbers): GuidedStep {
  return asked({
    id: 'weekdaySum',
    position: 10,
    title: 'Add them',
    question: `${n.doomsday} + ${n.daysOn} = ?`,
    ask: { kind: 'add', left: n.doomsday, right: n.daysOn },
    givens: [
      { label: `Doomsday in ${fullYear}`, value: String(n.doomsday), from: 'yearDoomsday' },
      { label: 'Days on', value: String(n.daysOn), from: 'daysOn' },
    ],
    table: null,
    input: 'count',
    max: 12,
    choices: [],
    answerLabel: 'Doomsday plus days on',
    working: `${n.doomsday} + ${n.daysOn} = ${n.weekdaySum}.`,
    why: 'The doomsday says where the year sits. The days move you off it.',
    result: null,
    note: null,
    fills: null,
    solving: 'weekday',
  });
}

function weekdayCodeStep(n: WalkNumbers): GuidedStep {
  return asked({
    id: 'weekdayCode',
    position: 11,
    title: 'Take the sevens off',
    question: `${n.weekdaySum} mod 7 = ?`,
    ask: { kind: 'sevens', left: n.weekdaySum },
    givens: [{ label: 'Doomsday plus days on', value: String(n.weekdaySum), from: 'weekdaySum' }],
    table: null,
    input: 'code',
    max: 6,
    choices: [],
    answerLabel: 'Weekday number',
    working: sevensLine(n.weekdaySum),
    why: SEVENS_WHY,
    result: null,
    note: null,
    fills: 'weekday',
    solving: 'weekday',
  });
}

function weekdayNameStep(n: WalkNumbers): GuidedStep {
  return asked({
    id: 'weekdayName',
    position: 12,
    title: 'Name it',
    question: `Which weekday is ${n.weekday}?`,
    ask: { kind: 'name', code: n.weekday },
    givens: [{ label: 'Weekday number', value: String(n.weekday), from: 'weekdayCode' }],
    table: null,
    input: 'weekday',
    max: 6,
    choices: [],
    answerLabel: 'The day',
    working: `${n.weekday} is ${trueWeekdayName(n.weekday)}.`,
    why: NAMING_WHY,
    result: null,
    note: null,
    fills: null,
    solving: 'weekday',
  });
}

/* ------------------------------------------------------------------ */
/* The equations                                                       */
/* ------------------------------------------------------------------ */

function equationsFor(fullYear: number, n: WalkNumbers): GuidedEquation[] {
  const yearCode: GuidedTerm = {
    kind: 'term',
    slot: 'yearCode',
    label: `Year code, ${formatYear(n.yy)}`,
    value: String(n.code),
    pending: null,
    from: 'yearCode',
  };
  const daysOn: GuidedTerm = {
    kind: 'term',
    slot: 'daysOn',
    label: 'Days on',
    value: String(n.daysOn),
    pending: null,
    from: 'daysOn',
  };

  return [
    {
      result: yearCode,
      parts: [
        { kind: 'op', text: '(' },
        {
          kind: 'term',
          slot: 'reduced',
          label: 'Year, 28s off',
          value: String(n.reduced),
          // The sum that will fill it, since both its numbers are already
          // known. Every other slot has nothing truthful to show until its step.
          pending: n.cycles === 0 ? null : `${n.yy} − ${n.taken}`,
          from: 'reduce',
        },
        { kind: 'op', text: '+' },
        {
          kind: 'term',
          slot: 'leapDays',
          label: 'Leap days',
          value: String(n.leaps),
          pending: null,
          from: 'leap',
        },
        { kind: 'op', text: ')' },
        { kind: 'op', text: 'mod 7' },
      ],
    },
    {
      result: daysOn,
      parts: [
        {
          kind: 'term',
          slot: 'day',
          label: n.shifted ? 'Date, a week on' : 'Your date',
          value: String(n.target),
          pending: null,
          from: null,
        },
        { kind: 'op', text: '−' },
        {
          kind: 'term',
          slot: 'nearest',
          label: 'Nearest doomsday',
          value: String(n.nearest),
          pending: null,
          from: 'nearest',
        },
      ],
    },
    {
      result: {
        kind: 'term',
        slot: 'weekday',
        label: 'Weekday number',
        value: String(n.weekday),
        pending: null,
        from: 'weekdayCode',
      },
      parts: [
        { kind: 'op', text: '(' },
        {
          kind: 'term',
          slot: 'anchor',
          label: `Century anchor, ${centuryLabel(centuryOf(fullYear))}`,
          value: String(n.anchor),
          pending: null,
          from: null,
        },
        { kind: 'op', text: '+' },
        yearCode,
        { kind: 'op', text: '+' },
        daysOn,
        { kind: 'op', text: ')' },
        { kind: 'op', text: 'mod 7' },
      ],
    },
  ];
}

/* ------------------------------------------------------------------ */
/* The walk                                                            */
/* ------------------------------------------------------------------ */

/**
 * The whole method for one date, as twelve labelled steps and three equations.
 *
 * Throws for a date outside 1800-2199 or for a day the month does not have,
 * which is `weekdayFor`'s range and the only range the calendar maths is tested
 * across. Callers take dates from a control that clamps; this is the backstop.
 */
export function guidedWalk(date: CalendarDate): GuidedWalk {
  const { fullYear, month, day } = date;
  const weekday = weekdayFor(fullYear, month, day);
  const n = walkNumbers(date);

  return {
    date,
    leapYear: n.leapYear,
    weekday,
    weekdayName: trueWeekdayName(weekday),
    dateLabel: formatDate(fullYear, month, day),
    steps: [
      reduceStep(n),
      leapStep(n),
      sumStep(n),
      yearCodeStep(n),
      anchorSumStep(fullYear, n),
      yearDoomsdayStep(fullYear, n),
      doomsdayNameStep(fullYear, n),
      nearestStep(month, day, n),
      daysOnStep(n),
      weekdaySumStep(fullYear, n),
      weekdayCodeStep(n),
      weekdayNameStep(n),
    ],
    equations: equationsFor(fullYear, n),
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

/** The four century anchors, in order, for the table on step 5. */
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
