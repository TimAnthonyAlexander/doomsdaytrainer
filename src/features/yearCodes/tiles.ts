import { BookOpen, Calculator, Flag, Repeat } from 'lucide-react';
import type { Tile } from '@/components/ui/TileGrid';
import type { ItemState, Scope } from '@/domain/types';
import { decadeBlocks, type DailyAllowance, type DecadeBlock } from '@/features/learn/blocks';
import { reviseStatus } from '@/features/revise/revisePlan';
import { troubleItems } from '@/features/trouble/troublePool';

/**
 * The Year codes grid, as data.
 *
 * Every status line here is derived from the screen it points at, by the same
 * functions that screen uses. A tile that promised a drill which opens empty,
 * or a block the daily cap will refuse, would be worse than no line at all.
 */

export type YearCodeTileId = 'learn' | 'revise' | 'calc' | 'trouble';

export interface YearCodeTile extends Tile {
  id: YearCodeTileId;
}

export interface TileInput {
  items: Record<string, ItemState>;
  /** The same items as a list. Both shapes are already on the context. */
  itemList: ItemState[];
  scope: Scope;
  allowance: DailyAllowance;
  now: number;
}

/**
 * What Learn has left.
 *
 * The block count comes first because it outranks the cap: with every block in
 * scope introduced there is nothing for the allowance to hold back, and saying
 * "next block unlocks tomorrow" then would name a block that does not exist.
 */
export function learnStatus(blocks: DecadeBlock[], allowance: DailyAllowance): string {
  const left = blocks.filter((block) => block.available && block.status !== 'introduced').length;
  if (left === 0) return 'Every block in scope is introduced.';
  if (!allowance.canStart) return allowance.message;
  return `${left} ${left === 1 ? 'block' : 'blocks'} of ten still to learn.`;
}

export function troubleStatus(count: number): string {
  return `${count} ${count === 1 ? 'code' : 'codes'} flagged after six lapses.`;
}

/**
 * The tiles, in the order they are laid out. Trouble spots is absent while
 * nothing is flagged, which also leaves the grid at a clean 2x2 once it is not.
 */
export function yearCodeTiles({ items, itemList, scope, allowance, now }: TileInput): YearCodeTile[] {
  const blocks = decadeBlocks(items, scope);
  const trouble = troubleItems(itemList, scope).length;

  const tiles: YearCodeTile[] = [
    {
      id: 'learn',
      path: '/year-codes/learn',
      label: 'Learn',
      icon: BookOpen,
      status: learnStatus(blocks, allowance),
    },
    {
      id: 'revise',
      path: '/year-codes/revise',
      label: 'Revise',
      icon: Repeat,
      status: reviseStatus(itemList, scope, now).detail,
    },
    {
      id: 'calc',
      path: '/year-codes/calc',
      label: 'Calc',
      icon: Calculator,
      // Static, and it stays static. The per-step figures Calc keeps answer
      // "which step is slow", which is a sentence, not a number for a tile.
      status: 'Work any code out from the year, one step at a time.',
    },
  ];

  if (trouble > 0) {
    tiles.push({
      id: 'trouble',
      path: '/year-codes/trouble',
      label: 'Trouble spots',
      icon: Flag,
      status: troubleStatus(trouble),
    });
  }

  return tiles;
}
