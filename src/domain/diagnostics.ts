import type { Attempt, ItemState } from './types';
import { leapDays, rawSum } from './calc';
import { median } from './time';
import { isCousin } from './rotation';

/**
 * Is the user recalling the code, or working it out?
 *
 * Latency alone cannot answer that. Uittenhove, Thevenot & Barrouillet (2016)
 * gave adults every single-digit addition and found response times still rose
 * with operand magnitude on the problems participants *reported* as retrieved:
 * a well-compiled procedure can beat retrieval on the clock and feel identical
 * from the inside. A fast median is therefore evidence of something, but not of
 * recall.
 *
 * What does separate them is *shape*. A procedure's cost tracks the work it
 * does, so if the user is counting up from the start of a decade their latency
 * rises with the year's position inside that decade, and if they are running
 * the arithmetic it rises with the size of the numbers the arithmetic handles.
 * Recall has no reason to track either. Every number below is a slope or a
 * difference over data the app already stores, and each one is a specific
 * accusation that the data can refuse.
 *
 * This is measurement, not grading. Nothing here feeds the scheduler.
 */

/** Fewer samples than this and a slope is noise. */
export const MIN_SAMPLES = 8;

/** Fewer distinct items than this and a per-item regression says nothing. */
export const MIN_ITEMS = 12;

export interface Slope {
  /** Millis of latency per unit of the predictor. Null when there is too little data. */
  msPerUnit: number | null;
  /** Pearson r between the predictor and per-item median latency. */
  r: number | null;
  /** How many items went into it. */
  items: number;
}

const EMPTY_SLOPE: Slope = { msPerUnit: null, r: null, items: 0 };

/** Least squares plus Pearson r, over paired samples. */
function regress(xs: number[], ys: number[]): Slope {
  const n = xs.length;
  if (n < MIN_ITEMS) return { ...EMPTY_SLOPE, items: n };

  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }

  if (sxx === 0 || syy === 0) return { ...EMPTY_SLOPE, items: n };
  return { msPerUnit: sxy / sxx, r: sxy / Math.sqrt(sxx * syy), items: n };
}

/** Correct, unhinted review answers. The only ones that describe a route. */
export function scoredAttempts(item: ItemState): Attempt[] {
  return item.attemptHistory.filter(
    (attempt) => attempt.source === 'review' && attempt.correct && !attempt.hintUsed,
  );
}

/** Per-item median latency, for items with enough attempts to have one. */
function medians(items: readonly ItemState[]): { yy: number; ms: number }[] {
  const out: { yy: number; ms: number }[] = [];
  for (const item of items) {
    const attempts = scoredAttempts(item);
    if (attempts.length < 3) continue;
    out.push({ yy: item.yy, ms: median(attempts.map((attempt) => attempt.latencyMs)) });
  }
  return out;
}

/**
 * Latency against the year's position inside its decade.
 *
 * This is the counting test, and it is the one that fits the reported symptom
 * exactly: someone who enters the decade at its first year and steps forward
 * pays for every step. A positive slope here is the chain, measured in millis
 * per step. Klahr et al. put covert recitation at 170-310ms per item, so a
 * slope in that region is not a coincidence.
 */
export function decadePositionSlope(items: readonly ItemState[]): Slope {
  const points = medians(items);
  return regress(
    points.map((point) => point.yy % 10),
    points.map((point) => point.ms),
  );
}

/**
 * Latency against the size of the arithmetic.
 *
 * `rawSum` is what the derivation actually carries, and it grows with the year,
 * so a user running the formula rather than recalling the pair shows a slope
 * here. This is the check that catches someone who has got fast at calculating
 * and would otherwise read as fluent.
 */
export function derivationSlope(items: readonly ItemState[]): Slope {
  const points = medians(items);
  return regress(
    points.map((point) => rawSum(point.yy)),
    points.map((point) => point.ms),
  );
}

/** Latency against the leap-day count, the step of the derivation people find slowest. */
export function leapDaySlope(items: readonly ItemState[]): Slope {
  const points = medians(items);
  return regress(
    points.map((point) => leapDays(point.yy)),
    points.map((point) => point.ms),
  );
}

export interface AdjacencyEffect {
  /** Median latency when the previous prompt was a cousin of this one. */
  afterCousinMs: number | null;
  /** Median latency when it was not. */
  afterOtherMs: number | null;
  /** afterOther − afterCousin. Positive means cousins were answered faster. */
  differenceMs: number | null;
  afterCousinCount: number;
  afterOtherCount: number;
}

const EMPTY_ADJACENCY: AdjacencyEffect = {
  afterCousinMs: null,
  afterOtherMs: null,
  differenceMs: null,
  afterCousinCount: 0,
  afterOtherCount: 0,
};

/**
 * How much faster an answer is when the year before it was a neighbour.
 *
 * Attempts are stored per item, so the app never records "what came before".
 * It does not need to: every attempt carries a timestamp, so merging all of
 * them and sorting reconstructs the order the prompts were actually seen in.
 *
 * A user recalling pairs has no reason to be faster after a neighbour. A user
 * stepping from the previous answer has every reason. The difference is the
 * chain, in millis, measured on this user rather than assumed.
 */
export function adjacencyEffect(items: readonly ItemState[]): AdjacencyEffect {
  const ordered = items
    .flatMap((item) => scoredAttempts(item).map((attempt) => ({ yy: item.yy, attempt })))
    .sort((a, b) => a.attempt.timestamp - b.attempt.timestamp);

  const afterCousin: number[] = [];
  const afterOther: number[] = [];

  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    // A gap this long is a different sitting, so the previous prompt was not on
    // screen in any sense that could have helped.
    if (current.attempt.timestamp - previous.attempt.timestamp > 60_000) continue;
    if (current.yy === previous.yy) continue;
    (isCousin(current.yy, previous.yy) ? afterCousin : afterOther).push(current.attempt.latencyMs);
  }

  if (afterCousin.length < MIN_SAMPLES || afterOther.length < MIN_SAMPLES) {
    return {
      ...EMPTY_ADJACENCY,
      afterCousinCount: afterCousin.length,
      afterOtherCount: afterOther.length,
    };
  }

  const cousinMs = median(afterCousin);
  const otherMs = median(afterOther);
  return {
    afterCousinMs: cousinMs,
    afterOtherMs: otherMs,
    differenceMs: otherMs - cousinMs,
    afterCousinCount: afterCousin.length,
    afterOtherCount: afterOther.length,
  };
}

/**
 * Coefficient of variation of an item's latency: standard deviation over mean.
 *
 * Logan's instance theory predicts that under real automatization the spread
 * falls as a power function with the same exponent as the mean, so a mean that
 * drops while the CV stays flat is a user who got quicker at the same
 * procedure, and a falling CV is the procedure being replaced. Treat it as the
 * softest number here: the CV criterion comes from second-language research and
 * is disputed there.
 */
export function latencyCv(item: ItemState): number | null {
  const values = scoredAttempts(item).map((attempt) => attempt.latencyMs);
  if (values.length < MIN_SAMPLES) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return null;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

export interface SpokenShare {
  /** Review answers in the window that had the year spoken. */
  spoken: number;
  /** Review answers in the window. */
  total: number;
}

/** How many recent review answers to look back over when reporting audio. */
export const SPOKEN_WINDOW = 100;

/**
 * How much of the recent review history was answered with the year spoken.
 *
 * Spoken review prompts are the one option in the app that changes what a
 * latency means: the clock runs from paint to tap, and a clip runs about a
 * second, so an answer that would have been under a 2000ms fast threshold can
 * land over it purely because the user waited for the sentence to finish. That
 * cost is real and the user chose it knowingly, so these attempts are graded
 * and scheduled like any other and nothing here is excluded from fluency. What
 * would be dishonest is showing the median without saying what is in it.
 */
export function spokenShare(
  items: readonly ItemState[],
  limit = SPOKEN_WINDOW,
): SpokenShare {
  const recent = items
    .flatMap((item) => item.attemptHistory)
    .filter((attempt) => attempt.source === 'review')
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, Math.max(0, limit));
  return {
    spoken: recent.filter((attempt) => attempt.audioPlayed === true).length,
    total: recent.length,
  };
}

export interface RouteReport {
  decadePosition: Slope;
  derivation: Slope;
  leapDays: Slope;
  adjacency: AdjacencyEffect;
  /** True when at least one measure has enough data to say anything. */
  hasData: boolean;
}

export function routeReport(items: readonly ItemState[]): RouteReport {
  const decadePosition = decadePositionSlope(items);
  const derivation = derivationSlope(items);
  const leap = leapDaySlope(items);
  const adjacency = adjacencyEffect(items);
  return {
    decadePosition,
    derivation,
    leapDays: leap,
    adjacency,
    hasData:
      decadePosition.msPerUnit !== null ||
      derivation.msPerUnit !== null ||
      adjacency.differenceMs !== null,
  };
}
