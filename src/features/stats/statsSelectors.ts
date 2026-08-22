import type { Attempt, ItemState, Scope, SessionDay } from '@/domain/types';
import { inScope } from '@/domain/scope';
import { decadeOf } from '@/domain/yearCodes';
import { addDays, dayKey, daysBetween, median, startOfDay } from '@/domain/time';

/**
 * Every number on the Stats screen is derived here, not in a component.
 *
 * One scoping rule runs through the whole file: latency and accuracy count
 * **review-sourced attempts only**. Drills ask a different question under a
 * clock, so folding them in would make both numbers mean nothing in particular.
 */

const REVIEW_SOURCE = 'review';

/** Review attempts across every item, oldest first. */
export function reviewAttempts(items: ItemState[]): Attempt[] {
  const out: Attempt[] = [];
  for (const item of items) {
    for (const attempt of item.attemptHistory) {
      if (attempt.source === REVIEW_SOURCE) out.push(attempt);
    }
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

/** Review attempts for one item, oldest first. */
export function itemReviewAttempts(item: ItemState): Attempt[] {
  return item.attemptHistory
    .filter((a) => a.source === REVIEW_SOURCE)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/* ------------------------------------------------------------------ */
/* Accuracy                                                            */
/* ------------------------------------------------------------------ */

export interface AccuracyWindow {
  correct: number;
  /** Attempts actually in the window, which is fewer than `size` early on. */
  total: number;
  /** 0..1, or null when the window is empty. Never 0 for "no data". */
  ratio: number | null;
}

/**
 * Accuracy over the last `size` review attempts, app-wide. With fewer than
 * `size` attempts on record it reports over what exists rather than padding.
 */
export function accuracyOverLast(items: ItemState[], size = 100): AccuracyWindow {
  const attempts = reviewAttempts(items);
  const window = attempts.slice(Math.max(0, attempts.length - size));
  const correct = window.filter((a) => a.correct).length;
  return {
    correct,
    total: window.length,
    ratio: window.length === 0 ? null : correct / window.length,
  };
}

/* ------------------------------------------------------------------ */
/* Latency                                                            */
/* ------------------------------------------------------------------ */

/** Median review latency across every item. Null when there is nothing to take a median of. */
export function medianReviewLatency(items: ItemState[]): number | null {
  const values = reviewAttempts(items).map((a) => a.latencyMs);
  return values.length === 0 ? null : median(values);
}

/** Median review latency for one item. Null when it has never been reviewed. */
export function medianItemLatency(item: ItemState): number | null {
  const values = itemReviewAttempts(item).map((a) => a.latencyMs);
  return values.length === 0 ? null : median(values);
}

export interface DecadeLatency {
  /** 0..9. */
  decade: number;
  /** "00–09". */
  label: string;
  medianMs: number | null;
  attempts: number;
}

function decadeLabel(decade: number): string {
  const from = decade * 10;
  const to = from + 9;
  return `${String(from).padStart(2, '0')}–${String(to).padStart(2, '0')}`;
}

/**
 * Ten entries, always, in decade order. A decade with no review attempts gets
 * `medianMs: null` — an untouched decade is not a fast one.
 */
export function medianLatencyByDecade(items: ItemState[]): DecadeLatency[] {
  const buckets: number[][] = Array.from({ length: 10 }, () => []);
  for (const item of items) {
    const decade = decadeOf(item.yy);
    for (const attempt of item.attemptHistory) {
      if (attempt.source === REVIEW_SOURCE) buckets[decade].push(attempt.latencyMs);
    }
  }
  return buckets.map((values, decade) => ({
    decade,
    label: decadeLabel(decade),
    medianMs: values.length === 0 ? null : median(values),
    attempts: values.length,
  }));
}

/* ------------------------------------------------------------------ */
/* Due                                                                 */
/* ------------------------------------------------------------------ */

export interface DueCounts {
  /** Due by the end of today, overdue included. */
  today: number;
  /** Due by the end of the seventh day from today, today included. */
  week: number;
}

export function dueCounts(items: ItemState[], scope: Scope, now: number): DueCounts {
  const endOfToday = startOfDay(addDays(now, 1));
  const endOfWeek = startOfDay(addDays(now, 7));
  let today = 0;
  let week = 0;
  for (const item of items) {
    if (!item.introduced || !inScope(item.yy, scope)) continue;
    if (item.dueAt < endOfToday) today += 1;
    if (item.dueAt < endOfWeek) week += 1;
  }
  return { today, week };
}

/* ------------------------------------------------------------------ */
/* Streak                                                              */
/* ------------------------------------------------------------------ */

/**
 * Consecutive days ending today with at least one completed review.
 *
 * A day with reviews still to do is not a broken streak, so a run that ends
 * yesterday still counts while today is unfinished. A gap anywhere earlier ends
 * the count there.
 */
export function reviewStreak(days: Record<string, SessionDay>, now: number): number {
  const reviewed = (ts: number): boolean => {
    const day = days[dayKey(ts)];
    return Boolean(day && day.reviewsCompleted > 0);
  };

  let cursor: number;
  if (reviewed(now)) cursor = now;
  else if (reviewed(addDays(now, -1))) cursor = addDays(now, -1);
  else return 0;

  let count = 0;
  while (reviewed(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/* ------------------------------------------------------------------ */
/* Daily latency series                                                */
/* ------------------------------------------------------------------ */

export interface LatencyPoint {
  /** "YYYY-MM-DD" local. */
  date: string;
  /** Local midnight of that day. */
  ts: number;
  /** Null on a day with no reviews. A gap, never a zero. */
  medianMs: number | null;
  attempts: number;
}

/**
 * Median review latency per local day for the last `dayCount` days, ending
 * today. Days without reviews carry null so the chart can break the line.
 * Drawing a zero there would claim the user answered instantly.
 */
export function dailyLatencySeries(items: ItemState[], now: number, dayCount = 30): LatencyPoint[] {
  const byDay = new Map<string, number[]>();
  for (const attempt of reviewAttempts(items)) {
    const key = dayKey(attempt.timestamp);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(attempt.latencyMs);
    else byDay.set(key, [attempt.latencyMs]);
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

/**
 * Index runs of consecutive days that actually have a median, so the chart can
 * draw one polyline per run and leave the gaps empty. A run of length 1 has no
 * segment to draw and is the reason the chart marks lone points.
 */
export function contiguousRuns(values: (number | null)[]): number[][] {
  const runs: number[][] = [];
  let current: number[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) runs.push(current);
      current = [];
    } else {
      current.push(index);
    }
  });
  if (current.length > 0) runs.push(current);
  return runs;
}

/** Smallest round latency at or above `ms`, for the top of a chart axis. */
export function niceLatencyCeiling(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 1000;
  const step = ms <= 5000 ? 500 : ms <= 20000 ? 1000 : 5000;
  return Math.ceil(ms / step) * step;
}

/* ------------------------------------------------------------------ */
/* Per-item detail                                                     */
/* ------------------------------------------------------------------ */

/** The last `count` attempts of any source, newest first. */
export function recentAttempts(item: ItemState, count = 20): Attempt[] {
  return [...item.attemptHistory]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, count);
}

/** Plain words for when an item comes back. */
export function dueLabel(item: ItemState, now: number): string {
  if (!item.introduced) return 'Not started';
  const days = daysBetween(now, item.dueAt);
  if (days <= 0) return 'Due now';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}
