import { formatMs } from '@/domain/time';
import type { ItemState, Scope, YearKey } from '@/domain/types';
import { sprintPool } from '@/features/drills/drillPlan';
import type { SessionSummary } from '@/features/review/summary';

/**
 * The endless pass over the year codes, as data.
 *
 * There is nothing to plan here beyond which years it may ask, because the
 * surface has no length, no clock and no schedule: it draws the pool once and
 * `src/features/learn/endless.ts` orders it from there.
 */

/**
 * Every year this can ask: introduced, and inside the active scope.
 *
 * Deliberately the same function the drills use rather than a second copy of
 * the same filter. A code the user has never been shown is not practice
 * wherever it is asked, and if that rule ever changes it should change in one
 * place.
 */
export function endlessPool(items: ItemState[], scope: Scope): YearKey[] {
  return sprintPool(items, scope);
}

/**
 * The tile's one line.
 *
 * It names the pool rather than promising a number to reach, because there is
 * no number to reach — the count is the point of the other three tiles and the
 * absence of one is the point of this one.
 */
export function endlessStatus(count: number): string {
  if (count === 0) return 'Learn a block and its ten codes join the pass.';
  return `${count} ${count === 1 ? 'code' : 'codes'} learned, asked over and over.`;
}

/**
 * What the sitting came to, in the app's one sentence for that: a count, the
 * misses, and the middle of the latencies.
 *
 * Every tap counts, including the wrong ones. A wrong tap never advances, so
 * the same year is asked again and answered again, and a total that skipped
 * the first of those would report fewer answers than the hand actually gave.
 */
export function endlessSessionLine(summary: SessionSummary): string {
  if (summary.total === 0) return '';
  return `${summary.total} answered, ${summary.wrong} wrong, median ${formatMs(summary.medianLatencyMs)}`;
}
