import { useCallback, useMemo, useState } from 'react';
import type { Attempt } from '@/domain/types';
import { useAppState } from '@/state/useAppState';
import { summarise, type SessionResult } from '@/features/review/summary';
import {
  allTableEntries,
  entryAnswer,
  entryId,
  nextTableDueAt,
  tableQueue,
  type TableEntry,
} from './tableDrill';

export type TablePhase = 'prompt' | 'correct' | 'wrong';

interface AnsweredState {
  id: string;
  chosen: number;
  correct: boolean;
}

export interface TableSession {
  /** The item on screen, or null when the queue is empty. */
  entry: TableEntry | null;
  phase: TablePhase;
  chosen: number | null;
  correctAnswer: number | null;
  promptKey: string;
  answer: (value: number, latencyMs: number) => void;
  advance: () => void;
  results: SessionResult[];
  /** Items still queued after the ones already answered. */
  remaining: number;
  nextDueAt: number | null;
  /** True while the user has asked to go through all sixteen regardless. */
  practising: boolean;
  practiseAll: () => void;
  summary: ReturnType<typeof summarise>;
}

/**
 * The month/century drill.
 *
 * This is the only surface that schedules the sixteen supporting items, and it
 * does it the same way review does: the tap is the grade, latency and
 * correctness decide it, and the domain scheduler applies it.
 */
export function useTableSession(): TableSession {
  const { monthItems, centuryItems, reviewTableItem } = useAppState();

  const [answered, setAnswered] = useState<AnsweredState | null>(null);
  const [round, setRound] = useState(0);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [practising, setPractising] = useState(false);
  const [done, setDone] = useState<string[]>([]);

  const queue = useMemo(() => {
    const due = tableQueue(monthItems, centuryItems, Date.now());
    if (due.length > 0 || !practising) return due;
    // "Practise anyway": all sixteen, minus the ones already answered in this
    // pass, so the run ends rather than looping forever.
    return allTableEntries(monthItems, centuryItems).filter(
      (item) => !done.includes(entryId(item.kind, item.key)),
    );
  }, [monthItems, centuryItems, practising, done]);

  const pinned = answered
    ? (allTableEntries(monthItems, centuryItems).find(
        (item) => entryId(item.kind, item.key) === answered.id,
      ) ?? null)
    : null;
  const entry = pinned ?? queue[0] ?? null;

  const nextDueAt = useMemo(
    () => nextTableDueAt(monthItems, centuryItems, Date.now()),
    [monthItems, centuryItems],
  );

  const answer = useCallback(
    (value: number, latencyMs: number) => {
      if (!entry || answered) return;
      const correctAnswer = entryAnswer(entry.kind, entry.key);
      const correct = value === correctAnswer;
      const latency = Math.round(latencyMs);
      const id = entryId(entry.kind, entry.key);

      const attempt: Attempt = {
        timestamp: Date.now(),
        correct,
        latencyMs: latency,
        answered: value,
        hintUsed: false,
        source: entry.kind,
      };

      setAnswered({ id, chosen: value, correct });
      setResults((prev) => [...prev, { correct, latencyMs: latency }]);
      setDone((prev) => (prev.includes(id) ? prev : [...prev, id]));

      void reviewTableItem(entry.kind, entry.key, attempt);
    },
    [entry, answered, reviewTableItem],
  );

  const advance = useCallback(() => {
    setAnswered(null);
    setRound((value) => value + 1);
  }, []);

  const practiseAll = useCallback(() => {
    setDone([]);
    setPractising(true);
  }, []);

  const summary = useMemo(() => summarise(results), [results]);

  return {
    entry,
    phase: answered ? (answered.correct ? 'correct' : 'wrong') : 'prompt',
    chosen: answered ? answered.chosen : null,
    correctAnswer: entry ? entryAnswer(entry.kind, entry.key) : null,
    promptKey: `${entry ? entryId(entry.kind, entry.key) : 'none'}#${round}`,
    answer,
    advance,
    results,
    remaining: queue.length,
    nextDueAt,
    practising,
    practiseAll,
    summary,
  };
}
