/**
 * Lifetime totals for the method's two halves.
 *
 * Same trim-proof pattern as every other aggregate in the app, and the same
 * bucket edges, so `dayStepMedianMs` and friends read these too: a median
 * cannot be recovered from a running sum, the raw log is bounded because an
 * unbounded array in a single-document store makes every write slow, so the
 * counts and a fixed-edge latency histogram are kept beside it and trimming
 * the log cannot move the all-time numbers.
 *
 * Each half is cut exactly once — the year half by century, the date half by
 * month — and each cut covers every attempt of its half. So a half's overall
 * figures are the sum of its own cut and are never stored a second time.
 */

import { combineDayStepTotals, emptyDayStepBucketTotals } from './dayStepLifetime';
import { latencyBucket } from './weekdayLifetime';
import type { DayStepBucketTotals, MethodPart, MethodPartAttempt, MethodPartTotals } from './types';
import { ALL_CENTURIES, ALL_MONTHS, MAX_YEAR, MIN_YEAR, monthLength } from './weekday';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/* ------------------------------------------------------------------ */
/* Construction                                                        */
/* ------------------------------------------------------------------ */

export function emptyMethodPartTotals(): MethodPartTotals {
  const yearByCentury: Record<string, DayStepBucketTotals> = {};
  for (const century of ALL_CENTURIES) yearByCentury[String(century)] = emptyDayStepBucketTotals();
  const dateByMonth: Record<string, DayStepBucketTotals> = {};
  for (const month of ALL_MONTHS) dateByMonth[String(month)] = emptyDayStepBucketTotals();
  return { yearByCentury, dateByMonth };
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
 * One answered half folded into its own cut. Never mutates the input.
 *
 * An attempt this build cannot place — an unknown part, a century or month
 * outside the shipped tables — is skipped rather than thrown. A document
 * written by a newer build is still worth opening, and counting an attempt
 * into a cell it does not belong in is worse than not counting it.
 */
export function addMethodPartAttempt(
  totals: MethodPartTotals,
  attempt: MethodPartAttempt,
): MethodPartTotals {
  if (!isRecord(attempt)) return totals;
  const correct = attempt.correct === true;

  if (attempt.part === 'year') {
    if (!Number.isInteger(attempt.fullYear)) return totals;
    const century = Math.floor(attempt.fullYear / 100);
    const key = String(century);
    if (!(ALL_CENTURIES as readonly number[]).includes(century)) return totals;
    return {
      ...totals,
      yearByCentury: {
        ...totals.yearByCentury,
        [key]: addOne(
          totals.yearByCentury[key] ?? emptyDayStepBucketTotals(),
          correct,
          attempt.latencyMs,
        ),
      },
    };
  }

  if (attempt.part === 'date') {
    const key = String(attempt.month);
    if (!(ALL_MONTHS as readonly number[]).includes(attempt.month)) return totals;
    return {
      ...totals,
      dateByMonth: {
        ...totals.dateByMonth,
        [key]: addOne(
          totals.dateByMonth[key] ?? emptyDayStepBucketTotals(),
          correct,
          attempt.latencyMs,
        ),
      },
    };
  }

  return totals;
}

/**
 * Totals rebuilt from a raw log. The repair path when a stored aggregate is
 * missing outright, and the migration path for a document that somehow carries
 * raw attempts without one.
 */
export function buildMethodPartTotals(
  attempts: readonly MethodPartAttempt[],
): MethodPartTotals {
  let totals = emptyMethodPartTotals();
  for (const attempt of attempts) totals = addMethodPartAttempt(totals, attempt);
  return totals;
}

/* ------------------------------------------------------------------ */
/* Reading numbers back out                                            */
/* ------------------------------------------------------------------ */

/** Everything ever answered on one half, summed from that half's own cut. */
export function overallMethodPartTotals(
  totals: MethodPartTotals,
  part: MethodPart,
): DayStepBucketTotals {
  const cut = part === 'year' ? totals.yearByCentury : totals.dateByMonth;
  const keys = part === 'year' ? ALL_CENTURIES : ALL_MONTHS;
  let out = emptyDayStepBucketTotals();
  for (const key of keys) {
    out = combineDayStepTotals(out, cut[String(key)] ?? emptyDayStepBucketTotals());
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Repair                                                              */
/* ------------------------------------------------------------------ */

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * One cell, repaired field by field rather than discarded. A stored bucket
 * array of the wrong length is padded or trimmed, `answered` is only ever
 * raised to cover samples that really exist, and `correct` is clamped so
 * accuracy cannot come out above 100%.
 */
function repairBucketTotals(value: unknown): DayStepBucketTotals {
  const empty = emptyDayStepBucketTotals();
  if (!isRecord(value)) return empty;
  const stored = Array.isArray(value.buckets) ? value.buckets : [];
  const buckets = empty.buckets.map((_unused, index) => count(stored[index]));
  const samples = buckets.reduce((sum, bucket) => sum + bucket, 0);
  const answered = Math.max(count(value.answered), samples);
  return { answered, correct: Math.min(count(value.correct), answered), buckets };
}

/**
 * The stored aggregate, repaired. With no aggregate at all the totals are
 * rebuilt from whatever raw attempts came with the document, which is the best
 * history available and strictly better than starting at zero.
 */
export function repairMethodPartTotals(
  value: unknown,
  attempts: readonly MethodPartAttempt[] = [],
): MethodPartTotals {
  if (!isRecord(value)) return buildMethodPartTotals(attempts);
  const yearStored = isRecord(value.yearByCentury) ? value.yearByCentury : {};
  const dateStored = isRecord(value.dateByMonth) ? value.dateByMonth : {};
  const out = emptyMethodPartTotals();
  for (const century of ALL_CENTURIES) {
    out.yearByCentury[String(century)] = repairBucketTotals(yearStored[String(century)]);
  }
  for (const month of ALL_MONTHS) {
    out.dateByMonth[String(month)] = repairBucketTotals(dateStored[String(month)]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Raw log validation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Enough of a half-attempt to count and to render. An entry that fails this is
 * corruption: keeping it would put an unplaceable prompt in a breakdown with no
 * column to go in, or a NaN latency in a histogram.
 *
 * The day is checked against the month it claims, using the leap flag it
 * carries, so a stored "February 30" cannot reach a screen that would try to
 * work out its doomsday offset.
 */
export function isMethodPartAttemptShaped(value: unknown): value is MethodPartAttempt {
  if (!isRecord(value)) return false;
  if (!Number.isFinite(value.timestamp)) return false;
  if (!Number.isFinite(value.latencyMs)) return false;
  if (typeof value.correct !== 'boolean') return false;

  if (value.part === 'year') {
    const year = value.fullYear;
    return Number.isInteger(year) && (year as number) >= MIN_YEAR && (year as number) <= MAX_YEAR;
  }

  if (value.part === 'date') {
    const month = value.month;
    if (!Number.isInteger(month) || (month as number) < 1 || (month as number) > 12) return false;
    if (typeof value.leapYear !== 'boolean') return false;
    const day = value.day;
    if (!Number.isInteger(day)) return false;
    return (day as number) >= 1 && (day as number) <= monthLength(month as number, value.leapYear);
  }

  return false;
}
