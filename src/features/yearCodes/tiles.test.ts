import { describe, expect, it } from 'vitest';
import { createItem, introduce } from '@/domain/scheduler';
import { SCOPES } from '@/domain/scope';
import type { ItemState, Scope } from '@/domain/types';
import { dailyAllowance, decadeBlocks } from '@/features/learn/blocks';
import { itemKey } from '@/storage/defaults';
import { learnStatus, troubleStatus, yearCodeTiles } from './tiles';

const NOW = 1_700_000_000_000;
const FULL = SCOPES[0];
const MODERN = SCOPES.find((scope) => scope.id === 'modern') as Scope;

function items(build: (map: Record<string, ItemState>) => void): Record<string, ItemState> {
  const map: Record<string, ItemState> = {};
  for (let yy = 0; yy <= 99; yy += 1) map[itemKey(yy)] = createItem(yy);
  build(map);
  return map;
}

function introduced(years: number[], over: Partial<ItemState> = {}) {
  return items((map) => {
    for (const yy of years) map[itemKey(yy)] = { ...introduce(createItem(yy), NOW), ...over };
  });
}

function tilesFor(map: Record<string, ItemState>, scope = FULL, cap = 20, used = 0) {
  return yearCodeTiles({
    items: map,
    itemList: Object.values(map).sort((a, b) => a.yy - b.yy),
    scope,
    allowance: dailyAllowance(cap, used),
    now: NOW,
  });
}

describe('learnStatus', () => {
  it('counts the blocks that still have something to introduce', () => {
    const blocks = decadeBlocks(introduced([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), FULL);
    expect(learnStatus(blocks, dailyAllowance(20, 0))).toBe('9 blocks of ten still to learn.');
  });

  it('says one block, not 1 blocks', () => {
    const done = Array.from({ length: 90 }, (_unused, i) => i);
    const blocks = decadeBlocks(introduced(done), FULL);
    expect(learnStatus(blocks, dailyAllowance(20, 0))).toBe('1 block of ten still to learn.');
  });

  it('counts only blocks the scope can reach', () => {
    const blocks = decadeBlocks(introduced([]), MODERN);
    expect(learnStatus(blocks, dailyAllowance(20, 0))).toBe('5 blocks of ten still to learn.');
  });

  it('hands over to the daily cap once it is spent', () => {
    const blocks = decadeBlocks(introduced([]), FULL);
    expect(learnStatus(blocks, dailyAllowance(20, 20))).toBe(
      '20 new codes today. Next block unlocks tomorrow.',
    );
  });

  it('reports a finished table ahead of the cap, which has nothing left to hold back', () => {
    const all = Array.from({ length: 100 }, (_unused, i) => i);
    const blocks = decadeBlocks(introduced(all), FULL);
    expect(learnStatus(blocks, dailyAllowance(20, 20))).toBe('Every block in scope is introduced.');
  });
});

describe('yearCodeTiles', () => {
  it('is Learn, Revise, Endless and Calc while nothing is flagged', () => {
    const tiles = tilesFor(introduced([40, 41, 42]));
    // The order is what the codes are for: get them, keep them, practise them
    // with nothing to finish, work one out.
    expect(tiles.map((tile) => tile.id)).toEqual(['learn', 'revise', 'endless', 'calc']);
  });

  it('adds Trouble spots once codes are flagged', () => {
    const map = introduced([40, 41, 42]);
    for (const yy of [73, 88]) {
      map[itemKey(yy)] = { ...introduce(createItem(yy), NOW), lapses: 7, leech: true, interval: 1 };
    }
    const tiles = tilesFor(map);
    expect(tiles).toHaveLength(5);
    expect(tiles[4].label).toBe('Trouble spots');
    expect(tiles[4].status).toBe('2 codes flagged after six lapses.');
  });

  it('counts the introduced codes on the Endless line, not the due ones', () => {
    // Nothing about this surface is scheduled, so a due count there would name
    // a number it does not act on.
    const map = introduced([40, 41, 42], { dueAt: NOW + 5 * 86_400_000, interval: 5 });
    const endless = tilesFor(map).find((tile) => tile.id === 'endless');
    expect(endless?.status).toBe('3 codes learned, asked over and over.');
  });

  it('sends the Endless line to Learn while there is nothing to ask', () => {
    const endless = tilesFor(introduced([])).find((tile) => tile.id === 'endless');
    expect(endless?.status).toBe('Learn a block and its ten codes join the pass.');
  });

  it('keeps the Endless pool inside the active scope', () => {
    // Modern is 50–99, so the 40 is introduced and still out of the pass.
    const endless = tilesFor(introduced([60, 61, 62, 40]), MODERN).find(
      (tile) => tile.id === 'endless',
    );
    expect(endless?.status).toBe('3 codes learned, asked over and over.');
  });

  it('uses the drill pool rule, so a recovered code does not put the tile back', () => {
    const map = introduced([40, 41, 42]);
    map[itemKey(73)] = { ...introduce(createItem(73), NOW), lapses: 7, leech: true, interval: 30 };
    expect(tilesFor(map).map((tile) => tile.id)).not.toContain('trouble');
  });

  it('takes the Revise line from the queue itself', () => {
    const revise = tilesFor(introduced([40, 41, 42])).find((tile) => tile.id === 'revise');
    expect(revise?.status).toBe('3 codes due now, oldest first.');
  });

  it('gives the next-due time when nothing is due', () => {
    const map = introduced([40], { dueAt: NOW + 2 * 86_400_000, interval: 2 });
    const revise = tilesFor(map).find((tile) => tile.id === 'revise');
    expect(revise?.status).toBe('Nothing due now. Next code due in 2 days.');
  });

  it('points every tile at its screen under /year-codes', () => {
    const map = introduced([40]);
    map[itemKey(73)] = { ...introduce(createItem(73), NOW), lapses: 7, leech: true, interval: 1 };
    for (const tile of tilesFor(map)) {
      expect(tile.path).toBe(`/year-codes/${tile.id}`);
    }
  });

  it('never leaves a tile without a line', () => {
    for (const tile of tilesFor(introduced([]))) {
      expect(tile.status.length).toBeGreaterThan(0);
    }
  });
});

describe('troubleStatus', () => {
  it('says one code, not 1 codes', () => {
    expect(troubleStatus(1)).toBe('1 code flagged after six lapses.');
  });
});
