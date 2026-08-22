import { describe, expect, it } from 'vitest';
import { createItem, introduce } from '@/domain/scheduler';
import { SCOPES, resolveScope, scopeYears } from '@/domain/scope';
import type { ItemState, Scope, YearKey } from '@/domain/types';
import { DEFAULT_SETTINGS } from '@/storage/defaults';
import {
  DECADE_SIZE,
  buildPlan,
  decadeOptions,
  decadeOrder,
  decadeYears,
  gauntletOrder,
  modeStatuses,
  nextSprintYear,
  shuffle,
  sprintPool,
  sprintSequence,
  systemRng,
  type Rng,
} from './drillPlan';

const NOW = 1_700_000_000_000;

function scope(id: Scope['id'], from = 0, to = 99): Scope {
  const base = SCOPES.find((entry) => entry.id === id);
  if (!base) throw new Error(`No scope ${id}`);
  return base.id === 'custom' ? { ...base, from, to } : base;
}

const FULL = scope('full');
const MODERN = scope('modern');

/** Items where `introducedYears` have been through Learn and the rest have not. */
function items(introducedYears: YearKey[]): ItemState[] {
  const set = new Set(introducedYears);
  return Array.from({ length: 100 }, (_unused, yy) =>
    set.has(yy) ? introduce(createItem(yy), NOW) : createItem(yy),
  );
}

/** A pinned rng: walks the given values, then repeats them. */
function seq(values: number[]): Rng {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

describe('shuffle', () => {
  it('leaves the input alone and keeps every element', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, seq([0.9, 0.1, 0.5, 0.3]));
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('stays in range for an rng that returns the top of the interval', () => {
    // Math.floor(1 * (i + 1)) would index one past the end without the clamp.
    const out = shuffle([1, 2, 3], () => 0.999999999999);
    expect(out).toHaveLength(3);
    expect(out).not.toContain(undefined);
  });

  it('actually reorders under the system rng', () => {
    const input = Array.from({ length: 100 }, (_unused, i) => i);
    const out = shuffle(input, systemRng);
    expect(out).not.toEqual(input);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });
});

describe('sprintPool', () => {
  it('takes introduced items only', () => {
    expect(sprintPool(items([3, 7, 41]), FULL)).toEqual([3, 7, 41]);
  });

  it('drops introduced items that fall outside the scope', () => {
    expect(sprintPool(items([3, 7, 41, 60, 99]), MODERN)).toEqual([60, 99]);
  });

  it('is empty before anything has been learned', () => {
    expect(sprintPool(items([]), FULL)).toEqual([]);
  });
});

describe('nextSprintYear', () => {
  it('returns null for an empty pool', () => {
    expect(nextSprintYear([], null, seq([0]))).toBeNull();
  });

  it('never draws the same year twice in a row', () => {
    const pool = [10, 11, 12];
    // 0.99 would land on the previous year if it were still a candidate.
    expect(nextSprintYear(pool, 12, seq([0.99]))).not.toBe(12);
    expect(nextSprintYear(pool, 10, seq([0]))).not.toBe(10);
  });

  it('repeats only when the pool holds a single year', () => {
    expect(nextSprintYear([44], 44, seq([0.5]))).toBe(44);
  });

  it('draws across the whole pool over many calls', () => {
    const pool = [1, 2, 3, 4, 5];
    const seen = new Set<YearKey>();
    let previous: YearKey | null = null;
    for (let i = 0; i < 200; i += 1) {
      previous = nextSprintYear(pool, previous, systemRng);
      if (previous !== null) seen.add(previous);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(pool);
  });
});

describe('sprintSequence', () => {
  it('produces the requested length from a pool it can draw from', () => {
    expect(sprintSequence([1, 2, 3], 12, systemRng)).toHaveLength(12);
  });

  it('holds the no-repeat rule across the whole sequence', () => {
    const out = sprintSequence([1, 2, 3, 4], 300, systemRng);
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]).not.toBe(out[i - 1]);
    }
  });

  it('stops at nothing when the pool is empty', () => {
    expect(sprintSequence([], 10, systemRng)).toEqual([]);
  });
});

describe('gauntletOrder', () => {
  it('covers exactly the scope years, once each', () => {
    const order = gauntletOrder(MODERN, systemRng);
    expect(order).toHaveLength(50);
    expect([...order].sort((a, b) => a - b)).toEqual(scopeYears(MODERN));
    expect(new Set(order).size).toBe(50);
  });

  it('covers all 100 on the full scope', () => {
    const order = gauntletOrder(FULL, systemRng);
    expect([...order].sort((a, b) => a - b)).toEqual(scopeYears(FULL));
  });

  it('follows a custom range', () => {
    const custom = resolveScope({ ...DEFAULT_SETTINGS, scopeId: 'custom', customScope: { from: 88, to: 92 } });
    expect([...gauntletOrder(custom, systemRng)].sort((a, b) => a - b)).toEqual([88, 89, 90, 91, 92]);
  });
});

describe('decadeOrder', () => {
  it('is the ten years of the decade in some order', () => {
    const order = decadeOrder(4, systemRng);
    expect(order).toHaveLength(DECADE_SIZE);
    expect([...order].sort((a, b) => a - b)).toEqual(decadeYears(4));
  });
});

describe('buildPlan', () => {
  it('labels a gauntlet with the number of codes the scope produced', () => {
    const plan = buildPlan('gauntlet', null, items([]), MODERN, systemRng);
    expect(plan.total).toBe(50);
    expect(plan.order).toHaveLength(50);
    expect(plan.title).toBe('Gauntlet');
    expect(plan.coverage).toBe('50 codes, modern, 50 to 99');
    expect(plan.limitSeconds).toBeNull();
  });

  it('says plainly when the gauntlet is the full hundred', () => {
    const plan = buildPlan('gauntlet', null, items([]), FULL, systemRng);
    expect(plan.total).toBe(100);
    expect(plan.coverage).toBe('100 codes, the full 100');
  });

  it('gives a sprint the learned pool and a sixty second limit', () => {
    const plan = buildPlan('sprint', null, items([1, 2, 3]), FULL, systemRng);
    expect(plan.pool).toEqual([1, 2, 3]);
    expect(plan.order).toEqual([]);
    expect(plan.total).toBe(0);
    expect(plan.limitSeconds).toBe(60);
    expect(plan.coverage).toBe('3 learned codes, the full 100');
  });

  it('runs the ten years of the decade it was given, whatever the scope', () => {
    const plan = buildPlan('decade', 4, items([]), MODERN, systemRng);
    expect(plan.decade).toBe(4);
    expect(plan.total).toBe(DECADE_SIZE);
    expect([...plan.order].sort((a, b) => a - b)).toEqual(decadeYears(4));
    expect(plan.title).toBe('Decade 40–49');
  });

  it('counts one learned code as singular', () => {
    expect(buildPlan('sprint', null, items([9]), FULL, systemRng).coverage).toBe(
      '1 learned code, the full 100',
    );
  });
});

describe('modeStatuses', () => {
  it('turns the sprint off when nothing in scope has been learned', () => {
    const [sprint] = modeStatuses(items([1, 2, 3]), MODERN);
    expect(sprint.canRun).toBe(false);
    expect(sprint.reason).toBe('No learned codes inside modern, 50 to 99. Learn a block first.');
  });

  it('turns the sprint on as soon as one in-scope code is learned', () => {
    const [sprint] = modeStatuses(items([1, 2, 60]), MODERN);
    expect(sprint.canRun).toBe(true);
    expect(sprint.reason).toBeNull();
  });

  it('names the gauntlet length in its own line', () => {
    const [, gauntlet] = modeStatuses(items([]), MODERN);
    expect(gauntlet.canRun).toBe(true);
    expect(gauntlet.detail).toContain('All 50 codes');
  });

  it('always offers the decade drill', () => {
    const [, , decade] = modeStatuses(items([]), MODERN);
    expect(decade.canRun).toBe(true);
  });
});

describe('decadeOptions', () => {
  it('keeps all ten decades and marks the ones outside the scope', () => {
    const options = decadeOptions(MODERN);
    expect(options).toHaveLength(10);
    expect(options.filter((option) => option.available).map((option) => option.decade)).toEqual([
      5, 6, 7, 8, 9,
    ]);
    expect(options[0].reason).toBe('Outside modern, 50 to 99');
    expect(options[9].reason).toBeNull();
  });

  it('counts a decade the scope clips as available', () => {
    const custom = resolveScope({ ...DEFAULT_SETTINGS, scopeId: 'custom', customScope: { from: 47, to: 52 } });
    const options = decadeOptions(custom);
    expect(options[4].available).toBe(true);
    expect(options[5].available).toBe(true);
    expect(options[6].available).toBe(false);
  });
});
