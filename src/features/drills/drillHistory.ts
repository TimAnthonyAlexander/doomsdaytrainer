import type { DrillMode, DrillRecord } from '@/domain/types';
import { addDays, dayKey, median, startOfDay } from '@/domain/time';
import type { LatencyPoint } from '@/features/stats/statsSelectors';

/**
 * Everything read back out of the drill log: personal bests and the median
 * latency series. Pure, and the only place the "lower is better" inversion is
 * decided.
 */

/**
 * A sprint counts answers inside a fixed minute, so a bigger number is better.
 * The gauntlet and the decade drill ask a fixed number of codes and score the
 * clock, so a smaller number is better. Getting this backwards would quietly
 * report every slow run as a record.
 */
export function lowerIsBetter(mode: DrillMode): boolean {
  return mode !== 'sprint';
}

/**
 * Two runs are comparable only when they asked the same questions.
 *
 * Mode and decade are on the record. Scope reaches it through `total`, the
 * number of prompts the scope produced, so a 50-code gauntlet time is never
 * held up against a 100-code one. A sprint is a fixed minute whatever the pool
 * is, and its `total` is however many the user got through, so its key is the
 * mode alone.
 */
export function bestKey(mode: DrillMode, decade: number | null, total: number): string {
  if (mode === 'sprint') return 'sprint';
  return `${mode}|${decade ?? '-'}|${total}`;
}

export function recordKey(record: DrillRecord): string {
  return bestKey(record.mode, record.decade, record.total);
}

/** The best score on record for that exact combination, or null for none. */
export function bestScore(
  records: readonly DrillRecord[],
  mode: DrillMode,
  decade: number | null,
  total: number,
): number | null {
  const key = bestKey(mode, decade, total);
  let best: number | null = null;
  for (const record of records) {
    if (recordKey(record) !== key) continue;
    if (best === null) best = record.score;
    else best = lowerIsBetter(mode) ? Math.min(best, record.score) : Math.max(best, record.score);
  }
  return best;
}

/** Strict. Matching your previous best is not beating it. */
export function beatsBest(mode: DrillMode, score: number, previous: number | null): boolean {
  if (previous === null) return true;
  return lowerIsBetter(mode) ? score < previous : score > previous;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/**
 * A running clock: "8.4", "59.9", "1:12.4". Tenths, always, so the width of
 * the number changes once a minute rather than once a tick.
 */
export function formatClock(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const tenthsTotal = Math.floor(safe / 100);
  const tenths = tenthsTotal % 10;
  const secondsTotal = Math.floor(tenthsTotal / 10);
  const seconds = secondsTotal % 60;
  const minutes = Math.floor(secondsTotal / 60);
  if (minutes === 0) return `${seconds}.${tenths}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

/** The same clock with a unit, for anywhere it is read rather than watched. */
export function formatDuration(ms: number): string {
  const clock = formatClock(ms);
  return clock.includes(':') ? clock : `${clock}s`;
}

/** A score in the units of its own mode. */
export function formatScore(mode: DrillMode, score: number): string {
  return lowerIsBetter(mode) ? formatDuration(score) : String(score);
}

/* ------------------------------------------------------------------ */
/* Median latency series                                               */
/* ------------------------------------------------------------------ */

/**
 * Median drill latency per local day for the last `dayCount` days.
 *
 * Each drill record already carries the median of its own run, so a day's value
 * is the median of those medians: one long gauntlet does not outweigh a short
 * sprint on the same day. Days without a drill carry null, never a zero.
 */
export function drillLatencySeries(
  records: readonly DrillRecord[],
  now: number,
  dayCount = 30,
): LatencyPoint[] {
  const byDay = new Map<string, number[]>();
  for (const record of records) {
    if (record.total <= 0) continue;
    const key = dayKey(record.timestamp);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(record.medianLatencyMs);
    else byDay.set(key, [record.medianLatencyMs]);
  }

  const points: LatencyPoint[] = [];
  for (let back = dayCount - 1; back >= 0; back -= 1) {
    const ts = startOfDay(addDays(now, -back));
    const date = dayKey(ts);
    const values = byDay.get(date);
    points.push({
      date,
      ts,
      medianMs: values && values.length > 0 ? median(values) : null,
      attempts: values ? values.length : 0,
    });
  }
  return points;
}
