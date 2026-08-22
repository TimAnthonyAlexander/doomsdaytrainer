import { useCallback, useMemo, useState } from 'react';
import type { Attempt, Code, ItemState, YearKey } from '@/domain/types';
import { resolveScope } from '@/domain/scope';
import { codeFor } from '@/domain/yearCodes';
import { structuralHint, type Hint } from '@/features/review/hints';
import type { ReviewPhase } from '@/features/review/useReviewSession';
import type { SessionResult } from '@/features/review/summary';
import { useAppState } from '@/state/useAppState';
import { itemKey } from '@/storage/defaults';
import { troubleItems } from './troublePool';

interface AnsweredState {
  yy: YearKey;
  chosen: Code;
  correct: boolean;
}

export interface TroubleSession {
  /** The item on screen, or null when the drill is over or was never needed. */
  item: ItemState | null;
  phase: ReviewPhase;
  chosen: Code | null;
  correctCode: Code | null;
  promptKey: string;
  /** Always present. The block is the point of this drill. */
  hint: Hint | null;
  answer: (value: number, latencyMs: number) => void;
  advance: () => void;
  results: SessionResult[];
  /** Flagged items left after the ones already answered this session. */
  remaining: number;
  /** Flagged items right now, answered ones included. Zero means nothing to do. */
  poolSize: number;
}

/**
 * The trouble-spot loop. Same shape as the review session, three differences:
 * the queue is the leech pool rather than what is due, the structural hint is on
 * screen before the answer instead of behind a button, and every attempt is
 * recorded with `source: 'trouble'` — which `applyReview` accepts, so these
 * answers do reschedule. The permanent hint means `hintUsed` is always true and
 * the grade is capped at 3: an item you can only get with the block in front of
 * you has not been recovered.
 */
export function useTroubleSession(): TroubleSession {
  const { itemList, items, settings, recordReview, noteSessionActivity } = useAppState();

  const [answered, setAnswered] = useState<AnsweredState | null>(null);
  const [seen, setSeen] = useState<YearKey[]>([]);
  const [round, setRound] = useState(0);
  const [results, setResults] = useState<SessionResult[]>([]);

  const scope = useMemo(() => resolveScope(settings), [settings]);
  const pool = useMemo(() => troubleItems(itemList, scope), [itemList, scope]);

  // A wrong answer here leaves the item due immediately, so without this the
  // queue would hand back the same year forever. One pass per session.
  const queue = useMemo(() => pool.filter((item) => !seen.includes(item.yy)), [pool, seen]);

  const pinned = answered ? (items[itemKey(answered.yy)] ?? null) : null;
  const item = pinned ?? queue[0] ?? null;

  const hint = useMemo(() => (item ? structuralHint(item.yy) : null), [item]);

  const answer = useCallback(
    (value: number, latencyMs: number) => {
      if (!item || answered) return;

      const correct = value === codeFor(item.yy);
      const latency = Math.round(latencyMs);

      const attempt: Attempt = {
        timestamp: Date.now(),
        correct,
        latencyMs: latency,
        answered: value as Code,
        hintUsed: true,
        source: 'trouble',
      };

      setAnswered({ yy: item.yy, chosen: value as Code, correct });
      setSeen((prev) => [...prev, item.yy]);
      setResults((prev) => [...prev, { correct, latencyMs: latency }]);

      void recordReview(item.yy, attempt).then(() => noteSessionActivity('review', 1));
    },
    [item, answered, recordReview, noteSessionActivity],
  );

  const advance = useCallback(() => {
    setAnswered(null);
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
    answer,
    advance,
    results,
    remaining: queue.length,
    poolSize: pool.length,
  };
}
