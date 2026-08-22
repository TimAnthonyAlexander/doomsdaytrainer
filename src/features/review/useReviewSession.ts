import { useCallback, useMemo, useState } from 'react';
import type { Attempt, Code, ItemState, YearKey } from '@/domain/types';
import { dueItems } from '@/domain/scheduler';
import { inScope, resolveScope } from '@/domain/scope';
import { codeFor } from '@/domain/yearCodes';
import { useAppState } from '@/state/useAppState';
import { itemKey } from '@/storage/defaults';
import { hintFor, shouldAutoHint, type Hint } from './hints';
import type { SessionResult } from './summary';

export type ReviewPhase = 'prompt' | 'correct' | 'wrong';

interface AnsweredState {
  yy: YearKey;
  chosen: Code;
  correct: boolean;
  /** Frozen at answer time so the panel cannot change under the feedback. */
  autoHint: boolean;
}

export interface ReviewSession {
  /** The item on screen, or null when nothing is due. */
  item: ItemState | null;
  phase: ReviewPhase;
  /** What the user tapped, once they have. */
  chosen: Code | null;
  correctCode: Code | null;
  /** Restarts the pad's latency clock. Changes on every advance. */
  promptKey: string;
  /** Non-null whenever a hint is on screen, asked for or not. */
  hint: Hint | null;
  /** True when the hint appeared because the item keeps failing. */
  autoHint: boolean;
  openHint: () => void;
  answer: (value: number, latencyMs: number) => void;
  advance: () => void;
  results: SessionResult[];
  /** Items still due after the ones already answered this session. */
  remaining: number;
  /** Any item introduced at all, in or out of scope. Guards the empty screen. */
  introducedCount: number;
  /** In scope and never introduced. Non-zero means Learn still has something. */
  unlearnedCount: number;
  nextDueAt: number | null;
}

/**
 * The review loop's state. Owns the queue, the current item and the session
 * tally; owns no grading — `recordReview` runs the domain scheduler.
 */
export function useReviewSession(): ReviewSession {
  const { itemList, items, settings, recordReview, noteSessionActivity } = useAppState();

  const [answered, setAnswered] = useState<AnsweredState | null>(null);
  const [round, setRound] = useState(0);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [hintOpen, setHintOpen] = useState(false);

  const scope = useMemo(() => resolveScope(settings), [settings]);

  // Recomputed whenever an answer changes the store, which is the only moment
  // the queue can change during a session. Ordering is the domain layer's.
  const queue = useMemo(() => dueItems(itemList, scope, Date.now()), [itemList, scope]);

  const pinned = answered ? (items[itemKey(answered.yy)] ?? null) : null;
  const item = pinned ?? queue[0] ?? null;

  const introducedCount = useMemo(
    () => itemList.filter((entry) => entry.introduced).length,
    [itemList],
  );

  const unlearnedCount = useMemo(
    () => itemList.filter((entry) => !entry.introduced && inScope(entry.yy, scope)).length,
    [itemList, scope],
  );

  const nextDueAt = useMemo(() => {
    const now = Date.now();
    let soonest: number | null = null;
    for (const entry of itemList) {
      if (!entry.introduced || !inScope(entry.yy, scope)) continue;
      if (entry.dueAt <= now) continue;
      if (soonest === null || entry.dueAt < soonest) soonest = entry.dueAt;
    }
    return soonest;
  }, [itemList, scope]);

  const autoHint = answered ? answered.autoHint : item !== null && shouldAutoHint(item);
  const hintVisible = hintOpen || autoHint;

  const hint = useMemo(() => {
    if (!item || !hintVisible) return null;
    return hintFor(item.yy, settings.hintType, (candidate) => items[itemKey(candidate)]);
  }, [item, hintVisible, settings.hintType, items]);

  const openHint = useCallback(() => setHintOpen(true), []);

  const answer = useCallback(
    (value: number, latencyMs: number) => {
      if (!item || answered) return;

      const correctCode = codeFor(item.yy);
      const correct = value === correctCode;
      const latency = Math.round(latencyMs);
      // A hint on screen caps the grade at 3 whether or not it was asked for:
      // the help was given either way, and the domain layer applies the cap.
      const hintUsed = hintOpen || shouldAutoHint(item);

      const attempt: Attempt = {
        timestamp: Date.now(),
        correct,
        latencyMs: latency,
        answered: value as Code,
        hintUsed,
        source: 'review',
      };

      setAnswered({ yy: item.yy, chosen: value as Code, correct, autoHint: shouldAutoHint(item) });
      setResults((prev) => [...prev, { correct, latencyMs: latency }]);

      void recordReview(item.yy, attempt).then(() => noteSessionActivity('review', 1));
    },
    [item, answered, hintOpen, recordReview, noteSessionActivity],
  );

  const advance = useCallback(() => {
    setAnswered(null);
    setHintOpen(false);
    setRound((value) => value + 1);
  }, []);

  const phase: ReviewPhase = answered ? (answered.correct ? 'correct' : 'wrong') : 'prompt';

  return {
    item,
    phase,
    chosen: answered ? answered.chosen : null,
    correctCode: item ? codeFor(item.yy) : null,
    promptKey: `${item ? item.yy : 'none'}#${round}`,
    hint,
    autoHint,
    openHint,
    answer,
    advance,
    results,
    remaining: queue.length,
    introducedCount,
    unlearnedCount,
    nextDueAt,
  };
}
