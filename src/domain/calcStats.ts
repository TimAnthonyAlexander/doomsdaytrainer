/**
 * Lifetime performance on the calculation trainer, broken down by step.
 *
 * The point of the breakdown is diagnosis. "You take six seconds to derive a
 * code" is not actionable; "the remainder step takes four of those six" is.
 * So every step keeps its own counts and its own latency histogram, and they
 * are never averaged together.
 *
 * The trim-proof approach is the one `weekdayLifetime.ts` already uses, and
 * for the same reason: `AppData.calcAttempts` is bounded, so a median computed
 * from it silently becomes a median of "recent" once the oldest entries fall
 * off. A running sum does not rescue that — a mean can be summed, a median
 * cannot. A fixed-width histogram can, to within one bucket, forever, for a
 * few hundred bytes.
 *
 * The bucket edges are `WEEKDAY_LATENCY_EDGES`, reused rather than redefined.
 * They fit: the derivation steps live in the one-to-fifteen-second band the
 * edges cover at second-or-better resolution, and the `code` step is a
 * straight recall from memory, which is exactly the sub-second range those
 * edges resolve to 250ms. A second edge array would buy nothing measurable and
 * would cost a second set of persisted counts to migrate.
 *
 * Pure and framework-free.
 */

import { CALC_DERIVATION_STEPS, CALC_STEP_IDS } from './calc';
import type {
  CalcAttempt,
  CalcStepId,
  CalcStepTotals,
  CalcTotals,
  Code,
  VerifyAttempt,
  VerifyOutcome,
  VerifyResultInput,
  VerifyTotals,
} from './types';
import {
  WEEKDAY_BUCKET_COUNT,
  accuracyOf,
  estimateMedianMs,
  latencyBucket,
} from './weekdayLifetime';
import { codeFor } from './yearCodes';

/* ------------------------------------------------------------------ */
/* Per-step totals                                                     */
/* ------------------------------------------------------------------ */

function zeroBuckets(): number[] {
  return new Array<number>(WEEKDAY_BUCKET_COUNT).fill(0);
}

export function emptyStepTotals(): CalcStepTotals {
  return { answered: 0, correct: 0, buckets: zeroBuckets() };
}

export function emptyCalcTotals(): CalcTotals {
  return {
    reduce: emptyStepTotals(),
    leap: emptyStepTotals(),
    sum: emptyStepTotals(),
    mod: emptyStepTotals(),
    code: emptyStepTotals(),
  };
}

function isStepId(value: unknown): value is CalcStepId {
  return typeof value === 'string' && (CALC_STEP_IDS as readonly string[]).includes(value);
}

/**
 * One answered step folded into the lifetime totals. Never mutates the input.
 * An attempt naming a step this build does not know is skipped rather than
 * thrown: a document written by a newer build is still worth opening.
 */
export function addCalcAttempt(totals: CalcTotals, attempt: CalcAttempt): CalcTotals {
  if (attempt === null || typeof attempt !== 'object' || !isStepId(attempt.step)) return totals;
  const before = totals[attempt.step] ?? emptyStepTotals();
  const buckets = [...before.buckets];
  buckets[latencyBucket(attempt.latencyMs)] += 1;
  return {
    ...totals,
    [attempt.step]: {
      answered: before.answered + 1,
      correct: before.correct + (attempt.correct === true ? 1 : 0),
      buckets,
    },
  };
}

/**
 * Totals rebuilt from a raw log. Used by the v4 migration, where the stored
 * `calcAttempts` are the only history there is, and as the repair path when a
 * stored aggregate is missing outright.
 */
export function buildCalcTotals(attempts: readonly CalcAttempt[]): CalcTotals {
  let totals = emptyCalcTotals();
  for (const attempt of attempts) totals = addCalcAttempt(totals, attempt);
  return totals;
}

/* ------------------------------------------------------------------ */
/* Reading numbers back out                                            */
/* ------------------------------------------------------------------ */

/**
 * `CalcStepTotals` and `WeekdayModeTotals` are the same histogram under two
 * field names, so the estimator is shared rather than copied.
 */
function asModeTotals(step: CalcStepTotals) {
  return { answered: step.answered, correct: step.correct, latencyBuckets: step.buckets };
}

/** Millis, or null before the step has been answered. Never 0 for "no data". */
export function calcStepMedian(totals: CalcTotals, step: CalcStepId): number | null {
  const one = totals[step];
  return one ? estimateMedianMs(asModeTotals(one)) : null;
}

/** 0..1, or null before the step has been answered. */
export function calcStepAccuracy(totals: CalcTotals, step: CalcStepId): number | null {
  const one = totals[step];
  return one ? accuracyOf(asModeTotals(one)) : null;
}

export function calcStepAnswered(totals: CalcTotals, step: CalcStepId): number {
  return totals[step]?.answered ?? 0;
}

/** Every step answered, added up. For "you have practised N steps". */
export function calcAnsweredTotal(totals: CalcTotals): number {
  let sum = 0;
  for (const step of CALC_STEP_IDS) sum += calcStepAnswered(totals, step);
  return sum;
}

/**
 * Before this many answers a step's median is noise, and pointing the user at
 * the wrong step is worse than pointing them at none.
 */
export const WEAKEST_STEP_MIN_SAMPLES = 5;

/**
 * The slowest step by median, or null before there is enough data.
 *
 * Only the four derivation steps are considered. `code` is a recall from
 * memory, not a step of the calculation, and it is always the fastest of the
 * five once it is learned — naming it "your weakest step" would be false.
 *
 * Ties break towards the step that comes first in the derivation, which is
 * where fixing it helps most and which keeps the answer deterministic.
 */
export function weakestStep(totals: CalcTotals): CalcStepId | null {
  let worst: CalcStepId | null = null;
  let worstMedian = -1;
  for (const step of CALC_DERIVATION_STEPS) {
    if (calcStepAnswered(totals, step) < WEAKEST_STEP_MIN_SAMPLES) continue;
    const median = calcStepMedian(totals, step);
    if (median === null) continue;
    if (median > worstMedian) {
      worst = step;
      worstMedian = median;
    }
  }
  return worst;
}

/* ------------------------------------------------------------------ */
/* Verify mode                                                         */
/* ------------------------------------------------------------------ */

export function emptyVerifyTotals(): VerifyTotals {
  return { agreedRight: 0, agreedWrong: 0, memoryRight: 0, calculationRight: 0, bothWrong: 0 };
}

/** Which counter an outcome lands in. */
const VERIFY_FIELD: Record<VerifyOutcome, keyof VerifyTotals> = {
  'agreed-right': 'agreedRight',
  'agreed-wrong': 'agreedWrong',
  'memory-right': 'memoryRight',
  'calculation-right': 'calculationRight',
  'both-wrong': 'bothWrong',
};

export const VERIFY_OUTCOMES: readonly VerifyOutcome[] = [
  'agreed-right',
  'agreed-wrong',
  'memory-right',
  'calculation-right',
  'both-wrong',
];

/**
 * The verdict on one comparison. Two answers against one truth: they either
 * agree or they do not, and at most one of two different answers can be right.
 */
export function classifyVerify(recalled: number, derived: number, actual: Code): VerifyOutcome {
  if (recalled === derived) return recalled === actual ? 'agreed-right' : 'agreed-wrong';
  if (recalled === actual) return 'memory-right';
  if (derived === actual) return 'calculation-right';
  return 'both-wrong';
}

/**
 * Fills in the truth and the verdict. The screen supplies what the user did;
 * what the code actually is comes from the shipped table, never from the
 * caller, so a UI bug cannot write a wrong "actual" into permanent totals.
 */
export function buildVerifyAttempt(input: VerifyResultInput): VerifyAttempt {
  const actual = codeFor(input.yy);
  return { ...input, actual, outcome: classifyVerify(input.recalled, input.derived, actual) };
}

/** One comparison folded into the lifetime totals. Never mutates the input. */
export function addVerifyResult(totals: VerifyTotals, attempt: VerifyAttempt): VerifyTotals {
  if (attempt === null || typeof attempt !== 'object') return totals;
  const field = VERIFY_FIELD[attempt.outcome];
  if (!field) return totals;
  return { ...totals, [field]: totals[field] + 1 };
}

export function buildVerifyTotals(attempts: readonly VerifyAttempt[]): VerifyTotals {
  let totals = emptyVerifyTotals();
  for (const attempt of attempts) totals = addVerifyResult(totals, attempt);
  return totals;
}

/** Comparisons made. */
export function verifyChecked(totals: VerifyTotals): number {
  return (
    totals.agreedRight + totals.agreedWrong + totals.memoryRight + totals.calculationRight + totals.bothWrong
  );
}

/** Times the two answers matched, right or wrong. */
export function verifyAgreed(totals: VerifyTotals): number {
  return totals.agreedRight + totals.agreedWrong;
}

export function verifyDisagreed(totals: VerifyTotals): number {
  return totals.memoryRight + totals.calculationRight + totals.bothWrong;
}

function rate(part: number, whole: number): number | null {
  return whole <= 0 ? null : part / whole;
}

/** 0..1: how often memory and calculation landed on the same code. */
export function verifyAgreementRate(totals: VerifyTotals): number | null {
  return rate(verifyAgreed(totals), verifyChecked(totals));
}

/** 0..1: how often the recalled code was the true one. */
export function verifyMemoryAccuracy(totals: VerifyTotals): number | null {
  return rate(totals.agreedRight + totals.memoryRight, verifyChecked(totals));
}

/** 0..1: how often the derived code was the true one. */
export function verifyCalculationAccuracy(totals: VerifyTotals): number | null {
  return rate(totals.agreedRight + totals.calculationRight, verifyChecked(totals));
}

/**
 * Of the times they disagreed, the share where memory was right. Null when
 * they have never disagreed, which is the good case and not a zero.
 */
export function verifyMemoryWinRate(totals: VerifyTotals): number | null {
  return rate(totals.memoryRight, verifyDisagreed(totals));
}

/* ------------------------------------------------------------------ */
/* Repair                                                              */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A non-negative whole number, or 0. Keeps NaN and strings off every screen. */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * One step's totals, made safe to render and to keep adding to. A bucket array
 * of the wrong length is padded or trimmed rather than discarded, `answered`
 * is only ever raised to cover samples that really exist, and `correct` is
 * clamped so accuracy cannot come out above 100%.
 */
function repairStepTotals(value: unknown): CalcStepTotals {
  if (!isRecord(value)) return emptyStepTotals();
  const stored = Array.isArray(value.buckets) ? value.buckets : [];
  const buckets = zeroBuckets();
  let samples = 0;
  for (let i = 0; i < WEEKDAY_BUCKET_COUNT; i += 1) {
    buckets[i] = count(stored[i]);
    samples += buckets[i];
  }
  const answered = Math.max(count(value.answered), samples);
  return { answered, correct: Math.min(count(value.correct), answered), buckets };
}

/**
 * The stored per-step aggregate, repaired. With no aggregate at all the totals
 * are rebuilt from whatever raw attempts came with the document, which is the
 * best history available and strictly better than starting at zero.
 */
export function repairCalcTotals(value: unknown, attempts: readonly CalcAttempt[] = []): CalcTotals {
  if (!isRecord(value)) return buildCalcTotals(attempts);
  const out = emptyCalcTotals();
  for (const step of CALC_STEP_IDS) out[step] = repairStepTotals(value[step]);
  return out;
}

/** The stored verify aggregate, repaired the same way. */
export function repairVerifyTotals(value: unknown, attempts: readonly VerifyAttempt[] = []): VerifyTotals {
  if (!isRecord(value)) return buildVerifyTotals(attempts);
  return {
    agreedRight: count(value.agreedRight),
    agreedWrong: count(value.agreedWrong),
    memoryRight: count(value.memoryRight),
    calculationRight: count(value.calculationRight),
    bothWrong: count(value.bothWrong),
  };
}

/* ------------------------------------------------------------------ */
/* Raw log validation                                                  */
/* ------------------------------------------------------------------ */

function isYear(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 99;
}

/**
 * Enough of a step attempt to count and to render. An entry that fails this is
 * corruption: keeping it would put an unknown step id or a NaN latency on a
 * screen, and the aggregate would disagree with the log it was built from.
 */
export function isCalcAttemptShaped(value: unknown): value is CalcAttempt {
  if (!isRecord(value)) return false;
  if (!isStepId(value.step)) return false;
  if (!isYear(value.yy)) return false;
  if (!Number.isFinite(value.timestamp)) return false;
  if (!Number.isFinite(value.latencyMs)) return false;
  return typeof value.correct === 'boolean';
}

export function isVerifyAttemptShaped(value: unknown): value is VerifyAttempt {
  if (!isRecord(value)) return false;
  if (!isYear(value.yy)) return false;
  if (!Number.isFinite(value.timestamp)) return false;
  if (typeof value.outcome !== 'string' || !(value.outcome in VERIFY_FIELD)) return false;
  if (typeof value.recalled !== 'number' || typeof value.derived !== 'number') return false;
  return Number.isFinite(value.recallLatencyMs) && Number.isFinite(value.deriveLatencyMs);
}
