import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import type {
  AppData,
  CalcAttempt,
  CalcStepId,
  DayStepAttempt,
  DayStepDirection,
  DayStepSize,
  DrillRecord,
  WeekdayAttempt,
  WeekdayMode,
} from '@/domain/types';
import { CALC_STEP_IDS } from '@/domain/calc';
import { DAY_STEP_SIZES } from '@/domain/dayStep';
import {
  buildDayStepTotals,
  emptyDayStepBucketTotals,
  emptyDayStepTotals,
  overallDayStepTotals,
} from '@/domain/dayStepLifetime';
import {
  buildCalcTotals,
  buildVerifyAttempt,
  calcAnsweredTotal,
  calcStepAnswered,
  calcStepMedian,
  emptyCalcTotals,
  emptyVerifyTotals,
  verifyChecked,
} from '@/domain/calcStats';
import {
  WEEKDAY_BUCKET_COUNT,
  bucketLowerEdge,
  bucketUpperEdge,
  buildWeekdayTotals,
  estimateMedianMs,
  latencyBucket,
} from '@/domain/weekdayLifetime';
import { median } from '@/domain/time';
import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  centuryItemKey,
  defaultAppData,
  itemKey,
  monthItemKey,
} from './defaults';
import { closeDb, loadAppData, migrateAppData, patchAppData, resetAppData, saveAppData } from './db';

const DB_NAME = 'doomsday-trainer';
const STORE = 'state';
const KEY = 'app';

async function deleteDb(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function putRaw(doc: unknown): Promise<void> {
  const instance = await openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    },
  });
  await instance.put(STORE, doc, KEY);
  instance.close();
}

beforeEach(deleteDb);

describe('loadAppData', () => {
  it('creates a full default document on first run', async () => {
    const data = await loadAppData();
    expect(Object.keys(data.items)).toHaveLength(100);
    expect(data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
    expect(data.drills).toEqual([]);
    expect(data.days).toEqual({});
    expect(data.items[itemKey(7)].yy).toBe(7);
    expect(data.items[itemKey(99)].yy).toBe(99);
  });

  it('returns the same document on a second run', async () => {
    const first = await loadAppData();
    await closeDb();
    const second = await loadAppData();
    expect(second.createdAt).toBe(first.createdAt);
  });

  it('fills in items that a partial import left out', async () => {
    const partial = defaultAppData(1000);
    delete partial.items[itemKey(3)];
    delete partial.items[itemKey(42)];
    await putRaw(partial);
    await closeDb();

    const data = await loadAppData();
    expect(Object.keys(data.items)).toHaveLength(100);
    expect(data.items[itemKey(3)].yy).toBe(3);
    expect(data.items[itemKey(42)].yy).toBe(42);
  });

  it('merges stored settings over the defaults so new settings get a value', async () => {
    const partial = defaultAppData(1000);
    const settings = { ...partial.settings, newItemsPerDay: 5 } as Record<string, unknown>;
    delete settings.hintType;
    delete settings.autoAdvanceMs;
    await putRaw({ ...partial, settings });
    await closeDb();

    const data = await loadAppData();
    expect(data.settings.newItemsPerDay).toBe(5);
    expect(data.settings.hintType).toBe(DEFAULT_SETTINGS.hintType);
    expect(data.settings.autoAdvanceMs).toBe(DEFAULT_SETTINGS.autoAdvanceMs);
  });

  it('refuses a document from a newer schema without destroying it', async () => {
    const future = { ...defaultAppData(1000), schemaVersion: SCHEMA_VERSION + 1 };
    await putRaw(future);
    await closeDb();

    await expect(loadAppData()).rejects.toThrow(/newer version/i);

    await closeDb();
    const instance = await openDB(DB_NAME, 1);
    const stored = (await instance.get(STORE, KEY)) as AppData;
    instance.close();
    expect(stored.schemaVersion).toBe(SCHEMA_VERSION + 1);
  });
});

/** A document exactly as schema v1 wrote it: no weekday trainer fields at all. */
function v1Document(): AppData {
  const drill: DrillRecord = {
    id: 'drill-1',
    mode: 'sprint',
    decade: null,
    timestamp: 1234,
    score: 41,
    correct: 41,
    total: 44,
    medianLatencyMs: 880,
  };
  const v2 = defaultAppData(1000);
  const stripped = {
    ...v2,
    schemaVersion: 1,
    settings: { ...v2.settings, newItemsPerDay: 7, onboardingComplete: true },
    items: {
      ...v2.items,
      [itemKey(73)]: { ...v2.items[itemKey(73)], introduced: true, interval: 12, lapses: 2 },
    },
    drills: [drill],
    days: { '2026-08-21': { date: '2026-08-21', reviewsCompleted: 9, newItemsIntroduced: 10 } },
  } as Record<string, unknown>;
  delete stripped.monthItems;
  delete stripped.centuryItems;
  delete stripped.weekdayAttempts;
  delete stripped.weekdayTotals;
  delete stripped.weekdayRuns;
  delete stripped.calcAttempts;
  delete stripped.calcTotals;
  delete stripped.verifyAttempts;
  delete stripped.verifyTotals;
  return stripped as unknown as AppData;
}

/** One answered date, as the weekday trainer writes it. */
function weekdayAttempt(mode: WeekdayMode, correct: boolean, latencyMs: number, month = 3): WeekdayAttempt {
  return { timestamp: 5000, fullYear: 1987, month, day: 14, mode, correct, latencyMs, answered: 6 };
}

/**
 * A document exactly as schema v2 wrote it: the weekday trainer is there and
 * has real history in it, but there is no lifetime aggregate yet.
 */
function v2Document(attempts: WeekdayAttempt[]): AppData {
  const stripped = { ...defaultAppData(1000), schemaVersion: 2, weekdayAttempts: attempts } as Record<
    string,
    unknown
  >;
  delete stripped.weekdayTotals;
  delete stripped.calcAttempts;
  delete stripped.calcTotals;
  delete stripped.verifyAttempts;
  delete stripped.verifyTotals;
  return stripped as unknown as AppData;
}

/**
 * A document exactly as schema v3 wrote it: the weekday trainer complete with
 * its lifetime aggregate, and nothing at all from the calculation trainer.
 */
function v3Document(overrides: Record<string, unknown> = {}): AppData {
  const stripped = { ...defaultAppData(1000), schemaVersion: 3 } as Record<string, unknown>;
  delete stripped.calcAttempts;
  delete stripped.calcTotals;
  delete stripped.verifyAttempts;
  delete stripped.verifyTotals;
  return { ...stripped, ...overrides } as unknown as AppData;
}

/** One answered calculation step, as the trainer writes it. */
function calcAttempt(step: CalcStepId, correct: boolean, latencyMs: number, yy = 73): CalcAttempt {
  return { timestamp: 6000, yy, step, answered: correct ? 0 : 4, correct, latencyMs, reduced: true };
}

/**
 * A document exactly as schema v5 wrote it: everything up to and including
 * fluency, and nothing at all from the day-step trainer.
 */
function v5Document(overrides: Record<string, unknown> = {}): AppData {
  const stripped = { ...defaultAppData(1000), schemaVersion: 5 } as Record<string, unknown>;
  delete stripped.dayStepAttempts;
  delete stripped.dayStepTotals;
  return { ...stripped, ...overrides } as unknown as AppData;
}

/** One answered day step, as the trainer writes it. */
function dayStepAttempt(
  size: DayStepSize,
  direction: DayStepDirection,
  correct: boolean,
  latencyMs: number,
): DayStepAttempt {
  return {
    timestamp: 8000,
    month: 3,
    leapYear: false,
    anchorDay: 14,
    anchorWeekday: 2,
    targetDay: direction === 'forward' ? 14 + size : 14 - size,
    size,
    direction,
    correct,
    latencyMs,
    answered: correct ? 0 : 1,
  };
}

describe('migrateAppData', () => {
  it('leaves a current document alone', () => {
    const data = defaultAppData(1000);
    expect(migrateAppData(data).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('rejects a nonsense version', () => {
    const data = { ...defaultAppData(1000), schemaVersion: 0 };
    expect(() => migrateAppData(data)).toThrow(/invalid schema version/i);
  });

  it('carries a v1 document forward without losing anything', () => {
    const migrated = migrateAppData(v1Document());

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.settings.newItemsPerDay).toBe(7);
    expect(migrated.settings.onboardingComplete).toBe(true);
    expect(Object.keys(migrated.items)).toHaveLength(100);
    expect(migrated.items[itemKey(73)]).toMatchObject({ introduced: true, interval: 12, lapses: 2 });
    expect(migrated.drills).toHaveLength(1);
    expect(migrated.drills[0].id).toBe('drill-1');
    expect(migrated.days['2026-08-21'].reviewsCompleted).toBe(9);
    expect(migrated.createdAt).toBe(1000);
  });

  it('gives a v1 document the twelve month and four century items', () => {
    const migrated = migrateAppData(v1Document());

    expect(Object.keys(migrated.monthItems)).toHaveLength(12);
    expect(Object.keys(migrated.centuryItems)).toHaveLength(4);
    expect(migrated.monthItems[monthItemKey(1)].yy).toBe(1);
    expect(migrated.monthItems[monthItemKey(12)].yy).toBe(12);
    expect(migrated.centuryItems[centuryItemKey(18)].yy).toBe(18);
    expect(migrated.centuryItems[centuryItemKey(21)].yy).toBe(21);
    expect(migrated.monthItems[monthItemKey(3)].introduced).toBe(false);
    expect(migrated.monthItems[monthItemKey(3)].easeFactor).toBe(2.5);
    expect(migrated.weekdayAttempts).toEqual([]);
    expect(migrated.weekdayRuns).toEqual([]);
  });

  it('builds the lifetime totals from a v2 document’s existing attempts', () => {
    const attempts = [
      weekdayAttempt('assisted', true, 800),
      weekdayAttempt('assisted', true, 1200),
      weekdayAttempt('assisted', false, 4000),
      weekdayAttempt('unassisted', true, 6000),
      weekdayAttempt('unassisted', false, 20_000),
    ];
    const migrated = migrateAppData(v2Document(attempts));

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    // Not reset to zero: everything the user had practised is still counted.
    expect(migrated.weekdayTotals.assisted).toMatchObject({ answered: 3, correct: 2 });
    expect(migrated.weekdayTotals.unassisted).toMatchObject({ answered: 2, correct: 1 });
    expect(migrated.weekdayAttempts).toHaveLength(5);

    // And it matches what computing straight off the same attempts gives.
    expect(migrated.weekdayTotals).toEqual(buildWeekdayTotals(attempts));
    const assistedLatencies = attempts.filter((a) => a.mode === 'assisted').map((a) => a.latencyMs);
    const estimate = estimateMedianMs(migrated.weekdayTotals.assisted);
    const trueMedian = median(assistedLatencies);
    const bucket = latencyBucket(trueMedian);
    const width = bucketUpperEdge(bucket) - bucketLowerEdge(bucket);
    expect(estimate).not.toBeNull();
    expect(Math.abs((estimate as number) - trueMedian)).toBeLessThanOrEqual(width);
  });

  it('gives a v2 document with no weekday history empty totals rather than nothing', () => {
    const migrated = migrateAppData(v2Document([]));
    expect(migrated.weekdayTotals.assisted).toEqual({
      answered: 0,
      correct: 0,
      latencyBuckets: new Array<number>(WEEKDAY_BUCKET_COUNT).fill(0),
    });
  });

  it('loads a stored v2 document and keeps its weekday history', async () => {
    const attempts = [weekdayAttempt('assisted', true, 900), weekdayAttempt('unassisted', false, 7000)];
    await putRaw(v2Document(attempts));
    await closeDb();

    const data = await loadAppData();
    expect(data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(data.weekdayTotals.assisted.answered).toBe(1);
    expect(data.weekdayTotals.unassisted.answered).toBe(1);
    expect(data.weekdayTotals.unassisted.correct).toBe(0);
  });

  it('loads a stored v1 document straight through', async () => {
    await putRaw(v1Document());
    await closeDb();

    const data = await loadAppData();
    expect(data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(data.items[itemKey(73)].interval).toBe(12);
    expect(Object.keys(data.monthItems)).toHaveLength(12);
    expect(Object.keys(data.centuryItems)).toHaveLength(4);
    expect(data.weekdayRuns).toEqual([]);
  });

  it('gives a v1, v2 and v3 document the calculation trainer, empty', () => {
    for (const doc of [v1Document(), v2Document([]), v3Document()]) {
      const migrated = migrateAppData(doc);
      expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
      expect(migrated.calcAttempts).toEqual([]);
      expect(migrated.calcTotals).toEqual(emptyCalcTotals());
      expect(migrated.verifyAttempts).toEqual([]);
      expect(migrated.verifyTotals).toEqual(emptyVerifyTotals());
    }
  });

  it('builds fluency from a v4 document’s existing review answers, not from zero', () => {
    // Same rule as every other aggregate migration here: someone who has been
    // reviewing for weeks arrives with the fluency their answers already show.
    const day = 24 * 60 * 60 * 1000;
    const fast = (timestamp: number) => ({
      timestamp,
      correct: true,
      latencyMs: 700,
      answered: 0,
      hintUsed: false,
      source: 'review' as const,
    });

    const base = defaultAppData(1000);
    const doc = {
      ...base,
      schemaVersion: 4,
      items: {
        ...base.items,
        [itemKey(73)]: {
          ...base.items[itemKey(73)],
          introduced: true,
          repetitions: 2,
          attemptHistory: [fast(day * 100), fast(day * 101)],
        },
        [itemKey(41)]: {
          ...base.items[itemKey(41)],
          introduced: true,
          repetitions: 2,
          // Correct every time, but never inside the fast threshold.
          attemptHistory: [
            { ...fast(day * 100), latencyMs: 6000 },
            { ...fast(day * 101), latencyMs: 6000 },
          ],
        },
      },
    } as unknown as AppData;

    const migrated = migrateAppData(doc);
    expect(migrated.items[itemKey(73)].fluency.fluent).toBe(true);
    expect(migrated.items[itemKey(73)].fluency.consecutiveFast).toBe(2);
    expect(migrated.items[itemKey(41)].fluency.fluent).toBe(false);
    // And nothing about the schedule moved.
    expect(migrated.items[itemKey(73)].repetitions).toBe(2);
    expect(migrated.items[itemKey(41)].attemptHistory).toHaveLength(2);
  });

  it('gives every item map a fluency block, months and centuries included', () => {
    const migrated = migrateAppData({ ...defaultAppData(1000), schemaVersion: 4 } as AppData);
    for (const map of [migrated.items, migrated.monthItems, migrated.centuryItems]) {
      for (const item of Object.values(map)) {
        expect(item.fluency).toEqual({
          consecutiveFast: 0,
          consecutiveSlow: 0,
          lastFastDay: null,
          fluent: false,
          fluentAt: null,
        });
      }
    }
  });

  it('leaves a v3 user’s year codes, weekday history and settings untouched', () => {
    const before = v3Document({
      settings: { ...DEFAULT_SETTINGS, newItemsPerDay: 3, onboardingComplete: true },
      items: {
        ...defaultAppData(1000).items,
        [itemKey(27)]: { ...defaultAppData(1000).items[itemKey(27)], introduced: true, interval: 45, repetitions: 6 },
      },
      weekdayAttempts: [weekdayAttempt('assisted', true, 900)],
      weekdayTotals: buildWeekdayTotals([weekdayAttempt('assisted', true, 900)]),
      days: { '2026-08-21': { date: '2026-08-21', reviewsCompleted: 4, newItemsIntroduced: 2 } },
    });
    const migrated = migrateAppData(before);

    expect(migrated.settings.newItemsPerDay).toBe(3);
    expect(migrated.settings.onboardingComplete).toBe(true);
    expect(migrated.items[itemKey(27)]).toMatchObject({ introduced: true, interval: 45, repetitions: 6 });
    expect(Object.keys(migrated.items)).toHaveLength(100);
    expect(migrated.weekdayTotals.assisted.answered).toBe(1);
    expect(migrated.days['2026-08-21'].reviewsCompleted).toBe(4);
    expect(migrated.createdAt).toBe(1000);
    // No new item map: the 28 base years are year codes 00-27, already here.
    expect(Object.keys(migrated)).not.toContain('calcItems');
    expect(migrated.items[itemKey(0)]).toBeDefined();
    expect(migrated.items[itemKey(27)]).toBeDefined();
  });

  it('builds the per-step totals from a raw calculation log rather than starting at zero', () => {
    const attempts = [
      calcAttempt('leap', true, 2400),
      calcAttempt('leap', false, 5200),
      calcAttempt('sum', true, 1800),
      calcAttempt('mod', true, 9000),
    ];
    const verifies = [buildVerifyAttempt({
      timestamp: 7000,
      yy: 73,
      recalled: 0,
      derived: 0,
      recallLatencyMs: 800,
      deriveLatencyMs: 5000,
      reduced: true,
    })];
    const migrated = migrateAppData(v3Document({ calcAttempts: attempts, verifyAttempts: verifies }));

    expect(migrated.calcTotals).toEqual(buildCalcTotals(attempts));
    expect(calcStepAnswered(migrated.calcTotals, 'leap')).toBe(2);
    expect(migrated.calcTotals.leap.correct).toBe(1);
    expect(calcAnsweredTotal(migrated.calcTotals)).toBe(4);
    expect(migrated.calcAttempts).toHaveLength(4);
    expect(migrated.verifyTotals.agreedRight).toBe(1);
    expect(verifyChecked(migrated.verifyTotals)).toBe(1);
  });

  it('drops a calculation attempt naming a step it does not know', () => {
    const migrated = migrateAppData(
      v3Document({
        calcAttempts: [calcAttempt('leap', true, 2000), { ...calcAttempt('leap', true, 2000), step: 'carry' }, null],
        verifyAttempts: [null, 'nope'],
      }),
    );
    expect(migrated.calcAttempts).toHaveLength(1);
    expect(calcAnsweredTotal(migrated.calcTotals)).toBe(1);
    expect(migrated.verifyAttempts).toEqual([]);
    expect(verifyChecked(migrated.verifyTotals)).toBe(0);
  });

  it('gives every older document the day-step trainer, empty', () => {
    for (const doc of [v1Document(), v2Document([]), v3Document(), v5Document()]) {
      const migrated = migrateAppData(doc);
      expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
      expect(migrated.dayStepAttempts).toEqual([]);
      expect(migrated.dayStepTotals).toEqual(emptyDayStepTotals());
      expect(overallDayStepTotals(migrated.dayStepTotals).answered).toBe(0);
    }
  });

  it('leaves everything a v5 user had exactly where it was', () => {
    const base = defaultAppData(1000);
    const before = v5Document({
      settings: { ...DEFAULT_SETTINGS, newItemsPerDay: 5, onboardingComplete: true },
      items: {
        ...base.items,
        [itemKey(73)]: {
          ...base.items[itemKey(73)],
          introduced: true,
          interval: 45,
          repetitions: 6,
          lapses: 2,
          fluency: {
            consecutiveFast: 2,
            consecutiveSlow: 0,
            lastFastDay: '2026-08-20',
            fluent: true,
            fluentAt: 999,
          },
        },
      },
      weekdayAttempts: [weekdayAttempt('assisted', true, 900)],
      weekdayTotals: buildWeekdayTotals([weekdayAttempt('assisted', true, 900)]),
      calcAttempts: [calcAttempt('mod', true, 3000)],
      calcTotals: buildCalcTotals([calcAttempt('mod', true, 3000)]),
      drills: [
        { id: 'drill-9', mode: 'sprint', decade: null, timestamp: 1, score: 30, correct: 30, total: 33, medianLatencyMs: 900 },
      ],
      days: { '2026-08-21': { date: '2026-08-21', reviewsCompleted: 11, newItemsIntroduced: 4 } },
    });
    const migrated = migrateAppData(before);

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.settings.newItemsPerDay).toBe(5);
    expect(migrated.settings.onboardingComplete).toBe(true);
    expect(Object.keys(migrated.items)).toHaveLength(100);
    expect(migrated.items[itemKey(73)]).toMatchObject({ introduced: true, interval: 45, repetitions: 6, lapses: 2 });
    // The fluency a v5 document already earned is carried, not rebuilt.
    expect(migrated.items[itemKey(73)].fluency.fluent).toBe(true);
    expect(migrated.items[itemKey(73)].fluency.consecutiveFast).toBe(2);
    expect(Object.keys(migrated.monthItems)).toHaveLength(12);
    expect(Object.keys(migrated.centuryItems)).toHaveLength(4);
    expect(migrated.weekdayAttempts).toHaveLength(1);
    expect(migrated.weekdayTotals.assisted.answered).toBe(1);
    expect(calcStepAnswered(migrated.calcTotals, 'mod')).toBe(1);
    expect(migrated.drills[0].id).toBe('drill-9');
    expect(migrated.days['2026-08-21'].reviewsCompleted).toBe(11);
    expect(migrated.createdAt).toBe(1000);
    // And no new item map: a (doomsday, day) pair is not a fixed item set.
    expect(Object.keys(migrated)).not.toContain('dayStepItems');
  });

  it('builds the day-step aggregate from a raw log rather than starting at zero', () => {
    const attempts = [
      dayStepAttempt(1, 'forward', true, 700),
      dayStepAttempt(1, 'forward', false, 3000),
      dayStepAttempt(5, 'backward', true, 2000),
    ];
    const migrated = migrateAppData(v5Document({ dayStepAttempts: attempts }));

    expect(migrated.dayStepTotals).toEqual(buildDayStepTotals(attempts));
    expect(migrated.dayStepTotals.bySize[1]).toMatchObject({ answered: 2, correct: 1 });
    expect(migrated.dayStepTotals.byDirection.backward.answered).toBe(1);
    expect(overallDayStepTotals(migrated.dayStepTotals).answered).toBe(3);
    expect(migrated.dayStepAttempts).toHaveLength(3);
  });

  it('drops a day step naming a size or direction it does not know', () => {
    const migrated = migrateAppData(
      v5Document({
        dayStepAttempts: [
          dayStepAttempt(2, 'forward', true, 900),
          { ...dayStepAttempt(2, 'forward', true, 900), size: 9 },
          { ...dayStepAttempt(2, 'forward', true, 900), direction: 'sideways' },
          null,
        ],
      }),
    );
    expect(migrated.dayStepAttempts).toHaveLength(1);
    expect(overallDayStepTotals(migrated.dayStepTotals).answered).toBe(1);
  });

  it('loads a stored v5 document and comes back with a usable day-step aggregate', async () => {
    await putRaw(
      v5Document({ dayStepAttempts: [dayStepAttempt(3, 'backward', true, 800), dayStepAttempt(3, 'backward', false, 4000)] }),
    );
    await closeDb();

    const data = await loadAppData();
    expect(data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(data.dayStepTotals.bySize[3]).toMatchObject({ answered: 2, correct: 1 });
    expect(data.dayStepTotals.byDirection.backward.answered).toBe(2);
    expect(data.dayStepAttempts).toHaveLength(2);
  });

  it('loads a stored v3 document and comes back with a usable calculation aggregate', async () => {
    await putRaw(v3Document({ calcAttempts: [calcAttempt('mod', true, 7000), calcAttempt('mod', false, 11_000)] }));
    await closeDb();

    const data = await loadAppData();
    expect(data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(calcStepAnswered(data.calcTotals, 'mod')).toBe(2);
    expect(data.calcTotals.mod.correct).toBe(1);
    expect(calcStepMedian(data.calcTotals, 'mod')).toBeGreaterThan(6000);
  });
});

describe('normalisation of the new maps', () => {
  it('fills month and century items that a partial import left out', async () => {
    const partial = defaultAppData(1000);
    delete partial.monthItems[monthItemKey(2)];
    delete partial.centuryItems[centuryItemKey(20)];
    await putRaw(partial);
    await closeDb();

    const data = await loadAppData();
    expect(Object.keys(data.monthItems)).toHaveLength(12);
    expect(Object.keys(data.centuryItems)).toHaveLength(4);
    expect(data.monthItems[monthItemKey(2)].yy).toBe(2);
    expect(data.centuryItems[centuryItemKey(20)].yy).toBe(20);
  });

  it('keeps the progress that is there', async () => {
    const partial = defaultAppData(1000);
    partial.monthItems[monthItemKey(7)] = {
      ...partial.monthItems[monthItemKey(7)],
      introduced: true,
      interval: 30,
      repetitions: 4,
    };
    await putRaw(partial);
    await closeDb();

    const data = await loadAppData();
    expect(data.monthItems[monthItemKey(7)]).toMatchObject({ introduced: true, interval: 30, repetitions: 4 });
  });
});

describe('normalisation of a corrupt document', () => {
  /**
   * These shapes cannot be produced by the app. They can be produced by a
   * hand-edited export file, and the load path is the last place to stop them:
   * every one of them used to import successfully and then throw on a screen.
   */
  it('replaces an item that is not a usable item rather than scheduling it', async () => {
    const doc = defaultAppData(1000) as unknown as Record<string, unknown>;
    (doc.monthItems as Record<string, unknown>)[monthItemKey(1)] = 42;
    (doc.centuryItems as Record<string, unknown>)[centuryItemKey(18)] = { yy: 18 };
    (doc.items as Record<string, unknown>)[itemKey(73)] = null;
    await putRaw(doc);
    await closeDb();

    const data = await loadAppData();
    for (const item of [data.monthItems[monthItemKey(1)], data.centuryItems[centuryItemKey(18)], data.items[itemKey(73)]]) {
      expect(Number.isFinite(item.easeFactor)).toBe(true);
      expect(Number.isFinite(item.interval)).toBe(true);
      expect(Number.isFinite(item.dueAt)).toBe(true);
      expect(item.attemptHistory).toEqual([]);
    }
    expect(data.monthItems[monthItemKey(1)].yy).toBe(1);
  });

  it('drops list entries and session days that are not objects', async () => {
    const doc = defaultAppData(1000) as unknown as Record<string, unknown>;
    doc.drills = [null, { id: 'a', mode: 'sprint', decade: null, timestamp: 1, score: 3, correct: 3, total: 5, medianLatencyMs: 900 }, 7];
    doc.weekdayAttempts = [null, 'nope'];
    doc.weekdayRuns = [undefined];
    doc.days = {
      '2026-01-01': null,
      '2026-01-02': { date: '2026-01-02', reviewsCompleted: 4, newItemsIntroduced: 0 },
      '2026-01-03': { date: '2026-01-03' },
    };
    await putRaw(doc);
    await closeDb();

    const data = await loadAppData();
    expect(data.drills).toHaveLength(1);
    expect(data.drills[0].id).toBe('a');
    expect(data.weekdayAttempts).toEqual([]);
    expect(data.weekdayRuns).toEqual([]);
    expect(Object.keys(data.days)).toEqual(['2026-01-02']);
  });

  it('repairs a lifetime aggregate rather than letting NaN reach a screen', async () => {
    const doc = defaultAppData(1000) as unknown as Record<string, unknown>;
    doc.weekdayTotals = {
      assisted: { answered: 'lots', correct: -4, latencyBuckets: [3, null, 'two', 1] },
      unassisted: 17,
    };
    await putRaw(doc);
    await closeDb();

    const data = await loadAppData();
    const { assisted, unassisted } = data.weekdayTotals;
    expect(assisted.latencyBuckets).toHaveLength(WEEKDAY_BUCKET_COUNT);
    for (const count of [...assisted.latencyBuckets, ...unassisted.latencyBuckets]) {
      expect(Number.isFinite(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(0);
    }
    // The four readable bucket entries survive; the junk becomes zero.
    expect(assisted.latencyBuckets[0]).toBe(3);
    expect(assisted.latencyBuckets[1]).toBe(0);
    expect(assisted.latencyBuckets[2]).toBe(0);
    expect(assisted.latencyBuckets[3]).toBe(1);
    // `answered` was unusable, so it is raised to cover the samples that exist.
    expect(assisted.answered).toBe(4);
    expect(assisted.correct).toBe(0);
    // A mode that is not an object at all starts empty rather than throwing.
    expect(unassisted).toEqual({
      answered: 0,
      correct: 0,
      latencyBuckets: new Array<number>(WEEKDAY_BUCKET_COUNT).fill(0),
    });
    expect(Number.isFinite(estimateMedianMs(assisted) as number)).toBe(true);
  });

  it('rebuilds the aggregate from the raw log when a document has none', async () => {
    const doc = defaultAppData(1000) as unknown as Record<string, unknown>;
    doc.weekdayAttempts = [weekdayAttempt('assisted', true, 900), weekdayAttempt('assisted', false, 1100)];
    delete doc.weekdayTotals;
    await putRaw(doc);
    await closeDb();

    const data = await loadAppData();
    expect(data.weekdayTotals.assisted).toMatchObject({ answered: 2, correct: 1 });
  });

  it('repairs the per-step aggregate rather than letting NaN reach a screen', async () => {
    const doc = defaultAppData(1000) as unknown as Record<string, unknown>;
    doc.calcTotals = {
      leap: { answered: 'lots', correct: -3, buckets: [4, null, 'two', 2] },
      sum: 19,
    };
    doc.verifyTotals = { agreedRight: 'many', memoryRight: 2, bothWrong: Number.NaN };
    await putRaw(doc);
    await closeDb();

    const data = await loadAppData();
    for (const step of CALC_STEP_IDS) {
      expect(data.calcTotals[step].buckets).toHaveLength(WEEKDAY_BUCKET_COUNT);
      for (const count of data.calcTotals[step].buckets) {
        expect(Number.isFinite(count)).toBe(true);
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
    // The readable bucket entries survive; the junk becomes zero.
    expect(data.calcTotals.leap.buckets[0]).toBe(4);
    expect(data.calcTotals.leap.buckets[1]).toBe(0);
    expect(data.calcTotals.leap.buckets[3]).toBe(2);
    expect(data.calcTotals.leap.answered).toBe(6);
    expect(data.calcTotals.leap.correct).toBe(0);
    // A step that is not an object at all starts empty rather than throwing.
    expect(data.calcTotals.sum).toEqual(emptyCalcTotals().sum);
    expect(Number.isFinite(calcStepMedian(data.calcTotals, 'leap') as number)).toBe(true);

    expect(data.verifyTotals).toEqual({
      agreedRight: 0,
      agreedWrong: 0,
      memoryRight: 2,
      calculationRight: 0,
      bothWrong: 0,
    });
  });

  it('rebuilds the calculation aggregate from the raw log when a document has none', async () => {
    const doc = defaultAppData(1000) as unknown as Record<string, unknown>;
    doc.calcAttempts = [calcAttempt('sum', true, 1600), calcAttempt('sum', false, 2400)];
    delete doc.calcTotals;
    delete doc.verifyTotals;
    await putRaw(doc);
    await closeDb();

    const data = await loadAppData();
    expect(data.calcTotals.sum).toMatchObject({ answered: 2, correct: 1 });
    expect(data.verifyTotals).toEqual(emptyVerifyTotals());
  });

  it('repairs the day-step aggregate rather than letting NaN reach a screen', async () => {
    const doc = defaultAppData(1000) as unknown as Record<string, unknown>;
    doc.dayStepTotals = {
      bySize: {
        1: { answered: Number.NaN, correct: -3, buckets: ['nonsense', 2] },
        2: { answered: 4, correct: 99, buckets: [] },
      },
      byDirection: { forward: { answered: 2, correct: 2, buckets: [2] } },
    };
    await putRaw(doc);
    await closeDb();

    const data = await loadAppData();
    // The one real count survives; the string does not, and nothing is invented.
    expect(data.dayStepTotals.bySize[1].buckets[1]).toBe(2);
    expect(data.dayStepTotals.bySize[1].answered).toBe(2);
    expect(data.dayStepTotals.bySize[1].correct).toBe(0);
    // `correct` never exceeds `answered`, so accuracy cannot come out over 100%.
    expect(data.dayStepTotals.bySize[2].correct).toBe(4);
    // Every cell is present and drawable, including the ones that were missing.
    for (const size of DAY_STEP_SIZES) {
      expect(data.dayStepTotals.bySize[size].buckets).toHaveLength(WEEKDAY_BUCKET_COUNT);
    }
    expect(data.dayStepTotals.byDirection.backward).toEqual(emptyDayStepBucketTotals());
  });

  it('rebuilds the day-step aggregate from the raw log when a document has none', async () => {
    const doc = defaultAppData(1000) as unknown as Record<string, unknown>;
    doc.dayStepAttempts = [dayStepAttempt(4, 'forward', true, 1100), dayStepAttempt(4, 'forward', false, 2600)];
    delete doc.dayStepTotals;
    await putRaw(doc);
    await closeDb();

    const data = await loadAppData();
    expect(data.dayStepTotals.bySize[4]).toMatchObject({ answered: 2, correct: 1 });
    expect(overallDayStepTotals(data.dayStepTotals).answered).toBe(2);
  });

  it('drops day-step log entries that are not usable', async () => {
    const doc = defaultAppData(1000) as unknown as Record<string, unknown>;
    doc.dayStepAttempts = [
      null,
      dayStepAttempt(2, 'forward', true, 900),
      { ...dayStepAttempt(2, 'forward', true, 900), month: 13 },
      7,
    ];
    delete doc.dayStepTotals;
    await putRaw(doc);
    await closeDb();

    const data = await loadAppData();
    expect(data.dayStepAttempts).toHaveLength(1);
    expect(overallDayStepTotals(data.dayStepTotals).answered).toBe(1);
  });

  it('drops calculation and verify log entries that are not usable', async () => {
    const doc = defaultAppData(1000) as unknown as Record<string, unknown>;
    doc.calcAttempts = [null, calcAttempt('leap', true, 2000), { ...calcAttempt('leap', true, 2000), yy: 300 }, 5];
    doc.verifyAttempts = [null, { outcome: 'made-up' }];
    delete doc.calcTotals;
    await putRaw(doc);
    await closeDb();

    const data = await loadAppData();
    expect(data.calcAttempts).toHaveLength(1);
    expect(data.calcAttempts[0].yy).toBe(73);
    expect(calcAnsweredTotal(data.calcTotals)).toBe(1);
    expect(data.verifyAttempts).toEqual([]);
  });

  it('drops an attempt history entry that is not an attempt', async () => {
    const doc = defaultAppData(1000) as unknown as Record<string, unknown>;
    (doc.items as Record<string, Record<string, unknown>>)[itemKey(12)].attemptHistory = [
      null,
      { timestamp: 5, correct: true, latencyMs: 700, answered: 1, hintUsed: false, source: 'review' },
    ];
    await putRaw(doc);
    await closeDb();

    const data = await loadAppData();
    expect(data.items[itemKey(12)].attemptHistory).toHaveLength(1);
    expect(data.items[itemKey(12)].attemptHistory[0].latencyMs).toBe(700);
  });
});

describe('writes', () => {
  it('stamps updatedAt on every save', async () => {
    const data = await loadAppData();
    const before = data.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 2));
    await saveAppData({ ...data, updatedAt: 0 });
    const after = await loadAppData();
    expect(after.updatedAt).toBeGreaterThanOrEqual(before);
    expect(after.updatedAt).not.toBe(0);
  });

  it('serialises concurrent patches so no write is lost', async () => {
    await patchAppData((draft) => ({ ...draft, settings: { ...draft.settings, newItemsPerDay: 0 } }));

    await Promise.all(
      Array.from({ length: 50 }, () =>
        patchAppData((draft) => ({
          ...draft,
          settings: { ...draft.settings, newItemsPerDay: draft.settings.newItemsPerDay + 1 },
        })),
      ),
    );

    const data = await loadAppData();
    expect(data.settings.newItemsPerDay).toBe(50);
  });

  it('resets back to defaults', async () => {
    await patchAppData((draft) => ({
      ...draft,
      settings: { ...draft.settings, onboardingComplete: true },
      drills: [
        {
          id: 'x',
          mode: 'sprint',
          decade: null,
          timestamp: 1,
          score: 10,
          correct: 10,
          total: 12,
          medianLatencyMs: 900,
        },
      ],
    }));

    const fresh = await resetAppData();
    expect(fresh.settings.onboardingComplete).toBe(false);
    expect(fresh.drills).toEqual([]);
    expect(Object.keys(fresh.items)).toHaveLength(100);

    const reloaded = await loadAppData();
    expect(reloaded.drills).toEqual([]);
  });
});
