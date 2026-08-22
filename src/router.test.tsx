import { matchRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '@/components/shell/BottomNav';
import { routes } from './router';

/**
 * The route table had no test until a nav restructure moved five paths at once,
 * which is exactly how a dead link ships: every screen still renders, every
 * unit test still passes, and the only broken thing is the address the button
 * points at. `matchRoutes` answers that without a browser.
 */

/** The path of the leaf route an address lands on. `*` means it fell through. */
function leaf(pathname: string): string | null {
  const matches = matchRoutes(routes, pathname);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1].route.path ?? '';
}

function resolves(pathname: string): boolean {
  const path = leaf(pathname);
  return path !== null && path !== '*';
}

/** Every address the app links to, including the ones no nav entry names. */
const LINKED_PATHS = [
  '/',
  '/welcome',
  '/concept',
  '/year-codes',
  '/year-codes/learn',
  '/year-codes/revise',
  '/year-codes/calc',
  '/year-codes/trouble',
  '/doomsdays',
  '/doomsdays/tables',
  '/doomsdays/day-step',
  '/stats',
  '/settings',
];

describe('the route table', () => {
  it('has a screen behind every nav entry', () => {
    for (const item of NAV_ITEMS) {
      expect(resolves(item.path), `${item.label} (${item.path})`).toBe(true);
    }
  });

  it('has a screen behind every address the app links to', () => {
    for (const path of LINKED_PATHS) {
      expect(resolves(path), path).toBe(true);
    }
  });

  it('nests the year-code screens under the nav entry that lights up for them', () => {
    // Nesting is what makes one nav entry cover four screens, so it is worth
    // asserting rather than leaving to the shape of a literal.
    const nested = routes
      .flatMap((route) => route.children ?? [])
      .map((route) => route.path)
      .filter((path): path is string => path !== undefined && path.startsWith('year-codes'));

    expect(nested).toEqual([
      'year-codes',
      'year-codes/learn',
      'year-codes/revise',
      'year-codes/calc',
      'year-codes/trouble',
    ]);
  });

  it('nests the doomsday screens under the nav entry that lights up for them', () => {
    const nested = routes
      .flatMap((route) => route.children ?? [])
      .map((route) => route.path)
      .filter((path): path is string => path !== undefined && path.startsWith('doomsdays'));

    expect(nested).toEqual(['doomsdays', 'doomsdays/tables', 'doomsdays/day-step']);
  });

  it('keeps Concept at the top level, so its nav entry lights on it alone', () => {
    expect(leaf('/concept')).toBe('concept');
    expect(leaf('/concept/anything')).toBe('*');
  });

  it('sends an address with no screen to the catch-all', () => {
    expect(leaf('/nowhere')).toBe('*');
    // The old top-level addresses are gone, not silently still working.
    for (const dead of ['/learn', '/drills', '/calc', '/trouble', '/weekday']) {
      expect(leaf(dead), dead).toBe('*');
    }
  });
});
