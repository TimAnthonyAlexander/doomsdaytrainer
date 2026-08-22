import { createContext, useContext } from 'react';
import type { ThemeMode, ThemePreference } from './tokens';
import { DEFAULT_PREFERENCE, resolveMode } from './themeStorage';

export interface ThemeModeValue {
  /** What the user picked: `'dark'`, `'light'` or `'system'`. */
  preference: ThemePreference;
  /** What that resolves to right now. Always `'dark'` or `'light'`. */
  mode: ThemeMode;
  /** Stores the choice and repaints. Passing the current value is a no-op. */
  setPreference: (preference: ThemePreference) => void;
}

/**
 * Defaults, so a component rendered without the provider (a unit test, say)
 * still reads the app's first-launch mode rather than crashing.
 */
export const ThemeModeContext = createContext<ThemeModeValue>({
  preference: DEFAULT_PREFERENCE,
  mode: resolveMode(DEFAULT_PREFERENCE),
  setPreference: () => {},
});

/** The mode control. Read `mode` to branch on it, `preference` to render a picker. */
export function useThemeMode(): ThemeModeValue {
  return useContext(ThemeModeContext);
}
