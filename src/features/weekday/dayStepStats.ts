import type { DayStepDirection, DayStepSize, DayStepTotals } from '@/domain/types';
import { DAY_STEP_DIRECTIONS, DAY_STEP_SIZES } from '@/domain/dayStep';
import {
  dayStepMedianMs,
  dayStepWrong,
  emptyDayStepBucketTotals,
  overallDayStepTotals,
} from '@/domain/dayStepLifetime';
import { formatMs } from '@/domain/time';
import type { SessionSummary } from '@/features/review/summary';

/**
 * The numbers the day-step trainer shows.
 *
 * Two breakdowns, because "you are slow at this" is not something anyone can
 * act on. A median per step size says which of the seven additions is the one
 * still being counted out, and a median per direction says whether the cost is
 * in going back off the doomsday, which is the half that turns the addition
 * into a subtraction.
 */

/** One line of a breakdown. The same shape whichever cut filled it. */
export interface DayStepRow {
  label: string;
  answered: number;
  correct: number;
  wrong: number;
  /** Null when the row has nothing in it. Never 0, which would read as instant. */
  medianMs: number | null;
}

/** "+0" through "+6": what gets added to the doomsday's weekday. */
export function sizeLabel(size: DayStepSize): string {
  return `+${size}`;
}

/** Plain words rather than "forward" and "backward", which name nothing on their own. */
export const DIRECTION_LABEL: Record<DayStepDirection, string> = {
  forward: 'Counting on',
  backward: 'Counting back',
};

function rowFrom(label: string, totals: DayStepTotals['bySize'][DayStepSize]): DayStepRow {
  return {
    label,
    answered: totals.answered,
    correct: totals.correct,
    wrong: dayStepWrong(totals),
    medianMs: dayStepMedianMs(totals),
  };
}

/** Seven rows, always, +0 first, then the total of all of them. */
export function sizeRows(totals: DayStepTotals): DayStepRow[] {
  return [
    ...DAY_STEP_SIZES.map((size) =>
      rowFrom(sizeLabel(size), totals.bySize[size] ?? emptyDayStepBucketTotals()),
    ),
    rowFrom('Total', overallDayStepTotals(totals)),
  ];
}

/** Both directions, always, in the order the breakdown lists them. */
export function directionRows(totals: DayStepTotals): DayStepRow[] {
  return DAY_STEP_DIRECTIONS.map((direction) =>
    rowFrom(DIRECTION_LABEL[direction], totals.byDirection[direction] ?? emptyDayStepBucketTotals()),
  );
}

/**
 * The slowest step size, or null before there is enough of it to mean anything.
 * Ties go to the smaller step, which keeps the answer deterministic.
 */
export const SLOWEST_STEP_MIN_SAMPLES = 5;

export function slowestSize(totals: DayStepTotals): DayStepSize | null {
  let worst: DayStepSize | null = null;
  let worstMedian = -1;
  for (const size of DAY_STEP_SIZES) {
    const cell = totals.bySize[size];
    if (!cell || cell.answered < SLOWEST_STEP_MIN_SAMPLES) continue;
    const median = dayStepMedianMs(cell);
    if (median === null || median <= worstMedian) continue;
    worst = size;
    worstMedian = median;
  }
  return worst;
}

/** "12 steps, 1 wrong, median 1.4s". Empty string before anything is answered. */
export function sessionLine(summary: SessionSummary): string {
  if (summary.total === 0) return '';
  const steps = summary.total === 1 ? '1 step' : `${summary.total} steps`;
  return `${steps}, ${summary.wrong} wrong, median ${formatMs(summary.medianLatencyMs)}`;
}
