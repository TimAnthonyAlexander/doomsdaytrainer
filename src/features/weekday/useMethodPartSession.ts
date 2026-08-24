import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Code, MethodPart, MethodPartAttempt, WeekdayRangeId } from '@/domain/types';
import {
  datePartAnswer,
  explainDatePart,
  explainYearPart,
  yearPartAnswer,
  type MethodPartLine,
} from '@/domain/methodParts';
import { useAppState } from '@/state/useAppState';
import type { SessionResult } from '@/features/review/summary';
import { rangeById } from './datePool';
import {
  nextPartPrompt,
  partPromptKey,
  rememberPrompt,
  type PartPrompt,
} from './partPool';

export type MethodPartPhase = 'prompt' | 'correct' | 'wrong';

interface AnsweredState {
  chosen: Code;
  correct: boolean;
}

export interface MethodPartSession {
  prompt: PartPrompt;
  /** The right answer, 0..6. */
  correctCode: Code;
  /** Every number behind that answer, each with the label naming it. */
  lines: MethodPartLine[];
  phase: MethodPartPhase;
  chosen: Code | null;
  /** Restarts the pad's latency clock. Changes on every advance. */
  promptKey: string;
  answer: (value: number, latencyMs: number) => void;
  advance: () => void;
  /**
   * Everything answered on this half since the screen opened. Cleared when the
   * half changes, because the two are different tasks and one median over both
   * would describe neither — the same rule that keeps assisted and unassisted
   * on separate lines.
   */
  results: SessionResult[];
}

/**
 * One half of the method, asked over and over.
 *
 * Neither half schedules anything, for the reasons in `MethodPartAttempt`: a
 * year is not a fixed item set the way the 100 codes are, a (month, day) pair
 * is not one either, and a wrong year half cannot say whether the century
 * anchor or the year code was the miss. It draws a prompt, records what was
 * answered and how long it took, and that is all.
 *
 * There is no run history here, unlike the full-date trainer. A run there
 * exists so a personal best can belong to the mode and range it was set under;
 * nothing on these two screens claims a best, so a run would be a record
 * nobody reads.
 */
export function useMethodPartSession(
  part: MethodPart,
  rangeId: WeekdayRangeId,
): MethodPartSession {
  const { recordMethodPartAttempt } = useAppState();

  // Fixed at mount so the "living memory" bound cannot move mid-session.
  const startedAt = useRef(Date.now());
  const range = useMemo(() => rangeById(rangeId, startedAt.current), [rangeId]);

  const recent = useRef<string[]>([]);
  const [prompt, setPrompt] = useState<PartPrompt>(() => {
    const first = nextPartPrompt(part, range, new Set());
    recent.current = rememberPrompt(recent.current, partPromptKey(first));
    return first;
  });
  const [answered, setAnswered] = useState<AnsweredState | null>(null);
  const [round, setRound] = useState(0);
  const [results, setResults] = useState<SessionResult[]>([]);

  const draw = useCallback(() => {
    const drawn = nextPartPrompt(part, range, new Set(recent.current));
    recent.current = rememberPrompt(recent.current, partPromptKey(drawn));
    return drawn;
  }, [part, range]);

  // The open results belong to the half and range they were answered under, so
  // changing either clears them and draws a fresh prompt. The year half's range
  // is which years it draws from; the date half has no year and ignores it,
  // which is why the screen does not offer the control there.
  const settingKey = `${part}|${rangeId}`;
  const lastSetting = useRef(settingKey);
  useEffect(() => {
    if (lastSetting.current === settingKey) return;
    lastSetting.current = settingKey;
    setAnswered(null);
    setResults([]);
    setPrompt(draw());
    setRound((value) => value + 1);
  }, [settingKey, draw]);

  const correctCode = useMemo(
    () => (prompt.part === 'year' ? yearPartAnswer(prompt.question) : datePartAnswer(prompt.question)),
    [prompt],
  );

  const lines = useMemo(
    () =>
      prompt.part === 'year'
        ? explainYearPart(prompt.question).lines
        : explainDatePart(prompt.question).lines,
    [prompt],
  );

  const answer = useCallback(
    (value: number, latencyMs: number) => {
      if (answered) return;
      const correct = value === correctCode;
      const latency = Math.round(latencyMs);

      setAnswered({ chosen: value as Code, correct });
      setResults((previous) => [...previous, { correct, latencyMs: latency }]);

      const attempt: MethodPartAttempt =
        prompt.part === 'year'
          ? {
              part: 'year',
              timestamp: Date.now(),
              fullYear: prompt.question.fullYear,
              correct,
              latencyMs: latency,
              answered: value as Code,
            }
          : {
              part: 'date',
              timestamp: Date.now(),
              month: prompt.question.month,
              day: prompt.question.day,
              leapYear: prompt.question.leapYear,
              correct,
              latencyMs: latency,
              answered: value as Code,
            };
      void recordMethodPartAttempt(attempt);
    },
    [answered, correctCode, prompt, recordMethodPartAttempt],
  );

  const advance = useCallback(() => {
    setAnswered(null);
    setPrompt(draw());
    setRound((value) => value + 1);
  }, [draw]);

  return {
    prompt,
    correctCode,
    lines,
    phase: answered ? (answered.correct ? 'correct' : 'wrong') : 'prompt',
    chosen: answered ? answered.chosen : null,
    promptKey: `${partPromptKey(prompt)}#${round}`,
    answer,
    advance,
    results,
  };
}
