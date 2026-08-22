import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, isNavActive, screenTitle } from './BottomNav';

describe('isNavActive', () => {
  it('matches the review root exactly and nothing else', () => {
    expect(isNavActive('/', '/')).toBe(true);
    expect(isNavActive('/stats', '/')).toBe(false);
  });

  it('matches a destination and anything nested under it', () => {
    expect(isNavActive('/stats', '/stats')).toBe(true);
    expect(isNavActive('/stats/73', '/stats')).toBe(true);
    // Not a prefix match on the raw string: /statsomething is a different page.
    expect(isNavActive('/statsomething', '/stats')).toBe(false);
  });
});

describe('screenTitle', () => {
  it('names every destination in the nav', () => {
    for (const item of NAV_ITEMS) {
      expect(screenTitle(item.path)).toBe(item.label);
    }
  });

  it('names the screens that are reachable but kept out of the nav', () => {
    // Without this the top bar called a working screen "Not found".
    expect(screenTitle('/trouble')).toBe('Trouble spots');
  });

  it('falls back to Not found for an address with no screen', () => {
    expect(screenTitle('/nowhere')).toBe('Not found');
  });
});
