import { createContext, useContext } from 'react';
import type {
  AppData,
  Attempt,
  CalcAttempt,
  CalcTotals,
  DrillRecord,
  GradeResult,
  ItemState,
  Settings,
  TableKind,
  VerifyAttempt,
  VerifyResultInput,
  VerifyTotals,
  WeekdayAttempt,
  WeekdayRun,
  WeekdayTotals,
  YearKey,
} from '@/domain/types';

export interface AppStateValue {
  /** False until the first load resolves. */
  ready: boolean;
  error: string | null;
  data: AppData;
  settings: Settings;
  items: Record<string, ItemState>;
  /** Sorted by yy, ascending. */
  itemList: ItemState[];
  /** The twelve month doomsdays, keyed 1..12. */
  monthItems: Record<string, ItemState>;
  /** The four century anchors, keyed 18..21. */
  centuryItems: Record<string, ItemState>;
  /** Sorted by month, January first. */
  monthItemList: ItemState[];
  /** Sorted by century, the 1800s first. */
  centuryItemList: ItemState[];
  /**
   * Lifetime weekday counts and latency histogram, per mode. Survives the
   * trimming of `data.weekdayAttempts`, so it is what "all time" reads.
   */
  weekdayTotals: WeekdayTotals;
  /**
   * Lifetime counts and a latency histogram for every calculation step, kept
   * apart so the slow step is visible. Survives the trimming of
   * `data.calcAttempts`.
   */
  calcTotals: CalcTotals;
  /** Lifetime verify outcomes: agreement, and who was right when they differed. */
  verifyTotals: VerifyTotals;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  /** Review-sourced only. Applies scheduling and returns the grade. */
  recordReview(yy: YearKey, attempt: Attempt): Promise<GradeResult>;
  /** Appends to attempt history and nothing else. Drills never reschedule. */
  recordDrillAttempt(yy: YearKey, attempt: Attempt): Promise<void>;
  introduceItems(yys: YearKey[]): Promise<void>;
  recordDrill(record: Omit<DrillRecord, 'id' | 'timestamp'>): Promise<void>;
  /**
   * Appends one answered date to the weekday log. Dates are not a fixed item
   * set, so nothing here schedules anything — not the year code, and not the
   * month or century item the user happened to need for it.
   */
  recordWeekdayAttempt(attempt: WeekdayAttempt): Promise<void>;
  recordWeekdayRun(run: Omit<WeekdayRun, 'id' | 'timestamp'>): Promise<void>;
  /**
   * Appends one answered calculation step to the log and folds it into the
   * per-step lifetime totals. Nothing here schedules anything: a derivation is
   * arithmetic practice, not a review of the year-code item.
   */
  recordCalcAttempt(attempt: CalcAttempt): Promise<void>;
  /**
   * Records one verify comparison. The caller supplies only what the user did;
   * the true code and the verdict are filled in from the shipped table and
   * returned, so the screen renders the same outcome that was stored.
   */
  recordVerifyResult(input: VerifyResultInput): Promise<VerifyAttempt>;
  /**
   * The only path that schedules a month doomsday or century anchor. It takes
   * a direct answer to that table, never a weekday answer: after a whole
   * computation in the user's head, which step went wrong is unknowable.
   */
  reviewTableItem(kind: TableKind, key: number, attempt: Attempt): Promise<GradeResult>;
  noteSessionActivity(kind: 'review' | 'new', count: number): Promise<void>;
  importData(json: string): Promise<void>;
  reset(): Promise<void>;
  refresh(): Promise<void>;
}

export const AppStateContext = createContext<AppStateValue | null>(null);

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used inside <AppStateProvider>.');
  return value;
}
