import type { ItemState, Scope } from '@/domain/types';
import { isLeech } from '@/domain/scheduler';
import { inScope } from '@/domain/scope';

/**
 * The leech pool, and the rule that lets an item leave it.
 *
 * SM-2 never decrements `lapses`, so `isLeech` stays true for the life of the
 * item once it has crossed the threshold. Left at that, the drill would fill up
 * and never empty, and a list that only grows is a list nobody opens. Recovery
 * is therefore derived from the schedule rather than stored: an item the
 * scheduler is willing to leave alone for ten days is recovered, whatever its
 * history says. The `leech` flag and the lapse count stay exactly as they are,
 * so Stats still shows what the item cost.
 */

/** Interval at which a flagged item stops being drilled. Bucket 4 on the grid. */
export const RECOVERY_INTERVAL_DAYS = 10;

export function isRecovered(item: ItemState): boolean {
  return item.interval >= RECOVERY_INTERVAL_DAYS;
}

/** Flagged, in scope, not recovered. Worst first, then by year for determinism. */
export function troubleItems(items: ItemState[], scope: Scope): ItemState[] {
  return items
    .filter(
      (item) =>
        item.introduced && isLeech(item) && !isRecovered(item) && inScope(item.yy, scope),
    )
    .sort((a, b) => (b.lapses === a.lapses ? a.yy - b.yy : b.lapses - a.lapses));
}
