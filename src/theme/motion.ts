/**
 * Motion, as the rest of the app is allowed to reach for it.
 *
 * STYLEGUIDE.md §7 fixes five durations and one easing curve, and
 * `./tokens.ts` is the authority on their values. This module exists because
 * those numbers were declared and then almost entirely unconsumed: components
 * were writing `140ms ease-out` by hand, which is neither a token nor the
 * token's curve, so the one place the durations could be changed was not the
 * place they were written.
 *
 * Everything here resolves to a `var(--dur-*)` rather than a number, for the
 * same reason `palette.ts` resolves to `var(--…)` rather than a hex: the
 * stylesheet zeroes those variables under `prefers-reduced-motion` and a
 * component holding the literal `180` would keep animating.
 */
import { useEffect, useState } from 'react';

/**
 * The durations, as CSS values.
 *
 * `instant` is 0ms and is not a rounding of "very fast". §7 and §9 both require
 * the feedback fill to be on screen in the same frame as the tap: a grading
 * colour that ramps has already stopped being pre-attentive by the time it
 * arrives, and the grade it reports was decided before the ramp started.
 */
export const dur = {
  instant: 'var(--dur-instant)',
  advance: 'var(--dur-advance)',
  flash: 'var(--dur-flash)',
  ui: 'var(--dur-ui)',
  hold: 'var(--dur-hold)',
} as const;

export const ease = { out: 'var(--ease-out)' } as const;

/** `transition` shorthand for one or more properties on one duration. */
export function transition(properties: readonly string[], duration: string): string {
  return properties.map((property) => `${property} ${duration} ${ease.out}`).join(', ');
}

/**
 * The colour transition every keypad-like surface shares.
 *
 * Deliberately `instant`. The pad's tones are feedback, and §7 puts feedback on
 * the tap frame. This is a named export rather than a literal in each pad so
 * the two pads cannot drift apart again, which is exactly how they came to
 * share a hand-written `140ms ease-out` that matched no token.
 */
export const FEEDBACK_TRANSITION = transition(
  ['background-color', 'color', 'box-shadow'],
  dur.instant,
);

const REDUCED = '(prefers-reduced-motion: reduce)';

/**
 * Whether the user has asked for reduced motion.
 *
 * The stylesheet already clamps every CSS `animation-duration` and
 * `transition-duration` under this query, so anything expressed as a CSS
 * transition needs nothing from this hook. It is for the cases CSS cannot
 * reach: an animation whose *structure* changes rather than its speed, and
 * anything driven from JavaScript, which the media query does not touch at all.
 *
 * A zeroed keyframe still runs, and a split-flap whose static halves hold the
 * old glyph would land on the wrong character in 0.01ms rather than never
 * showing it. Those cases have to branch, not just go faster.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(REDUCED).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(REDUCED);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    setReduced(query.matches);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * A per-item delay for a staggered reveal, capped so a long list cannot turn
 * into a wait.
 *
 * The cap is the point. A 45ms stagger over four rows is 135ms of sequencing;
 * the same stagger over a hundred mastery cells would be four and a half
 * seconds, which is no longer motion but a loading screen.
 */
export function stagger(index: number, stepMs: number, maxMs = 240): string {
  return `${Math.min(index * stepMs, maxMs)}ms`;
}
