import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  AppData,
  Attempt,
  CalcAttempt,
  DayStepAttempt,
  DrillRecord,
  GradeResult,
  ItemState,
  Settings,
  TableKind,
  VerifyResultInput,
  WeekdayAttempt,
  WeekdayRun,
  YearKey,
} from '@/domain/types';
import { applyReview, createItem, introduce } from '@/domain/scheduler';
import { dayKey } from '@/domain/time';
import { addWeekdayAttempt } from '@/domain/weekdayLifetime';
import { addCalcAttempt, addVerifyResult, buildVerifyAttempt } from '@/domain/calcStats';
import { addDayStepAttempt } from '@/domain/dayStepLifetime';
import {
  MAX_ATTEMPT_HISTORY,
  MAX_CALC_ATTEMPTS,
  MAX_DAY_STEP_ATTEMPTS,
  MAX_VERIFY_ATTEMPTS,
  MAX_WEEKDAY_ATTEMPTS,
  MAX_WEEKDAY_RUNS,
  defaultAppData,
  itemKey,
} from '@/storage/defaults';
import { loadAppData, patchAppData, resetAppData, saveAppData } from '@/storage/db';
import { parseImportFile } from '@/storage/exportImport';
import { AppStateContext, useAppState, type AppStateValue } from './useAppState';

/** Placeholder so consumers always get a well-shaped document, even pre-load. */
let placeholderCache: AppData | null = null;
function placeholder(): AppData {
  placeholderCache ??= defaultAppData(0);
  return placeholderCache;
}

function capHistory(history: Attempt[]): Attempt[] {
  return history.length > MAX_ATTEMPT_HISTORY ? history.slice(history.length - MAX_ATTEMPT_HISTORY) : history;
}

function itemOf(data: AppData, yy: YearKey): ItemState {
  return data.items[itemKey(yy)] ?? createItem(yy);
}

function withItem(data: AppData, item: ItemState): AppData {
  return { ...data, items: { ...data.items, [itemKey(item.yy)]: item } };
}

/** Which map on the document a table kind reads and writes. */
const TABLE_FIELD: Record<TableKind, 'monthItems' | 'centuryItems'> = {
  month: 'monthItems',
  century: 'centuryItems',
};

function tableItemOf(data: AppData, kind: TableKind, key: number): ItemState {
  return data[TABLE_FIELD[kind]][String(key)] ?? createItem(key);
}

function withTableItem(data: AppData, kind: TableKind, item: ItemState): AppData {
  const field = TABLE_FIELD[kind];
  return { ...data, [field]: { ...data[field], [String(item.yy)]: item } };
}

function capTail<T>(list: T[], max: number): T[] {
  return list.length > max ? list.slice(list.length - max) : list;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * Where every action's result lands. A write started before the provider
   * unmounted can still resolve after it — the review loop's `recordReview`
   * chains a `noteSessionActivity` behind it, and a session that ends on the
   * last due item unmounts in between. The write is kept either way; only the
   * render into a torn-down tree is dropped.
   */
  const commit = useCallback((next: AppData) => {
    if (!alive.current) return;
    setData(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const loaded = await loadAppData();
      if (!alive.current) return;
      setData(loaded);
      setError(null);
    } catch (err) {
      if (!alive.current) return;
      setError(err instanceof Error ? err.message : 'Could not open local storage.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = await patchAppData((draft) => ({ ...draft, settings: { ...draft.settings, ...patch } }));
      commit(next);
    },
    [commit],
  );

  const recordReview = useCallback(
    async (yy: YearKey, attempt: Attempt) => {
      const holder: { value: GradeResult | null } = { value: null };
      const next = await patchAppData((draft) => {
        const before = itemOf(draft, yy);
        const graded = applyReview(before, attempt, draft.settings, attempt.timestamp);
        holder.value = graded;
        // applyReview may or may not append the attempt itself; make sure it lands exactly once.
        const history =
          graded.next.attemptHistory.length > before.attemptHistory.length
            ? graded.next.attemptHistory
            : [...before.attemptHistory, attempt];
        return withItem(draft, { ...graded.next, attemptHistory: capHistory(history) });
      });
      commit(next);
      if (!holder.value) throw new Error('Scheduling returned no result.');
      return holder.value;
    },
    [commit],
  );

  const recordDrillAttempt = useCallback(
    async (yy: YearKey, attempt: Attempt) => {
      const next = await patchAppData((draft) => {
        const before = itemOf(draft, yy);
        // Scheduling fields are copied untouched. This is a spec invariant.
        return withItem(draft, { ...before, attemptHistory: capHistory([...before.attemptHistory, attempt]) });
      });
      commit(next);
    },
    [commit],
  );

  const introduceItems = useCallback(
    async (yys: YearKey[]) => {
      const now = Date.now();
      const next = await patchAppData((draft) => {
        let out = draft;
        for (const yy of yys) {
          out = withItem(out, introduce(itemOf(out, yy), now));
        }
        return out;
      });
      commit(next);
    },
    [commit],
  );

  const recordDrill = useCallback(
    async (record: Omit<DrillRecord, 'id' | 'timestamp'>) => {
      const full: DrillRecord = { ...record, id: crypto.randomUUID(), timestamp: Date.now() };
      const next = await patchAppData((draft) => ({ ...draft, drills: [...draft.drills, full] }));
      commit(next);
    },
    [commit],
  );

  const recordWeekdayAttempt = useCallback(
    async (attempt: WeekdayAttempt) => {
      const next = await patchAppData((draft) => ({
        ...draft,
        weekdayAttempts: capTail([...draft.weekdayAttempts, attempt], MAX_WEEKDAY_ATTEMPTS),
        // Written on the same document write as the raw attempt, so the two can
        // never disagree. The raw log is trimmed; this is not.
        weekdayTotals: addWeekdayAttempt(draft.weekdayTotals, attempt),
      }));
      commit(next);
    },
    [commit],
  );

  const recordWeekdayRun = useCallback(
    async (record: Omit<WeekdayRun, 'id' | 'timestamp'>) => {
      const full: WeekdayRun = { ...record, id: crypto.randomUUID(), timestamp: Date.now() };
      const next = await patchAppData((draft) => ({
        ...draft,
        weekdayRuns: capTail([...draft.weekdayRuns, full], MAX_WEEKDAY_RUNS),
      }));
      commit(next);
    },
    [commit],
  );

  const recordDayStepAttempt = useCallback(
    async (attempt: DayStepAttempt) => {
      const next = await patchAppData((draft) => ({
        ...draft,
        dayStepAttempts: capTail([...draft.dayStepAttempts, attempt], MAX_DAY_STEP_ATTEMPTS),
        // Written on the same document write as the raw step, so the two can
        // never disagree. The raw log is trimmed; this is not.
        dayStepTotals: addDayStepAttempt(draft.dayStepTotals, attempt),
      }));
      commit(next);
    },
    [commit],
  );

  const recordCalcAttempt = useCallback(
    async (attempt: CalcAttempt) => {
      const next = await patchAppData((draft) => ({
        ...draft,
        calcAttempts: capTail([...draft.calcAttempts, attempt], MAX_CALC_ATTEMPTS),
        // Written on the same document write as the raw step, so the two can
        // never disagree. The raw log is trimmed; this is not.
        calcTotals: addCalcAttempt(draft.calcTotals, attempt),
      }));
      commit(next);
    },
    [commit],
  );

  const recordVerifyResult = useCallback(
    async (input: VerifyResultInput) => {
      // The true code and the verdict come from the domain, never from the
      // caller: a screen bug must not be able to write a wrong "actual" into
      // totals that are never recomputed.
      const attempt = buildVerifyAttempt(input);
      const next = await patchAppData((draft) => ({
        ...draft,
        verifyAttempts: capTail([...draft.verifyAttempts, attempt], MAX_VERIFY_ATTEMPTS),
        verifyTotals: addVerifyResult(draft.verifyTotals, attempt),
      }));
      commit(next);
      return attempt;
    },
    [commit],
  );

  const reviewTableItem = useCallback(
    async (kind: TableKind, key: number, attempt: Attempt) => {
      const holder: { value: GradeResult | null } = { value: null };
      const next = await patchAppData((draft) => {
        const stored = tableItemOf(draft, kind, key);
        // There is no separate Learn mode for sixteen items: the first direct
        // answer is what moves one into the queue.
        const before = stored.introduced ? stored : introduce(stored, attempt.timestamp);
        const graded = applyReview(before, attempt, draft.settings, attempt.timestamp);
        holder.value = graded;
        const history =
          graded.next.attemptHistory.length > before.attemptHistory.length
            ? graded.next.attemptHistory
            : [...before.attemptHistory, attempt];
        return withTableItem(draft, kind, { ...graded.next, attemptHistory: capHistory(history) });
      });
      commit(next);
      if (!holder.value) throw new Error('Scheduling returned no result.');
      return holder.value;
    },
    [commit],
  );

  const noteSessionActivity = useCallback(
    async (kind: 'review' | 'new', count: number) => {
      const date = dayKey(Date.now());
      const next = await patchAppData((draft) => {
        const day = draft.days[date] ?? { date, reviewsCompleted: 0, newItemsIntroduced: 0 };
        const updated =
          kind === 'review'
            ? { ...day, reviewsCompleted: day.reviewsCompleted + count }
            : { ...day, newItemsIntroduced: day.newItemsIntroduced + count };
        return { ...draft, days: { ...draft.days, [date]: updated } };
      });
      commit(next);
    },
    [commit],
  );

  const importData = useCallback(
    async (json: string) => {
      const incoming = parseImportFile(json);
      await saveAppData(incoming);
      const reloaded = await loadAppData();
      commit(reloaded);
      if (alive.current) setError(null);
    },
    [commit],
  );

  const reset = useCallback(async () => {
    const fresh = await resetAppData();
    commit(fresh);
    if (alive.current) setError(null);
  }, [commit]);

  const value = useMemo<AppStateValue>(() => {
    const current = data ?? placeholder();
    const byKey = (a: ItemState, b: ItemState) => a.yy - b.yy;
    return {
      ready: data !== null,
      error,
      data: current,
      settings: current.settings,
      items: current.items,
      itemList: Object.values(current.items).sort(byKey),
      monthItems: current.monthItems,
      centuryItems: current.centuryItems,
      monthItemList: Object.values(current.monthItems).sort(byKey),
      centuryItemList: Object.values(current.centuryItems).sort(byKey),
      weekdayTotals: current.weekdayTotals,
      dayStepTotals: current.dayStepTotals,
      calcTotals: current.calcTotals,
      verifyTotals: current.verifyTotals,
      updateSettings,
      recordReview,
      recordDrillAttempt,
      introduceItems,
      recordDrill,
      recordWeekdayAttempt,
      recordWeekdayRun,
      recordDayStepAttempt,
      recordCalcAttempt,
      recordVerifyResult,
      reviewTableItem,
      noteSessionActivity,
      importData,
      reset,
      refresh,
    };
  }, [
    data,
    error,
    updateSettings,
    recordReview,
    recordDrillAttempt,
    introduceItems,
    recordDrill,
    recordWeekdayAttempt,
    recordWeekdayRun,
    recordDayStepAttempt,
    recordCalcAttempt,
    recordVerifyResult,
    reviewTableItem,
    noteSessionActivity,
    importData,
    reset,
    refresh,
  ]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

/** Renders children only once the stored document has loaded. No copy, no spinner. */
export function AppStateGate({ children }: { children: ReactNode }) {
  const { ready } = useAppState();
  return ready ? <>{children}</> : null;
}
