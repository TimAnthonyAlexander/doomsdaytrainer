import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';

export interface AnswerTimer {
  /**
   * Millis from the paint of the current prompt to now. 0 until the prompt has
   * actually been painted, so a tap that somehow lands earlier is never scored
   * as a negative or absurdly small latency.
   */
  elapsedMs: () => number;
  /** True once the browser has painted the current prompt. */
  running: () => boolean;
}

type Frame = { cancel: () => void };

/**
 * Schedules `run` for after the next paint. `requestAnimationFrame` fires
 * before paint in the same frame, so the callback is deferred one extra tick
 * where a real rAF exists; environments without one fall back to a timeout.
 */
function afterPaint(run: () => void): Frame {
  if (typeof requestAnimationFrame !== 'function') {
    const id = setTimeout(run, 0);
    return { cancel: () => clearTimeout(id) };
  }
  let inner: ReturnType<typeof setTimeout> | null = null;
  const raf = requestAnimationFrame(() => {
    inner = setTimeout(run, 0);
  });
  return {
    cancel: () => {
      cancelAnimationFrame(raf);
      if (inner !== null) clearTimeout(inner);
    },
  };
}

/**
 * The latency clock for one prompt.
 *
 * Grades are derived from latency, so the zero point has to be the moment the
 * user could first see the prompt. React's commit is too early: layout and
 * paint still have to happen, and on a cold route that gap is tens of millis.
 * The clock therefore starts in a `useLayoutEffect` that waits for the frame
 * after the commit, and restarts whenever `promptKey` changes.
 *
 * `armed` is the same rule applied to a prompt that is painted but not yet
 * readable. A prompt that arrives on a split-flap is on screen from the first
 * frame and says the wrong thing for the length of the flip: the top half
 * carries the new glyph while the bottom half still carries the old one. Paint
 * is therefore no longer the moment the user could first see the prompt, and
 * starting the clock there would add the flip's duration to every stored
 * latency — which crosses the thresholds in Settings, so it would silently
 * change `gradeFor`, then fluency, then the mastery bucket, then every median
 * on Stats, and break comparability with all the history already recorded.
 *
 * Passing `false` holds the clock at zero. `AnswerPad` already refuses a tap
 * while the clock is not running, so an unarmed prompt is inert rather than
 * mistimed, which is the same treatment a not-yet-painted prompt has always
 * had. Defaults to `true`, so every caller that does not animate its prompt
 * behaves exactly as before.
 */
export function useAnswerTimer(promptKey: string | number, armed = true): AnswerTimer {
  const startedAt = useRef<number | null>(null);

  useLayoutEffect(() => {
    startedAt.current = null;
    if (!armed) return;
    const frame = afterPaint(() => {
      startedAt.current = performance.now();
    });
    return () => frame.cancel();
  }, [promptKey, armed]);

  const elapsedMs = useCallback(() => {
    if (startedAt.current === null) return 0;
    return Math.max(0, performance.now() - startedAt.current);
  }, []);

  const running = useCallback(() => startedAt.current !== null, []);

  return useMemo(() => ({ elapsedMs, running }), [elapsedMs, running]);
}
