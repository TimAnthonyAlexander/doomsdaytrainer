/**
 * Which mode and which date range the weekday trainer comes back on.
 *
 * localStorage, not `AppData` and not a `Settings` field. "The picker I left
 * this screen on" is device state, the same category as the theme preference in
 * `src/theme/themeStorage.ts`: export the document, import it on a second
 * machine, and a picker nobody touched there would have moved. So it reuses the
 * `deviceFlags` wrappers, which swallow the throw Safari raises on storage
 * access in private mode — a locked-down browser must cost the memory, not the
 * screen.
 *
 * The view (`dates`, `daystep`, `tables`, `stats`) is deliberately not here. It
 * is where the user is standing rather than what they chose, and coming back
 * into a half-finished table drill is not a preference.
 *
 * An unrecognised stored value falls back to the default rather than reaching
 * the screen. The range matters most: `rangeById` in `datePool.ts` answers an
 * unknown id with the full range, so a corrupt value would silently widen the
 * pool from one century to four hundred years instead of failing.
 */
import type { WeekdayMode, WeekdayRangeId, WeekdayTask } from '@/domain/types';
import { readFlag, writeFlag } from '@/features/notifications/deviceFlags';

export const WEEKDAY_MODE_KEY = 'doomsday.weekdayMode';
export const WEEKDAY_RANGE_KEY = 'doomsday.weekdayRange';
export const WEEKDAY_TASK_KEY = 'doomsday.weekdayTask';

/**
 * The whole date. The two halves exist to be practised deliberately, and the
 * screen is the app's index route — opening it on half of the method would
 * make the front door of the app a drill for one step of it.
 */
export const DEFAULT_WEEKDAY_TASK: WeekdayTask = 'full';

/**
 * Unassisted on a fresh device. Assisted hands over the year code, which is the
 * part the app spends ten decades teaching, so starting there would let the
 * primary screen skip the thing it exists for.
 */
export const DEFAULT_WEEKDAY_MODE: WeekdayMode = 'unassisted';

/** This century. The dates a person actually needs a weekday for. */
export const DEFAULT_WEEKDAY_RANGE: WeekdayRangeId = 'century';

function isMode(value: string | null): value is WeekdayMode {
  return value === 'assisted' || value === 'unassisted';
}

function isRangeId(value: string | null): value is WeekdayRangeId {
  return value === 'century' || value === 'living' || value === 'full';
}

export function readWeekdayMode(): WeekdayMode {
  const stored = readFlag(WEEKDAY_MODE_KEY);
  return isMode(stored) ? stored : DEFAULT_WEEKDAY_MODE;
}

export function writeWeekdayMode(mode: WeekdayMode): void {
  writeFlag(WEEKDAY_MODE_KEY, mode);
}

function isTask(value: string | null): value is WeekdayTask {
  return value === 'full' || value === 'year' || value === 'date';
}

export function readWeekdayTask(): WeekdayTask {
  const stored = readFlag(WEEKDAY_TASK_KEY);
  return isTask(stored) ? stored : DEFAULT_WEEKDAY_TASK;
}

export function writeWeekdayTask(task: WeekdayTask): void {
  writeFlag(WEEKDAY_TASK_KEY, task);
}

export function readWeekdayRange(): WeekdayRangeId {
  const stored = readFlag(WEEKDAY_RANGE_KEY);
  return isRangeId(stored) ? stored : DEFAULT_WEEKDAY_RANGE;
}

export function writeWeekdayRange(rangeId: WeekdayRangeId): void {
  writeFlag(WEEKDAY_RANGE_KEY, rangeId);
}
