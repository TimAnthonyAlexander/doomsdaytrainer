import type {
  Attempt,
  Grade,
  GradeResult,
  ItemState,
  Scope,
  Settings,
  YearKey,
} from './types';
import { inScope } from './scope';
import { addDays } from './time';

/** Lapses at or above this flag the item as a leech. */
export const LEECH_THRESHOLD = 6;

const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;

/** A fresh, never-introduced item. Matches the defaults documented in types.ts. */
export function createItem(yy: YearKey): ItemState {
  return {
    yy,
    easeFactor: DEFAULT_EASE,
    interval: 0,
    dueAt: 0,
    repetitions: 0,
    lapses: 0,
    introduced: false,
    introducedAt: null,
    consecutiveFailures: 0,
    leech: false,
    attemptHistory: [],
  };
}

/**
 * The tap is the grade. Correctness and latency decide it; a hint caps it at 3.
 */
export function gradeFor(
  correct: boolean,
  latencyMs: number,
  hintUsed: boolean,
  settings: Settings,
): Grade {
  if (!correct) return 1;
  if (hintUsed) return 3;
  if (latencyMs < settings.fastThresholdMs) return 5;
  if (latencyMs < settings.mediumThresholdMs) return 4;
  return 3;
}

/** Standard SM-2 ease update, floored at 1.3. Applied for every grade. */
function nextEase(ease: number, grade: Grade): number {
  const q = grade;
  const updated = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return Math.max(MIN_EASE, updated);
}

/**
 * Apply one review answer to an item. Returns a new item; the input is never
 * mutated. Throws for drill-sourced attempts: drills record history but must
 * never touch scheduling state, and silent corruption there is unrecoverable.
 */
export function applyReview(
  item: ItemState,
  attempt: Attempt,
  settings: Settings,
  now: number,
): GradeResult {
  if (attempt.source === 'sprint' || attempt.source === 'gauntlet' || attempt.source === 'decade') {
    throw new Error(`applyReview called with drill attempt source: ${attempt.source}`);
  }

  const grade = gradeFor(attempt.correct, attempt.latencyMs, attempt.hintUsed, settings);
  const easeFactor = nextEase(item.easeFactor, grade);
  const attemptHistory = [...item.attemptHistory, attempt];

  if (grade === 1) {
    const lapses = item.lapses + 1;
    return {
      grade,
      correct: attempt.correct,
      next: {
        ...item,
        easeFactor,
        interval: 0,
        dueAt: now,
        repetitions: 0,
        lapses,
        consecutiveFailures: item.consecutiveFailures + 1,
        leech: item.leech || lapses >= LEECH_THRESHOLD,
        attemptHistory,
      },
    };
  }

  const repetitions = item.repetitions + 1;
  let interval: number;
  if (repetitions === 1) interval = 1;
  else if (repetitions === 2) interval = 6;
  else interval = Math.round(item.interval * easeFactor);

  return {
    grade,
    correct: attempt.correct,
    next: {
      ...item,
      easeFactor,
      interval,
      dueAt: addDays(now, interval),
      repetitions,
      consecutiveFailures: 0,
      attemptHistory,
    },
  };
}

/** Learn mode → review queue: interval 0, due immediately. */
export function introduce(item: ItemState, now: number): ItemState {
  return {
    ...item,
    introduced: true,
    introducedAt: item.introducedAt ?? now,
    interval: 0,
    dueAt: now,
  };
}

export function isDue(item: ItemState, now: number): boolean {
  return item.introduced && item.dueAt <= now;
}

/** Due, in scope, oldest first. Ordering is deterministic: dueAt, then yy. */
export function dueItems(items: ItemState[], scope: Scope, now: number): ItemState[] {
  return items
    .filter((item) => item.introduced && inScope(item.yy, scope) && item.dueAt <= now)
    .sort((a, b) => (a.dueAt === b.dueAt ? a.yy - b.yy : a.dueAt - b.dueAt));
}

/** 0..6, matching the mastery ramp in src/theme/palette.ts. */
export function masteryBucket(item: ItemState): number {
  if (!item.introduced) return 0;
  const d = item.interval;
  if (d <= 0) return 1;
  if (d < 4) return 2;
  if (d < 10) return 3;
  if (d < 30) return 4;
  if (d < 90) return 5;
  return 6;
}

export function isLeech(item: ItemState): boolean {
  return item.leech || item.lapses >= LEECH_THRESHOLD;
}
