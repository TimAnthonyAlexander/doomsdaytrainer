import { useCallback, useMemo, useState } from 'react';
import type { Attempt } from '@/domain/types';
import { useAppState } from '@/state/useAppState';
import { summarise, type SessionResult } from '@/features/review/summary';
import {
  allTableEntries,
  entryAccepted,
  entryAccepts,
  entryAnswer,
  entryId,
  entryPrompts,
  nextTableDueAt,
  tableQueue,
  type TableEntry,
  type TablePrompt,
} from './tableDrill';

export type TablePhase = 'prompt' | 'correct' | 'wrong';

interface PartResult {
  leapYear: boolean;
  chosen: number;
  correct: boolean;
  latencyMs: number;
}

interface AnsweredState {
  id: string;
  chosen: number;
  correct: boolean;
}

export interface TableSession {
  /** The item on screen, or null when the queue is empty. */
  entry: TableEntry | null;
  /** The question being asked of it. January and February ask two. */
  prompt: TablePrompt | null;
  /** How many questions this entry asks: two for January and February, one otherwise. */
  partCount: number;
  phase: TablePhase;
  chosen: number | null;
  /** The taught answer to the current prompt. */
  canonical: number | null;
  /** Every answer the current prompt accepts. */
  accepted: readonly number[];
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
 *
 * January and February are two questions and one item. Both halves are asked
 * before anything is written, and one attempt is recorded for the pair: correct
 * only if both halves were, timed by the slower of the two. The slower rather
 * than the sum, because the thresholds in Settings are the price of *an*
 * answer — summing two taps would put those two months permanently a grade
 * below the other ten for no reason but having been asked twice. Two separate
 * reviews of one item in one sitting would be worse still: it would advance the
 * interval twice for a single showing.
 */
export function useTableSession(): TableSession {
  const { monthItems, centuryItems, reviewTableItem } = useAppState();

  const [answered, setAnswered] = useState<AnsweredState | null>(null);
  const [parts, setParts] = useState<PartResult[]>([]);
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

  // While an entry is only part-answered nothing has been written, so the queue
  // has not moved and its head is still that entry. Pinning matters after the
  // last part, when the write has already taken it out of the queue.
  const pinned = answered
    ? (allTableEntries(monthItems, centuryItems).find(
        (item) => entryId(item.kind, item.key) === answered.id,
      ) ?? null)
    : null;
  const entry = pinned ?? queue[0] ?? null;

  const prompts = useMemo(
    () => (entry ? entryPrompts(entry.kind, entry.key) : []),
    [entry],
  );
  const index = Math.min(answered ? Math.max(parts.length - 1, 0) : parts.length, Math.max(prompts.length - 1, 0));
  const prompt = prompts[index] ?? null;

  const nextDueAt = useMemo(
    () => nextTableDueAt(monthItems, centuryItems, Date.now()),
    [monthItems, centuryItems],
  );

  const answer = useCallback(
    (value: number, latencyMs: number) => {
      if (!entry || !prompt || answered) return;
      // Any date in the month that lands on the doomsday, not just the one the
      // table teaches, and it is a plain correct answer when it arrives. The
      // method does not have a "real" doomsday per month: it has an anchor, and
      // whichever of the month's three to five the user holds is theirs.
      const correct = entryAccepts(prompt.kind, prompt.key, prompt.leapYear, value);
      const latency = Math.round(latencyMs);

      const id = entryId(entry.kind, entry.key);
      const collected = [
        ...parts,
        { leapYear: prompt.leapYear, chosen: value, correct, latencyMs: latency },
      ];
      setParts(collected);
      setAnswered({ id, chosen: value, correct });

      if (collected.length < prompts.length) return;

      const allCorrect = collected.every((part) => part.correct);
      const attempt: Attempt = {
        timestamp: Date.now(),
        correct: allCorrect,
        latencyMs: Math.max(...collected.map((part) => part.latencyMs)),
        // What went wrong, when something did; otherwise the first tap. The
        // pair is one attempt, so only one number can be stored, and the wrong
        // half is the one worth having.
        answered: (collected.find((part) => !part.correct) ?? collected[0]).chosen,
        hintUsed: false,
        source: entry.kind,
      };

      setResults((prev) => [...prev, { correct: allCorrect, latencyMs: attempt.latencyMs }]);
      setDone((prev) => (prev.includes(id) ? prev : [...prev, id]));

      void reviewTableItem(entry.kind, entry.key, attempt);
    },
    [entry, prompt, prompts.length, parts, answered, reviewTableItem],
  );

  const totalParts = prompts.length;
  const advance = useCallback(() => {
    setAnswered(null);
    setRound((value) => value + 1);
    setParts((prev) => (prev.length >= totalParts ? [] : prev));
  }, [totalParts]);

  const practiseAll = useCallback(() => {
    setDone([]);
    setParts([]);
    setAnswered(null);
    setPractising(true);
  }, []);

  const summary = useMemo(() => summarise(results), [results]);

  const phase: TablePhase = answered ? (answered.correct ? 'correct' : 'wrong') : 'prompt';

  return {
    entry,
    prompt,
    partCount: Math.max(prompts.length, 1),
    phase,
    chosen: answered ? answered.chosen : null,
    canonical: prompt ? entryAnswer(prompt.kind, prompt.key, prompt.leapYear) : null,
    accepted: prompt ? entryAccepted(prompt.kind, prompt.key, prompt.leapYear) : [],
    promptKey: `${prompt ? `${entryId(prompt.kind, prompt.key)}:${prompt.leapYear ? 'leap' : 'common'}` : 'none'}#${round}`,
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
