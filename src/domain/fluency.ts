import type { Attempt, Fluency, Settings } from './types';
import { dayKey } from './time';

export type { Fluency };

/**
 * Fluency: whether the answer is being recalled or worked out.
 *
 * The scheduler cannot tell the difference. `gradeFor` gives a correct answer
 * that took six seconds a grade 3, which still advances the interval, so an
 * item the user counts their way to every single time reaches a ninety-day
 * interval and reports as mastered. That is the hole this closes.
 *
 * It closes it beside SM-2 rather than inside it. There is no evidence that
 * punishing a slow correct answer in the schedule helps — a slow correct answer
 * is real retrieval evidence and deserves its interval — and Rickard, Lau &
 * Pashler (2008) found that pushing for direct retrieval *within* a session
 * makes performance look better that day and worse days later. So scheduling is
 * left exactly as it was and fluency becomes a second, separate state that the
 * mastery grid reports instead of the interval.
 *
 * What counts is deliberately narrow:
 *
 * - **Correct**, obviously.
 * - **Unhinted.** A hint caps the grade at 3 everywhere else in the app for the
 *   same reason it disqualifies here.
 * - **Under the fast threshold.** XtraMath's published rationale for their own
 *   three-second cut is the clearest statement of what this number is for: long
 *   enough to enter a recalled answer, not long enough to comfortably enter a
 *   counted one.
 * - **On a different day from the last one that counted.** Rawson & Dunlosky's
 *   successive relearning work found three correct recalls spread over three
 *   spaced sessions produce more than double the recall of three in one
 *   session. Two fast answers ten seconds apart are one event.
 *
 * Two of those in a row makes an item fluent. Two is also what takes the
 * seven-button pad's 14.3% chance of a lucky tap down to about 2%.
 *
 * Fluency is losable. Graf & Auman report unannounced timings a year after a
 * course falling by a factor of three to ten, so a state that could only ever
 * be earned would overstate exactly the way the interval-based grid did.
 */

/** Consecutive qualifying answers that make an item fluent. */
export const FLUENT_RUN = 2;

/** Consecutive correct-but-not-qualifying answers that take fluency away. */
export const LAPSE_RUN = 2;

export function emptyFluency(): Fluency {
  return {
    consecutiveFast: 0,
    consecutiveSlow: 0,
    lastFastDay: null,
    fluent: false,
    fluentAt: null,
  };
}

/** Correct, unhinted and under the fast threshold. Says nothing about the day. */
export function qualifies(attempt: Attempt, settings: Settings): boolean {
  return attempt.correct && !attempt.hintUsed && attempt.latencyMs < settings.fastThresholdMs;
}

/**
 * Fold one answer into an item's fluency. Never mutates.
 *
 * A wrong answer clears everything: whatever route was being used, it did not
 * arrive. A qualifying answer on a day that has already contributed holds the
 * run where it is rather than advancing it, so a burst of fast taps in one
 * sitting cannot make an item fluent on its own.
 */
export function applyFluency(state: Fluency, attempt: Attempt, settings: Settings): Fluency {
  if (!attempt.correct) {
    return { ...emptyFluency(), lastFastDay: state.lastFastDay };
  }

  if (!qualifies(attempt, settings)) {
    const consecutiveSlow = state.consecutiveSlow + 1;
    const lapsed = consecutiveSlow >= LAPSE_RUN;
    return {
      ...state,
      consecutiveFast: 0,
      consecutiveSlow,
      fluent: lapsed ? false : state.fluent,
      fluentAt: lapsed ? null : state.fluentAt,
    };
  }

  const day = dayKey(attempt.timestamp);
  const sameDay = day === state.lastFastDay;
  const consecutiveFast = sameDay ? Math.max(1, state.consecutiveFast) : state.consecutiveFast + 1;
  const fluent = state.fluent || consecutiveFast >= FLUENT_RUN;

  return {
    consecutiveFast,
    consecutiveSlow: 0,
    lastFastDay: day,
    fluent,
    fluentAt: fluent ? (state.fluentAt ?? attempt.timestamp) : null,
  };
}

/**
 * Rebuild fluency from an item's stored attempts. Used by the v5 migration so
 * a user who has been practising for weeks arrives with the fluency they have
 * already earned rather than at zero.
 *
 * The attempt log is capped, so this can only see as far back as the cap. That
 * is the right failure: the run it reconstructs is the *recent* one, which is
 * what fluency is supposed to describe.
 */
export function buildFluency(attempts: readonly Attempt[], settings: Settings): Fluency {
  let state = emptyFluency();
  for (const attempt of attempts) {
    if (!countsTowardFluency(attempt.source)) continue;
    state = applyFluency(state, attempt, settings);
  }
  return state;
}

/**
 * Which surfaces feed fluency: exactly the ones that schedule.
 *
 * Drill and learn attempts are excluded for the same reason Progress excludes
 * them from every other latency figure — mixing a sixty-second sprint into a
 * measure of durable recall makes the measure mean nothing. Trouble is in, and
 * it can only ever cost fluency: those answers always carry a hint, so they
 * never qualify.
 */
export function countsTowardFluency(source: Attempt['source']): boolean {
  return source === 'review' || source === 'trouble' || source === 'month' || source === 'century';
}
