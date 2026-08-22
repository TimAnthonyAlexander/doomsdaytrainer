/**
 * Device-scoped UI state, kept in localStorage rather than in AppData.
 *
 * "I already asked about notifications", "I already saw the offline line" and
 * "the last reminder instant this device handled" are properties of the browser
 * on this machine, not of the user's learning data. Putting them in AppData
 * would export them, import them onto a second device and re-ask or re-suppress
 * prompts that never happened there. localStorage is the right home.
 *
 * Every access is wrapped: Safari in private mode throws on both read and write.
 */

const PREFIX = 'doomsday.';

export const REMINDER_PROMPT_ASKED = `${PREFIX}reminderPromptAsked`;
export const LAST_REMINDER_AT = `${PREFIX}lastReminderAt`;
export const MISSED_REMINDER_SEEN = `${PREFIX}missedReminderSeen`;
export const OFFLINE_READY_SEEN = `${PREFIX}offlineReadySeen`;

export function readFlag(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeFlag(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage is unavailable; the flag simply does not persist across reloads.
  }
}

export function readNumberFlag(key: string): number {
  const raw = readFlag(key);
  if (raw === null) return 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export function readBooleanFlag(key: string): boolean {
  return readFlag(key) === '1';
}

export function writeBooleanFlag(key: string, value: boolean): void {
  writeFlag(key, value ? '1' : '0');
}
