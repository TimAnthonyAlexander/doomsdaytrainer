import { Anchor, Footprints } from 'lucide-react';
import type { Tile } from '@/components/ui/TileGrid';
import { dayStepMedianMs, overallDayStepTotals } from '@/domain/dayStepLifetime';
import { formatMs } from '@/domain/time';
import type { DayStepTotals, ItemState } from '@/domain/types';
import { nextDueLabel } from '@/features/review/summary';
import { sizeLabel, slowestSize } from '@/features/weekday/dayStepStats';
import { nextTableDueAt, tableQueue } from '@/features/weekday/tableDrill';

/**
 * The Doomsdays grid, as data.
 *
 * Same contract as the Year codes tiles: every status line is derived from the
 * screen it points at, by the same functions that screen uses. A tile that
 * promised a queue which opens empty would be worse than no line at all.
 */

export type DoomsdayTileId = 'tables' | 'day-step';

export interface DoomsdayTile extends Tile {
  id: DoomsdayTileId;
}

export const TABLE_ITEM_COUNT = 16;

/**
 * What Tables has left. Due first, because that is the only figure that is a
 * reason to open it; the next-due line is the honest thing to say instead of a
 * zero, which would read as a measurement rather than as an absence.
 */
export function tablesStatus(
  monthItems: Record<string, ItemState>,
  centuryItems: Record<string, ItemState>,
  now: number,
): string {
  const due = tableQueue(monthItems, centuryItems, now).length;
  if (due > 0) return `${due} of ${TABLE_ITEM_COUNT} due now, oldest first.`;
  const next = nextDueLabel(nextTableDueAt(monthItems, centuryItems, now), now);
  return next === null ? 'Nothing due now.' : `Nothing due now. Next due ${next}.`;
}

/**
 * What the day step has to say for itself.
 *
 * The slowest step size outranks the median, because it is the one line here
 * that can be acted on: "the +5 steps are the ones still being counted" names
 * a drill, and "median 1.4s" names only a mood. It needs five answers of that
 * size before it will claim anything, so an early run falls back to the median
 * and a cold start says so plainly.
 */
export function dayStepStatus(totals: DayStepTotals): string {
  const overall = overallDayStepTotals(totals);
  if (overall.answered === 0) return 'The last step of the method, on its own.';

  const slowest = slowestSize(totals);
  if (slowest !== null) {
    const cell = totals.bySize[slowest];
    const median = cell ? dayStepMedianMs(cell) : null;
    if (median !== null) {
      return `Slowest step ${sizeLabel(slowest)}, median ${formatMs(median)}.`;
    }
  }

  const median = dayStepMedianMs(overall);
  const steps = overall.answered === 1 ? '1 step' : `${overall.answered} steps`;
  return median === null ? `${steps} so far.` : `${steps}, median ${formatMs(median)}.`;
}

export interface DoomsdayTileInput {
  monthItems: Record<string, ItemState>;
  centuryItems: Record<string, ItemState>;
  dayStepTotals: DayStepTotals;
  now: number;
}

/**
 * The tiles, in the order they are laid out. Tables first: the sixteen are
 * what a doomsday *is*, and the step is what you do once you have one.
 */
export function doomsdayTiles({
  monthItems,
  centuryItems,
  dayStepTotals,
  now,
}: DoomsdayTileInput): DoomsdayTile[] {
  return [
    {
      id: 'tables',
      path: '/doomsdays/tables',
      label: 'Tables',
      icon: Anchor,
      status: tablesStatus(monthItems, centuryItems, now),
    },
    {
      id: 'day-step',
      path: '/doomsdays/day-step',
      label: 'Day step',
      icon: Footprints,
      status: dayStepStatus(dayStepTotals),
    },
  ];
}
