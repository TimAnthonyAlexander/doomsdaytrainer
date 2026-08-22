import type {
  Attempt,
  Grade,
  GradeResult,
  ItemState,
  Scope,
  Settings,
  YearKey,
} from './types';
import { applyFluency, emptyFluency } from './fluency';
import { nextUnburied, orderVaried } from './rotation';
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
    fluency: emptyFluency(),
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
  // Scheduling does not read this and this does not read scheduling. A slow
  // correct answer still earns its interval; it just stops being called mastery.
  const fluency = applyFluency(item.fluency, attempt, settings);

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
        fluency,
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
      fluency,
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

/**
 * Due, in scope, oldest first.
 *
 * The tie-break used to be ascending `yy`, and that one line was doing real
 * damage. A learn block stamps its ten years with the same `dueAt`, so the
 * decade came back as 00, 01, 02… on its first review, and because the ten then
 * moved through identical intervals it kept arriving in that order for months.
 * The queue was rehearsing the sequence the block had just taught.
 *
 * Ties now break on the varied rotation instead. `dueAt` still comes first, so
 * nothing overdue is delayed; only the order within one due moment changes.
 * Ordering stays deterministic — the seed is derived from the day, so a queue
 * re-read during a session does not reshuffle under the user.
 */
export function dueItems(items: ItemState[], scope: Scope, now: number): ItemState[] {
  const due = items.filter(
    (item) => item.introduced && inScope(item.yy, scope) && item.dueAt <= now,
  );
  const rank = new Map<YearKey, number>();
  orderVaried(
    due.map((item) => item.yy),
    Math.floor(now / 86_400_000),
  ).forEach((yy, index) => rank.set(yy, index));

  return due.sort((a, b) =>
    a.dueAt === b.dueAt ? (rank.get(a.yy) ?? 0) - (rank.get(b.yy) ?? 0) : a.dueAt - b.dueAt,
  );
}

/**
 * The next due item, skipping years made easy by what was just asked.
 *
 * `recent` is the years already answered this session, oldest first.
 */
export function nextDueItem(queue: ItemState[], recent: readonly YearKey[]): ItemState | null {
  const yy = nextUnburied(
    queue.map((item) => item.yy),
    recent,
  );
  return yy === null ? null : (queue.find((item) => item.yy === yy) ?? null);
}

/**
 * 0..6, matching the mastery ramp in src/theme/palette.ts.
 *
 * This used to be the interval and nothing else, which meant an item the user
 * counted their way to every single time still climbed to the top of the ramp:
 * a six-second correct answer grades 3, a grade 3 advances the interval, and
 * the grid read the interval. The ramp now needs both — speed to get past the
 * middle, retention to get to the top — because either one alone overstates.
 *
 * Buckets 4 and up all require fluency, so the grid drops for anything held
 * only by a long interval. That drop is the correction, not a regression.
 */
export function masteryBucket(item: ItemState): number {
  if (!item.introduced) return 0;
  if (item.repetitions === 0) return 1;
  if (!item.fluency.fluent) return item.fluency.consecutiveFast > 0 ? 3 : 2;
  if (item.interval < 10) return 4;
  if (item.interval < 90) return 5;
  return 6;
}

export function isLeech(item: ItemState): boolean {
  return item.leech || item.lapses >= LEECH_THRESHOLD;
}
