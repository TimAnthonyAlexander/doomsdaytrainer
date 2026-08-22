import { ThemeProvider } from '@mui/material/styles';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildTheme } from './theme';
import {
  DEFAULT_PREFERENCE,
  SYSTEM_DARK_QUERY,
  readThemePreference,
  resolveMode,
  writeThemePreference,
} from './themeStorage';
import { themeColor, type ThemePreference } from './tokens';
import { ThemeModeContext, type ThemeModeValue } from './useThemeMode';

/**
 * Owns the mode: reads the stored preference, keeps `data-theme` on the html
 * element in step with it, and hands the matching MUI theme down.
 *
 * The inline script in index.html has already stamped `data-theme` by the time
 * this mounts. That is the point — this provider agrees with what is on screen
 * rather than being what puts it there, so switching modes later never repaints
 * the page twice and a first load never flashes.
 */

function applyMode(mode: 'light' | 'dark'): void {
  const ground = themeColor(mode);
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  root.style.backgroundColor = ground;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ground);
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_PREFERENCE);
  const [mode, setMode] = useState(() => resolveMode(DEFAULT_PREFERENCE));

  // The first read happens in an effect rather than in the initial state so
  // server-rendered and test environments without storage still mount.
  useEffect(() => {
    const stored = readThemePreference();
    setPreferenceState(stored);
    setMode(resolveMode(stored));
  }, []);

  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  // Only 'system' listens. A fixed choice ignores the OS switching under it.
  useEffect(() => {
    if (preference !== 'system') return;
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(SYSTEM_DARK_QUERY);
    const onChange = () => setMode(query.matches ? 'dark' : 'light');
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    setMode(resolveMode(next));
    writeThemePreference(next);
  }, []);

  const value = useMemo<ThemeModeValue>(
    () => ({ preference, mode, setPreference }),
    [preference, mode, setPreference],
  );

  const theme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
