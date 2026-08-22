import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Attempt, Code, DrillMode, YearKey } from '@/domain/types';
import { resolveScope } from '@/domain/scope';
import { median } from '@/domain/time';
import { codeFor } from '@/domain/yearCodes';
import { useAppState } from '@/state/useAppState';
import { beatsBest, bestScore } from './drillHistory';
import {
  COUNTDOWN_SECONDS,
  buildPlan,
  nextSprintYear,
  systemRng,
  type DrillPlan,
  type Rng,
} from './drillPlan';

/**
 * One drill run, from the 3-2-1 to the result.
 *
 * Two rules shape everything here.
 *
 * First: a drill never touches scheduling. Attempts are written with
 * `recordDrillAttempt`, which copies `interval`, `easeFactor`, `dueAt`,
 * `repetitions` and `lapses` across untouched. `applyReview` is never called,
 * and it throws for a drill source anyway.
 *
 * Second: an aborted run writes nothing at all. Attempts are therefore buffered
 * in memory for the length of the run and flushed only when it finishes. That
 * also keeps a hundred IndexedDB writes out of the middle of a timed sprint,
 * where they would land straight in the latency being measured.
 */

export type DrillPhase = 'countdown' | 'running' | 'finished';

export interface DrillOutcome {
  mode: DrillMode;
  decade: number | null;
  title: string;
  coverage: string;
  /** Sprint: correct answers. Gauntlet and decade: elapsed millis. */
  score: number;
  correct: number;
  total: number;
  medianLatencyMs: number;
  elapsedMs: number;
  /** Best on record for this exact mode, decade and run length. */
  previousBest: number | null;
  improved: boolean;
}

export interface DrillRunParams {
  mode: DrillMode;
  /** 0..9 for a decade drill, null otherwise. */
  decade: number | null;
  /** Called when the run ends without writing anything. */
  onDiscard: (message: string) => void;
  /** Tests only. The real countdown is three seconds. */
  countdownSeconds?: number;
  rng?: Rng;
}

export interface DrillRun {
  plan: DrillPlan;
  phase: DrillPhase;
  /** 3, 2, 1 while the run is still counting in. */
  countdown: number;
  /** The year on screen, or null outside the running phase. */
  yy: YearKey | null;
  /** Restarts the pad's latency clock on every prompt. */
  promptKey: string;
  answered: number;
  /** `performance.now()` origin of the run. Null until the countdown ends. */
  startedAt: number | null;
  outcome: DrillOutcome | null;
  /** Set only when the finished run could not be written to storage. */
  saveError: string | null;
  answer: (value: number, latencyMs: number) => void;
  /** The answer window ran out. Recorded as a miss; drills schedule nothing. */
  expire: (latencyMs: number) => void;
  abort: () => void;
}

interface Buffered {
  yy: YearKey;
  attempt: Attempt;
}

export function useDrillRun({
  mode,
  decade,
  onDiscard,
  countdownSeconds = COUNTDOWN_SECONDS,
  rng = systemRng,
}: DrillRunParams): DrillRun {
  const { itemList, settings, data, recordDrillAttempt, recordDrill } = useAppState();

  const scope = useMemo(() => resolveScope(settings), [settings]);

  // Built once. A re-render must never reshuffle a live run, so this is a state
  // initializer rather than a memo.
  const [plan] = useState<DrillPlan>(() => buildPlan(mode, decade, itemList, scope, rng));

  const [phase, setPhase] = useState<DrillPhase>('countdown');
  const [countdown, setCountdown] = useState(Math.max(0, countdownSeconds));
  const [yy, setYy] = useState<YearKey | null>(null);
  const [answered, setAnswered] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<DrillOutcome | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const phaseRef = useRef<DrillPhase>('countdown');
  const yyRef = useRef<YearKey | null>(null);
  const startedRef = useRef<number | null>(null);
  const correctRef = useRef(0);
  const latenciesRef = useRef<number[]>([]);
  const bufferRef = useRef<Buffered[]>([]);

  // The drill log as of the latest render, for the personal-best comparison at
  // the end of a run that may have started several minutes earlier.
  const drillsRef = useRef(data.drills);
  useEffect(() => {
    drillsRef.current = data.drills;
  }, [data.drills]);

  const persist = useCallback(
    async (entries: Buffered[], record: DrillOutcome) => {
      for (const entry of entries) {
        await recordDrillAttempt(entry.yy, entry.attempt);
      }
      await recordDrill({
        mode: record.mode,
        decade: record.decade,
        score: record.score,
        correct: record.correct,
        total: record.total,
        medianLatencyMs: record.medianLatencyMs,
      });
    },
    [recordDrillAttempt, recordDrill],
  );

  const finish = useCallback(() => {
    if (phaseRef.current !== 'running') return;
    phaseRef.current = 'finished';

    const started = startedRef.current;
    const elapsedMs = started === null ? 0 : Math.round(performance.now() - started);
    const entries = bufferRef.current;
    const total = entries.length;

    if (total === 0) {
      setPhase('finished');
      onDiscard('The run ended with no answers. Nothing was saved.');
      return;
    }

    const correct = correctRef.current;
    const medianLatencyMs = Math.round(median(latenciesRef.current));
    const score = plan.mode === 'sprint' ? correct : elapsedMs;
    const previousBest = bestScore(drillsRef.current, plan.mode, plan.decade, total);

    const result: DrillOutcome = {
      mode: plan.mode,
      decade: plan.decade,
      title: plan.title,
      coverage: plan.coverage,
      score,
      correct,
      total,
      medianLatencyMs,
      elapsedMs,
      previousBest,
      improved: beatsBest(plan.mode, score, previousBest),
    };

    setOutcome(result);
    setPhase('finished');

    void persist(entries, result).catch(() => {
      setSaveError('This run could not be written to local storage.');
    });
  }, [onDiscard, persist, plan]);

  // Held in a ref so the sprint's hard stop can call the current version
  // without the timeout being torn down and restarted on every render.
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  const start = useCallback(() => {
    if (phaseRef.current !== 'countdown') return;

    const first =
      plan.mode === 'sprint' ? nextSprintYear(plan.pool, null, rng) : (plan.order[0] ?? null);

    if (first === null) {
      phaseRef.current = 'finished';
      setPhase('finished');
      onDiscard('That drill has nothing to ask. Nothing was saved.');
      return;
    }

    phaseRef.current = 'running';
    startedRef.current = performance.now();
    yyRef.current = first;
    setYy(first);
    setStartedAt(startedRef.current);
    setPhase('running');
  }, [onDiscard, plan, rng]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      start();
      return;
    }
    const id = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, countdown, start]);

  // The sprint's clock, not the user, ends a sprint.
  useEffect(() => {
    if (phase !== 'running' || plan.limitSeconds === null) return;
    const id = setTimeout(() => finishRef.current(), plan.limitSeconds * 1000);
    return () => clearTimeout(id);
  }, [phase, plan.limitSeconds]);

  /**
   * One prompt resolved, by a tap or by the answer window running out.
   *
   * `value` is null when the window ran out. That is a miss here and nothing
   * more delicate, because a drill writes no scheduling state: the buffer is
   * flushed as history when the run completes and `applyReview` refuses drill
   * sources outright. The same expiry in Review would be scoring a forced
   * guess, which is why Review handles it differently.
   */
  const record = useCallback(
    (value: number | null, latencyMs: number) => {
      if (phaseRef.current !== 'running') return;
      const current = yyRef.current;
      if (current === null) return;

      const correct = value !== null && value === codeFor(current);
      const latency = Math.round(Math.max(0, latencyMs));

      bufferRef.current.push({
        yy: current,
        attempt: {
          timestamp: Date.now(),
          correct,
          latencyMs: latency,
          answered: value === null ? null : (value as Code),
          hintUsed: false,
          source: plan.mode,
        },
      });
      latenciesRef.current.push(latency);
      if (correct) correctRef.current += 1;

      const done = bufferRef.current.length;
      setAnswered(done);

      if (plan.mode === 'sprint') {
        const started = startedRef.current;
        if (started !== null && performance.now() - started >= (plan.limitSeconds ?? 0) * 1000) {
          finishRef.current();
          return;
        }
        const next = nextSprintYear(plan.pool, current, rng);
        yyRef.current = next;
        setYy(next);
        if (next === null) finishRef.current();
        return;
      }

      if (done >= plan.order.length) {
        finishRef.current();
        return;
      }
      yyRef.current = plan.order[done];
      setYy(plan.order[done]);
    },
    [plan, rng],
  );

  const answer = useCallback(
    (value: number, latencyMs: number) => record(value, latencyMs),
    [record],
  );

  /** The answer window ran out. A drill counts that as a miss and moves on. */
  const expire = useCallback(
    (latencyMs: number) => record(null, latencyMs),
    [record],
  );

  const abort = useCallback(() => {
    if (phaseRef.current === 'finished') return;
    phaseRef.current = 'finished';
    setPhase('finished');
    // Nothing is flushed. The buffer dies with the component.
    onDiscard('Run aborted. Nothing was saved.');
  }, [onDiscard]);

  return {
    plan,
    phase,
    countdown,
    yy: phase === 'running' ? yy : null,
    // The phase is in the key because the pad is mounted through the count-in.
    // Without it the clock would start at the paint of the "3" and charge the
    // first answer the whole count-in, which is the exact thing the count-in
    // exists to prevent.
    promptKey: `${plan.mode}#${phase}#${answered}`,
    answered,
    startedAt,
    outcome,
    saveError,
    answer,
    expire,
    abort,
  };
}
