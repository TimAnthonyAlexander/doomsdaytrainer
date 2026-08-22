import type { DrillMode, ItemState, Scope, YearKey } from '@/domain/types';
import { inScope, scopeYears } from '@/domain/scope';
import { formatYear } from '@/domain/yearCodes';

/**
 * What a drill run asks, and in what order.
 *
 * Pure and framework-free, but deliberately *not* deterministic: the order is
 * randomised, which is the one thing the domain layer is not allowed to be. The
 * randomness lives here rather than in `src/domain/` for exactly that reason,
 * and every function takes an injectable `rng` so the tests can pin it.
 *
 * Nothing in this file knows about scheduling. Drills never touch it.
 */

export const SPRINT_SECONDS = 60;
export const SPRINT_MS = SPRINT_SECONDS * 1000;
export const COUNTDOWN_SECONDS = 3;
export const DECADE_SIZE = 10;

/** Uniform in [0, 1). */
export type Rng = () => number;

/**
 * Crypto-backed where it exists, `Math.random` otherwise. Either is fine for a
 * drill order; the point of using `getRandomValues` is that the first few
 * gauntlets of a session do not all open on the same year.
 */
export function systemRng(): number {
  const source = globalThis.crypto;
  if (source && typeof source.getRandomValues === 'function') {
    const buffer = new Uint32Array(1);
    source.getRandomValues(buffer);
    return buffer[0] / 4_294_967_296;
  }
  return Math.random();
}

/** Fisher–Yates. Returns a new array; the input is never touched. */
export function shuffle<T>(list: readonly T[], rng: Rng = systemRng): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    // Clamped: an rng that ever returns exactly 1 would index off the end.
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

export function decadeYears(decade: number): YearKey[] {
  const from = decade * DECADE_SIZE;
  return Array.from({ length: DECADE_SIZE }, (_unused, i) => from + i);
}

export function decadeLabel(decade: number): string {
  return `${formatYear(decade * DECADE_SIZE)}–${formatYear(decade * DECADE_SIZE + 9)}`;
}

/* ------------------------------------------------------------------ */
/* Pools and orders                                                    */
/* ------------------------------------------------------------------ */

/**
 * The sprint pool: introduced items inside the active scope, ascending.
 * A code the user has never been shown is not a speed test, it is a coin flip.
 */
export function sprintPool(items: ItemState[], scope: Scope): YearKey[] {
  return items
    .filter((item) => item.introduced && inScope(item.yy, scope))
    .map((item) => item.yy)
    .sort((a, b) => a - b);
}

/**
 * Draw the next sprint prompt.
 *
 * Never the same year twice in a row: the second ask would test the memory of
 * the answer just given, not the code. A pool of one is the single exception,
 * because the alternative is asking nothing.
 */
export function nextSprintYear(
  pool: readonly YearKey[],
  previous: YearKey | null,
  rng: Rng = systemRng,
): YearKey | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  const candidates = previous === null ? pool : pool.filter((yy) => yy !== previous);
  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  return candidates[index];
}

/** `count` sprint draws in a row, honouring the no-immediate-repeat rule. */
export function sprintSequence(
  pool: readonly YearKey[],
  count: number,
  rng: Rng = systemRng,
): YearKey[] {
  const out: YearKey[] = [];
  let previous: YearKey | null = null;
  for (let i = 0; i < count; i += 1) {
    const next = nextSprintYear(pool, previous, rng);
    if (next === null) break;
    out.push(next);
    previous = next;
  }
  return out;
}

/** Every year of the scope, exactly once, shuffled. */
export function gauntletOrder(scope: Scope, rng: Rng = systemRng): YearKey[] {
  return shuffle(scopeYears(scope), rng);
}

/** The ten years of one decade, shuffled. */
export function decadeOrder(decade: number, rng: Rng = systemRng): YearKey[] {
  return shuffle(decadeYears(decade), rng);
}

/* ------------------------------------------------------------------ */
/* Plans                                                               */
/* ------------------------------------------------------------------ */

export interface DrillPlan {
  mode: DrillMode;
  /** 0..9 for a decade drill, null otherwise. Matches DrillRecord.decade. */
  decade: number | null;
  /** The fixed queue for gauntlet and decade. Empty for sprint. */
  order: YearKey[];
  /** Sprint only: the set it draws from, over and over, for 60 seconds. */
  pool: YearKey[];
  /** Prompts in the run. 0 for a sprint, where the clock decides the length. */
  total: number;
  /** Seconds allowed. Null when the run ends by exhausting `order` instead. */
  limitSeconds: number | null;
  /** "Sprint", "Gauntlet", "Decade 40–49". */
  title: string;
  /**
   * What the run covers, in one phrase. This is the label that keeps a 50-code
   * gauntlet from being read next to a 100-code one.
   */
  coverage: string;
}

function scopePhrase(scope: Scope): string {
  if (scope.id === 'full') return 'the full 100';
  return `${scope.label.toLowerCase()}, ${formatYear(scope.from)} to ${formatYear(scope.to)}`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function buildPlan(
  mode: DrillMode,
  decade: number | null,
  items: ItemState[],
  scope: Scope,
  rng: Rng = systemRng,
): DrillPlan {
  if (mode === 'sprint') {
    const pool = sprintPool(items, scope);
    return {
      mode,
      decade: null,
      order: [],
      pool,
      total: 0,
      limitSeconds: SPRINT_SECONDS,
      title: 'Sprint',
      coverage: `${plural(pool.length, 'learned code')}, ${scopePhrase(scope)}`,
    };
  }

  if (mode === 'decade') {
    const which = decade ?? 0;
    return {
      mode,
      decade: which,
      order: decadeOrder(which, rng),
      pool: [],
      total: DECADE_SIZE,
      limitSeconds: null,
      title: `Decade ${decadeLabel(which)}`,
      coverage: `${DECADE_SIZE} codes`,
    };
  }

  const order = gauntletOrder(scope, rng);
  return {
    mode,
    decade: null,
    order,
    pool: [],
    total: order.length,
    limitSeconds: null,
    title: 'Gauntlet',
    coverage: `${plural(order.length, 'code')}, ${scopePhrase(scope)}`,
  };
}

/* ------------------------------------------------------------------ */
/* What can actually be run                                            */
/* ------------------------------------------------------------------ */

export interface ModeStatus {
  mode: DrillMode;
  label: string;
  /** One line of what the mode does. Always present. */
  detail: string;
  canRun: boolean;
  /** One line, set only when `canRun` is false. */
  reason: string | null;
}

export interface DecadeOption {
  decade: number;
  label: string;
  available: boolean;
  reason: string | null;
}

/**
 * The three rows of the drills list.
 *
 * A sprint over an empty pool has nothing to ask, so it is the one mode that
 * turns itself off. The gauntlet runs the whole scope by design, learned or
 * not; that is what makes it a gauntlet.
 */
export function modeStatuses(items: ItemState[], scope: Scope): ModeStatus[] {
  const pool = sprintPool(items, scope);
  const years = scopeYears(scope);

  return [
    {
      mode: 'sprint',
      label: 'Sprint',
      detail: 'Sixty seconds of codes you have already learned. Score is how many you get right.',
      canRun: pool.length > 0,
      reason:
        pool.length > 0
          ? null
          : `No learned codes inside ${scopePhrase(scope)}. Learn a block first.`,
    },
    {
      mode: 'gauntlet',
      label: 'Gauntlet',
      detail: `All ${plural(years.length, 'code')} of your scope, one pass, timed. Wrong answers are counted, not corrected.`,
      canRun: years.length > 0,
      reason: years.length > 0 ? null : 'Your scope covers no years.',
    },
    {
      mode: 'decade',
      label: 'Decade',
      detail: 'The ten codes of one decade, timed. Pick the decade.',
      canRun: true,
      reason: null,
    },
  ];
}

/**
 * Ten decades, always in order. A decade with no year inside the scope stays on
 * the list and is marked, rather than vanishing: a user who narrowed the scope
 * should see where the missing decades went.
 */
export function decadeOptions(scope: Scope): DecadeOption[] {
  return Array.from({ length: 10 }, (_unused, decade) => {
    const available = decadeYears(decade).some((yy) => inScope(yy, scope));
    return {
      decade,
      label: decadeLabel(decade),
      available,
      reason: available ? null : `Outside ${scopePhrase(scope)}`,
    };
  });
}
