import type { Code, YearKey } from '@/domain/types';
import { orderVaried } from '@/domain/rotation';
import { codeFor } from '@/domain/yearCodes';

/**
 * The recall passes of a learn block.
 *
 * This used to be a single ascending pass where a wrong tap sent the user back
 * to the first year of the group. That is Ebbinghaus's serial anticipation
 * method almost exactly, and it is the most reliable way known to build a list
 * that can only be entered at its start: the run gets rehearsed from position
 * zero over and over, and the years in the middle are never once retrieved
 * cold. Young (1962) overlearned serial lists and still found no significant
 * transfer to the paired-associate versions of the same items. The order was
 * being learned instead of the pairs.
 *
 * What replaces it comes from Battig, Brown & Nelson (1963), who compared
 * constant and varied presentation order across five experiments. Constant
 * order genuinely helps — so the first pass keeps it — but switching to varied
 * order **after the first correct response to each pair** kept the whole
 * benefit. So that is the switch point, and it is per item rather than per
 * block: a year that has been produced once has nothing more to gain from
 * being asked in its place in the run.
 *
 * Two passes:
 *
 * 1. `ordered` — ascending, once through, each year until it is right. A wrong
 *    tap keeps the year on screen (the app's rule everywhere else) rather than
 *    restarting anything.
 * 2. `varied` — a rotation with no neighbours and no repeats adjacent, until
 *    every target year has been answered correctly `VARIED_STREAK` times in a
 *    row. A wrong tap costs that year its streak and nothing else.
 *
 * The varied pass can carry `mixIn` years the user already knows. They get
 * asked and they space the targets apart, but they gate nothing: the block ends
 * when the block's own years are clean.
 */

/** Correct answers in a row, in varied order, before a year is done. */
export const VARIED_STREAK = 2;

/** How far down the queue a year goes when it still needs another clean answer. */
export const REINSERT_GAP = 3;

export type RecallPhase = 'ordered' | 'varied';

export interface RecallState {
  phase: RecallPhase;
  /** The years this pass has to finish, ascending. Never reordered. */
  targets: YearKey[];
  /** Already-known years mixed in to space the targets. Gate nothing. */
  mixIn: YearKey[];
  /** The queue for the current phase. The head is what is on screen. */
  queue: YearKey[];
  /** Correct answers in a row per year, during the varied phase. */
  streaks: Record<YearKey, number>;
  /** Wrong taps across both passes. */
  wrongTaps: number;
  /** Last wrong code tapped, and the year it was tapped for. Cleared on advance. */
  lastWrong: Code | null;
  lastWrongYear: YearKey | null;
  done: boolean;
  /** Varies the rotation between runs of the same block. */
  seed: number;
}

/**
 * `alreadyProduced` skips the ordered pass.
 *
 * The switch point is the first correct response **per pair**, so a year that
 * has already been produced in an earlier pass has spent its ordered ask.
 * Without this the block's final pass over all ten would open ascending a
 * second time, which is the defect the whole file exists to remove.
 */
export function startRecall(
  years: readonly YearKey[],
  seed = 0,
  mixIn: readonly YearKey[] = [],
  alreadyProduced = false,
): RecallState {
  const targets = [...years].sort((a, b) => a - b);
  const spacers = [...mixIn].filter((yy) => !targets.includes(yy));
  const queue = alreadyProduced ? orderVaried([...targets, ...spacers], seed) : targets;
  return {
    phase: alreadyProduced ? 'varied' : 'ordered',
    targets,
    mixIn: spacers,
    queue,
    streaks: Object.fromEntries(targets.map((yy) => [yy, 0])),
    wrongTaps: 0,
    lastWrong: null,
    lastWrongYear: null,
    done: targets.length === 0,
    seed,
  };
}

export function currentYear(state: RecallState): YearKey | null {
  return state.done ? null : (state.queue[0] ?? null);
}

/** True once this year has the clean run the block wants. */
export function isSettled(state: RecallState, yy: YearKey): boolean {
  return (state.streaks[yy] ?? 0) >= VARIED_STREAK;
}

/** Target years still needing a clean streak. */
export function remainingCount(state: RecallState): number {
  if (state.phase === 'ordered') return state.queue.length;
  return state.targets.filter((yy) => !isSettled(state, yy)).length;
}

/** How far through the pass the user is, as answered-out-of-total. */
export function progress(state: RecallState): { position: number; total: number } {
  if (state.phase === 'ordered') {
    return {
      position: Math.min(state.targets.length - state.queue.length + 1, state.targets.length),
      total: state.targets.length,
    };
  }
  const total = state.targets.length * VARIED_STREAK;
  const earned = state.targets.reduce(
    (sum, yy) => sum + Math.min(VARIED_STREAK, state.streaks[yy] ?? 0),
    0,
  );
  return { position: Math.min(earned + 1, total), total };
}

export interface RecallAnswer {
  state: RecallState;
  correct: boolean;
}

/**
 * Apply one tap. Never mutates. Answering a finished pass changes nothing.
 *
 * A wrong answer does not advance, on either pass. The way forward is tapping
 * the code the year actually has, so the last thing the hand does before the
 * next prompt is the right pairing — the same rule Review and Trouble follow.
 */
export function answerRecall(state: RecallState, chosen: Code): RecallAnswer {
  if (state.done) return { state, correct: false };

  const yy = state.queue[0];
  if (yy === undefined) return { state, correct: false };

  if (chosen !== codeFor(yy)) {
    return {
      state: {
        ...state,
        // The year stays on screen. Nothing restarts.
        wrongTaps: state.wrongTaps + 1,
        lastWrong: chosen,
        lastWrongYear: yy,
        streaks: yy in state.streaks ? { ...state.streaks, [yy]: 0 } : state.streaks,
      },
      correct: false,
    };
  }

  const cleared = { ...state, lastWrong: null, lastWrongYear: null };

  if (state.phase === 'ordered') {
    const queue = state.queue.slice(1);
    if (queue.length > 0) return { state: { ...cleared, queue }, correct: true };
    // Every year has been produced once, so constant order has given what it
    // has to give. Everything from here is varied.
    const varied = orderVaried([...state.targets, ...state.mixIn], state.seed);
    return {
      state: { ...cleared, phase: 'varied', queue: varied, done: varied.length === 0 },
      correct: true,
    };
  }

  const streaks =
    yy in state.streaks ? { ...state.streaks, [yy]: (state.streaks[yy] ?? 0) + 1 } : state.streaks;
  const next = { ...cleared, streaks };
  const queue = nextVariedQueue(next, yy);
  // Only the block's own years decide when the block is over. A mix-in is a
  // spacer: it gets asked, and it is never something the user is waiting on.
  const done = next.targets.every((year) => isSettled(next, year));
  return { state: { ...next, queue: done ? [] : queue, done }, correct: true };
}

/**
 * The queue after `answered` was cleared.
 *
 * A year that still needs a streak goes back in a few places down, never next:
 * asking it again immediately would let the answer just given carry the
 * retrieval rather than the pairing. When the queue is too short to hold that
 * gap — which is what the end of a block looks like — years that are already
 * settled are pulled back in as spacers. They cost a few taps and they are the
 * difference between a real gap and a repeat.
 */
function nextVariedQueue(state: RecallState, answered: YearKey): YearKey[] {
  // A settled target drops out for good. A mix-in goes to the back instead of
  // dropping out: consumed once, the spacing would run out halfway through the
  // pass and the tail of the block would collapse back into one decade.
  const rest = state.queue
    .slice(1)
    .filter((yy) => !state.targets.includes(yy) || !isSettled(state, yy));
  if (!state.targets.includes(answered)) return [...rest, answered];
  if (isSettled(state, answered)) return rest;

  const padded =
    rest.length >= REINSERT_GAP
      ? rest
      : [
          ...rest,
          ...spacersFor(state, answered, REINSERT_GAP - rest.length, rest[rest.length - 1]),
        ];
  const at = insertionPoint(padded, answered);
  return [...padded.slice(0, at), answered, ...padded.slice(at)];
}

/**
 * Where the answered year goes back in: at the gap, unless that would land it
 * beside another copy of itself, in which case one place further along.
 *
 * A batch is three or four years, not ten, and at that size the queue is
 * regularly shorter than the gap and padded out. Taking the gap as a fixed
 * index there could put the year immediately after a spacer that happened to be
 * the same year, and a year asked twice running is answered by the tap that was
 * just made rather than by the pairing — which is the one thing the gap exists
 * to prevent.
 */
function insertionPoint(queue: readonly YearKey[], yy: YearKey): number {
  for (let at = Math.min(REINSERT_GAP, queue.length); at <= queue.length; at += 1) {
    if (queue[at - 1] === yy || queue[at] === yy) continue;
    return at;
  }
  return queue.length;
}

/**
 * Settled years and mix-ins, used only to keep a year off its own heels.
 *
 * `previous` is whatever the spacers are being appended to, so the first one
 * never repeats it. Without that the padding itself creates the repeat it was
 * added to prevent, which is what happened on a pool of three.
 */
function spacersFor(
  state: RecallState,
  exclude: YearKey,
  count: number,
  previous: YearKey | undefined,
): YearKey[] {
  const pool = [...state.targets, ...state.mixIn].filter((yy) => yy !== exclude);
  if (pool.length === 0) return [];
  const rotated = orderVaried(pool, state.seed + state.wrongTaps + 1);

  const out: YearKey[] = [];
  let last = previous;
  for (let i = 0; out.length < count && i < count + rotated.length; i += 1) {
    const candidate = rotated[i % rotated.length];
    if (candidate === last && rotated.length > 1) continue;
    out.push(candidate);
    last = candidate;
  }
  return out;
}
