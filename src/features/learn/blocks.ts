import type { ItemState, Scope, SessionDay, YearKey } from '@/domain/types';
import { inScope } from '@/domain/scope';
import { dayKey } from '@/domain/time';
import { blockOf, codeFor, formatYear } from '@/domain/yearCodes';
import { itemKey } from '@/storage/defaults';

/**
 * Learn mode works one decade at a time. Everything here is pure: the screen
 * derives what it shows from these functions and holds no state of its own
 * beyond where the user is inside the current block.
 */

/** Items in one decade block. Ten, always. */
export const BLOCK_SIZE = 10;

export const DECADES: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export type BlockStatus = 'not-started' | 'in-progress' | 'introduced';

export interface DecadeBlock {
  /** 0..9 */
  decade: number;
  from: YearKey;
  to: YearKey;
  years: YearKey[];
  /** "40–49" */
  label: string;
  introducedCount: number;
  status: BlockStatus;
  /** False only when every year of the decade falls outside the active scope. */
  available: boolean;
  /** One plain line, set only when `available` is false. */
  reason: string | null;
  /**
   * True when an earlier block is still unfinished. Blocks are taught in order:
   * the table is one continuous run and learning 20-29 before 10-19 leaves the
   * user guessing at a structure they have not been shown yet.
   *
   * A finished block is never locked, so any block already learned can be redone.
   */
  locked: boolean;
  /** One plain line, set only when `locked` is true. */
  lockReason: string | null;
}

export function decadeYears(decade: number): YearKey[] {
  const from = decade * 10;
  return Array.from({ length: BLOCK_SIZE }, (_unused, i) => from + i);
}

export function decadeLabel(decade: number): string {
  return `${formatYear(decade * 10)}–${formatYear(decade * 10 + 9)}`;
}

export function introducedCount(years: YearKey[], items: Record<string, ItemState>): number {
  return years.filter((yy) => items[itemKey(yy)]?.introduced === true).length;
}

/** How many of these ten would actually be new. Never over-reports a re-run. */
export function newlyIntroducedCount(years: YearKey[], items: Record<string, ItemState>): number {
  return years.length - introducedCount(years, items);
}

export function blockStatus(years: YearKey[], items: Record<string, ItemState>): BlockStatus {
  const count = introducedCount(years, items);
  if (count === 0) return 'not-started';
  return count === years.length ? 'introduced' : 'in-progress';
}

/**
 * All ten decades, in order. Decades outside the scope stay in the list and are
 * marked unavailable rather than dropped: a user who narrowed their scope should
 * see where the missing years went, not wonder.
 */
export function decadeBlocks(items: Record<string, ItemState>, scope: Scope): DecadeBlock[] {
  const bound = `${formatYear(scope.from)}–${formatYear(scope.to)}`;
  const built = DECADES.map((decade) => {
    const years = decadeYears(decade);
    const available = years.some((yy) => inScope(yy, scope));
    return {
      decade,
      from: years[0],
      to: years[years.length - 1],
      years,
      label: decadeLabel(decade),
      introducedCount: introducedCount(years, items),
      status: blockStatus(years, items),
      available,
      reason: available ? null : `Outside ${scope.label} (${bound})`,
    };
  });

  // Walk in order. The first unfinished block is the one to do next; everything
  // unfinished after it waits its turn.
  let openLabel: string | null = null;
  return built.map((block) => {
    if (!block.available || block.status === 'introduced') {
      return { ...block, locked: false, lockReason: null };
    }
    if (openLabel === null) {
      openLabel = block.label;
      return { ...block, locked: false, lockReason: null };
    }
    return { ...block, locked: true, lockReason: `Finish ${openLabel} first` };
  });
}

/** First block the user could sensibly start next, or null when there is none. */
export function nextBlock(blocks: DecadeBlock[]): DecadeBlock | null {
  return (
    blocks.find((block) => block.available && !block.locked && block.status !== 'introduced') ?? null
  );
}

export interface LeapRun {
  /** Start of the four-year run, from `blockOf`. May precede the decade. */
  start: YearKey;
  end: YearKey;
  /** Only the years of the run that fall inside this decade. */
  years: YearKey[];
  /** True when the decade edge cuts the run short. */
  partial: boolean;
}

/**
 * The four-year runs a decade is built from, using the domain's `blockOf`. Runs
 * start at multiples of four, so seven of the ten decades open or close on a
 * run that is cut in half. That misalignment is the thing the screen has to show.
 */
export function leapRuns(decade: number): LeapRun[] {
  const runs: LeapRun[] = [];
  for (const yy of decadeYears(decade)) {
    const { start, end } = blockOf(yy);
    const last = runs[runs.length - 1];
    if (last && last.start === start) {
      last.years.push(yy);
    } else {
      runs.push({ start, end, years: [yy], partial: false });
    }
  }
  return runs.map((run) => ({ ...run, partial: run.years.length < 4 }));
}

/** How many batches a decade is introduced in. Three, so none is over four. */
export const BATCH_COUNT = 3;

/**
 * The decade split into the batches learn mode introduces one at a time.
 *
 * This used to be the leap runs — 00–03, 04–07, 08–09 — which was the whole
 * defect in miniature. A batch that is a contiguous run hands the learner the
 * +1 step and lets them produce every code after the first without ever
 * retrieving a pair. Small pools are right (Rocket Math teaches four facts at a
 * time, the Koch method two characters), but the pool has to be small *and*
 * unconnected.
 *
 * So the split is by position mod three: 00, 03, 06, 09 · 01, 04, 07 · 02, 05,
 * 08. Three or four pairs per batch, no two of them adjacent, and no batch that
 * is a run of anything. The stride is not a shortcut of its own either, because
 * three years cross a leap boundary about half the time, so the code step
 * between batch members alternates between three and four rather than being
 * one number the user could ride.
 */
export function introBatches(decade: number): YearKey[][] {
  const years = decadeYears(decade);
  return Array.from({ length: BATCH_COUNT }, (_unused, batch) =>
    years.filter((_year, index) => index % BATCH_COUNT === batch),
  );
}

/** Code delta from `yy` to `yy + 1`: 1 inside a run, 2 across the leap boundary. */
export function stepAfter(yy: YearKey): number {
  if (yy >= 99) return 0;
  return (codeFor(yy + 1) - codeFor(yy) + 7) % 7;
}

/** One adjacent pair of years, with the size of the step between their codes. */
export interface StructureExample {
  from: YearKey;
  to: YearKey;
  /** 1 inside a leap run, 2 across a boundary. */
  step: number;
}

/**
 * Two adjacent pairs from a decade the user has just finished: one where the
 * code rises by one, one where it jumps by two.
 *
 * Two pairs, deliberately, and never the ten laid out in a row. The +1/+2
 * structure is worth knowing as a way to check an answer you have already
 * produced, and it is ruinous as the route you produce it by — a ladder can
 * only be climbed from the bottom. Showing it as two isolated pairs after the
 * decade is learned is the difference between "so that is why the table looks
 * like that" and "here is how to work them all out".
 */
export function structureExamples(decade: number): { rise: StructureExample; jump: StructureExample } {
  const pairs = decadeYears(decade)
    .slice(0, BLOCK_SIZE - 1)
    .map((yy) => ({ from: yy, to: yy + 1, step: stepAfter(yy) }));

  const ones = pairs.filter((pair) => pair.step === 1);
  const twos = pairs.filter((pair) => pair.step === 2);

  // A pair whose codes wrap past six — 6 then 0 — is a true step of one and
  // reads as a drop of six. The screen says "one higher", so it gets a pair
  // where that sentence is literally what the two numbers show. The wrap is
  // real and it is taught in Calculate, where the remainder step is the lesson.
  const noWrap = (pair: StructureExample) => codeFor(pair.to) === codeFor(pair.from) + pair.step;

  // The two examples must not touch. Sharing a year, or sitting next to one
  // another, would put three or four consecutive years on the screen, and four
  // consecutive years is the run this whole rewrite exists to stop showing.
  const apart = (a: StructureExample, b: StructureExample) =>
    b.from > a.to + 1 || a.from > b.to + 1;

  for (const strict of [true, false]) {
    for (const rise of ones) {
      if (strict && !noWrap(rise)) continue;
      for (const jump of twos) {
        if (strict && !noWrap(jump)) continue;
        if (!apart(rise, jump)) continue;
        return { rise, jump };
      }
    }
  }

  // Unreachable for every real decade: leap runs are four long, so ten
  // consecutive years always hold a boundary and an interior far apart enough.
  throw new Error(`decade ${decade} has no separated +1/+2 pair`);
}

/** How many already-known years the final pass mixes in to space the block. */
export const MIX_IN_SIZE = 10;

/**
 * Years from outside this block to interleave through its final pass.
 *
 * A block practised only against itself is ten years of one decade, and ten
 * years of one decade can be recited. Mixing in years the user already has
 * breaks that, and it costs nothing to find: the weakest introduced years are
 * exactly the ones worth putting back in front of someone anyway.
 *
 * Deliberately a fixed count rather than "everything learned so far", so the
 * last block of the hundred is no longer than the first. What widens with
 * progress is the review queue, which is where the real mixing happens.
 */
export function mixInYears(
  exclude: readonly YearKey[],
  items: Record<string, ItemState>,
  scope: Scope,
  limit = MIX_IN_SIZE,
): YearKey[] {
  const excluded = new Set(exclude);
  return Object.values(items)
    .filter(
      (item) => item.introduced && !excluded.has(item.yy) && inScope(item.yy, scope),
    )
    .sort((a, b) => {
      // Weakest first: never fluent before fluent, then by how long the
      // scheduler is willing to leave it alone.
      const fluency = Number(a.fluency.fluent) - Number(b.fluency.fluent);
      if (fluency !== 0) return fluency;
      return a.interval === b.interval ? a.yy - b.yy : a.interval - b.interval;
    })
    .slice(0, Math.max(0, limit))
    .map((item) => item.yy);
}

export interface DailyAllowance {
  /** settings.newItemsPerDay */
  cap: number;
  usedToday: number;
  remaining: number;
  canStart: boolean;
  /** One line for the picker. Always present, whether or not a block can start. */
  message: string;
}

export function newItemsIntroducedToday(days: Record<string, SessionDay>, now: number): number {
  return days[dayKey(now)]?.newItemsIntroduced ?? 0;
}

/**
 * The daily cap on new codes.
 *
 * A part-used allowance still opens a whole block: ten codes taught as one run
 * of the table is the unit that teaches anything, and half a decade would leave
 * the leap boundary unexplained. What the cap does stop is *starting* a block
 * once the allowance is gone.
 */
export function dailyAllowance(cap: number, usedToday: number): DailyAllowance {
  const used = Math.max(0, usedToday);
  const limit = Math.max(0, cap);
  const remaining = Math.max(0, limit - used);

  if (limit === 0) {
    return {
      cap: limit,
      usedToday: used,
      remaining: 0,
      canStart: false,
      message: 'New codes per day is set to 0. Raise it in Settings to start a block.',
    };
  }

  if (remaining === 0) {
    return {
      cap: limit,
      usedToday: used,
      remaining: 0,
      canStart: false,
      message: `${used} new codes today. Next block unlocks tomorrow.`,
    };
  }

  return {
    cap: limit,
    usedToday: used,
    remaining,
    canStart: true,
    message:
      remaining < BLOCK_SIZE
        ? `${used} of ${limit} new codes today. The next block still introduces all ten.`
        : `${used} of ${limit} new codes today.`,
  };
}
