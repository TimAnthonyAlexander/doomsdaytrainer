import type { WeekdayAttempt, WeekdayMode, WeekdayTotals } from '@/domain/types';
import { median } from '@/domain/time';
import { ALL_CENTURIES, ALL_MONTHS, MONTH_NAMES, centuryLabel } from '@/domain/weekday';
import {
  WEEKDAY_MODES,
  estimateMedianMs,
  overallModeTotals,
  wrongCount,
} from '@/domain/weekdayLifetime';
import type { SessionResult } from '@/features/review/summary';

/**
 * Numbers for the weekday trainer.
 *
 * The Stats screen's selectors read `ItemState.attemptHistory` and filter on
 * `source === 'review'`. Weekday attempts are not per-item — a date belongs to
 * no item — so none of those helpers fit, and these read the trainer's own log.
 */

export interface Tally {
  attempts: number;
  correct: number;
  /** 0..1, or null when nothing has been answered. Never 0 for "no data". */
  accuracy: number | null;
  medianMs: number | null;
}

function tally(attempts: readonly WeekdayAttempt[]): Tally {
  if (attempts.length === 0) return { attempts: 0, correct: 0, accuracy: null, medianMs: null };
  let correct = 0;
  const latencies: number[] = [];
  for (const attempt of attempts) {
    if (attempt.correct) correct += 1;
    latencies.push(attempt.latencyMs);
  }
  return {
    attempts: attempts.length,
    correct,
    accuracy: correct / attempts.length,
    medianMs: median(latencies),
  };
}

export function overallTally(attempts: readonly WeekdayAttempt[]): Tally {
  return tally(attempts);
}

/* ------------------------------------------------------------------ */
/* By mode                                                             */
/* ------------------------------------------------------------------ */

export interface ModeTally extends Tally {
  mode: WeekdayMode;
  label: string;
}

const MODE_LABEL: Record<WeekdayMode, string> = {
  assisted: 'Assisted',
  unassisted: 'Unassisted',
};

/** Both modes, always, in the order the toggle shows them. */
export function tallyByMode(attempts: readonly WeekdayAttempt[]): ModeTally[] {
  return (['assisted', 'unassisted'] as const).map((mode) => ({
    mode,
    label: MODE_LABEL[mode],
    ...tally(attempts.filter((attempt) => attempt.mode === mode)),
  }));
}

/* ------------------------------------------------------------------ */
/* By month and by century                                             */
/* ------------------------------------------------------------------ */

export interface MonthTally extends Tally {
  /** 1..12. */
  month: number;
  label: string;
}

/**
 * Twelve entries, always, January first. A month with no attempts carries null
 * rather than a zero: the point of this breakdown is spotting which month
 * doomsday is slow, and an untouched month is not a fast one.
 */
export function tallyByMonth(attempts: readonly WeekdayAttempt[]): MonthTally[] {
  const buckets = new Map<number, WeekdayAttempt[]>();
  for (const attempt of attempts) {
    const bucket = buckets.get(attempt.month);
    if (bucket) bucket.push(attempt);
    else buckets.set(attempt.month, [attempt]);
  }
  return ALL_MONTHS.map((month) => ({
    month,
    label: MONTH_NAMES[month - 1],
    ...tally(buckets.get(month) ?? []),
  }));
}

export interface CenturyTally extends Tally {
  /** 18..21. */
  century: number;
  label: string;
}

export function tallyByCentury(attempts: readonly WeekdayAttempt[]): CenturyTally[] {
  const buckets = new Map<number, WeekdayAttempt[]>();
  for (const attempt of attempts) {
    const century = Math.floor(attempt.fullYear / 100);
    const bucket = buckets.get(century);
    if (bucket) bucket.push(attempt);
    else buckets.set(century, [attempt]);
  }
  return ALL_CENTURIES.map((century) => ({
    century,
    label: centuryLabel(century),
    ...tally(buckets.get(century) ?? []),
  }));
}

/* ------------------------------------------------------------------ */
/* This session against all time                                       */
/* ------------------------------------------------------------------ */

/** One answered date in the current sitting, with the mode it was answered under. */
export interface WeekdaySessionResult extends SessionResult {
  mode: WeekdayMode;
}

/** One line of the totals block. The same shape whichever source filled it. */
export interface TotalsRow {
  label: string;
  answered: number;
  correct: number;
  wrong: number;
  /** Null when the row has nothing in it. Never 0, which would read as instant. */
  medianMs: number | null;
}

function rowFrom(label: string, results: readonly WeekdaySessionResult[]): TotalsRow {
  const correct = results.filter((result) => result.correct).length;
  return {
    label,
    answered: results.length,
    correct,
    wrong: results.length - correct,
    medianMs: results.length === 0 ? null : Math.round(median(results.map((r) => r.latencyMs))),
  };
}

/**
 * Assisted, unassisted, then both. The session block has every latency it is
 * describing in memory, so its median is exact.
 */
export function sessionRows(results: readonly WeekdaySessionResult[]): TotalsRow[] {
  return [
    ...WEEKDAY_MODES.map((mode) =>
      rowFrom(MODE_LABEL[mode], results.filter((result) => result.mode === mode)),
    ),
    rowFrom('Total', results),
  ];
}

/**
 * The same three rows read out of the persisted histogram instead. The medians
 * here are grouped estimates, accurate to the width of the bucket they land in,
 * because the raw latencies they came from are long gone.
 */
export function lifetimeRows(totals: WeekdayTotals): TotalsRow[] {
  const parts = [...WEEKDAY_MODES.map((mode) => totals[mode]), overallModeTotals(totals)];
  const labels = [...WEEKDAY_MODES.map((mode) => MODE_LABEL[mode]), 'Total'];
  return parts.map((part, index) => ({
    label: labels[index],
    answered: part.answered,
    correct: part.correct,
    wrong: wrongCount(part),
    medianMs: estimateMedianMs(part),
  }));
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** "94%", or "—" when there is nothing to be accurate about. */
export function formatAccuracy(ratio: number | null): string {
  return ratio === null ? '—' : `${Math.round(ratio * 100)}%`;
}

/** The one line under a finished run: "24 dates, 3 wrong". */
export function runLine(total: number, correct: number): string {
  const wrong = total - correct;
  const dates = total === 1 ? '1 date' : `${total} dates`;
  return `${dates}, ${wrong} wrong`;
}
