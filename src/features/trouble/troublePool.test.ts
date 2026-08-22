import { describe, expect, it } from 'vitest';
import type { Attempt, ItemState, Scope } from '@/domain/types';
import { LEECH_THRESHOLD, applyReview, createItem } from '@/domain/scheduler';
import { resolveScope } from '@/domain/scope';
import { DEFAULT_SETTINGS } from '@/storage/defaults';
import { RECOVERY_INTERVAL_DAYS, isRecovered, troubleItems } from './troublePool';

const FULL: Scope = resolveScope(DEFAULT_SETTINGS);
const MODERN: Scope = resolveScope({ ...DEFAULT_SETTINGS, scopeId: 'modern' });

function item(yy: number, patch: Partial<ItemState> = {}): ItemState {
  return { ...createItem(yy), introduced: true, ...patch };
}

function attempt(patch: Partial<Attempt> = {}): Attempt {
  return {
    timestamp: 1_700_000_000_000,
    correct: true,
    latencyMs: 900,
    answered: 0,
    hintUsed: true,
    source: 'trouble',
    ...patch,
  };
}

describe('trouble pool', () => {
  it('takes flagged items only', () => {
    const pool = troubleItems(
      [item(10, { lapses: 5 }), item(20, { lapses: LEECH_THRESHOLD }), item(30, { leech: true })],
      FULL,
    );
    expect(pool.map((entry) => entry.yy)).toEqual([20, 30]);
  });

  it('ignores items that were never introduced', () => {
    expect(troubleItems([item(40, { lapses: 9, introduced: false })], FULL)).toEqual([]);
  });

  it('orders worst first, then by year', () => {
    const pool = troubleItems(
      [item(12, { lapses: 7 }), item(80, { lapses: 9 }), item(4, { lapses: 7 })],
      FULL,
    );
    expect(pool.map((entry) => entry.yy)).toEqual([80, 4, 12]);
  });

  it('drops items outside the scope without touching them', () => {
    const outside = item(12, { lapses: 8 });
    const pool = troubleItems([outside, item(70, { lapses: 8 })], MODERN);
    expect(pool.map((entry) => entry.yy)).toEqual([70]);
    expect(outside.lapses).toBe(8);
  });
});

describe('recovery', () => {
  it('drops a flagged item once its interval reaches ten days', () => {
    const recovered = item(50, { lapses: 9, leech: true, interval: RECOVERY_INTERVAL_DAYS });
    expect(isRecovered(recovered)).toBe(true);
    expect(troubleItems([recovered], FULL)).toEqual([]);

    const stillWeak = item(50, { lapses: 9, leech: true, interval: RECOVERY_INTERVAL_DAYS - 1 });
    expect(isRecovered(stillWeak)).toBe(false);
    expect(troubleItems([stillWeak], FULL)).toHaveLength(1);
  });

  it('leaves the flag and the lapse history alone', () => {
    const recovered = item(50, { lapses: 9, leech: true, interval: 30 });
    expect(recovered.leech).toBe(true);
    expect(recovered.lapses).toBe(9);
  });

  it('is the only way out, because a correct answer never lowers lapses', () => {
    const before = item(50, { lapses: 9, leech: true, interval: 2, repetitions: 2 });
    const after = applyReview(before, attempt(), DEFAULT_SETTINGS, before.dueAt).next;
    expect(after.lapses).toBe(9);
    expect(after.leech).toBe(true);
    // Interval 5: short of recovery, so the item stays in the list.
    expect(after.interval).toBe(5);
    expect(troubleItems([after], FULL)).toHaveLength(1);
  });
});

describe('trouble attempts and scheduling', () => {
  it('reschedules, capped at grade 3 by the permanent hint', () => {
    const before = item(50, { lapses: 6, leech: true });
    const graded = applyReview(before, attempt({ latencyMs: 100 }), DEFAULT_SETTINGS, before.dueAt);
    // 100ms is well inside the fast cutoff; the hint is what holds it at 3.
    expect(graded.grade).toBe(3);
    expect(graded.next.repetitions).toBe(1);
    expect(graded.next.interval).toBe(1);
    expect(graded.next.easeFactor).toBeCloseTo(2.36, 5);
  });

  it('still lapses on a wrong answer', () => {
    const before = item(50, { lapses: 6, leech: true, interval: 4, repetitions: 3 });
    const graded = applyReview(before, attempt({ correct: false }), DEFAULT_SETTINGS, before.dueAt);
    expect(graded.grade).toBe(1);
    expect(graded.next.lapses).toBe(7);
    expect(graded.next.interval).toBe(0);
  });

  it('refuses drill sources, which is why drills cannot reschedule', () => {
    const before = item(50, { lapses: 6, leech: true });
    for (const source of ['sprint', 'gauntlet', 'decade'] as const) {
      expect(() => applyReview(before, attempt({ source }), DEFAULT_SETTINGS, 0)).toThrow(
        /drill attempt source/,
      );
    }
  });
});
