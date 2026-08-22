import { describe, expect, it } from 'vitest';
import { MONTH_DOOMSDAYS, weekdayFor } from '@/domain/weekday';
import { MONTH_PAD_VALUES, weekdayOptions } from './weekdayPad';

describe('weekdayOptions', () => {
  it('is always seven, and always the seven days', () => {
    for (const convention of ['sunday', 'monday'] as const) {
      const options = weekdayOptions(convention);
      expect(options).toHaveLength(7);
      expect(new Set(options.map((o) => o.value)).size).toBe(7);
      expect(new Set(options.map((o) => o.name)).size).toBe(7);
    }
  });

  it('starts on Sunday when the user is Sunday-indexed', () => {
    const options = weekdayOptions('sunday');
    expect(options.map((o) => o.name)).toEqual([
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ]);
    expect(options.map((o) => o.value)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('starts on Monday when the user is Monday-indexed, without renaming a day', () => {
    const options = weekdayOptions('monday');
    expect(options.map((o) => o.name)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    // Reordered, not relabelled: Saturday still carries the code the tables give it.
    expect(options.map((o) => o.value)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('keeps the value that matches the method under either convention', () => {
    // 14 March 1987 was a Saturday.
    const code = weekdayFor(1987, 3, 14);
    for (const convention of ['sunday', 'monday'] as const) {
      const saturday = weekdayOptions(convention).find((o) => o.name === 'Saturday');
      expect(saturday?.value).toBe(code);
    }
  });

  it('abbreviates to three letters, all distinct', () => {
    const shorts = weekdayOptions('sunday').map((o) => o.short);
    expect(shorts).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(new Set(shorts).size).toBe(7);
  });
});

describe('MONTH_PAD_VALUES', () => {
  it('is exactly the twelve month doomsdays, ascending', () => {
    expect(MONTH_PAD_VALUES).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 28]);
    expect([...MONTH_PAD_VALUES].sort((a, b) => a - b)).toEqual([...MONTH_PAD_VALUES]);
  });

  it('can answer every month', () => {
    for (const doomsday of MONTH_DOOMSDAYS) {
      expect(MONTH_PAD_VALUES).toContain(doomsday);
    }
  });
});
