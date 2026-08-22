import { describe, expect, it } from 'vitest';
import { buildDayStepTotals, emptyDayStepTotals } from '@/domain/dayStepLifetime';
import { introduce } from '@/domain/scheduler';
import type { DayStepAttempt, ItemState } from '@/domain/types';
import { SLOWEST_STEP_MIN_SAMPLES } from '@/features/weekday/dayStepStats';
import { centuryItemKey, defaultCenturyItems, defaultMonthItems, monthItemKey } from '@/storage/defaults';
import { TABLE_ITEM_COUNT, dayStepStatus, doomsdayTiles, tablesStatus } from './tiles';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function months(build: (map: Record<string, ItemState>) => void = () => {}) {
  const map = defaultMonthItems();
  build(map);
  return map;
}

function centuries(build: (map: Record<string, ItemState>) => void = () => {}) {
  const map = defaultCenturyItems();
  build(map);
  return map;
}

function attempt(over: Partial<DayStepAttempt> = {}): DayStepAttempt {
  return {
    timestamp: NOW,
    month: 3,
    leapYear: false,
    anchorDay: 14,
    anchorWeekday: 2,
    targetDay: 15,
    size: 1,
    direction: 'forward',
    correct: true,
    latencyMs: 1000,
    answered: 0,
    ...over,
  };
}

/** `count` answers of one step size, all at the same latency. */
function runOf(size: DayStepAttempt['size'], count: number, latencyMs: number): DayStepAttempt[] {
  return Array.from({ length: count }, () => attempt({ size, latencyMs }));
}

describe('tablesStatus', () => {
  it('counts what is due out of the sixteen, never a bare number', () => {
    // A fresh document has all sixteen unintroduced, and an unintroduced item
    // is in the queue: sixteen items do not need a Learn mode of their own.
    expect(tablesStatus(months(), centuries(), NOW)).toBe(
      `${TABLE_ITEM_COUNT} of ${TABLE_ITEM_COUNT} due now, oldest first.`,
    );
  });

  it('names when the next one comes back rather than printing a zero', () => {
    const month = months((map) => {
      for (const key of Object.keys(map)) {
        map[key] = { ...introduce(map[key], NOW), dueAt: NOW + 3 * DAY };
      }
    });
    const century = centuries((map) => {
      for (const key of Object.keys(map)) {
        map[key] = { ...introduce(map[key], NOW), dueAt: NOW + 5 * DAY };
      }
    });
    expect(tablesStatus(month, century, NOW)).toBe('Nothing due now. Next due in 3 days.');
  });

  it('leaves an item that is introduced but not yet due out of the count', () => {
    const month = months((map) => {
      map[monthItemKey(1)] = { ...introduce(map[monthItemKey(1)], NOW), dueAt: NOW + DAY };
    });
    expect(tablesStatus(month, centuries(), NOW)).toBe(
      `${TABLE_ITEM_COUNT - 1} of ${TABLE_ITEM_COUNT} due now, oldest first.`,
    );
  });

  it('drops an answered century out of the count', () => {
    const century = centuries((map) => {
      map[centuryItemKey(18)] = { ...introduce(map[centuryItemKey(18)], NOW), dueAt: NOW + DAY };
    });
    expect(tablesStatus(months(), century, NOW)).toBe(
      `${TABLE_ITEM_COUNT - 1} of ${TABLE_ITEM_COUNT} due now, oldest first.`,
    );
  });
});

describe('dayStepStatus', () => {
  it('says what the screen is for before anything has been answered', () => {
    expect(dayStepStatus(emptyDayStepTotals())).toBe('The last step of the method, on its own.');
  });

  it('names the slowest step once there is enough of it to name one', () => {
    const totals = buildDayStepTotals([
      ...runOf(1, SLOWEST_STEP_MIN_SAMPLES, 800),
      ...runOf(5, SLOWEST_STEP_MIN_SAMPLES, 3000),
    ]);
    // 3.3s rather than 3.0s: above ten seconds the buckets are coarse and
    // below two they are dense, so a median here is the bucket's figure. That
    // is the trim-proof aggregate working as designed, not a rounding slip.
    expect(dayStepStatus(totals)).toBe('Slowest step +5, median 3.3s.');
  });

  it('falls back to the overall median before any size has five answers', () => {
    const totals = buildDayStepTotals(runOf(3, SLOWEST_STEP_MIN_SAMPLES - 1, 1400));
    expect(dayStepStatus(totals)).toBe('4 steps, median 1.4s.');
  });

  it('counts one step as a step, not as steps', () => {
    expect(dayStepStatus(buildDayStepTotals([attempt({ latencyMs: 900 })]))).toBe(
      '1 step, median 0.88s.',
    );
  });
});

describe('doomsdayTiles', () => {
  it('is Tables then Day step, both pointing at a real address', () => {
    const tiles = doomsdayTiles({
      monthItems: months(),
      centuryItems: centuries(),
      dayStepTotals: emptyDayStepTotals(),
      now: NOW,
    });
    expect(tiles.map((tile) => [tile.id, tile.path])).toEqual([
      ['tables', '/doomsdays/tables'],
      ['day-step', '/doomsdays/day-step'],
    ]);
  });

  it('gives every tile a status line that is never empty', () => {
    const tiles = doomsdayTiles({
      monthItems: months(),
      centuryItems: centuries(),
      dayStepTotals: emptyDayStepTotals(),
      now: NOW,
    });
    for (const tile of tiles) {
      expect(tile.status.length, tile.id).toBeGreaterThan(0);
    }
  });
});
