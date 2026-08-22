/**
 * Which year the practice and verify screens ask for next.
 *
 * A session never asks the same year twice while there is an unused one left.
 * Repeating inside a short run turns a calculation drill into a recall drill,
 * which is the other half of the app.
 */

import type { YearKey } from '@/domain/types';
import { allYears } from '@/domain/yearCodes';

export interface YearDraw {
  yy: YearKey;
  /** The used list to pass to the next draw. */
  used: YearKey[];
}

/**
 * Picks an unused year. Once every year has been used the list starts over, so
 * a long session keeps running rather than stopping on an empty pool.
 *
 * `random` returns 0 <= r < 1 and is injected so the sequence is testable.
 */
export function drawYear(used: readonly YearKey[], random: () => number, pool: YearKey[] = allYears()): YearDraw {
  if (pool.length === 0) throw new RangeError('Year pool is empty.');
  const seen = new Set(used);
  const free = pool.filter((yy) => !seen.has(yy));
  const from = free.length > 0 ? free : pool;
  const index = Math.min(from.length - 1, Math.max(0, Math.floor(random() * from.length)));
  const yy = from[index];
  return { yy, used: free.length > 0 ? [...used, yy] : [yy] };
}
