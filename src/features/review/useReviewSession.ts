import { useCallback, useMemo, useState } from 'react';
import type { Attempt, Code, ItemState, YearKey } from '@/domain/types';
import { dueItems, nextDueItem } from '@/domain/scheduler';
import { LOOKBACK } from '@/domain/rotation';
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
  /** The answer window ran out. Shows the hint; never records anything. */
  expire: () => void;
  answer: (value: number, latencyMs: number) => void;
  advance: () => void;
  results: SessionResult[];
  /** Best guess at the year after this one. Used only to preload its clip. */
  upcoming: YearKey | null;
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
  const [retries, setRetries] = useState(0);
  const [timedOut, setTimedOut] = useState(0);

  const scope = useMemo(() => resolveScope(settings), [settings]);

  // Recomputed whenever an answer changes the store, which is the only moment
  // the queue can change during a session. Ordering is the domain layer's.
  const queue = useMemo(() => dueItems(itemList, scope, Date.now()), [itemList, scope]);

  // Years already asked this session, oldest first. The queue is due-ordered,
  // but asking 64 straight after 63 lets the step answer it, so the rest of a
  // decade is passed over for a few prompts once one of its years comes up.
  // Anki buries siblings for the same reason; these are cousins rather than
  // siblings, which is why it has to be a rule of our own.
  const [recent, setRecent] = useState<YearKey[]>([]);

  const pinned = answered ? (items[itemKey(answered.yy)] ?? null) : null;
  const item = pinned ?? nextDueItem(queue, recent);

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
  const hintVisible = hintOpen || autoHint || timedOut > 0;

  const hint = useMemo(() => {
    if (!item || !hintVisible) return null;
    return hintFor(item.yy, settings.hintType, (candidate) => items[itemKey(candidate)]);
  }, [item, hintVisible, settings.hintType, items]);

  const openHint = useCallback(() => setHintOpen(true), []);

  /**
   * The optional answer window ran out.
   *
   * It shows the hint and reopens the pad. It does not record an attempt and it
   * does not advance: a deadline that turned into a tap would be scoring a
   * forced guess, and Seabrooke et al. (2019) found guessing before feedback
   * improves memory for the items while *impairing* cued recall of the link,
   * which is the one thing this app is trying to build. The hint the user now
   * has caps the grade at 3 when they do answer, which is the honest price.
   */
  const expire = useCallback(() => setTimedOut((count) => count + 1), []);

  const advance = useCallback(() => {
    setAnswered(null);
    setHintOpen(false);
    setRetries(0);
    setTimedOut(0);
    setRound((value) => value + 1);
  }, []);

  const answer = useCallback(
    (value: number, latencyMs: number) => {
      if (!item) return;

      // After a wrong answer the year stays put. The only way on is to tap the
      // code it actually has, so the right pairing is the last thing the hand
      // does before the next prompt. Nothing is recorded here: the attempt was
      // already graded, and a correction is not a second review.
      if (answered) {
        if (!answered.correct) {
          if (value === codeFor(item.yy)) advance();
          // Counted so the pad, which answers once per prompt key, will take
          // the next correction tap.
          else setRetries((count) => count + 1);
        }
        return;
      }

      const correctCode = codeFor(item.yy);
      const correct = value === correctCode;
      const latency = Math.round(latencyMs);
      // A hint on screen caps the grade at 3 whether or not it was asked for:
      // the help was given either way, and the domain layer applies the cap.
      const hintUsed = hintOpen || timedOut > 0 || shouldAutoHint(item);

      const attempt: Attempt = {
        timestamp: Date.now(),
        correct,
        latencyMs: latency,
        answered: value as Code,
        hintUsed,
        source: 'review',
        // Marked, not compensated for. The clock still runs from paint to tap,
        // because moving it to the end of the clip would let an answer given
        // while the year was still being spoken measure as negative and take a
        // free grade 5 — the exact bug the paint-to-tap rule exists to stop.
        // Stats reads this to say how much of the recent median was listening.
        audioPlayed: settings.spokenReviewPrompts,
      };

      setAnswered({ yy: item.yy, chosen: value as Code, correct, autoHint: shouldAutoHint(item) });
      setResults((prev) => [...prev, { correct, latencyMs: latency }]);
      setRecent((prev) => [...prev, item.yy].slice(-LOOKBACK));

      void recordReview(item.yy, attempt).then(() => noteSessionActivity('review', 1));
    },
    [
      item,
      answered,
      hintOpen,
      timedOut,
      settings.spokenReviewPrompts,
      recordReview,
      noteSessionActivity,
      advance,
    ],
  );

  // Only used to warm the next spoken clip, so a miss costs nothing: the year
  // that actually comes up next depends on what this answer does to the queue.
  const upcoming = useMemo(() => {
    if (!item) return null;
    const rest = queue.filter((entry) => entry.yy !== item.yy);
    return nextDueItem(rest, [...recent, item.yy])?.yy ?? null;
  }, [queue, item, recent]);

  const phase: ReviewPhase = answered ? (answered.correct ? 'correct' : 'wrong') : 'prompt';

  return {
    item,
    phase,
    chosen: answered ? answered.chosen : null,
    correctCode: item ? codeFor(item.yy) : null,
    // Phase is in the key so the correction tap after a wrong answer is a fresh
    // prompt to the pad. Without it the pad, which answers once per key, would
    // swallow it.
    // The timeout is in the key too: the pad closes itself when the window
    // runs out, so it needs a new prompt before it will take the answer.
    promptKey: `${item ? item.yy : 'none'}#${round}#${phase}#${retries}#${timedOut}`,
    hint,
    autoHint,
    openHint,
    expire,
    answer,
    advance,
    results,
    upcoming,
    remaining: queue.length,
    introducedCount,
    unlearnedCount,
    nextDueAt,
  };
}
