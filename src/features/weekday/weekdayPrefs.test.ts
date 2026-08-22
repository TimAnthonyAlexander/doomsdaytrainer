import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WEEKDAY_MODE,
  DEFAULT_WEEKDAY_RANGE,
  WEEKDAY_MODE_KEY,
  WEEKDAY_RANGE_KEY,
  readWeekdayMode,
  readWeekdayRange,
  writeWeekdayMode,
  writeWeekdayRange,
} from './weekdayPrefs';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('Weekday preferences', () => {
  it('starts a fresh device unassisted, on this century', () => {
    // Assisted hands over the year code. The screen the app opens on does not.
    expect(readWeekdayMode()).toBe('unassisted');
    expect(readWeekdayRange()).toBe('century');
    expect(DEFAULT_WEEKDAY_MODE).toBe('unassisted');
    expect(DEFAULT_WEEKDAY_RANGE).toBe('century');
  });

  it('reads back what was written', () => {
    writeWeekdayMode('assisted');
    writeWeekdayRange('living');
    expect(readWeekdayMode()).toBe('assisted');
    expect(readWeekdayRange()).toBe('living');

    writeWeekdayMode('unassisted');
    writeWeekdayRange('full');
    expect(readWeekdayMode()).toBe('unassisted');
    expect(readWeekdayRange()).toBe('full');
  });

  it('stores the value under the documented key', () => {
    writeWeekdayMode('assisted');
    writeWeekdayRange('full');
    expect(window.localStorage.getItem(WEEKDAY_MODE_KEY)).toBe('assisted');
    expect(window.localStorage.getItem(WEEKDAY_RANGE_KEY)).toBe('full');
  });

  it('falls back to the default when the stored value is not a legal one', () => {
    window.localStorage.setItem(WEEKDAY_MODE_KEY, 'guided');
    window.localStorage.setItem(WEEKDAY_RANGE_KEY, 'decade');
    expect(readWeekdayMode()).toBe('unassisted');
    // The one that matters: `rangeById` answers an unknown id with the full
    // range, so an unchecked value here would widen the pool rather than error.
    expect(readWeekdayRange()).toBe('century');

    window.localStorage.setItem(WEEKDAY_MODE_KEY, '');
    window.localStorage.setItem(WEEKDAY_RANGE_KEY, 'Century');
    expect(readWeekdayMode()).toBe('unassisted');
    expect(readWeekdayRange()).toBe('century');
  });

  it('survives a browser that refuses storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('The operation is insecure.');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('The operation is insecure.');
    });

    expect(() => writeWeekdayMode('assisted')).not.toThrow();
    expect(() => writeWeekdayRange('full')).not.toThrow();
    // Nothing persisted, so the read is the default rather than a crash.
    expect(readWeekdayMode()).toBe('unassisted');
    expect(readWeekdayRange()).toBe('century');
  });
});
