/**
 * Lifetime totals for the weekday trainer.
 *
 * The raw `AppData.weekdayAttempts` log is bounded, so it cannot be the source
 * of a lifetime median: once the oldest attempts are trimmed away, a median
 * computed from what is left silently becomes a median of "recent", not of
 * "all time". A running sum does not help either — a mean can be summed, a
 * median cannot.
 *
 * So every answer also lands in a fixed-width latency histogram that is never
 * trimmed. Counts are all the histogram holds, so it costs a few hundred bytes
 * forever, and a median can be read back out of it to within one bucket no
 * matter how much raw history has been dropped.
 *
 * Assisted and unassisted are kept apart at every level. An answer where the
 * year code was handed over and an answer where it was not measure different
 * things, and one median over both would describe neither.
 */

import type { WeekdayAttempt, WeekdayMode, WeekdayModeTotals, WeekdayTotals } from './types';

/* ------------------------------------------------------------------ */
/* Bucket edges                                                        */
/* ------------------------------------------------------------------ */

/**
 * Upper edges, exclusive, in millis. Bucket `i` holds latencies in
 * `[edges[i - 1], edges[i])`, with bucket 0 starting at 0 and the last bucket
 * open-ended.
 *
 * The edges are dense where the data lives. Sub-second recall is the whole
 * point of the app, so everything under two seconds is cut into 250ms steps —
 * a lifetime median that lands there is accurate to a quarter of a second,
 * which is finer than the difference the user is actually training. Between
 * two and four seconds the steps widen to 500ms, then to a second, and past
 * ten seconds they go coarse: an answer that took twenty seconds is a
 * distraction, not a recall, and resolving it precisely buys nothing.
 *
 * Twenty buckets is also a drawable histogram: the style guide wants latency
 * as a real chart, and this array is already the bars, left to right.
 *
 * These edges are persisted data. Changing one re-scales every stored count,
 * so a change here needs a schema bump and a migration, not an edit.
 */
export const WEEKDAY_LATENCY_EDGES: readonly number[] = [
  250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 8000, 10_000,
  15_000, 20_000, 30_000, Infinity,
];

export const WEEKDAY_BUCKET_COUNT = WEEKDAY_LATENCY_EDGES.length;

/** Inclusive lower edge of bucket `index`. */
export function bucketLowerEdge(index: number): number {
  return index <= 0 ? 0 : WEEKDAY_LATENCY_EDGES[index - 1];
}

/** Exclusive upper edge of bucket `index`. `Infinity` for the last one. */
export function bucketUpperEdge(index: number): number {
  return WEEKDAY_LATENCY_EDGES[index] ?? Infinity;
}

/**
 * Which bucket a latency falls in. Anything negative, NaN or absurd is pinned
 * into range rather than dropped: an attempt that happened still happened, and
 * losing it would make the counts disagree with the accuracy.
 */
export function latencyBucket(latencyMs: number): number {
  // NaN is unreadable and goes to the fastest bucket; an infinite latency is
  // readable and belongs at the slow end, which the loop below reaches on its own.
  if (typeof latencyMs !== 'number' || Number.isNaN(latencyMs) || latencyMs <= 0) return 0;
  for (let i = 0; i < WEEKDAY_LATENCY_EDGES.length; i += 1) {
    if (latencyMs < WEEKDAY_LATENCY_EDGES[i]) return i;
  }
  return WEEKDAY_LATENCY_EDGES.length - 1;
}

/* ------------------------------------------------------------------ */
/* Construction                                                        */
/* ------------------------------------------------------------------ */

function zeroBuckets(): number[] {
  return new Array<number>(WEEKDAY_BUCKET_COUNT).fill(0);
}

export function emptyModeTotals(): WeekdayModeTotals {
  return { answered: 0, correct: 0, latencyBuckets: zeroBuckets() };
}

export function emptyWeekdayTotals(): WeekdayTotals {
  return { assisted: emptyModeTotals(), unassisted: emptyModeTotals() };
}

/** Both modes, in the order the trainer's toggle shows them. */
export const WEEKDAY_MODES: readonly WeekdayMode[] = ['assisted', 'unassisted'];

function addOne(totals: WeekdayModeTotals, correct: boolean, latencyMs: number): WeekdayModeTotals {
  const latencyBuckets = [...totals.latencyBuckets];
  const index = latencyBucket(latencyMs);
  latencyBuckets[index] += 1;
  return {
    answered: totals.answered + 1,
    correct: totals.correct + (correct ? 1 : 0),
    latencyBuckets,
  };
}

/** One answered date folded into the lifetime totals. Never mutates the input. */
export function addWeekdayAttempt(totals: WeekdayTotals, attempt: WeekdayAttempt): WeekdayTotals {
  const mode: WeekdayMode = attempt.mode === 'unassisted' ? 'unassisted' : 'assisted';
  return { ...totals, [mode]: addOne(totals[mode], attempt.correct === true, attempt.latencyMs) };
}

/**
 * Totals rebuilt from a raw log. Used by the v3 migration, where the stored
 * `weekdayAttempts` are the only history that exists, and as the repair path
 * when a stored aggregate is missing outright.
 */
export function buildWeekdayTotals(attempts: readonly WeekdayAttempt[]): WeekdayTotals {
  let totals = emptyWeekdayTotals();
  for (const attempt of attempts) {
    if (attempt === null || typeof attempt !== 'object') continue;
    totals = addWeekdayAttempt(totals, attempt);
  }
  return totals;
}

/** Assisted and unassisted added together, for the combined row. */
export function combineModeTotals(a: WeekdayModeTotals, b: WeekdayModeTotals): WeekdayModeTotals {
  const latencyBuckets = zeroBuckets();
  for (let i = 0; i < WEEKDAY_BUCKET_COUNT; i += 1) {
    latencyBuckets[i] = a.latencyBuckets[i] + b.latencyBuckets[i];
  }
  return { answered: a.answered + b.answered, correct: a.correct + b.correct, latencyBuckets };
}

export function overallModeTotals(totals: WeekdayTotals): WeekdayModeTotals {
  return combineModeTotals(totals.assisted, totals.unassisted);
}

/* ------------------------------------------------------------------ */
/* Reading numbers back out                                            */
/* ------------------------------------------------------------------ */

/**
 * The grouped median: walk the buckets until the running count reaches half
 * the samples, then place the answer inside that bucket in proportion to how
 * far into it the halfway point fell.
 *
 * That linear step assumes the latencies are spread evenly across the bucket
 * they landed in, which is wrong in detail and harmless in practice: the error
 * is bounded by the bucket's width, and under two seconds that is 250ms. The
 * open-ended top bucket has no width to interpolate across, so it reports its
 * lower edge — the only claim the counts actually support.
 *
 * Null when nothing has been answered. Never zero: a zero here would read as a
 * measured instant answer.
 */
export function estimateMedianMs(totals: WeekdayModeTotals): number | null {
  // Deliberately counted from the histogram rather than from `answered`. The
  // two agree for anything this app wrote; a hand-edited file where they do not
  // still gets a median of the samples it actually holds, not of a claim.
  let samples = 0;
  for (const bucket of totals.latencyBuckets) samples += bucket;
  if (samples <= 0) return null;

  const target = samples / 2;
  let below = 0;
  for (let i = 0; i < WEEKDAY_BUCKET_COUNT; i += 1) {
    const count = totals.latencyBuckets[i];
    if (count <= 0) continue;
    if (below + count >= target) {
      const lower = bucketLowerEdge(i);
      const upper = bucketUpperEdge(i);
      if (!Number.isFinite(upper)) return lower;
      return Math.round(lower + ((target - below) / count) * (upper - lower));
    }
    below += count;
  }
  return null;
}

/** 0..1, or null when nothing has been answered. Never 0 for "no data". */
export function accuracyOf(totals: WeekdayModeTotals): number | null {
  return totals.answered <= 0 ? null : totals.correct / totals.answered;
}

export function wrongCount(totals: WeekdayModeTotals): number {
  return Math.max(0, totals.answered - totals.correct);
}

/* ------------------------------------------------------------------ */
/* Repair                                                              */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A non-negative whole number, or 0. Keeps NaN and strings off every screen. */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * One mode's totals, made safe to render and to keep adding to.
 *
 * A bucket array of the wrong length is padded or trimmed rather than thrown
 * away: a document written by an older or newer build still has real counts in
 * the buckets it does have. Nothing is invented to fill a gap — `answered` is
 * only ever raised to cover the samples that are really there, and `correct`
 * is clamped so accuracy cannot come out above 100%.
 */
function repairModeTotals(value: unknown): WeekdayModeTotals {
  if (!isRecord(value)) return emptyModeTotals();
  const stored = Array.isArray(value.latencyBuckets) ? value.latencyBuckets : [];
  const latencyBuckets = zeroBuckets();
  let samples = 0;
  for (let i = 0; i < WEEKDAY_BUCKET_COUNT; i += 1) {
    latencyBuckets[i] = count(stored[i]);
    samples += latencyBuckets[i];
  }
  const answered = Math.max(count(value.answered), samples);
  return { answered, correct: Math.min(count(value.correct), answered), latencyBuckets };
}

/**
 * The stored aggregate, repaired. When there is no aggregate at all the totals
 * are rebuilt from whatever raw attempts came with the document, which is the
 * best history available and strictly better than starting at zero.
 */
export function repairWeekdayTotals(value: unknown, attempts: readonly WeekdayAttempt[] = []): WeekdayTotals {
  if (!isRecord(value)) return buildWeekdayTotals(attempts);
  return {
    assisted: repairModeTotals(value.assisted),
    unassisted: repairModeTotals(value.unassisted),
  };
}
