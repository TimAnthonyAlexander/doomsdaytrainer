import type { AppData, CenturyKey, ItemState, MonthKey, Settings, YearKey } from '@/domain/types';
import { createItem } from '@/domain/scheduler';
import { allYears } from '@/domain/yearCodes';
import { ALL_CENTURIES, ALL_MONTHS } from '@/domain/weekday';
import { emptyWeekdayTotals } from '@/domain/weekdayLifetime';
import { emptyDayStepTotals } from '@/domain/dayStepLifetime';
import { emptyMethodPartTotals } from '@/domain/methodPartLifetime';
import { emptyCalcTotals, emptyVerifyTotals } from '@/domain/calcStats';

/**
 * Version of the persisted document shape. Bump only when a stored document
 * from an older build needs rewriting, and add the matching migration in
 * src/storage/db.ts.
 *
 * v2 added the weekday trainer: the twelve month doomsdays and four century
 * anchors as SM-2 items, plus the trainer's own attempt and run logs.
 *
 * v3 added `weekdayTotals`: lifetime counts and a latency histogram per mode,
 * which outlive the trimming of `weekdayAttempts`.
 *
 * v4 added the calculation trainer: `calcAttempts` and the per-step
 * `calcTotals`, plus `verifyAttempts` and `verifyTotals` for the recall
 * against calculation comparison. No new item map — the 28 base years are
 * year codes 00-27 and already live in `items`.
 *
 * v5 added `ItemState.fluency`: whether the answer arrives or gets worked out,
 * held beside the SM-2 fields and read by the mastery grid in place of the
 * interval. Rebuilt from each item's stored attempts on upgrade, so nobody
 * loses the fluency they had already earned.
 *
 * v6 added the day-step trainer: `dayStepAttempts` and `dayStepTotals`, the
 * last step of the method timed on its own. No new item map — a (doomsday, day)
 * pair is not a fixed item set, so nothing there is scheduled.
 *
 * v7 added the method's two halves as modes of the weekday screen:
 * `partAttempts` and `partTotals`, the year half cut by century and the date
 * half cut by month. No new item map, for the same reason as v6 — a year is
 * not a fixed item set the way the 100 codes are, and neither is a (month,
 * day) pair.
 *
 * v8 removed `settings.indexConvention`, the only migration here that takes
 * something away. It chose whether 0 meant Sunday or Monday, and all it did was
 * rename the seven buttons: every century anchor, every year code, every
 * intermediate sum and every worked line in the app is Sunday-indexed and none
 * of them moved. So a user who picked Monday read "0 = Monday" on the pad and
 * "the 1900s anchor is 3" everywhere else, which are two different claims about
 * the same number. `mergeSettings` spreads whatever the document holds, so the
 * dead field would otherwise have ridden along in every export for good.
 */
export const SCHEMA_VERSION = 8;

export const DEFAULT_SETTINGS: Settings = {
  scopeId: 'full',
  customScope: { from: 0, to: 99 },
  newItemsPerDay: 20,
  fastThresholdMs: 2000,
  mediumThresholdMs: 5000,
  // Was 'structural', which told the user to find the block and count up from
  // its first year. That is the counting strategy, offered as the strategy, and
  // it was the default. The arithmetic hint is the only one of the three that
  // can be entered at any year, so it is the only one that does not rehearse a
  // walk. See src/features/review/hints.ts.
  hintType: 'arithmetic',
  answerWindowMs: null,
  autoAdvanceMs: 250,
  keyboardInput: true,
  // On, because nothing in Learn is timed, so nothing there can be distorted.
  spokenPrompts: true,
  // Off, because a review latency is measured from paint to tap and a spoken
  // cue runs about a second. The user can turn it on from the review screen and
  // the app then says, on Stats, how many of their recent answers had it.
  spokenReviewPrompts: false,
  reminderEnabled: false,
  reminderTime: '19:00',
  eveningReminderEnabled: false,
  structureLessonSeen: false,
  onboardingComplete: false,
};

/**
 * Key used for a year inside `AppData.items`. Plain `String(yy)`, so that
 * `items[73]` and `items['73']` are the same entry. Readers that only have a
 * zero-padded label should call this rather than padding by hand.
 */
export function itemKey(yy: YearKey): string {
  return String(yy);
}

/** Key inside `AppData.monthItems`. Month is 1-based, so "1".."12". */
export function monthItemKey(month: MonthKey): string {
  return String(month);
}

/** Key inside `AppData.centuryItems`: "18".."21". */
export function centuryItemKey(century: CenturyKey): string {
  return String(century);
}

/** A fresh map of items, one per key. Used for defaults and for migration. */
export function freshItems(keys: readonly number[]): Record<string, ItemState> {
  const out: Record<string, ItemState> = {};
  for (const key of keys) out[String(key)] = createItem(key);
  return out;
}

export function defaultMonthItems(): Record<string, ItemState> {
  return freshItems(ALL_MONTHS);
}

export function defaultCenturyItems(): Record<string, ItemState> {
  return freshItems(ALL_CENTURIES);
}

export function defaultAppData(now: number): AppData {
  const items: AppData['items'] = {};
  for (const yy of allYears()) {
    items[itemKey(yy)] = createItem(yy);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS, customScope: { ...DEFAULT_SETTINGS.customScope } },
    items,
    monthItems: defaultMonthItems(),
    centuryItems: defaultCenturyItems(),
    weekdayAttempts: [],
    weekdayTotals: emptyWeekdayTotals(),
    weekdayRuns: [],
    dayStepAttempts: [],
    dayStepTotals: emptyDayStepTotals(),
    partAttempts: [],
    partTotals: emptyMethodPartTotals(),
    calcAttempts: [],
    calcTotals: emptyCalcTotals(),
    verifyAttempts: [],
    verifyTotals: emptyVerifyTotals(),
    drills: [],
    days: {},
    createdAt: now,
    updatedAt: now,
  };
}

/** Most recent attempts kept per item. Older ones are dropped on write. */
export const MAX_ATTEMPT_HISTORY = 200;

/**
 * Weekday attempts are not per-item, so they share one log. The cap is higher
 * than the per-item one because the per-month and per-century breakdowns read
 * from it and 200 dates would leave some months with a handful of samples.
 *
 * 2000 is the ceiling because the whole document is written back under one key
 * on every answer: at roughly 120 bytes of JSON per attempt that is a 240KB
 * tail, which still clones in well under a frame, and it leaves each of the
 * twelve months around 160 samples to draw a median from. Trimming past it
 * costs nothing that matters — `AppData.weekdayTotals` keeps the lifetime
 * counts and the latency histogram, so the all-time numbers do not move when
 * the oldest attempts fall off the end.
 */
export const MAX_WEEKDAY_ATTEMPTS = 2000;

/** Weekday runs kept. Older ones are dropped on write. */
export const MAX_WEEKDAY_RUNS = 200;

/**
 * Day steps kept in the raw log.
 *
 * The breakdown cuts this two ways — seven step sizes and two directions — so
 * the smallest cell that has to stay meaningful is one size in one direction,
 * fourteen of them in all. 1200 leaves each of those around 85 samples, which is
 * enough for a recent median to move when practice moves it.
 *
 * It is smaller than `MAX_WEEKDAY_ATTEMPTS` because a step row is smaller and
 * because the lifetime figures do not depend on it at all: `AppData.dayStepTotals`
 * holds the counts and the latency histogram, so trimming this cannot change a
 * single all-time number. The ceiling exists for the same reason as the others,
 * which is that the whole document is rewritten under one key on every answer.
 */
export const MAX_DAY_STEP_ATTEMPTS = 1200;

/**
 * Halves kept in the raw log, both together.
 *
 * The breakdown cuts each half once, and the finer of the two cuts is the date
 * half's twelve months, so that is the cell that has to stay meaningful. 1200
 * split across two halves leaves each month around 50 recent samples, which is
 * enough for a median to move when practice moves it and is the same order as
 * the day step's fourteen cells.
 *
 * As everywhere else here, the lifetime figures do not depend on this at all:
 * `AppData.partTotals` holds the counts and the latency histogram, so trimming
 * cannot change a single all-time number. The ceiling exists because the whole
 * document is rewritten under one key on every answer.
 */
export const MAX_PART_ATTEMPTS = 1200;

/**
 * Calculation steps kept in the raw log. One derivation writes three or four
 * rows, so 2000 is roughly 500 worked years — enough for a per-decade or
 * per-step recent view, and the same order of magnitude as the weekday cap for
 * the same reason: the whole document is rewritten on every answer.
 * `AppData.calcTotals` holds the all-time numbers, so trimming this costs
 * nothing that any screen reads as "lifetime".
 */
export const MAX_CALC_ATTEMPTS = 2000;

/**
 * Verify comparisons kept. One row per completed comparison rather than per
 * step, so far fewer are needed; `AppData.verifyTotals` is again the all-time
 * record.
 */
export const MAX_VERIFY_ATTEMPTS = 500;
