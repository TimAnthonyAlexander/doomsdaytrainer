import { act } from '@testing-library/react';

/**
 * Waits for the frame that starts an answer pad's latency clock.
 *
 * `useAnswerTimer` takes its zero point one frame after the commit, because the
 * commit is not the moment the user can see the prompt. The pads refuse a tap
 * before that frame: a tap that early cannot be an answer to a prompt nobody
 * has looked at yet, and scoring it would record 0ms.
 *
 * A real browser delivers the frame in about 16ms, well inside the time it
 * takes a hand to move. jsdom delivers it on a timer that a test clicking
 * straight after `findBy` beats every time, so tests wait for it here instead.
 */
export async function nextPaint(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    });
  });
}
