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
  /**
   * The year was spoken with this prompt, so the latency contains listening
   * time. Optional: absent reads as false, which is what every attempt written
   * before spoken prompts existed means.
   *
   * It marks intent rather than sound — a clip that failed to load still sets
   * it, because what the figure has to be honest about is whether the user was
   * waiting for one. Nothing grades on it. It exists so Stats can say why a
   * median moved instead of leaving the user to wonder.
   */
  audioPlayed?: boolean;
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
  /** Spoken year and code while learning a block. Nothing there is timed. */
  spokenPrompts: boolean;
  /**
   * Spoken year on a review prompt. Off by default, and it is the one setting
   * in the app that changes what a number means: latency runs from paint to
   * tap, so a spoken cue puts about a second of listening inside every latency,
   * every fluency decision and every mastery bucket. Attempts made with it on
   * carry `audioPlayed`, and Stats says how many.
   */
  spokenReviewPrompts: boolean;
  reminderEnabled: boolean;
  /** "HH:MM", 24h, local time. */
  reminderTime: string;
  eveningReminderEnabled: boolean;
  /** Set once the +1/+2 structure has been shown. It is taught once, ever. */
  structureLessonSeen: boolean;
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

/**
 * Which of the three trainers the weekday screen is showing.
 *
 * `full` is a whole date to a weekday, which is the method end to end. The
 * other two are its halves, asked alone — see `MethodPart` and
 * src/domain/methodParts.ts. Separate from `WeekdayMode`, which is a different
 * axis: assisted and unassisted are how much help a *full date* comes with,
 * and neither half has any help to give.
 */
export type WeekdayTask = 'full' | MethodPart;

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
/* Day-step trainer                                                    */
/* ------------------------------------------------------------------ */

/**
 * How far the day asked for sits from the month's doomsday, reduced mod 7.
 *
 * Zero is a real size and not an absence: a day a whole number of weeks from
 * the doomsday falls on the doomsday's own weekday. See src/domain/dayStep.ts.
 */
export type DayStepSize = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Whether the day asked for sits after the doomsday or before it. */
export type DayStepDirection = 'forward' | 'backward';

/**
 * One step answered on the day-step trainer.
 *
 * A prompt is a month, a stated weekday for that month's doomsday, and a day.
 * It is not a date, so — like every date on the weekday trainer — nothing here
 * enters spaced repetition. A (doomsday, day) pair is not a fixed item set
 * either: there are 366 of them and no reason to schedule any one.
 */
export interface DayStepAttempt {
  /** Epoch millis. */
  timestamp: number;
  /** 1..12, 1 = January. */
  month: number;
  /** True when the leap-year doomsday was in force. Only moves Jan and Feb. */
  leapYear: boolean;
  /** The month's doomsday date, as the prompt gave it. */
  anchorDay: number;
  /** The weekday the prompt stated for that doomsday, Sunday-indexed. */
  anchorWeekday: Code;
  /** The day the prompt asked for. Never the doomsday itself. */
  targetDay: number;
  /** Stored rather than recomputed, so a breakdown reads what was asked. */
  size: DayStepSize;
  direction: DayStepDirection;
  correct: boolean;
  /** Prompt render → button tap, in millis. */
  latencyMs: number;
  /** The weekday index tapped, Sunday-indexed. Null when the window ran out. */
  answered: Code | null;
}

/**
 * Lifetime totals for one slice of the day-step trainer. Same trim-proof shape
 * as `WeekdayModeTotals` and the same bucket edges, so one estimator serves all
 * three aggregates.
 */
export interface DayStepBucketTotals {
  answered: number;
  correct: number;
  /**
   * One count per latency bucket, ascending, same length and order as
   * `WEEKDAY_LATENCY_EDGES`. Ready to be drawn as bars, left to right.
   */
  buckets: number[];
}

/**
 * Every day-step answer ever given, cut two ways.
 *
 * Both cuts cover every attempt, so either one adds up to the overall totals —
 * which is why there is no third stored copy of them, and why a test asserts
 * the two agree. "I am slow at this" is not actionable; "the +5 steps cost
 * twice what the +1 steps do" and "counting back costs more than counting on"
 * both are.
 */
export interface DayStepTotals {
  bySize: Record<DayStepSize, DayStepBucketTotals>;
  byDirection: Record<DayStepDirection, DayStepBucketTotals>;
}

/* ------------------------------------------------------------------ */
/* The method's two halves                                             */
/* ------------------------------------------------------------------ */

/**
 * Which half of the calculation a prompt asked for. See
 * src/domain/methodParts.ts — `year` is `(anchor + code) mod 7`, `date` is
 * `(day - month doomsday) mod 7`, and adding the two gives the weekday.
 *
 * Declared here rather than only in that module because the persisted log is
 * discriminated by it.
 */
export type MethodPart = 'year' | 'date';

/**
 * One half answered on the weekday screen.
 *
 * A discriminated union rather than one flat row with half its fields nulled,
 * because the two halves genuinely take different questions: the year half is
 * given a year and no date, the date half a month and a day and no year. A row
 * that carried both with nulls could express "a year half that also had a
 * month", which is not a thing, and every reader would have to re-check which
 * fields were real.
 *
 * Neither half enters spaced repetition, for the same reason the full-date
 * trainer does not: a year is not a fixed item set the way the 100 codes are,
 * a (month, day) pair is not one either, and the year code inside the year
 * half is handed no differently than a wrong full date hands it — which of the
 * two lookups failed is unknowable from one tap.
 */
export type MethodPartAttempt =
  | {
      part: 'year';
      /** Epoch millis. */
      timestamp: number;
      /** 1800..2199. */
      fullYear: number;
      correct: boolean;
      /** Prompt paint → tap, in millis. */
      latencyMs: number;
      /** The digit tapped, 0..6. Null when the answer window ran out. */
      answered: Code | null;
    }
  | {
      part: 'date';
      /** Epoch millis. */
      timestamp: number;
      /** 1..12, 1 = January. */
      month: number;
      day: number;
      /** Which doomsday was in force. Only January and February move. */
      leapYear: boolean;
      correct: boolean;
      /** Prompt paint → tap, in millis. */
      latencyMs: number;
      /** The digit tapped, 0..6. Null when the answer window ran out. */
      answered: Code | null;
    };

/**
 * Every half-answer ever given, each half cut the one way that is actionable.
 *
 * The year half is cut by century, because the two things inside it are the
 * anchor and the code, and the codes already have a mastery grid of their own
 * on Stats — so a per-decade cut here would be a second, worse copy of that,
 * while a per-century cut is the only place the four anchors are timed.
 * The date half is cut by month, because the twelve month doomsdays are what
 * it is made of and "March costs twice what June does" names a drill.
 *
 * Each cut covers every attempt of its half, so summing one gives that half's
 * overall figures and there is no third stored copy to fall out of step. Same
 * trim-proof shape and bucket edges as every other aggregate here, so the same
 * estimator reads all of them.
 */
export interface MethodPartTotals {
  /** Keyed by century, "18".."21". */
  yearByCentury: Record<string, DayStepBucketTotals>;
  /** Keyed by month, "1".."12". */
  dateByMonth: Record<string, DayStepBucketTotals>;
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
   * The most recent day steps answered, oldest first. Bounded — read
   * `dayStepTotals` for anything that must cover all of history.
   */
  dayStepAttempts: DayStepAttempt[];
  /** Every day step ever answered, by size and by direction. Never trimmed. */
  dayStepTotals: DayStepTotals;
  /**
   * The most recent halves answered on the weekday screen, oldest first.
   * Bounded — read `partTotals` for anything that must cover all of history.
   */
  partAttempts: MethodPartAttempt[];
  /** Every half ever answered, by century and by month. Never trimmed. */
  partTotals: MethodPartTotals;
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
