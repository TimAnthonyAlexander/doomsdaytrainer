/**
 * Shared contracts. Every module in the app builds against these.
 * Nothing here should import from outside src/domain.
 */

/** A two-digit year, 0..99. Stored as a number, rendered zero-padded. */
export type YearKey = number;

/** A Doomsday year code, 0..6. */
export type Code = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** SM-2 quality grade. We only ever emit 1, 3, 4 or 5. */
export type Grade = 1 | 3 | 4 | 5;

export interface Attempt {
  /** Epoch millis. */
  timestamp: number;
  correct: boolean;
  /** Prompt render → button tap, in millis. */
  latencyMs: number;
  /**
   * What the user actually tapped. Null when the attempt was abandoned.
   * A year-code or century-anchor answer is a `Code`; a month-doomsday answer
   * is a day of the month, which is why this is a plain number.
   */
  answered: number | null;
  /** True when a hint was opened before answering. Caps the grade at 3. */
  hintUsed: boolean;
  /** Which surface produced this attempt. Drills never touch scheduling. */
  source: AttemptSource;
}

export type AttemptSource =
  | 'review'
  | 'learn'
  | 'sprint'
  | 'gauntlet'
  | 'decade'
  | 'trouble'
  /** A direct month-doomsday review on the weekday trainer. */
  | 'month'
  /** A direct century-anchor review on the weekday trainer. */
  | 'century';

/** Key of a month-doomsday item: 1..12, 1 = January. Stored in `ItemState.yy`. */
export type MonthKey = number;

/** Key of a century-anchor item: 18..21, 18 = the 1800s. Stored in `ItemState.yy`. */
export type CenturyKey = number;

export interface ItemState {
  /**
   * Which item this is. A year code stores 00-99 here; the month and century
   * maps reuse the same record and store a `MonthKey` or `CenturyKey` instead.
   */
  yy: YearKey;
  easeFactor: number;
  /** Days. 0 means "due now, still being learned". */
  interval: number;
  /** Epoch millis. */
  dueAt: number;
  repetitions: number;
  lapses: number;
  /** True once the item has left Learn mode and entered the review queue. */
  introduced: boolean;
  /** Epoch millis of introduction, or null. */
  introducedAt: number | null;
  /** Consecutive failures, reset on any correct answer. Drives auto-hints. */
  consecutiveFailures: number;
  /** Set when lapses crosses LEECH_THRESHOLD. */
  leech: boolean;
  attemptHistory: Attempt[];
}

export type IndexConvention = 'sunday' | 'monday';

export type ScopeId = 'full' | 'living' | 'modern' | 'current' | 'custom';

export interface Scope {
  id: ScopeId;
  label: string;
  /** Inclusive bounds. */
  from: YearKey;
  to: YearKey;
}

export type HintType = 'structural' | 'arithmetic' | 'anchor';

export interface Settings {
  indexConvention: IndexConvention;
  scopeId: ScopeId;
  /** Only meaningful when scopeId === 'custom'. */
  customScope: { from: YearKey; to: YearKey };
  /** 0..40 */
  newItemsPerDay: number;
  /** Millis. correct && < fast → grade 5; < medium → grade 4; else grade 3. */
  fastThresholdMs: number;
  mediumThresholdMs: number;
  hintType: HintType;
  /** Millis, 0..1000. */
  autoAdvanceMs: number;
  keyboardInput: boolean;
  reminderEnabled: boolean;
  /** "HH:MM", 24h, local time. */
  reminderTime: string;
  eveningReminderEnabled: boolean;
  /** Set once the user has finished onboarding. */
  onboardingComplete: boolean;
}

export type DrillMode = 'sprint' | 'gauntlet' | 'decade';

export interface DrillRecord {
  id: string;
  mode: DrillMode;
  /** For 'decade', which decade (0..9). Null otherwise. */
  decade: number | null;
  timestamp: number;
  /** Sprint: correct answers in 60s. Gauntlet/decade: elapsed millis. */
  score: number;
  correct: number;
  total: number;
  medianLatencyMs: number;
}

export interface SessionDay {
  /** "YYYY-MM-DD" local. */
  date: string;
  reviewsCompleted: number;
  newItemsIntroduced: number;
}

/* ------------------------------------------------------------------ */
/* Weekday trainer                                                     */
/* ------------------------------------------------------------------ */

/** Which of the two fixed supporting tables an item belongs to. */
export type TableKind = 'month' | 'century';

/** Assisted shows the year code above the date; unassisted shows nothing. */
export type WeekdayMode = 'assisted' | 'unassisted';

/** Independent of the year-code `ScopeId`. Dates, not two-digit years. */
export type WeekdayRangeId = 'century' | 'living' | 'full';

/** A full date. Month is 1-based, matching src/domain/weekday.ts. */
export interface CalendarDate {
  fullYear: number;
  /** 1..12, 1 = January. */
  month: number;
  day: number;
}

export interface WeekdayRange {
  id: WeekdayRangeId;
  label: string;
  /** Inclusive. */
  start: CalendarDate;
  /** Inclusive. "Living memory" ends today, not at the end of this year. */
  end: CalendarDate;
}

/** One date answered on the weekday trainer. Dates never enter SM-2. */
export interface WeekdayAttempt {
  /** Epoch millis. */
  timestamp: number;
  /** 1800..2199. */
  fullYear: number;
  /** 1..12, 1 = January. */
  month: number;
  day: number;
  mode: WeekdayMode;
  correct: boolean;
  latencyMs: number;
  /** The weekday index the user tapped, in Sunday-indexed form. */
  answered: Code | null;
}

/**
 * Lifetime totals for one weekday mode. Survives any trimming of the raw
 * attempt log, which is why the latencies are a histogram and not a list: a
 * median cannot be recovered from a running sum, but it can be read back out
 * of fixed buckets to within one bucket's width.
 *
 * See src/domain/weekdayLifetime.ts for the bucket edges and the estimator.
 */
export interface WeekdayModeTotals {
  answered: number;
  correct: number;
  /**
   * One count per latency bucket, ascending, same length and order as
   * `WEEKDAY_LATENCY_EDGES`. Ready to be drawn as bars, left to right.
   */
  latencyBuckets: number[];
}

/** The two modes, never averaged together. */
export interface WeekdayTotals {
  assisted: WeekdayModeTotals;
  unassisted: WeekdayModeTotals;
}

/** One finished pass on the weekday trainer, for the run history. */
export interface WeekdayRun {
  id: string;
  timestamp: number;
  mode: WeekdayMode;
  rangeId: WeekdayRangeId;
  correct: number;
  total: number;
  medianLatencyMs: number;
}

/** The full persisted document. Also the shape of an export file. */
export interface AppData {
  schemaVersion: number;
  settings: Settings;
  items: Record<string, ItemState>;
  /** Keyed by `MonthKey`. Twelve entries, trained like the year codes. */
  monthItems: Record<string, ItemState>;
  /** Keyed by `CenturyKey`. Four entries, trained like the year codes. */
  centuryItems: Record<string, ItemState>;
  /**
   * The most recent dates answered on the weekday trainer, oldest first.
   * Bounded — read `weekdayTotals` for anything that must cover all of history.
   */
  weekdayAttempts: WeekdayAttempt[];
  /** Every date ever answered, per mode. Never trimmed. */
  weekdayTotals: WeekdayTotals;
  weekdayRuns: WeekdayRun[];
  drills: DrillRecord[];
  days: Record<string, SessionDay>;
  createdAt: number;
  updatedAt: number;
}

export interface ExportFile {
  app: 'doomsday-trainer';
  schemaVersion: number;
  exportedAt: number;
  data: AppData;
}

/** Result of grading one review answer. */
export interface GradeResult {
  grade: Grade;
  correct: boolean;
  /** The item state after scheduling has been applied. */
  next: ItemState;
}
