import { describe, expect, it } from 'vitest';
import type { AppData, Attempt, CalcAttempt, CalcStepId, WeekdayAttempt, WeekdayMode } from '@/domain/types';
import { WEEKDAY_BUCKET_COUNT, buildWeekdayTotals, estimateMedianMs } from '@/domain/weekdayLifetime';
import { CALC_STEP_IDS } from '@/domain/calc';
import {
  buildCalcTotals,
  buildVerifyAttempt,
  buildVerifyTotals,
  calcAnsweredTotal,
  calcStepMedian,
  emptyVerifyTotals,
} from '@/domain/calcStats';
import { SCHEMA_VERSION, defaultAppData, itemKey } from './defaults';
import { ImportError, parseImportFile, serialiseExport, toExportFile } from './exportImport';

function sample(): AppData {
  const data = defaultAppData(1_700_000_000_000);
  const attempt: Attempt = {
    timestamp: 1_700_000_001_000,
    correct: true,
    latencyMs: 840,
    answered: 0,
    hintUsed: false,
    source: 'review',
  };
  data.items[itemKey(73)] = {
    ...data.items[itemKey(73)],
    interval: 6,
    easeFactor: 2.6,
    repetitions: 3,
    dueAt: 1_700_500_000_000,
    introduced: true,
    introducedAt: 1_700_000_000_000,
    attemptHistory: [attempt],
  };
  data.drills = [
    {
      id: 'drill-1',
      mode: 'sprint',
      decade: null,
      timestamp: 1_700_000_002_000,
      score: 34,
      correct: 34,
      total: 37,
      medianLatencyMs: 910,
    },
  ];
  data.days = { '2023-11-14': { date: '2023-11-14', reviewsCompleted: 12, newItemsIntroduced: 10 } };
  data.weekdayTotals = buildWeekdayTotals([
    weekdayAttempt('assisted', true, 820),
    weekdayAttempt('assisted', false, 3100),
    weekdayAttempt('unassisted', true, 7400),
  ]);
  data.calcAttempts = [calcAttempt('leap', true, 2600), calcAttempt('mod', false, 8200)];
  data.calcTotals = buildCalcTotals(data.calcAttempts);
  data.verifyAttempts = [
    buildVerifyAttempt({
      timestamp: 1_700_000_004_000,
      yy: 73,
      recalled: 0,
      derived: 0,
      recallLatencyMs: 780,
      deriveLatencyMs: 5400,
      reduced: true,
    }),
    buildVerifyAttempt({
      timestamp: 1_700_000_005_000,
      yy: 40,
      recalled: 2,
      derived: 1,
      recallLatencyMs: 1500,
      deriveLatencyMs: 6100,
      reduced: false,
    }),
  ];
  data.verifyTotals = buildVerifyTotals(data.verifyAttempts);
  return data;
}

function calcAttempt(step: CalcStepId, correct: boolean, latencyMs: number): CalcAttempt {
  return { timestamp: 1_700_000_006_000, yy: 73, step, answered: correct ? 0 : 4, correct, latencyMs, reduced: true };
}

function weekdayAttempt(mode: WeekdayMode, correct: boolean, latencyMs: number): WeekdayAttempt {
  return { timestamp: 1_700_000_003_000, fullYear: 1987, month: 3, day: 14, mode, correct, latencyMs, answered: 6 };
}

function wrap(data: unknown, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ app: 'doomsday-trainer', schemaVersion: SCHEMA_VERSION, exportedAt: 1, data, ...overrides });
}

describe('export', () => {
  it('wraps the document with an app marker', () => {
    const file = toExportFile(sample());
    expect(file.app).toBe('doomsday-trainer');
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Object.keys(file.data.items)).toHaveLength(100);
  });

  it('pretty prints', () => {
    const json = serialiseExport(sample());
    expect(json).toContain('\n  "app"');
  });
});

describe('parseImportFile', () => {
  it('round-trips a real export', () => {
    const original = sample();
    const back = parseImportFile(serialiseExport(original));
    expect(Object.keys(back.items)).toHaveLength(100);
    expect(back.items[itemKey(73)].interval).toBe(6);
    expect(back.items[itemKey(73)].attemptHistory).toHaveLength(1);
    expect(back.drills).toHaveLength(1);
    expect(back.days['2023-11-14'].reviewsCompleted).toBe(12);
    expect(back.settings).toEqual(original.settings);
  });

  it('round-trips the lifetime weekday totals', () => {
    const original = sample();
    const back = parseImportFile(serialiseExport(original));

    expect(back.weekdayTotals).toEqual(original.weekdayTotals);
    expect(back.weekdayTotals.assisted).toMatchObject({ answered: 2, correct: 1 });
    expect(back.weekdayTotals.unassisted).toMatchObject({ answered: 1, correct: 1 });
    expect(estimateMedianMs(back.weekdayTotals.assisted)).toBe(
      estimateMedianMs(original.weekdayTotals.assisted),
    );
  });

  it('rebuilds the totals from an older export that has none', () => {
    const data = sample() as unknown as Record<string, unknown>;
    data.weekdayAttempts = [weekdayAttempt('unassisted', true, 4200), weekdayAttempt('unassisted', false, 5100)];
    delete data.weekdayTotals;
    const back = parseImportFile(wrap(data, { schemaVersion: 2 }));
    expect(back.weekdayTotals.unassisted).toMatchObject({ answered: 2, correct: 1 });
  });

  it('repairs a hand-edited aggregate instead of putting NaN on a screen', () => {
    const data = sample() as unknown as Record<string, unknown>;
    data.weekdayTotals = { assisted: { answered: 'many', correct: 3, latencyBuckets: [1, 'x', 2] } };
    const back = parseImportFile(wrap(data));
    expect(back.weekdayTotals.assisted.latencyBuckets).toHaveLength(WEEKDAY_BUCKET_COUNT);
    for (const count of back.weekdayTotals.assisted.latencyBuckets) expect(Number.isFinite(count)).toBe(true);
    expect(back.weekdayTotals.assisted.answered).toBe(3);
    expect(back.weekdayTotals.unassisted.answered).toBe(0);
  });

  it('round-trips the calculation and verify history', () => {
    const original = sample();
    const back = parseImportFile(serialiseExport(original));

    expect(back.calcAttempts).toHaveLength(2);
    expect(back.calcTotals).toEqual(original.calcTotals);
    expect(calcAnsweredTotal(back.calcTotals)).toBe(2);
    expect(calcStepMedian(back.calcTotals, 'mod')).toBe(calcStepMedian(original.calcTotals, 'mod'));

    expect(back.verifyAttempts).toHaveLength(2);
    expect(back.verifyTotals).toEqual({
      agreedRight: 1,
      agreedWrong: 0,
      memoryRight: 0,
      calculationRight: 1,
      bothWrong: 0,
    });
  });

  it('gives a v3 export the calculation trainer without touching what it had', () => {
    const data = sample() as unknown as Record<string, unknown>;
    delete data.calcAttempts;
    delete data.calcTotals;
    delete data.verifyAttempts;
    delete data.verifyTotals;
    const back = parseImportFile(wrap(data, { schemaVersion: 3 }));

    expect(back.schemaVersion).toBe(SCHEMA_VERSION);
    expect(back.calcAttempts).toEqual([]);
    expect(calcAnsweredTotal(back.calcTotals)).toBe(0);
    expect(back.verifyTotals).toEqual(emptyVerifyTotals());
    // And the rest of the file survived the upgrade.
    expect(back.items[itemKey(73)].interval).toBe(6);
    expect(back.drills).toHaveLength(1);
  });

  it('rebuilds the per-step totals from an older export that only has the log', () => {
    const data = sample() as unknown as Record<string, unknown>;
    delete data.calcTotals;
    const back = parseImportFile(wrap(data, { schemaVersion: 3 }));
    expect(calcAnsweredTotal(back.calcTotals)).toBe(2);
    expect(back.calcTotals.leap.correct).toBe(1);
  });

  it('repairs a hand-edited per-step aggregate instead of putting NaN on a screen', () => {
    const data = sample() as unknown as Record<string, unknown>;
    data.calcTotals = { leap: { answered: 'many', correct: 3, buckets: [1, 'x', 2] } };
    data.verifyTotals = { agreedRight: -1, memoryRight: 'two' };
    const back = parseImportFile(wrap(data));

    for (const step of CALC_STEP_IDS) {
      expect(back.calcTotals[step].buckets).toHaveLength(WEEKDAY_BUCKET_COUNT);
      for (const count of back.calcTotals[step].buckets) expect(Number.isFinite(count)).toBe(true);
    }
    expect(back.calcTotals.leap.answered).toBe(3);
    expect(back.calcTotals.mod.answered).toBe(0);
    expect(back.verifyTotals).toEqual(emptyVerifyTotals());
  });

  it('fills missing items and settings from a hand-trimmed file', () => {
    const data = sample();
    const trimmed = { ...data, items: { [itemKey(73)]: data.items[itemKey(73)] }, settings: { newItemsPerDay: 4 } };
    const back = parseImportFile(wrap(trimmed));
    expect(Object.keys(back.items)).toHaveLength(100);
    expect(back.settings.newItemsPerDay).toBe(4);
    expect(back.settings.hintType).toBe('arithmetic');
  });

  const rejections: Array<[string, string, RegExp]> = [
    ['not JSON', 'this is not json {', /not valid JSON/i],
    ['a JSON array', '[]', /Doomsday Trainer/i],
    ['a JSON string', '"hello"', /Doomsday Trainer/i],
    ['the wrong app', JSON.stringify({ app: 'anki', schemaVersion: 1, data: {} }), /not exported by/i],
    ['a missing schema version', JSON.stringify({ app: 'doomsday-trainer', data: {} }), /schema version/i],
    [
      'a non-integer schema version',
      JSON.stringify({ app: 'doomsday-trainer', schemaVersion: '1', data: {} }),
      /schema version/i,
    ],
    [
      'a future schema version',
      JSON.stringify({ app: 'doomsday-trainer', schemaVersion: SCHEMA_VERSION + 1, data: {} }),
      /newer version/i,
    ],
    ['a missing data section', JSON.stringify({ app: 'doomsday-trainer', schemaVersion: 1 }), /no data section/i],
    ['items as an array', wrap({ items: [] }), /items/i],
    ['no items at all', wrap({ drills: [] }), /items/i],
    ['an item that is not an object', wrap({ items: { '3': 7 } }), /not an object/i],
    ['an out-of-range year', wrap({ items: { '300': { ...defaultAppData(0).items['3'], yy: 300 } } }), /00-99/],
    [
      'a non-finite ease factor',
      wrap({ items: { '3': { ...defaultAppData(0).items['3'], easeFactor: null } } }),
      /ease factor/i,
    ],
    [
      'a negative interval',
      wrap({ items: { '3': { ...defaultAppData(0).items['3'], interval: -1 } } }),
      /invalid interval/i,
    ],
    ['a bad due date', wrap({ items: { '3': { ...defaultAppData(0).items['3'], dueAt: 'soon' } } }), /due date/i],
    [
      'an attempt history that is not a list',
      wrap({ items: { '3': { ...defaultAppData(0).items['3'], attemptHistory: {} } } }),
      /not a list/i,
    ],
    [
      'an attempt with no timestamp',
      wrap({ items: { '3': { ...defaultAppData(0).items['3'], attemptHistory: [{ correct: true, latencyMs: 1 }] } } }),
      /timestamp/i,
    ],
    [
      'an attempt with a non-boolean correct',
      wrap({
        items: { '3': { ...defaultAppData(0).items['3'], attemptHistory: [{ timestamp: 1, latencyMs: 1 }] } },
      }),
      /correct/i,
    ],
    ['drills as an object', wrap({ items: {}, drills: {} }), /drill log/i],
    ['days as an array', wrap({ items: {}, days: [] }), /session log/i],
    ['settings as a string', wrap({ items: {}, settings: 'default' }), /settings/i],
    ['a weekday log that is not a list', wrap({ items: {}, weekdayAttempts: {} }), /weekday log/i],
    ['lifetime totals that are a list', wrap({ items: {}, weekdayTotals: [] }), /lifetime weekday totals/i],
    ['lifetime totals that are a string', wrap({ items: {}, weekdayTotals: 'none' }), /lifetime weekday totals/i],
    ['a calculation log that is not a list', wrap({ items: {}, calcAttempts: {} }), /calculation log/i],
    ['per-step totals that are a list', wrap({ items: {}, calcTotals: [] }), /lifetime calculation totals/i],
    ['per-step totals that are a string', wrap({ items: {}, calcTotals: 'none' }), /lifetime calculation totals/i],
    ['a verify log that is not a list', wrap({ items: {}, verifyAttempts: {} }), /verify log/i],
    ['verify totals that are a list', wrap({ items: {}, verifyTotals: [] }), /lifetime verify totals/i],
  ];

  it.each(rejections)('rejects %s', (_label, json, message) => {
    expect(() => parseImportFile(json)).toThrow(ImportError);
    expect(() => parseImportFile(json)).toThrow(message);
  });
});
