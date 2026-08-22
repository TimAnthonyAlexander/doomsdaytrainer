/**
 * Deriving a year code instead of recalling it.
 *
 * The table in `yearCodes.ts` is the thing the app trains. This file is the
 * other path to the same number: `code(yy) = (yy + floor(yy / 4)) mod 7`, cut
 * into steps small enough to practise and to time one at a time.
 *
 * Pure and framework-free. No `Math.random`, no `Date`, no I/O.
 *
 * The one fact worth more than the formula: **the codes repeat every 28
 * years.** Twenty-eight years hold exactly seven leap days, so the sum grows by
 * 28 + 7 = 35, and 35 is five whole weeks. A two-digit year never crosses a
 * century, so nothing breaks the cycle. There are 28 distinct year codes, not
 * 100, and 00-27 generates every one of them.
 *
 * That is not trivia. Reducing first caps the sum at 33 (from 27 + 6), so the
 * only multiples of seven ever needed are 7, 14, 21 and 28. Left unreduced the
 * sum reaches 123 and the multiples run to 119. Same answer, a quarter of the
 * arithmetic.
 */

import type { CalcStepId, Code, YearKey } from './types';
import { codeFor } from './yearCodes';

export type { CalcStepId } from './types';

/** Years between repeats of a code. `code(yy + 28) === code(yy)`, always. */
export const CYCLE = 28;

/** How far a full cycle moves the raw sum: 28 years plus 7 leap days. */
export const CYCLE_SUM_STEP = 35;

/** The largest `rawSum` over 00-99, reached at 99. */
export const MAX_RAW_SUM = 123;

/** The largest `rawSum` once the year is reduced below 28, reached at 27. */
export const MAX_REDUCED_SUM = 33;

function assertYear(yy: YearKey): void {
  if (!Number.isInteger(yy) || yy < 0 || yy > 99) {
    throw new RangeError(`Year key out of range: ${yy}`);
  }
}

/* ------------------------------------------------------------------ */
/* The numbers                                                         */
/* ------------------------------------------------------------------ */

/** floor(yy / 4). The number of leap days since the century began. */
export function leapDays(yy: YearKey): number {
  assertYear(yy);
  return Math.floor(yy / 4);
}

/** yy + leapDays(yy), before the remainder is taken. */
export function rawSum(yy: YearKey): number {
  return yy + leapDays(yy);
}

/** yy reduced below 28 by subtracting whole cycles. */
export function reduce28(yy: YearKey): YearKey {
  assertYear(yy);
  return yy % CYCLE;
}

/** How many times 28 comes out of yy. 0, 1, 2 or 3. */
export function cyclesRemoved(yy: YearKey): number {
  assertYear(yy);
  return Math.floor(yy / CYCLE);
}

/**
 * The largest multiple of 7 at or below n, and what is left over.
 * Anything under 7 has no multiple to take out, so the multiple is 0 and the
 * remainder is n itself. Nonsense input is pinned to zero rather than allowed
 * to produce a NaN the UI would render.
 */
export function sevenStep(n: number): { multiple: number; remainder: number } {
  if (!Number.isFinite(n) || n <= 0) return { multiple: 0, remainder: 0 };
  const whole = Math.floor(n / 7);
  const multiple = whole * 7;
  return { multiple, remainder: n - multiple };
}

/* ------------------------------------------------------------------ */
/* The steps                                                           */
/* ------------------------------------------------------------------ */

export interface CalcStep {
  id: CalcStepId;
  /** What the user is asked, in words, with this year's numbers in it. */
  question: string;
  /** The single number they must produce. */
  answer: number;
  /** Why this step exists, in one or two plain sentences. */
  why: string;
  /** The worked line, e.g. "73 ÷ 4 = 18 remainder 1, so 18". */
  working: string;
}

/**
 * The derivation steps, in the order they are worked, for the reduce-first
 * path. `stepsFor` skips `reduce`. `code` is not part of either derivation:
 * it is the id the verify screen records a straight recall under, so that
 * "how fast can you remember it" and "how fast can you work it out" sit in the
 * same shape without ever being averaged together.
 */
export const CALC_DERIVATION_STEPS: readonly CalcStepId[] = ['reduce', 'leap', 'sum', 'mod'];

/** Every step id, in a fixed order. Both aggregates iterate this. */
export const CALC_STEP_IDS: readonly CalcStepId[] = ['reduce', 'leap', 'sum', 'mod', 'code'];

function leapStep(year: YearKey): CalcStep {
  const l = leapDays(year);
  const over = year % 4;
  return {
    id: 'leap',
    question: `Leap days in ${year} years: ${year} ÷ 4, whole part only.`,
    answer: l,
    why: `Every fourth year has an extra day, and that day pushes the weekday one further forward. In ${year} years that has happened ${l} times.`,
    working:
      over === 0
        ? `${year} ÷ 4 = ${l} exactly, so ${l}.`
        : `${year} ÷ 4 = ${l} remainder ${over}, so ${l}.`,
  };
}

function sumStep(year: YearKey, l: number = leapDays(year)): CalcStep {
  const s = year + l;
  return {
    id: 'sum',
    question: `Add the leap days: ${year} + ${l}.`,
    answer: s,
    why: `Each year moves the weekday on by one, and each leap day moves it on once more. ${year} plus ${l} is the whole shift, ${s} days.`,
    working: `${year} + ${l} = ${s}.`,
  };
}

function modStep(s: number, reduced: boolean): CalcStep {
  const { multiple, remainder } = sevenStep(s);
  const why = reduced
    ? `Seven days is a full week and changes nothing, so only the leftover counts. Reducing first holds the sum at ${MAX_REDUCED_SUM} or below, so ${s} never needs a multiple of 7 past 28.`
    : `Seven days is a full week and changes nothing, so only the leftover counts. Left unreduced the sum runs as high as ${MAX_RAW_SUM}, so ${s} can need a much larger multiple of 7.`;
  return {
    id: 'mod',
    question: `Take whole weeks out of ${s}.`,
    answer: remainder,
    why,
    working:
      multiple === 0
        ? `${s} is under 7 on its own, so ${remainder}.`
        : `${s} − 7 × ${multiple / 7} = ${remainder}.`,
  };
}

function reduceStep(yy: YearKey): CalcStep {
  const cycles = cyclesRemoved(yy);
  const reduced = reduce28(yy);
  return {
    id: 'reduce',
    question: `Take whole 28s out of ${yy}.`,
    answer: reduced,
    why:
      cycles === 0
        ? `Codes repeat every 28 years, so nothing under 28 can be made smaller. ${yy} is under 28 and stands as it is.`
        : `Codes repeat every 28 years, because 28 years hold exactly 7 leap days and 28 + 7 = ${CYCLE_SUM_STEP} is five whole weeks. So ${yy} and ${reduced} share a code.`,
    working:
      cycles === 0
        ? `${yy} is under 28 on its own, so ${yy}.`
        : `${yy} − ${cycles} × 28 = ${reduced}.`,
  };
}

/**
 * The three-step derivation for a year, with every number named. Always
 * `[leap, sum, mod]`, and the last step's answer is the year's code.
 */
export function stepsFor(yy: YearKey): CalcStep[] {
  assertYear(yy);
  return [leapStep(yy), sumStep(yy), modStep(rawSum(yy), false)];
}

/**
 * The reduce-first derivation: reduce to under 28, then the same three steps
 * on the smaller year. Always `[reduce, leap, sum, mod]` — the reduce step is
 * kept even when the year is already under 28, so the screen never changes
 * shape between years and the user still has to decide that nothing comes out.
 */
export function reducedStepsFor(yy: YearKey): CalcStep[] {
  assertYear(yy);
  const reduced = reduce28(yy);
  return [reduceStep(yy), leapStep(reduced), sumStep(reduced), modStep(rawSum(reduced), true)];
}

/** Every intermediate value for a year, for a results table. */
export function explain(yy: YearKey): {
  yy: YearKey;
  leapDays: number;
  rawSum: number;
  reduced: YearKey;
  cyclesRemoved: number;
  reducedLeapDays: number;
  reducedSum: number;
  code: Code;
} {
  assertYear(yy);
  const reduced = reduce28(yy);
  return {
    yy,
    leapDays: leapDays(yy),
    rawSum: rawSum(yy),
    reduced,
    cyclesRemoved: cyclesRemoved(yy),
    reducedLeapDays: leapDays(reduced),
    reducedSum: rawSum(reduced),
    code: codeFor(yy),
  };
}

/**
 * The 28 years that generate every code. Not a new item set: these are year
 * codes 00-27, which already have their own entries in `AppData.items`, and
 * the existing custom scope `{ from: 0, to: 27 }` already restricts the review
 * queue to them.
 */
export function baseYears(): YearKey[] {
  return Array.from({ length: CYCLE }, (_, i) => i);
}

/** What the user has answered so far in a derivation. Absent means not yet asked. */
export interface CarriedAnswers {
  reduce?: number;
  leap?: number;
  sum?: number;
}

/**
 * The derivation built from the user's own earlier answers rather than the true
 * intermediate values.
 *
 * `stepsFor` always asks the next question using the correct previous number,
 * which is right when teaching a step in isolation: the point there is the step,
 * not the chain. It is wrong in verify mode, where the whole question is whether
 * the user's calculation agrees with their memory. Handing them the correct sum
 * after they miscounted the leap days means the derivation can only ever fail on
 * its last step, and "calculation was right" stops meaning anything.
 *
 * Here a mistake carries, exactly as it would on paper. Each step is still
 * graded against the chain the user is actually on, so a single slip produces
 * one wrong step and one wrong code rather than a cascade of red.
 */
export function stepsFromAnswers(
  yy: YearKey,
  answers: CarriedAnswers,
  useReduce: boolean,
): CalcStep[] {
  assertYear(yy);

  if (!useReduce) {
    const leap = answers.leap ?? leapDays(yy);
    const sum = answers.sum ?? yy + leap;
    return [leapStep(yy), sumStep(yy, leap), modStep(sum, false)];
  }

  const reduced = answers.reduce ?? reduce28(yy);
  const leap = answers.leap ?? leapDays(reduced);
  const sum = answers.sum ?? reduced + leap;
  return [reduceStep(yy), leapStep(reduced), sumStep(reduced, leap), modStep(sum, true)];
}
