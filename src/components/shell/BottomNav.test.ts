import { describe, expect, it } from 'vitest';
import { DUE_COUNT_PATH, NAV_ITEMS, isNavActive, screenTitle } from './BottomNav';

describe('NAV_ITEMS', () => {
  it('is Weekday first, Concept second, then the rest, in order', () => {
    expect(NAV_ITEMS.map((item) => [item.path, item.label])).toEqual([
      ['/', 'Weekday'],
      ['/concept', 'Concept'],
      ['/year-codes', 'Year codes'],
      ['/stats', 'Stats'],
      ['/settings', 'Settings'],
    ]);
  });

  it('gives every entry its own icon', () => {
    const icons = new Set(NAV_ITEMS.map((item) => item.icon));
    expect(icons.size).toBe(NAV_ITEMS.length);
  });

  it('hangs the due count on Year codes, which is what falls due', () => {
    expect(NAV_ITEMS.some((item) => item.path === DUE_COUNT_PATH)).toBe(true);
    expect(DUE_COUNT_PATH).not.toBe('/');
  });
});

describe('isNavActive', () => {
  it('matches the weekday root exactly and nothing else', () => {
    expect(isNavActive('/', '/')).toBe(true);
    expect(isNavActive('/stats', '/')).toBe(false);
    expect(isNavActive('/concept', '/')).toBe(false);
    expect(isNavActive('/year-codes', '/')).toBe(false);
  });

  it('matches a destination and anything nested under it', () => {
    expect(isNavActive('/stats', '/stats')).toBe(true);
    expect(isNavActive('/stats/73', '/stats')).toBe(true);
    // Not a prefix match on the raw string: /statsomething is a different page.
    expect(isNavActive('/statsomething', '/stats')).toBe(false);
  });

  it('lights Year codes on every one of its children, with no extra rule', () => {
    for (const child of ['learn', 'revise', 'calc', 'trouble']) {
      expect(isNavActive(`/year-codes/${child}`, '/year-codes')).toBe(true);
    }
  });
});

describe('screenTitle', () => {
  it('names every destination in the nav', () => {
    for (const item of NAV_ITEMS) {
      expect(screenTitle(item.path)).toBe(item.label);
    }
  });

  it('lets a child of Year codes name itself instead of inheriting the parent', () => {
    // The nav entry is active on the whole subtree, so a plain nav lookup would
    // put "Year codes" in the top bar while the user is on Learn.
    expect(screenTitle('/year-codes/learn')).toBe('Learn');
    expect(screenTitle('/year-codes/revise')).toBe('Revise');
    expect(screenTitle('/year-codes/calc')).toBe('Calc');
    expect(screenTitle('/year-codes/trouble')).toBe('Trouble spots');
  });

  it('falls back to Not found for an address with no screen', () => {
    expect(screenTitle('/nowhere')).toBe('Not found');
  });
});
