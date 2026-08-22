import { useCallback, useMemo, useState } from 'react';
import type { Code, DayStepAttempt } from '@/domain/types';
import { explainDayStep, type DayStepQuestion, type DayStepWorking } from '@/domain/dayStep';
import { useAppState } from '@/state/useAppState';
import { summarise, type SessionResult } from '@/features/review/summary';
import { nextDayStepQuestion, questionKey } from './dayStepPlan';

export type DayStepPhase = 'prompt' | 'correct' | 'wrong';

interface AnsweredState {
  chosen: Code;
  correct: boolean;
}

export interface DayStepSession {
  question: DayStepQuestion;
  /** Every number for the prompt on screen, each with its label. */
  working: DayStepWorking;
  phase: DayStepPhase;
  chosen: Code | null;
  correctCode: Code;
  /** Restarts the pad's latency clock. Changes on every advance. */
  promptKey: string;
  answer: (value: number, latencyMs: number) => void;
  /** The answer window ran out. A miss, and on to the next prompt. */
  expire: (latencyMs: number) => void;
  advance: () => void;
  results: SessionResult[];
  summary: ReturnType<typeof summarise>;
}

/**
 * The day-step loop's state.
 *
 * Nothing here schedules anything. A (doomsday, day) pair is not a fixed item
 * set, so it never enters spaced repetition — the same rule the weekday
 * trainer's dates follow. The month doomsday is not reviewed either: the prompt
 * *states* it, so answering says nothing about whether the user could have
 * recalled it.
 *
 * Attempts are written one at a time rather than buffered to the end of a run,
 * because there is no run: the trainer has no fixed length, and a user who
 * leaves after four steps should keep those four.
 */
export function useDayStepSession(): DayStepSession {
  const { recordDayStepAttempt } = useAppState();

  const [question, setQuestion] = useState<DayStepQuestion>(() => nextDayStepQuestion(null));
  const [answered, setAnswered] = useState<AnsweredState | null>(null);
  const [round, setRound] = useState(0);
  const [results, setResults] = useState<SessionResult[]>([]);

  const working = useMemo(() => explainDayStep(question), [question]);

  const draw = useCallback(() => {
    setAnswered(null);
    setQuestion((previous) => nextDayStepQuestion(previous));
    setRound((value) => value + 1);
  }, []);

  const record = useCallback(
    (value: Code | null, latencyMs: number) => {
      const correct = value !== null && value === working.weekday;
      const latency = Math.round(Math.max(0, latencyMs));

      setResults((previous) => [...previous, { correct, latencyMs: latency }]);

      const attempt: DayStepAttempt = {
        timestamp: Date.now(),
        month: question.month,
        leapYear: question.leapYear,
        anchorDay: question.anchorDay,
        anchorWeekday: question.anchorWeekday,
        targetDay: question.targetDay,
        size: working.size,
        direction: working.direction,
        correct,
        latencyMs: latency,
        answered: value,
      };
      void recordDayStepAttempt(attempt);
      return correct;
    },
    [question, working, recordDayStepAttempt],
  );

  const answer = useCallback(
    (value: number, latencyMs: number) => {
      if (answered) return;
      const chosen = value as Code;
      const correct = record(chosen, latencyMs);
      setAnswered({ chosen, correct });
    },
    [answered, record],
  );

  /**
   * The window ran out. Counted as a miss and moved past, which is what a drill
   * does with one and the only thing invariant 11 allows on a surface that
   * writes no scheduling state. It is never turned into a tap: a forced guess
   * on seven buttons is wrong 85.7% of the time, and the wrong answer is what
   * would get reinforced.
   */
  const expire = useCallback(
    (latencyMs: number) => {
      if (answered) return;
      record(null, latencyMs);
      draw();
    },
    [answered, record, draw],
  );

  const summary = useMemo(() => summarise(results), [results]);

  return {
    question,
    working,
    phase: answered ? (answered.correct ? 'correct' : 'wrong') : 'prompt',
    chosen: answered ? answered.chosen : null,
    correctCode: working.weekday,
    promptKey: `${questionKey(question)}#${round}`,
    answer,
    expire,
    advance: draw,
    results,
    summary,
  };
}
