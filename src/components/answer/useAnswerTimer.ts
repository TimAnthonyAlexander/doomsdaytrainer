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
 */
export function useAnswerTimer(promptKey: string | number): AnswerTimer {
  const startedAt = useRef<number | null>(null);

  useLayoutEffect(() => {
    startedAt.current = null;
    const frame = afterPaint(() => {
      startedAt.current = performance.now();
    });
    return () => frame.cancel();
  }, [promptKey]);

  const elapsedMs = useCallback(() => {
    if (startedAt.current === null) return 0;
    return Math.max(0, performance.now() - startedAt.current);
  }, []);

  const running = useCallback(() => startedAt.current !== null, []);

  return useMemo(() => ({ elapsedMs, running }), [elapsedMs, running]);
}
