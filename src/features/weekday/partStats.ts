/**
 * What the two half-trainers have to say about themselves.
 *
 * Every lifetime figure is read from `partTotals`, never from the raw log, so
 * trimming `partAttempts` cannot move a number the screen calls "all time".
 */

import { dayStepAccuracy, dayStepMedianMs } from '@/domain/dayStepLifetime';
import { overallMethodPartTotals } from '@/domain/methodPartLifetime';
import type { DayStepBucketTotals, MethodPart, MethodPartTotals } from '@/domain/types';
import { formatMs } from '@/domain/time';
import { ALL_CENTURIES, ALL_MONTHS, centuryLabel, monthName } from '@/domain/weekday';
import type { SessionSummary } from '@/features/review/summary';
import type { Tally } from './weekdayStats';

/** "12 answered, 2 wrong, median 1.1s". Empty while nothing has been answered. */
export function partSessionLine(summary: SessionSummary): string {
  if (summary.total === 0) return '';
  const answered = summary.total === 1 ? '1 answered' : `${summary.total} answered`;
  return `${answered}, ${summary.wrong} wrong, median ${formatMs(summary.medianLatencyMs)}`;
}

/** "340 answered, 96% right, median 1.3s", or null with nothing behind it. */
export function partLifetimeLine(totals: MethodPartTotals, part: MethodPart): string | null {
  const overall = overallMethodPartTotals(totals, part);
  if (overall.answered === 0) return null;
  const accuracy = dayStepAccuracy(overall);
  const median = dayStepMedianMs(overall);
  const parts = [`${overall.answered} answered`];
  if (accuracy !== null) parts.push(`${Math.round(accuracy * 100)}% right`);
  if (median !== null) parts.push(`median ${formatMs(median)}`);
  return parts.join(', ');
}

/**
 * One row of a breakdown, in the shape `WeekdayStatsView` already draws — a
 * `Tally` with a label on it, so the same block renders both.
 */
export interface PartTotalsRow extends Tally {
  label: string;
}

function rowFrom(label: string, cell: DayStepBucketTotals | undefined): PartTotalsRow {
  const totals = cell ?? { answered: 0, correct: 0, buckets: [] };
  return {
    label,
    attempts: totals.answered,
    correct: totals.correct,
    accuracy: dayStepAccuracy(totals),
    medianMs: dayStepMedianMs(totals),
  };
}

/**
 * The year half by century: four rows, one per anchor.
 *
 * A per-decade cut would be the more obvious one and it is the wrong one. The
 * year half is an anchor plus a code, the hundred codes already have a mastery
 * grid and a per-decade latency table on Stats, and this is the only place the
 * four anchors are ever timed.
 */
export function yearPartRows(totals: MethodPartTotals): PartTotalsRow[] {
  return ALL_CENTURIES.map((century) =>
    rowFrom(centuryLabel(century), totals.yearByCentury[String(century)]),
  );
}

/** The date half by month: twelve rows, one per month doomsday. */
export function datePartRows(totals: MethodPartTotals): PartTotalsRow[] {
  return ALL_MONTHS.map((month) => rowFrom(monthName(month), totals.dateByMonth[String(month)]));
}

/** Whether either half has anything recorded, so an empty screen can say so. */
export function hasPartHistory(totals: MethodPartTotals): boolean {
  return (
    overallMethodPartTotals(totals, 'year').answered > 0 ||
    overallMethodPartTotals(totals, 'date').answered > 0
  );
}
