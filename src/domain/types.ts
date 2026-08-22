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

/**
 * Whether the answer is being recalled or worked out. Held beside the SM-2
 * fields and never read by them: see src/domain/fluency.ts for what earns it
 * and why the scheduler deliberately ignores it.
 */
export interface Fluency {
  /** Qualifying answers in a row, each on a different day. */
  consecutiveFast: number;
  /** Correct answers in a row that were too slow or used a hint. */
  consecutiveSlow: number;
  /** Day key of the most recent qualifying answer. Null when there is none. */
  lastFastDay: string | null;
  fluent: boolean;
  /** Epoch millis of the first time this item became fluent, or null. */
  fluentAt: number | null;
}

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
  /**
   * Recall speed, kept separate from scheduling. The interval says how long the
   * answer survives; this says whether it arrives without being worked out.
   */
  fluency: Fluency;
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
  /**
   * Optional answer window, in millis. Null means off, which is the default.
   *
   * A deadline reliably moves someone off a procedure and onto retrieval for
   * items they already know (Campbell & Austin 2002), and there is no evidence
   * it helps acquire a new pair. There is evidence it hurts: Seabrooke et al.
   * (2019) found guessing before feedback improves memory for the items and
   * *impairs* cued recall of the link, and Siegler's learning rule strengthens
   * whichever answer was produced, right or wrong. On a seven-button pad a
   * forced guess is wrong 85.7% of the time.
   *
   * So the window never scores a tap on a surface that schedules. In Review it
   * expires into the hint, which caps the grade at 3 the same way asking for
   * one does. In Drills, which write no scheduling state at all, it counts as a
   * miss and moves on.
   */
  answerWindowMs: number | null;
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

/* ------------------------------------------------------------------ */
/* Calculation trainer                                                 */
/* ------------------------------------------------------------------ */

/**
 * One step of deriving a year code.
 *
 * `leap`, `sum` and `mod` are the formula itself. `reduce` is the optional
 * first move that takes whole 28s out of the year before the formula runs —
 * the codes repeat every 28 years, so it changes nothing except how small the
 * numbers get. `code` is not a derivation step: it is a straight recall of the
 * code from memory, recorded under its own id so that remembering and working
 * it out can be compared instead of averaged.
 *
 * See src/domain/calc.ts. Declared here because the persisted aggregate is
 * keyed by it.
 */
export type CalcStepId = 'leap' | 'sum' | 'mod' | 'reduce' | 'code';

/** One step answered on the calculation trainer. Steps never enter SM-2. */
export interface CalcAttempt {
  /** Epoch millis. */
  timestamp: number;
  /** The year being derived, 0..99. On the reduce-first path this stays the
   * original year, not the reduced one, so a decade breakdown still works. */
  yy: YearKey;
  step: CalcStepId;
  /** The number the user produced. Null when the step was abandoned. */
  answered: number | null;
  correct: boolean;
  /** Prompt render → answer, in millis. */
  latencyMs: number;
  /** True when the reduce-first path was in use for this derivation. */
  reduced: boolean;
}

/**
 * Lifetime totals for one step. Same trim-proof shape as `WeekdayModeTotals`
 * and the same bucket edges, so one estimator serves both.
 */
export interface CalcStepTotals {
  answered: number;
  correct: number;
  /**
   * One count per latency bucket, ascending, same length and order as
   * `WEEKDAY_LATENCY_EDGES`. Ready to be drawn as bars, left to right.
   */
  buckets: number[];
}

/** Every step, kept apart. Averaging them would hide the slow one. */
export type CalcTotals = Record<CalcStepId, CalcStepTotals>;

/**
 * What happened when a recalled code and a derived code were put side by side.
 *
 * Two answers and one truth give exactly five outcomes. They are stored as
 * five counters rather than as accuracy percentages because the useful
 * question is the disagreement: when memory and calculation differ, which one
 * was right? A pair of accuracy figures cannot answer that; these can.
 */
export type VerifyOutcome =
  /** Both matched the true code. */
  | 'agreed-right'
  /** Both gave the same answer, and it was wrong. The dangerous one. */
  | 'agreed-wrong'
  /** They differed and the recalled code was right. */
  | 'memory-right'
  /** They differed and the derived code was right. */
  | 'calculation-right'
  /** They differed and neither was right. */
  | 'both-wrong';

/** What the verify screen collects. Truth and verdict are added by the domain. */
export interface VerifyResultInput {
  /** Epoch millis. */
  timestamp: number;
  yy: YearKey;
  /** The code the user produced from memory. */
  recalled: number;
  /** The code the user reached by working it out. */
  derived: number;
  /** Prompt render → the recalled answer. */
  recallLatencyMs: number;
  /** From the recalled answer to the derived answer. */
  deriveLatencyMs: number;
  /** True when the reduce-first path was in use. */
  reduced: boolean;
}

/**
 * One completed comparison. A verify that was abandoned before both answers
 * exist is not recorded: there is nothing to compare, and a half-filled row
 * would drag every rate below towards a number that never happened.
 */
export interface VerifyAttempt extends VerifyResultInput {
  /** The true code for `yy`, from the shipped table. */
  actual: Code;
  outcome: VerifyOutcome;
}

/** Lifetime counts of every verify outcome. Never trimmed. */
export interface VerifyTotals {
  agreedRight: number;
  agreedWrong: number;
  memoryRight: number;
  calculationRight: number;
  bothWrong: number;
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
  /**
   * The most recent steps answered on the calculation trainer, oldest first.
   * Bounded — read `calcTotals` for anything that must cover all of history.
   */
  calcAttempts: CalcAttempt[];
  /** Every step ever answered, per step. Never trimmed. */
  calcTotals: CalcTotals;
  /** The most recent verify comparisons, oldest first. Bounded. */
  verifyAttempts: VerifyAttempt[];
  /** Every verify comparison ever made. Never trimmed. */
  verifyTotals: VerifyTotals;
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
