import { useEffect, useRef } from 'react';
import { playClip, preloadClip } from './speech';

/**
 * Speaks a clip when a new prompt appears, and warms the one behind it.
 *
 * An effect rather than something on the tap handler, because what is spoken
 * belongs to the prompt on screen, not to the tap that brought it there. It
 * fires on the same commit that paints the prompt and returns immediately:
 * nothing waits for the clip, and a clip that never arrives changes nothing
 * about what the screen does or what it records.
 *
 * `token` is what counts as a new prompt. It defaults to the url, which is
 * right when consecutive prompts are always different years. Review needs its
 * own, because a queue with one item in it asks the same year twice in a row
 * and both times are new prompts, while a correction tap after a wrong answer
 * is not one and must not speak over the correction.
 *
 * `enabled` false creates no element and fetches nothing.
 */
export function useSpokenPrompt(
  url: string | null,
  enabled: boolean,
  next?: string | null,
  token?: string | number,
): void {
  const urlRef = useRef(url);
  urlRef.current = url;
  const key = token ?? url;

  useEffect(() => {
    if (!enabled) return;
    const current = urlRef.current;
    if (current) playClip(current);
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled || !next) return;
    preloadClip(next);
  }, [next, enabled]);
}
