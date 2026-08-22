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
 * then names exactly which numbers the question rests on, and `visibleNumbers`
 * says which numbers the screen is printing at that moment. A step that asked
 * for something the user could not see fails a test rather than merely reading
 * badly. See `guidedDate.test.ts`.
 *
 * Three more rules shape it.
 *
 * **Twelve steps, but four goals.** Twelve sums in a row is arithmetic homework:
 * each one is answerable and none of them says what is being built. So the steps
 * are grouped into four goals — the year code, the year's doomsday, the distance
 * from a doomsday to the date, the weekday — and only the goal being worked is
 * on screen. A finished goal collapses to its one-line `summary`. That is the
 * difference between a walk a person can follow and a list of sums.
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

/** The four things the twelve steps build, in the order they are built. */
export type GuidedGoalId = 'yearCode' | 'doomsday' | 'daysOn' | 'weekday';

export const GUIDED_GOAL_IDS: readonly GuidedGoalId[] = [
  'yearCode',
  'doomsday',
  'daysOn',
  'weekday',
];

/** Which goal each step serves. One goal is on screen at a time. */
const GOAL_OF: Readonly<Record<GuidedStepId, GuidedGoalId>> = {
  reduce: 'yearCode',
  leap: 'yearCode',
  sum: 'yearCode',
  yearCode: 'yearCode',
  anchorSum: 'doomsday',
  yearDoomsday: 'doomsday',
  doomsdayName: 'doomsday',
  nearest: 'daysOn',
  daysOn: 'daysOn',
  weekdaySum: 'weekday',
  weekdayCode: 'weekday',
  weekdayName: 'weekday',
};

/**
 * Which control can take the answer.
 *
 * `code` is the shared seven-button pad, 0-6. `weekday` is the same pad with
 * the seven weekday names on it. `choice` is one button per doomsday date in
 * the month, four or five of them. `count` is a typed field, for the four sums
 * that can run past six.
 */
export type GuidedInput = 'code' | 'count' | 'choice' | 'weekday';

/**
 * The question itself, as data rather than as a sentence.
 *
 * `expression` on the goal row is what the screen prints; this is what it
 * prints *about*. Keeping the two separate is what lets a test assert that no
 * question ever needs a number the user cannot see: the operands are enumerable.
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
 * Every number the question rests on. All of them must be printed by the screen
 * at the moment it is asked, or the user is being asked to supply something the
 * app never gave them. That is the property `guidedDate.test.ts` pins, against
 * `visibleNumbers`.
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

/* ------------------------------------------------------------------ */
/* Goals                                                               */
/* ------------------------------------------------------------------ */

/**
 * One line of a goal's working: what the number is, how it is got, and what it
 * comes out at.
 *
 * The label is never empty, filled or not. Half this screen is digits and two
 * of them stacked with nothing naming them teach nothing (invariant 7).
 */
export interface GuidedGoalRow {
  /** Names the number. "Leap days", "Nearest doomsday". */
  label: string;
  /**
   * The sum as it reads: "87 − 84", "3 ÷ 4", "12 mod 7", "5 as a weekday".
   * Empty for a row the app simply states, which has nothing to work out.
   *
   * A row's expression names numbers the user has not necessarily produced yet,
   * so the screen only prints it once the row is the live one. Before that the
   * row shows its label alone, which is the shape of what is coming without the
   * answers to it.
   */
  expression: string;
  /** The value once it is known. A word for the two naming rows. */
  value: string;
  /**
   * The step that fills it, or null for a row the app states outright — the
   * century anchor, the month's doomsday dates, the date itself. Those are the
   * lookups the app does on the user's behalf, and they stand filled from the
   * moment their goal opens.
   */
  from: GuidedStepId | null;
}

export interface GuidedGoal {
  id: GuidedGoalId;
  /** What these steps are building. "The year code for 87". */
  title: string;
  /** One short line saying what that thing is. Plain words, no method jargon. */
  blurb: string;
  rows: readonly GuidedGoalRow[];
  /**
   * How the goal reads once it is behind the user and collapses to one line.
   * Null for the last goal, which does not collapse: it is the answer.
   */
  summary: string | null;
}

export interface GuidedStep {
  id: GuidedStepId;
  /** 1-based, and always 1..12. No date changes the count. */
  position: number;
  /** The goal this step is working toward. */
  goal: GuidedGoalId;
  /**
   * True when this date makes the step a no-op. The screen states the row and
   * moves on rather than asking it. Exactly the steps with no `ask`.
   */
  noop: boolean;
  /** The sum behind the step, or null when the step is a line to read. */
  ask: GuidedAsk | null;
  input: GuidedInput;
  /** The largest answer this kind of step can have. `count` and `choice` read it. */
  max: number;
  /** The buttons, for a `choice` step. Empty for every other input. */
  choices: readonly number[];
  answer: number;
  /** What the answer is. Never omitted; a bare number teaches nothing. */
  answerLabel: string;
  /**
   * The worked line, shown when the answer is wrong. It always contains the
   * value that was wanted, which is what makes the walk finishable by somebody
   * who knows nothing and why there is no skip.
   */
  working: string;
  /**
   * One short line, or empty. Only where the operation itself needs saying —
   * what `mod 7` means, where the anchor came from. An addition explains itself
   * and gets nothing.
   */
  why: string;
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
  /** Four, in `GUIDED_GOAL_IDS` order. */
  goals: readonly GuidedGoal[];
}

/* ------------------------------------------------------------------ */
/* What the screen is showing, at a given point                        */
/* ------------------------------------------------------------------ */

export type GuidedRowState = 'filled' | 'active' | 'pending';

export function goalOf(walk: GuidedWalk, id: GuidedGoalId): GuidedGoal {
  const goal = walk.goals.find((entry) => entry.id === id);
  if (!goal) throw new RangeError(`No goal ${id}`);
  return goal;
}

/**
 * How one row of the current goal reads after `stepsDone` steps.
 *
 * A row the app states is filled the moment its goal opens. A row a step fills
 * is pending until that step is live, active while it is, and filled after.
 * Never filled early, never empty late — that is the whole contract, and it is
 * decided here rather than in the component so it can be asserted without
 * rendering anything.
 */
export function rowState(
  walk: GuidedWalk,
  row: GuidedGoalRow,
  stepsDone: number,
): GuidedRowState {
  if (row.from === null) return 'filled';
  const at = walk.steps.findIndex((step) => step.id === row.from);
  if (at < stepsDone) return 'filled';
  return at === stepsDone ? 'active' : 'pending';
}

/** Goals fully behind the user, which collapse to their summary line. */
export function settledGoals(walk: GuidedWalk, stepsDone: number): GuidedGoal[] {
  return walk.goals.filter((goal) =>
    goal.rows.every((row) => rowState(walk, row, stepsDone) === 'filled'),
  );
}

/**
 * Every number the screen is actually printing after `stepsDone` steps.
 *
 * Only the goal being worked is on screen, plus the one-line summary of each
 * goal already behind it, so this counts those and nothing else. Counting every
 * goal's rows would overstate what the user can see and would let a question
 * rest on a number that is not there — which is the exact failure this whole
 * file is built to make impossible.
 */
export function visibleNumbers(walk: GuidedWalk, stepsDone: number): Set<number> {
  const seen = new Set<number>();
  const take = (text: string) => {
    for (const found of text.match(/\d+/g) ?? []) seen.add(Number(found));
  };

  for (const settled of settledGoals(walk, stepsDone)) {
    if (settled.summary !== null) take(settled.summary);
  }

  const step = walk.steps[stepsDone];
  if (step === undefined) return seen;

  for (const row of goalOf(walk, step.goal).rows) {
    const state = rowState(walk, row, stepsDone);
    // A pending row shows its label and nothing else, so it prints no number.
    if (state === 'filled') take(row.value);
    if (state === 'active') take(row.expression);
  }
  return seen;
}

/* ------------------------------------------------------------------ */
/* Copy helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * What the operation is, not why it is there.
 *
 * The screen used to say "a week is 7 days, so whole sevens change nothing",
 * which explains the reason to somebody who already knows the operation. A
 * person meeting `mod 7` for the first time needs the operation first, and it
 * is repeated at all three sevens steps rather than cross-referenced, because a
 * user on step 11 should not have to remember what step 4 said.
 */
const SEVENS_WHY = 'mod 7 means take 7 away until less than 7 is left.';

const NAMING_WHY = 'The numbers count from Sunday, so 0 is Sunday and 6 is Saturday.';

/** "12 − 7 = 5.", or that nothing comes off. */
function sevensLine(sum: number): string {
  const { multiple, remainder } = sevenStep(sum);
  if (multiple === 0) return `${sum} is already under 7, so ${sum}.`;
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
  century: string;
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
    century: centuryLabel(centuryOf(fullYear)),
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
function asked(step: Omit<GuidedStep, 'answer' | 'noop' | 'goal'> & { ask: GuidedAsk }): GuidedStep {
  return { ...step, goal: GOAL_OF[step.id], noop: false, answer: askAnswer(step.ask) };
}

function stepsFor(date: CalendarDate, n: WalkNumbers): GuidedStep[] {
  const { fullYear, month, day } = date;
  const year = formatYear(n.yy);
  const name = monthName(month);

  const reduce: GuidedStep =
    n.cycles === 0
      ? {
          id: 'reduce',
          position: 1,
          goal: 'yearCode',
          noop: true,
          ask: null,
          input: 'count',
          max: CYCLE - 1,
          choices: [],
          answer: n.reduced,
          answerLabel: 'Year, 28s off',
          working: `${year} is under 28, so ${n.reduced}.`,
          why: `The codes repeat every 28 years, and ${year} is under 28, so nothing comes off.`,
        }
      : asked({
          id: 'reduce',
          position: 1,
          ask: { kind: 'subtract', left: n.yy, right: n.taken },
          input: 'count',
          max: CYCLE - 1,
          choices: [],
          answerLabel: 'Year, 28s off',
          working: `${n.yy} − ${n.taken} = ${n.reduced}.`,
          why: `The codes repeat every 28 years, so 28 × ${n.cycles} comes off.`,
        });

  return [
    reduce,
    asked({
      id: 'leap',
      position: 2,
      ask: { kind: 'quarter', left: n.reduced },
      input: 'code',
      max: 6,
      choices: [],
      answerLabel: 'Leap days',
      working: quarterLine(n.reduced),
      why: 'A leap day lands every fourth year. Ignore the remainder.',
    }),
    asked({
      id: 'sum',
      position: 3,
      ask: { kind: 'add', left: n.reduced, right: n.leaps },
      input: 'count',
      max: CYCLE - 1 + 6,
      choices: [],
      answerLabel: 'Added up',
      working: `${n.reduced} + ${n.leaps} = ${n.sum}.`,
      why: '',
    }),
    asked({
      id: 'yearCode',
      position: 4,
      ask: { kind: 'sevens', left: n.sum },
      input: 'code',
      max: 6,
      choices: [],
      answerLabel: 'Year code',
      working: sevensLine(n.sum),
      why: SEVENS_WHY,
    }),
    asked({
      id: 'anchorSum',
      position: 5,
      ask: { kind: 'add', left: n.anchor, right: n.code },
      input: 'count',
      max: 12,
      choices: [],
      answerLabel: 'Anchor plus year code',
      working: `${n.anchor} + ${n.code} = ${n.anchorSum}.`,
      why: '',
    }),
    asked({
      id: 'yearDoomsday',
      position: 6,
      ask: { kind: 'sevens', left: n.anchorSum },
      input: 'code',
      max: 6,
      choices: [],
      answerLabel: 'Doomsday number',
      working: sevensLine(n.anchorSum),
      why: SEVENS_WHY,
    }),
    asked({
      id: 'doomsdayName',
      position: 7,
      ask: { kind: 'name', code: n.doomsday },
      input: 'weekday',
      max: 6,
      choices: [],
      answerLabel: `Doomsday in ${fullYear}`,
      working: `${n.doomsday} is ${trueWeekdayName(n.doomsday)}.`,
      why: NAMING_WHY,
    }),
    asked({
      id: 'nearest',
      position: 8,
      ask: { kind: 'nearest', options: n.dates, ceiling: n.target },
      input: 'choice',
      max: n.dates[n.dates.length - 1],
      choices: n.dates,
      answerLabel: 'Nearest doomsday',
      working: `The ${ordinal(n.nearest)} is the closest one at or before the ${ordinal(n.target)}.`,
      why: n.shifted
        ? `No doomsday falls on or before the ${ordinal(day)}, so count from the ${ordinal(n.target)} instead. A week on is the same weekday.`
        : `${name}'s doomsday is the ${ordinal(n.anchorDay)}, and every 7 days from it is another one.`,
    }),
    asked({
      id: 'daysOn',
      position: 9,
      ask: { kind: 'subtract', left: n.target, right: n.nearest },
      input: 'code',
      max: 6,
      choices: [],
      answerLabel: 'Days on',
      working: `${n.target} − ${n.nearest} = ${n.daysOn}.`,
      why: '',
    }),
    asked({
      id: 'weekdaySum',
      position: 10,
      ask: { kind: 'add', left: n.doomsday, right: n.daysOn },
      input: 'count',
      max: 12,
      choices: [],
      answerLabel: 'Doomsday plus days on',
      working: `${n.doomsday} + ${n.daysOn} = ${n.weekdaySum}.`,
      why: '',
    }),
    asked({
      id: 'weekdayCode',
      position: 11,
      ask: { kind: 'sevens', left: n.weekdaySum },
      input: 'code',
      max: 6,
      choices: [],
      answerLabel: 'Weekday number',
      working: sevensLine(n.weekdaySum),
      why: SEVENS_WHY,
    }),
    asked({
      id: 'weekdayName',
      position: 12,
      ask: { kind: 'name', code: n.weekday },
      input: 'weekday',
      max: 6,
      choices: [],
      answerLabel: 'The day',
      working: `${n.weekday} is ${trueWeekdayName(n.weekday)}.`,
      why: NAMING_WHY,
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* The goals                                                           */
/* ------------------------------------------------------------------ */

function goalsFor(fullYear: number, month: number, day: number, n: WalkNumbers): GuidedGoal[] {
  const year = formatYear(n.yy);
  const name = monthName(month);

  const daysOnRows: GuidedGoalRow[] = [
    {
      label: `Doomsdays in ${name}`,
      expression: '',
      value: numberList(n.dates),
      from: null,
    },
    { label: 'Your date', expression: '', value: String(day), from: null },
  ];
  if (n.shifted) {
    daysOnRows.push({
      label: 'A week on from it',
      expression: '',
      value: String(n.target),
      from: null,
    });
  }
  daysOnRows.push(
    {
      label: 'Nearest doomsday',
      expression: `closest at or under ${n.target}`,
      value: String(n.nearest),
      from: 'nearest',
    },
    {
      label: 'Days on',
      expression: `${n.target} − ${n.nearest}`,
      value: String(n.daysOn),
      from: 'daysOn',
    },
  );

  return [
    {
      id: 'yearCode',
      title: `The year code for ${year}`,
      blurb: 'Every year gets a number from 0 to 6, worked out from the year alone.',
      rows: [
        {
          label: 'Year, 28s off',
          expression: n.cycles === 0 ? `${year} is under 28` : `${n.yy} − ${n.taken}`,
          value: String(n.reduced),
          from: 'reduce',
        },
        {
          label: 'Leap days',
          expression: `${n.reduced} ÷ 4`,
          value: String(n.leaps),
          from: 'leap',
        },
        {
          label: 'Added up',
          expression: `${n.reduced} + ${n.leaps}`,
          value: String(n.sum),
          from: 'sum',
        },
        {
          label: 'Year code',
          expression: `${n.sum} mod 7`,
          value: String(n.code),
          from: 'yearCode',
        },
      ],
      summary: `Year code ${n.code}`,
    },
    {
      id: 'doomsday',
      title: `The doomsday of ${fullYear}`,
      blurb: 'One weekday that a handful of dates in the year all land on.',
      rows: [
        {
          label: `Anchor for the ${n.century}`,
          expression: '',
          value: String(n.anchor),
          from: null,
        },
        {
          label: 'Anchor plus year code',
          expression: `${n.anchor} + ${n.code}`,
          value: String(n.anchorSum),
          from: 'anchorSum',
        },
        {
          label: 'Doomsday number',
          expression: `${n.anchorSum} mod 7`,
          value: String(n.doomsday),
          from: 'yearDoomsday',
        },
        {
          label: 'Doomsday',
          expression: `${n.doomsday} as a weekday`,
          value: trueWeekdayName(n.doomsday),
          from: 'doomsdayName',
        },
      ],
      summary: `Doomsday ${n.doomsday}, ${trueWeekdayName(n.doomsday)}`,
    },
    {
      id: 'daysOn',
      title: `From a doomsday to the ${ordinal(day)}`,
      blurb: 'Your date sits a few days off one of those. Count them.',
      rows: daysOnRows,
      summary: `Days on ${n.daysOn}`,
    },
    {
      id: 'weekday',
      title: 'The weekday',
      blurb: 'Put the doomsday and the days together.',
      rows: [
        {
          label: 'Doomsday plus days on',
          expression: `${n.doomsday} + ${n.daysOn}`,
          value: String(n.weekdaySum),
          from: 'weekdaySum',
        },
        {
          label: 'Weekday number',
          expression: `${n.weekdaySum} mod 7`,
          value: String(n.weekday),
          from: 'weekdayCode',
        },
        {
          label: 'The day',
          expression: `${n.weekday} as a weekday`,
          value: trueWeekdayName(n.weekday),
          from: 'weekdayName',
        },
      ],
      summary: null,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* The walk                                                            */
/* ------------------------------------------------------------------ */

/**
 * The whole method for one date, as twelve labelled steps inside four goals.
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
    steps: stepsFor(date, n),
    goals: goalsFor(fullYear, month, day, n),
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

/** True when the date is one this walk can take: in range, and a real day. */
export function isWalkableDate(date: CalendarDate): boolean {
  const { fullYear, month, day } = date;
  if (!Number.isInteger(fullYear) || fullYear < MIN_YEAR || fullYear > MAX_YEAR) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  return Number.isInteger(day) && day >= 1 && day <= daysInMonth(fullYear, month);
}
