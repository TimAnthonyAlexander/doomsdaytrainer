/**
 * Lifetime totals for the day-step trainer, broken down by the size of the
 * step and by its direction.
 *
 * The trim-proof approach is the one `weekdayLifetime.ts` already uses, and for
 * the same reason: `AppData.dayStepAttempts` is bounded, so a median computed
 * from it silently becomes a median of "recent" once the oldest entries fall
 * off the end. A running sum does not rescue that — a mean can be summed, a
 * median cannot. A fixed-width histogram can, to within one bucket, forever,
 * for a few hundred bytes.
 *
 * The bucket edges are `WEEKDAY_LATENCY_EDGES`, reused rather than redefined.
 * They fit: a day step is the fastest thing the method asks for, and those
 * edges resolve the sub-two-second band to 250ms, which is exactly where the
 * difference between counting and knowing shows up.
 *
 * Two cuts, both covering every attempt: by step size 0..6, and by direction.
 * Either one sums to the overall totals, so the overall figures are derived
 * rather than stored a third time.
 *
 * Pure and framework-free.
 */

import { DAY_STEP_DIRECTIONS, DAY_STEP_SIZES } from './dayStep';
import type {
  DayStepAttempt,
  DayStepBucketTotals,
  DayStepDirection,
  DayStepSize,
  DayStepTotals,
} from './types';
import {
  WEEKDAY_BUCKET_COUNT,
  accuracyOf,
  estimateMedianMs,
  latencyBucket,
} from './weekdayLifetime';

/* ------------------------------------------------------------------ */
/* Construction                                                        */
/* ------------------------------------------------------------------ */

function zeroBuckets(): number[] {
  return new Array<number>(WEEKDAY_BUCKET_COUNT).fill(0);
}

export function emptyDayStepBucketTotals(): DayStepBucketTotals {
  return { answered: 0, correct: 0, buckets: zeroBuckets() };
}

export function emptyDayStepTotals(): DayStepTotals {
  const bySize = {} as Record<DayStepSize, DayStepBucketTotals>;
  for (const size of DAY_STEP_SIZES) bySize[size] = emptyDayStepBucketTotals();
  const byDirection = {} as Record<DayStepDirection, DayStepBucketTotals>;
  for (const direction of DAY_STEP_DIRECTIONS) byDirection[direction] = emptyDayStepBucketTotals();
  return { bySize, byDirection };
}

function isSize(value: unknown): value is DayStepSize {
  return typeof value === 'number' && (DAY_STEP_SIZES as readonly number[]).includes(value);
}

function isDirection(value: unknown): value is DayStepDirection {
  return value === 'forward' || value === 'backward';
}

function addOne(
  totals: DayStepBucketTotals,
  correct: boolean,
  latencyMs: number,
): DayStepBucketTotals {
  const buckets = [...totals.buckets];
  buckets[latencyBucket(latencyMs)] += 1;
  return {
    answered: totals.answered + 1,
    correct: totals.correct + (correct ? 1 : 0),
    buckets,
  };
}

/**
 * One answered step folded into both cuts. Never mutates the input.
 *
 * An attempt whose size or direction this build does not recognise is skipped
 * rather than thrown: a document written by a newer build is still worth
 * opening, and counting it into a cell it does not belong in would be worse
 * than not counting it at all.
 */
export function addDayStepAttempt(totals: DayStepTotals, attempt: DayStepAttempt): DayStepTotals {
  if (attempt === null || typeof attempt !== 'object') return totals;
  if (!isSize(attempt.size) || !isDirection(attempt.direction)) return totals;
  const correct = attempt.correct === true;
  return {
    bySize: {
      ...totals.bySize,
      [attempt.size]: addOne(
        totals.bySize[attempt.size] ?? emptyDayStepBucketTotals(),
        correct,
        attempt.latencyMs,
      ),
    },
    byDirection: {
      ...totals.byDirection,
      [attempt.direction]: addOne(
        totals.byDirection[attempt.direction] ?? emptyDayStepBucketTotals(),
        correct,
        attempt.latencyMs,
      ),
    },
  };
}

/**
 * Totals rebuilt from a raw log. Used as the repair path when a stored
 * aggregate is missing outright, and by the v6 migration for a document that
 * somehow carries raw attempts without one.
 */
export function buildDayStepTotals(attempts: readonly DayStepAttempt[]): DayStepTotals {
  let totals = emptyDayStepTotals();
  for (const attempt of attempts) totals = addDayStepAttempt(totals, attempt);
  return totals;
}

/* ------------------------------------------------------------------ */
/* Reading numbers back out                                            */
/* ------------------------------------------------------------------ */

/** Two histograms added together. Same length, same edges, so it is a sum. */
export function combineDayStepTotals(
  a: DayStepBucketTotals,
  b: DayStepBucketTotals,
): DayStepBucketTotals {
  const buckets = zeroBuckets();
  for (let i = 0; i < WEEKDAY_BUCKET_COUNT; i += 1) {
    buckets[i] = (a.buckets[i] ?? 0) + (b.buckets[i] ?? 0);
  }
  return { answered: a.answered + b.answered, correct: a.correct + b.correct, buckets };
}

/**
 * Everything ever answered. Summed from the size cut, which covers every
 * attempt exactly once — as does the direction cut, and a test holds the two
 * to each other.
 */
export function overallDayStepTotals(totals: DayStepTotals): DayStepBucketTotals {
  let out = emptyDayStepBucketTotals();
  for (const size of DAY_STEP_SIZES) {
    out = combineDayStepTotals(out, totals.bySize[size] ?? emptyDayStepBucketTotals());
  }
  return out;
}

/**
 * `DayStepBucketTotals` and `WeekdayModeTotals` are the same histogram under
 * two field names, so the estimator is shared rather than copied.
 */
function asModeTotals(totals: DayStepBucketTotals) {
  return { answered: totals.answered, correct: totals.correct, latencyBuckets: totals.buckets };
}

/** Millis, or null before anything has been answered. Never 0 for "no data". */
export function dayStepMedianMs(totals: DayStepBucketTotals): number | null {
  return estimateMedianMs(asModeTotals(totals));
}

/** 0..1, or null before anything has been answered. */
export function dayStepAccuracy(totals: DayStepBucketTotals): number | null {
  return accuracyOf(asModeTotals(totals));
}

export function dayStepWrong(totals: DayStepBucketTotals): number {
  return Math.max(0, totals.answered - totals.correct);
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
 * One cell's totals, made safe to render and to keep adding to. A bucket array
 * of the wrong length is padded or trimmed rather than discarded, `answered` is
 * only ever raised to cover samples that really exist, and `correct` is clamped
 * so accuracy cannot come out above 100%.
 */
function repairBucketTotals(value: unknown): DayStepBucketTotals {
  if (!isRecord(value)) return emptyDayStepBucketTotals();
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
 * The stored aggregate, repaired. With no aggregate at all the totals are
 * rebuilt from whatever raw attempts came with the document, which is the best
 * history available and strictly better than starting at zero.
 */
export function repairDayStepTotals(
  value: unknown,
  attempts: readonly DayStepAttempt[] = [],
): DayStepTotals {
  if (!isRecord(value)) return buildDayStepTotals(attempts);
  const bySizeStored = isRecord(value.bySize) ? value.bySize : {};
  const byDirectionStored = isRecord(value.byDirection) ? value.byDirection : {};
  const out = emptyDayStepTotals();
  for (const size of DAY_STEP_SIZES) out.bySize[size] = repairBucketTotals(bySizeStored[size]);
  for (const direction of DAY_STEP_DIRECTIONS) {
    out.byDirection[direction] = repairBucketTotals(byDirectionStored[direction]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Raw log validation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Enough of a day-step attempt to count and to render. An entry that fails this
 * is corruption: keeping it would put an unknown size in a breakdown with no
 * column to go in, or a NaN latency in a histogram.
 */
export function isDayStepAttemptShaped(value: unknown): value is DayStepAttempt {
  if (!isRecord(value)) return false;
  if (!isSize(value.size) || !isDirection(value.direction)) return false;
  if (!Number.isInteger(value.month) || (value.month as number) < 1 || (value.month as number) > 12) {
    return false;
  }
  if (!Number.isInteger(value.anchorDay) || !Number.isInteger(value.targetDay)) return false;
  if (!Number.isFinite(value.timestamp)) return false;
  if (!Number.isFinite(value.latencyMs)) return false;
  return typeof value.correct === 'boolean';
}
