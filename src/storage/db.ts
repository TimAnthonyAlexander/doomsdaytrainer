import { openDB, type IDBPDatabase } from 'idb';
import type { AppData, ItemState, Settings } from '@/domain/types';
import { createItem } from '@/domain/scheduler';
import { allYears } from '@/domain/yearCodes';
import { ALL_CENTURIES, ALL_MONTHS } from '@/domain/weekday';
import { buildFluency, emptyFluency } from '@/domain/fluency';
import { buildWeekdayTotals, repairWeekdayTotals } from '@/domain/weekdayLifetime';
import {
  buildDayStepTotals,
  isDayStepAttemptShaped,
  repairDayStepTotals,
} from '@/domain/dayStepLifetime';
import {
  buildCalcTotals,
  buildVerifyTotals,
  isCalcAttemptShaped,
  isVerifyAttemptShaped,
  repairCalcTotals,
  repairVerifyTotals,
} from '@/domain/calcStats';
import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  defaultCenturyItems,
  defaultAppData,
  defaultMonthItems,
} from './defaults';

/**
 * The whole AppData document lives under a single key in a single store.
 * A fresh document is about 34KB, and every log in it is capped, so the size is
 * bounded: filling all of them — 200 attempts on each of the 116 items, which is
 * most of it, plus the full weekday, day-step, calc and verify logs — comes to
 * about 3.6MB. Splitting it into per-record stores would buy nothing and cost
 * transactions, indexes and merge logic.
 * This is deliberate — please do not "fix" it into a normalised schema.
 */
const DB_NAME = 'doomsday-trainer';
const DB_VERSION = 1;
const STORE = 'state';
const KEY = 'app';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(instance) {
      if (!instance.objectStoreNames.contains(STORE)) {
        instance.createObjectStore(STORE);
      }
    },
  });
  return dbPromise;
}

/* ------------------------------------------------------------------ */
/* Serialisation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Every public entry point runs through this chain, so two reviews submitted
 * a millisecond apart cannot read the same document and clobber each other.
 */
let chain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/* ------------------------------------------------------------------ */
/* Migrations                                                          */
/* ------------------------------------------------------------------ */

type Migration = (data: AppData) => AppData;

/**
 * Keyed by the version being migrated *to*. Every migration is additive: it
 * carries the whole existing document forward and only fills in what the new
 * version needs. Nothing here may drop items, drills, days or settings.
 */
const MIGRATIONS: Record<number, Migration> = {
  /**
   * v1 → v2: the weekday trainer. Twelve month doomsdays and four century
   * anchors become SM-2 items, and the trainer gets its own attempt and run
   * logs. A v1 document has none of them, so they start empty.
   */
  2: (data) => ({
    ...data,
    schemaVersion: 2,
    monthItems: data.monthItems ?? defaultMonthItems(),
    centuryItems: data.centuryItems ?? defaultCenturyItems(),
    weekdayAttempts: Array.isArray(data.weekdayAttempts) ? data.weekdayAttempts : [],
    weekdayRuns: Array.isArray(data.weekdayRuns) ? data.weekdayRuns : [],
  }),

  /**
   * v2 → v3: lifetime totals for the weekday trainer.
   *
   * A v2 document already carries real `weekdayAttempts`, so the totals are
   * built from them rather than started at zero. Someone who has been
   * practising for weeks keeps every number they had; only history already
   * trimmed out of that log before this build existed is unrecoverable, and
   * nothing after the upgrade can be lost again.
   */
  3: (data) => ({
    ...data,
    schemaVersion: 3,
    weekdayTotals: buildWeekdayTotals(Array.isArray(data.weekdayAttempts) ? data.weekdayAttempts : []),
  }),

  /**
   * v3 → v4: the calculation trainer. Steps of the derivation get their own
   * raw log and their own per-step lifetime aggregate; verify mode gets a log
   * and five outcome counters.
   *
   * Nothing else moves. The 28 base years are year codes 00-27 and already
   * have entries in `items`, so no new item map is created and no scheduling
   * state is touched. A v3 document has no calculation history, so the logs
   * start empty; a document that somehow carries raw attempts without an
   * aggregate has the aggregate built from them rather than started at zero.
   */
  4: (data) => {
    const calcAttempts = Array.isArray(data.calcAttempts) ? data.calcAttempts.filter(isCalcAttemptShaped) : [];
    const verifyAttempts = Array.isArray(data.verifyAttempts)
      ? data.verifyAttempts.filter(isVerifyAttemptShaped)
      : [];
    return {
      ...data,
      schemaVersion: 4,
      calcAttempts,
      calcTotals: buildCalcTotals(calcAttempts),
      verifyAttempts,
      verifyTotals: buildVerifyTotals(verifyAttempts),
    };
  },

  /**
   * v4 → v5: `ItemState.fluency` on all three item maps.
   *
   * Built from each item's own `attemptHistory` rather than started at zero,
   * which is the same rule every aggregate migration here follows. Someone who
   * has been reviewing for weeks keeps the fluency their answers already show;
   * only history trimmed past `MAX_ATTEMPT_HISTORY` before this build existed
   * is unrecoverable, and that only ever shortens a run that the next two
   * reviews rebuild.
   *
   * Settings are read through `mergeSettings` first, so a document written
   * before `fastThresholdMs` existed still replays against a real number.
   */
  5: (data) => {
    const settings = mergeSettings(data.settings);
    const withFluency = (map: Record<string, ItemState> | undefined) => {
      const out: Record<string, ItemState> = {};
      for (const [key, item] of Object.entries(map ?? {})) {
        const attempts = Array.isArray(item?.attemptHistory) ? item.attemptHistory : [];
        out[key] = { ...item, fluency: buildFluency(attempts, settings) };
      }
      return out;
    };
    return {
      ...data,
      schemaVersion: 5,
      settings,
      items: withFluency(data.items),
      monthItems: withFluency(data.monthItems),
      centuryItems: withFluency(data.centuryItems),
    };
  },

  /**
   * v5 → v6: the day-step trainer. The last step of the method — from a
   * month's doomsday to another day in that month — gets its own raw log and
   * its own lifetime aggregate, cut by step size and by direction.
   *
   * Nothing else moves, and no new item map appears: a (doomsday, day) pair is
   * not a fixed item set, so it is never scheduled, exactly like the dates on
   * the weekday trainer. A v5 document has no day-step history, so the log
   * starts empty; a document that somehow carries raw attempts without an
   * aggregate has the aggregate built from them rather than started at zero.
   */
  6: (data) => {
    const dayStepAttempts = Array.isArray(data.dayStepAttempts)
      ? data.dayStepAttempts.filter(isDayStepAttemptShaped)
      : [];
    return {
      ...data,
      schemaVersion: 6,
      dayStepAttempts,
      dayStepTotals: buildDayStepTotals(dayStepAttempts),
    };
  },
};

export function migrateAppData(data: AppData): AppData {
  const from = data.schemaVersion;
  if (!Number.isInteger(from) || from < 1) {
    throw new Error(`Stored data has an invalid schema version (${String(from)}).`);
  }
  if (from > SCHEMA_VERSION) {
    throw new Error(
      `This data was written by a newer version of Doomsday Trainer (schema v${from}, this build reads v${SCHEMA_VERSION}). Update the app before opening it. Nothing has been changed.`,
    );
  }
  let out = data;
  for (let v = from + 1; v <= SCHEMA_VERSION; v += 1) {
    const migration = MIGRATIONS[v];
    if (!migration) throw new Error(`Missing migration to schema v${v}.`);
    out = migration(out);
  }
  return out.schemaVersion === SCHEMA_VERSION ? out : { ...out, schemaVersion: SCHEMA_VERSION };
}

/* ------------------------------------------------------------------ */
/* Defensive normalisation                                             */
/* ------------------------------------------------------------------ */

function mergeSettings(stored: unknown): Settings {
  const partial = (stored ?? {}) as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    customScope: { ...DEFAULT_SETTINGS.customScope, ...(partial.customScope ?? {}) },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every element that is not an object at all. A crafted file can hold nulls. */
function records<T>(stored: unknown): T[] {
  return Array.isArray(stored) ? (stored.filter(isRecord) as T[]) : [];
}

/**
 * Enough of an item to schedule. A stored entry that fails this is corruption,
 * not partial data: reading `undefined` here would put NaN into an ease factor
 * and the item would never be scheduled correctly again.
 */
function isItemShaped(value: unknown): value is ItemState {
  if (!isRecord(value)) return false;
  for (const field of ['easeFactor', 'interval', 'dueAt', 'repetitions', 'lapses']) {
    if (!Number.isFinite(value[field])) return false;
  }
  return true;
}

/**
 * Enough of a fluency block to fold the next answer into. The counters drive a
 * grid cell rather than a schedule, so a bad one is cosmetic — but `NaN` in a
 * counter would never compare its way back to fluent again.
 */
function isFluencyShaped(value: unknown): value is ItemState['fluency'] {
  if (!isRecord(value)) return false;
  return (
    Number.isFinite(value.consecutiveFast) &&
    Number.isFinite(value.consecutiveSlow) &&
    typeof value.fluent === 'boolean'
  );
}

/**
 * One map of items, filled out to exactly `keys`. Anything stored under a key
 * that is not in the set is dropped: the three item sets are fixed content, so
 * a stray entry is corruption rather than data worth keeping. So is an entry
 * that is not a usable item, which is replaced with a fresh one rather than
 * carried into the scheduler.
 */
function fillItems(stored: unknown, keys: readonly number[]): Record<string, ItemState> {
  const source = (stored ?? {}) as Record<string, unknown>;
  const out: Record<string, ItemState> = {};
  for (const key of keys) {
    const name = String(key);
    // Accept a zero-padded key too, in case a file was written by hand.
    const found = source[name] ?? source[name.padStart(2, '0')];
    out[name] = isItemShaped(found)
      ? {
          ...found,
          yy: key,
          // Filled rather than rebuilt: a document that reaches here has already
          // been through the v5 migration, so a missing block means a partial
          // import rather than an old build. Starting it empty costs two
          // reviews; replaying a hand-written log could invent a run.
          fluency: isFluencyShaped(found.fluency) ? found.fluency : emptyFluency(),
          attemptHistory: records(found.attemptHistory),
        }
      : createItem(key);
  }
  return out;
}

/** Session days, keyed by date. A malformed day is dropped, not repaired. */
function fillDays(stored: unknown): AppData['days'] {
  if (!isRecord(stored)) return {};
  const out: AppData['days'] = {};
  for (const [date, value] of Object.entries(stored)) {
    if (!isRecord(value)) continue;
    if (!Number.isFinite(value.reviewsCompleted) || !Number.isFinite(value.newItemsIntroduced)) continue;
    out[date] = { ...(value as unknown as AppData['days'][string]), date };
  }
  return out;
}

/**
 * Fills anything a partial import or an older build could have left out:
 * missing items get a fresh one, missing settings get their default.
 */
export function normaliseAppData(data: AppData, now: number): AppData {
  const weekdayAttempts = records<AppData['weekdayAttempts'][number]>(data.weekdayAttempts);
  // Stricter than `records` on purpose: a step attempt carries a step id and a
  // year that a screen groups by, and an unknown step id would land in a
  // breakdown with no column to go in.
  const calcAttempts = Array.isArray(data.calcAttempts) ? data.calcAttempts.filter(isCalcAttemptShaped) : [];
  const verifyAttempts = Array.isArray(data.verifyAttempts)
    ? data.verifyAttempts.filter(isVerifyAttemptShaped)
    : [];
  // Stricter than `records` for the same reason as the calculation log: a step
  // carries a size and a direction that a breakdown groups by, and an unknown
  // one would land in a column that does not exist.
  const dayStepAttempts = Array.isArray(data.dayStepAttempts)
    ? data.dayStepAttempts.filter(isDayStepAttemptShaped)
    : [];
  return {
    ...data,
    schemaVersion: SCHEMA_VERSION,
    settings: mergeSettings(data.settings),
    items: fillItems(data.items, allYears()),
    monthItems: fillItems(data.monthItems, ALL_MONTHS),
    centuryItems: fillItems(data.centuryItems, ALL_CENTURIES),
    weekdayAttempts,
    // A missing aggregate is rebuilt from whatever raw attempts came with the
    // document; a partial or corrupt one is repaired field by field. Neither
    // path may put a NaN or a negative count somewhere a screen will read it.
    weekdayTotals: repairWeekdayTotals(data.weekdayTotals, weekdayAttempts),
    weekdayRuns: records(data.weekdayRuns),
    dayStepAttempts,
    // Same contract again: rebuilt from the raw log when the aggregate is
    // missing, repaired cell by cell when it is there and wrong.
    dayStepTotals: repairDayStepTotals(data.dayStepTotals, dayStepAttempts),
    calcAttempts,
    // Same contract as `weekdayTotals`: a missing aggregate is rebuilt from
    // the raw log, a partial or corrupt one is repaired step by step, and
    // neither path may put a NaN or a negative count where a screen reads it.
    calcTotals: repairCalcTotals(data.calcTotals, calcAttempts),
    verifyAttempts,
    verifyTotals: repairVerifyTotals(data.verifyTotals, verifyAttempts),
    drills: records(data.drills),
    days: fillDays(data.days),
    createdAt: Number.isFinite(data.createdAt) ? data.createdAt : now,
    updatedAt: Number.isFinite(data.updatedAt) ? data.updatedAt : now,
  };
}

/* ------------------------------------------------------------------ */
/* Reads and writes                                                    */
/* ------------------------------------------------------------------ */

async function readRaw(): Promise<AppData | undefined> {
  const instance = await db();
  return (await instance.get(STORE, KEY)) as AppData | undefined;
}

async function writeRaw(data: AppData): Promise<AppData> {
  const stamped: AppData = { ...data, schemaVersion: SCHEMA_VERSION, updatedAt: Date.now() };
  const instance = await db();
  await instance.put(STORE, stamped, KEY);
  return stamped;
}

async function loadUnlocked(): Promise<AppData> {
  const stored = await readRaw();
  if (!stored) {
    const fresh = defaultAppData(Date.now());
    const instance = await db();
    await instance.put(STORE, fresh, KEY);
    return fresh;
  }
  return normaliseAppData(migrateAppData(stored), Date.now());
}

export async function loadAppData(): Promise<AppData> {
  return withLock(loadUnlocked);
}

export async function saveAppData(data: AppData): Promise<void> {
  await withLock(() => writeRaw(data));
}

/**
 * Read-modify-write under the lock. `fn` must return a new document rather
 * than mutating the draft; the name is a nod to the ergonomics, not to Immer.
 */
export async function patchAppData(fn: (draft: AppData) => AppData): Promise<AppData> {
  return withLock(async () => {
    const current = await loadUnlocked();
    return writeRaw(fn(current));
  });
}

export async function resetAppData(): Promise<AppData> {
  return withLock(async () => writeRaw(defaultAppData(Date.now())));
}

/** Drops the cached connection. Tests use this to simulate a reload. */
export async function closeDb(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (pending) {
    const instance = await pending;
    instance.close();
  }
}
