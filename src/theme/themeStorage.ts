/**
 * Where the chosen mode lives.
 *
 * localStorage, not `AppData`. Which mode a screen is in is a property of the
 * device, the same way "I already answered the notification prompt" is — export
 * it and import it onto a second machine and you have changed a setting nobody
 * touched there. `src/features/notifications/deviceFlags.ts` set that
 * precedent and this reuses its wrappers, which swallow the throw Safari raises
 * on storage access in private mode.
 *
 * The key and the resolution rule are duplicated by the inline script in
 * index.html, which has to run before any module loads. Change one, change both.
 */
import { readFlag, writeFlag } from '@/features/notifications/deviceFlags';
import type { ThemeMode, ThemePreference } from './tokens';

export const THEME_PREFERENCE_KEY = 'doomsday.themePreference';

/** Dark on first launch, per STYLEGUIDE.md §2. Not system — dark. */
export const DEFAULT_PREFERENCE: ThemePreference = 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['dark', 'light', 'system'];

function isPreference(value: string | null): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}

export function readThemePreference(): ThemePreference {
  const stored = readFlag(THEME_PREFERENCE_KEY);
  return isPreference(stored) ? stored : DEFAULT_PREFERENCE;
}

export function writeThemePreference(preference: ThemePreference): void {
  writeFlag(THEME_PREFERENCE_KEY, preference);
}

export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

/** What the OS is asking for. Falls back to dark, which is the app's default. */
export function systemMode(): ThemeMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia(SYSTEM_DARK_QUERY).matches ? 'dark' : 'light';
}

export function resolveMode(preference: ThemePreference): ThemeMode {
  return preference === 'system' ? systemMode() : preference;
}
