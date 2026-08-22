import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CalendarDate,
  Code,
  WeekdayAttempt,
  WeekdayMode,
  WeekdayRangeId,
} from '@/domain/types';
import { explainWeekday, type WeekdayWorking } from '@/domain/weekday';
import { useAppState } from '@/state/useAppState';
import { summarise, type SessionResult } from '@/features/review/summary';
import { dateKey, nextDate, rangeById } from './datePool';
import type { WeekdaySessionResult } from './weekdayStats';

export type WeekdayPhase = 'prompt' | 'correct' | 'wrong';

interface AnsweredState {
  chosen: Code;
  correct: boolean;
}

/** Results accumulated under one mode and one range. Flushed as a run. */
interface PendingRun {
  mode: WeekdayMode;
  rangeId: WeekdayRangeId;
  results: SessionResult[];
}

export interface WeekdaySession {
  date: CalendarDate;
  /** Every intermediate number for the date on screen. */
  working: WeekdayWorking;
  phase: WeekdayPhase;
  chosen: Code | null;
  correctCode: Code;
  /** Restarts the pad's latency clock. Changes on every advance. */
  promptKey: string;
  answer: (value: number, latencyMs: number) => void;
  advance: () => void;
  /**
   * Everything answered since the screen opened, each tagged with the mode it
   * was answered under. Not cleared when the mode or range changes: the run
   * that gets written to the history still ends there, but the numbers under
   * the pad describe the sitting, and a sitting does not restart because the
   * user tried the other mode for a minute.
   */
  results: WeekdaySessionResult[];
}

/**
 * The weekday loop's state.
 *
 * Dates are not a fixed item set, so nothing here schedules anything. It draws
 * a date, records what the user answered and how long it took, and keeps a run
 * of results per mode and range. Switching mode or range closes the run that
 * was open and starts a fresh one, so a personal best always belongs to the
 * settings it was set under.
 */
export function useWeekdaySession(mode: WeekdayMode, rangeId: WeekdayRangeId): WeekdaySession {
  const { recordWeekdayAttempt, recordWeekdayRun } = useAppState();

  // Fixed at mount so the "living memory" bound cannot move mid-session.
  const startedAt = useRef(Date.now());
  const range = useMemo(() => rangeById(rangeId, startedAt.current), [rangeId]);

  const seen = useRef<Set<string>>(new Set());
  const [date, setDate] = useState<CalendarDate>(() => {
    const first = nextDate(range, seen.current);
    seen.current.add(dateKey(first));
    return first;
  });
  const [answered, setAnswered] = useState<AnsweredState | null>(null);
  const [round, setRound] = useState(0);
  const [results, setResults] = useState<WeekdaySessionResult[]>([]);

  const pending = useRef<PendingRun | null>(null);

  const flushRun = useCallback(() => {
    const run = pending.current;
    pending.current = null;
    if (!run || run.results.length === 0) return;
    const summary = summarise(run.results);
    void recordWeekdayRun({
      mode: run.mode,
      rangeId: run.rangeId,
      correct: summary.total - summary.wrong,
      total: summary.total,
      medianLatencyMs: Math.round(summary.medianLatencyMs),
    });
  }, [recordWeekdayRun]);

  // The open run belongs to whatever mode and range it was answered under, so
  // changing either closes it and draws a fresh date.
  const settingKey = `${mode}|${rangeId}`;
  const lastSetting = useRef(settingKey);
  useEffect(() => {
    if (lastSetting.current === settingKey) return;
    lastSetting.current = settingKey;
    flushRun();
    setAnswered(null);
    setDate(() => {
      const drawn = nextDate(range, seen.current);
      seen.current.add(dateKey(drawn));
      return drawn;
    });
    setRound((value) => value + 1);
  }, [settingKey, range, flushRun]);

  // Leaving the screen ends the run. Kept in a ref so the cleanup runs once, on
  // unmount, rather than on every change of `flushRun`.
  const flushRef = useRef(flushRun);
  useEffect(() => {
    flushRef.current = flushRun;
  }, [flushRun]);
  useEffect(() => () => flushRef.current(), []);

  const working = useMemo(() => explainWeekday(date.fullYear, date.month, date.day), [date]);

  const answer = useCallback(
    (value: number, latencyMs: number) => {
      if (answered) return;
      const correct = value === working.weekday;
      const latency = Math.round(latencyMs);

      setAnswered({ chosen: value as Code, correct });
      setResults((prev) => [...prev, { mode, correct, latencyMs: latency }]);

      pending.current ??= { mode, rangeId, results: [] };
      pending.current.results.push({ correct, latencyMs: latency });

      const attempt: WeekdayAttempt = {
        timestamp: Date.now(),
        fullYear: date.fullYear,
        month: date.month,
        day: date.day,
        mode,
        correct,
        latencyMs: latency,
        answered: value as Code,
      };
      void recordWeekdayAttempt(attempt);
    },
    [answered, working.weekday, date, mode, rangeId, recordWeekdayAttempt],
  );

  const advance = useCallback(() => {
    setAnswered(null);
    setDate(() => {
      const drawn = nextDate(range, seen.current);
      seen.current.add(dateKey(drawn));
      return drawn;
    });
    setRound((value) => value + 1);
  }, [range]);

  return {
    date,
    working,
    phase: answered ? (answered.correct ? 'correct' : 'wrong') : 'prompt',
    chosen: answered ? answered.chosen : null,
    correctCode: working.weekday,
    promptKey: `${dateKey(date)}#${round}`,
    answer,
    advance,
    results,
  };
}
