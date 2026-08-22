import type { YearKey } from './types';
import { decadeOf } from './yearCodes';

/**
 * Varied prompt order.
 *
 * Asking the years of a decade in ascending order does not teach the pairs. It
 * teaches the run as one sequence, and a sequence can only be entered at its
 * start: the user recites 00, 01, 02… and counts, exactly the way a literate
 * adult who has sung the alphabet daily for twenty years still cannot answer
 * "what is the 18th letter" without reciting from a chunk boundary. Klahr,
 * Chase & Lovelace (1983) found 90-95% of adults report covert recitation from
 * a named entry point on that task, at 170-310ms per step.
 *
 * The fix is not to randomise everything. Ordered presentation genuinely helps
 * while a pair is being acquired, and interleaving arbitrary paired associates
 * from the start is worse than blocking them (Hwang 2025 puts pure interleaving
 * last of three conditions). What the evidence supports is a switch: Battig,
 * Brown & Nelson (1963) found that moving from constant to varied order **after
 * the first correct response to each pair** kept the whole benefit of constant
 * order. So the app introduces in order and varies from first correct onward,
 * per item.
 *
 * The order here is deterministic given a seed, not random. A 2022 review in
 * the Journal of Motor Learning and Development found serial (a fixed
 * non-blocked rotation) and random practice produce equivalent retention and
 * transfer, so there is nothing to buy by reaching for `Math.random`, and a
 * deterministic rotation is the one that can be unit tested. The seed comes
 * from the calling feature, which is where the app's randomness already lives.
 */

/** How many recent prompts the constraints look back over. */
export const LOOKBACK = 3;

/** Penalty at or above which a candidate is considered blocked outright. */
export const HARD_PENALTY = 100;

/**
 * Two years that make each other easy. Same decade means the run can be
 * recited; adjacent means the +1 step answers it without recall.
 */
export function isCousin(a: YearKey, b: YearKey): boolean {
  return decadeOf(a) === decadeOf(b) || Math.abs(a - b) === 1;
}

/**
 * How bad `candidate` is next, given the recently asked years, most recent
 * first. Lower is better and 0 is unconstrained. The weights only have to rank
 * candidates against each other, so they are round numbers rather than tuned.
 */
export function penaltyFor(candidate: YearKey, recent: readonly YearKey[]): number {
  let penalty = 0;
  for (let i = 0; i < recent.length && i < LOOKBACK; i += 1) {
    const other = recent[i];
    const immediate = i === 0;
    const gap = Math.abs(candidate - other);
    if (decadeOf(candidate) === decadeOf(other)) penalty += immediate ? HARD_PENALTY : 10;
    if (gap === 1) penalty += immediate ? HARD_PENALTY : 10;
    else if (gap === 2) penalty += immediate ? 5 : 1;
  }
  return penalty;
}

/**
 * Every year of `pool` exactly once, ordered so that consecutive prompts are
 * not neighbours and not from the same decade wherever the pool allows it.
 *
 * Always returns a full permutation. A pool that cannot satisfy the constraints
 * — one decade on its own, or two years — degrades to the least bad order
 * rather than looping or dropping anything.
 */
export function orderVaried(pool: readonly YearKey[], seed: number): YearKey[] {
  const remaining = [...pool].sort((a, b) => a - b);
  if (remaining.length <= 2) return remaining;

  // A seeded generator rather than `Math.random`, so the domain layer stays
  // deterministic and every order in the tests is reproducible. It exists only
  // to choose where each constraint scan begins: without it the greedy walk
  // converges on nearly the same successor for every seed, and "what comes
  // after 37" would become a fact worth memorising — the same defect as the
  // ascending order, wearing a different hat.
  const next = lcg(seed);

  // The entry point moves with the seed too. Kahana, Mollison & Addis (2010)
  // found rotating a list's start position costs very little, and what it does
  // cost is almost entirely errors of initiation.
  const out: YearKey[] = [remaining.splice(next(remaining.length), 1)[0]];

  while (remaining.length > 0) {
    const recent = out.slice(-LOOKBACK).reverse();
    const start = next(remaining.length);
    let bestIndex = start;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let step = 0; step < remaining.length; step += 1) {
      const index = (start + step) % remaining.length;
      const score = penaltyFor(remaining[index], recent);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
        if (score === 0) break;
      }
    }
    out.push(remaining.splice(bestIndex, 1)[0]);
  }

  return out;
}

/**
 * A small linear congruential generator. Numerical Recipes' constants, which
 * are more than good enough to pick a scan offset and small enough to read.
 * Returns integers in [0, bound).
 */
function lcg(seed: number): (bound: number) => number {
  let state = (Math.abs(Math.trunc(seed)) + 0x9e3779b9) >>> 0;
  return (bound: number) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return bound <= 0 ? 0 : state % bound;
  };
}

/**
 * The next year to ask from a due-ordered queue, skipping cousins of what was
 * just asked.
 *
 * This is the review-queue half of the same idea, and it is the port of Anki's
 * sibling burying to items that are not siblings: once 63 has been asked, the
 * rest of the sixties are answerable by stepping, so asking one of them next
 * rewards the traversal instead of the pairing. The queue's due order is
 * otherwise preserved — the first acceptable entry wins, not the best one, so
 * nothing overdue is pushed far back.
 *
 * Falls back to the head of the queue when every candidate is a cousin, which
 * a narrow scope makes routine. Burying is a preference, never a reason to
 * stop asking.
 */
export function nextUnburied(
  queue: readonly YearKey[],
  recent: readonly YearKey[],
): YearKey | null {
  if (queue.length === 0) return null;
  const window = recent.slice(-LOOKBACK);
  for (const yy of queue) {
    if (!window.some((other) => isCousin(yy, other))) return yy;
  }
  return queue[0];
}
