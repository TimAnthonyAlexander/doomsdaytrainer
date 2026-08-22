import { describe, expect, it } from 'vitest';
import type { ItemState, SessionDay, YearKey } from '@/domain/types';
import { resolveScope, SCOPES } from '@/domain/scope';
import { createItem } from '@/domain/scheduler';
import { dayKey } from '@/domain/time';
import { DEFAULT_SETTINGS, itemKey } from '@/storage/defaults';
import {
  BLOCK_SIZE,
  DECADES,
  blockStatus,
  dailyAllowance,
  decadeBlocks,
  decadeLabel,
  decadeYears,
  introducedCount,
  leapRuns,
  learnGroups,
  newItemsIntroducedToday,
  newlyIntroducedCount,
  nextBlock,
  stepAfter,
} from './blocks';

function items(introduced: YearKey[] = []): Record<string, ItemState> {
  const out: Record<string, ItemState> = {};
  for (let yy = 0; yy < 100; yy++) {
    out[itemKey(yy)] = { ...createItem(yy), introduced: introduced.includes(yy) };
  }
  return out;
}

const scopeOf = (id: (typeof SCOPES)[number]['id'], custom = { from: 0, to: 99 }) =>
  resolveScope({ ...DEFAULT_SETTINGS, scopeId: id, customScope: custom });

describe('decade shape', () => {
  it('gives ten years and a padded label', () => {
    expect(decadeYears(0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(decadeYears(9)).toEqual([90, 91, 92, 93, 94, 95, 96, 97, 98, 99]);
    expect(decadeLabel(0)).toBe('00–09');
    expect(decadeLabel(4)).toBe('40–49');
  });
});

describe('block state derivation', () => {
  it('reads not-started, in-progress and introduced from the item states', () => {
    const years = decadeYears(4);
    expect(blockStatus(years, items())).toBe('not-started');
    expect(blockStatus(years, items([40, 41, 42]))).toBe('in-progress');
    expect(blockStatus(years, items(years))).toBe('introduced');
  });

  it('counts introduced and still-new items', () => {
    const years = decadeYears(7);
    const state = items([70, 71, 79]);
    expect(introducedCount(years, state)).toBe(3);
    expect(newlyIntroducedCount(years, state)).toBe(7);
    expect(newlyIntroducedCount(years, items())).toBe(BLOCK_SIZE);
    expect(newlyIntroducedCount(years, items(years))).toBe(0);
  });

  it('ignores items from other decades', () => {
    expect(blockStatus(decadeYears(3), items([20, 21, 45]))).toBe('not-started');
  });
});

describe('scope filtering of decades', () => {
  it('keeps all ten decades listed under the full scope', () => {
    const blocks = decadeBlocks(items(), scopeOf('full'));
    expect(blocks).toHaveLength(10);
    expect(blocks.every((b) => b.available)).toBe(true);
    expect(blocks.every((b) => b.reason === null)).toBe(true);
  });

  it('marks decades entirely outside living memory as unavailable', () => {
    const blocks = decadeBlocks(items(), scopeOf('living'));
    expect(blocks.map((b) => b.available)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(blocks[0].reason).toBe('Outside Living memory (25–99)');
    expect(blocks[2].reason).toBeNull();
  });

  it('keeps a decade that only partly overlaps the scope', () => {
    const blocks = decadeBlocks(items(), scopeOf('custom', { from: 47, to: 52 }));
    expect(blocks[4].available).toBe(true);
    expect(blocks[5].available).toBe(true);
    expect(blocks[6].available).toBe(false);
    expect(blocks[6].reason).toBe('Outside Custom range (47–52)');
  });

  it('cuts the top half for the current era and the bottom half for modern', () => {
    expect(decadeBlocks(items(), scopeOf('current')).map((b) => b.available)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(decadeBlocks(items(), scopeOf('modern')).map((b) => b.available)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
      true,
    ]);
  });
});

describe('nextBlock', () => {
  it('skips finished blocks and blocks out of scope', () => {
    const introduced = [...decadeYears(2), ...decadeYears(3)];
    const blocks = decadeBlocks(items(introduced), scopeOf('living'));
    expect(nextBlock(blocks)?.decade).toBe(4);
  });

  it('returns a part-finished block rather than passing over it', () => {
    const blocks = decadeBlocks(items([50, 51]), scopeOf('modern'));
    expect(nextBlock(blocks)?.decade).toBe(5);
    expect(nextBlock(blocks)?.status).toBe('in-progress');
  });

  it('returns null once every in-scope decade is introduced', () => {
    const all = Array.from({ length: 100 }, (_unused, yy) => yy);
    expect(nextBlock(decadeBlocks(items(all), scopeOf('full')))).toBeNull();
  });
});

describe('leap runs inside a decade', () => {
  it('splits 00-09 into 00-03, 04-07 and the head of 08-11', () => {
    const runs = leapRuns(0);
    expect(runs.map((r) => r.years)).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9],
    ]);
    expect(runs.map((r) => r.partial)).toEqual([false, false, true]);
    expect(runs[2].start).toBe(8);
    expect(runs[2].end).toBe(11);
  });

  it('opens 10-19 with the tail of the run that started at 08', () => {
    const runs = leapRuns(1);
    expect(runs.map((r) => r.years)).toEqual([
      [10, 11],
      [12, 13, 14, 15],
      [16, 17, 18, 19],
    ]);
    expect(runs[0].start).toBe(8);
    expect(runs[0].partial).toBe(true);
    expect(runs[1].partial).toBe(false);
  });

  it('closes 90-99 on a whole run', () => {
    const runs = leapRuns(9);
    expect(runs.map((r) => r.years)).toEqual([
      [90, 91],
      [92, 93, 94, 95],
      [96, 97, 98, 99],
    ]);
  });

  it('always covers the decade exactly once', () => {
    for (let decade = 0; decade < 10; decade++) {
      expect(leapRuns(decade).flatMap((r) => r.years)).toEqual(decadeYears(decade));
    }
  });
});

describe('stepAfter', () => {
  it('is +1 inside a run and +2 across every leap boundary', () => {
    for (let yy = 0; yy < 99; yy++) {
      expect(stepAfter(yy)).toBe((yy + 1) % 4 === 0 ? 2 : 1);
    }
  });

  it('has nothing after 99', () => {
    expect(stepAfter(99)).toBe(0);
  });
});

describe('daily allowance', () => {
  it('allows two blocks on the default cap', () => {
    const fresh = dailyAllowance(20, 0);
    expect(fresh.canStart).toBe(true);
    expect(fresh.remaining).toBe(20);
    expect(fresh.message).toBe('0 of 20 new codes today.');

    const half = dailyAllowance(20, 10);
    expect(half.canStart).toBe(true);
    expect(half.remaining).toBe(10);
    expect(half.message).toBe('10 of 20 new codes today.');
  });

  it('closes the picker once the cap is spent', () => {
    const spent = dailyAllowance(20, 20);
    expect(spent.canStart).toBe(false);
    expect(spent.remaining).toBe(0);
    expect(spent.message).toBe('20 new codes today. Next block unlocks tomorrow.');
  });

  it('still opens a whole block when the allowance left is smaller than one', () => {
    const partial = dailyAllowance(15, 10);
    expect(partial.remaining).toBe(5);
    expect(partial.canStart).toBe(true);
    expect(partial.message).toBe('10 of 15 new codes today. The next block still introduces all ten.');

    const one = dailyAllowance(20, 19);
    expect(one.remaining).toBe(1);
    expect(one.canStart).toBe(true);
  });

  it('does not start a block on a cap of zero', () => {
    const off = dailyAllowance(0, 0);
    expect(off.canStart).toBe(false);
    expect(off.message).toBe('New codes per day is set to 0. Raise it in Settings to start a block.');
  });

  it('reports the real count when the cap was lowered after the fact', () => {
    const over = dailyAllowance(10, 25);
    expect(over.remaining).toBe(0);
    expect(over.canStart).toBe(false);
    expect(over.message).toBe('25 new codes today. Next block unlocks tomorrow.');
  });

  it('treats a negative cap as zero', () => {
    expect(dailyAllowance(-5, 0).canStart).toBe(false);
  });
});

describe('newItemsIntroducedToday', () => {
  const now = Date.UTC(2026, 3, 14, 12, 0, 0);
  const day = (date: string, newItems: number): SessionDay => ({
    date,
    reviewsCompleted: 0,
    newItemsIntroduced: newItems,
  });

  it('reads only the local day containing `now`', () => {
    const days = {
      [dayKey(now)]: day(dayKey(now), 10),
      [dayKey(now - 86_400_000)]: day(dayKey(now - 86_400_000), 20),
    };
    expect(newItemsIntroducedToday(days, now)).toBe(10);
  });

  it('is zero when today has no entry', () => {
    expect(newItemsIntroducedToday({}, now)).toBe(0);
  });
});

describe('learnGroups', () => {
  it('splits a decade at its leap boundaries', () => {
    // 00-09 is the case the user sees first: four, four, then the two that
    // belong to the run continuing into the next decade.
    expect(learnGroups(0)).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9],
    ]);
  });

  it('puts the short group first when a decade opens mid-run', () => {
    expect(learnGroups(1)).toEqual([
      [10, 11],
      [12, 13, 14, 15],
      [16, 17, 18, 19],
    ]);
  });

  it('covers every year of the decade exactly once, for all ten decades', () => {
    for (const decade of DECADES) {
      expect(learnGroups(decade).flat()).toEqual(decadeYears(decade));
    }
  });

  it('never emits a group that spans a leap boundary', () => {
    for (const decade of DECADES) {
      for (const group of learnGroups(decade)) {
        // Inside a group every step is +1. A +2 would mean the split is wrong.
        for (let i = 0; i < group.length - 1; i++) {
          expect(stepAfter(group[i])).toBe(1);
        }
      }
    }
  });
});
