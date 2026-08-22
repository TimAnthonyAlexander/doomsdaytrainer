import { daysBetween, median } from '@/domain/time';

export interface SessionResult {
  correct: boolean;
  latencyMs: number;
}

export interface SessionSummary {
  total: number;
  wrong: number;
  medianLatencyMs: number;
}

export function summarise(results: SessionResult[]): SessionSummary {
  return {
    total: results.length,
    wrong: results.filter((result) => !result.correct).length,
    medianLatencyMs: median(results.map((result) => result.latencyMs)),
  };
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * How far off the next item is, as a phrase to drop after "Next item due".
 * Null when there is nothing scheduled at all.
 */
export function nextDueLabel(dueAt: number | null, now: number): string | null {
  if (dueAt === null) return null;
  const delta = dueAt - now;
  if (delta <= 0) return 'now';
  if (delta < MINUTE) return 'in under a minute';
  if (delta < HOUR) {
    const minutes = Math.round(delta / MINUTE);
    return minutes === 1 ? 'in a minute' : `in ${minutes} minutes`;
  }
  if (delta < DAY) {
    const hours = Math.round(delta / HOUR);
    // 23h50m rounds to 24, which reads worse than the day form.
    if (hours < 24) return hours === 1 ? 'in an hour' : `in ${hours} hours`;
  }
  const days = daysBetween(now, dueAt);
  if (days <= 1) return 'tomorrow';
  return `in ${days} days`;
}
