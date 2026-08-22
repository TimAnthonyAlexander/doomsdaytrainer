/**
 * The old palette names, re-pointed at the tokens in `./tokens.ts`.
 *
 * Every value here is a `var(--token)` reference rather than a hex literal, so
 * the thirty-odd files that already import `palette` follow the mode without
 * being touched. New code should take the token from MUI's theme or from
 * `cssVar()`; these names are kept so the sweep can delete call sites instead of
 * rewriting them, and several no longer describe what they return.
 *
 * The app is purple now. `green`, `greenDeep`, `greenSoft`, `terracotta` and
 * `terracottaSoft` are the names of colours that are gone; they resolve to the
 * nearest token that plays the same role. Anything still reading them is a
 * sweep target.
 */
import { cssVar, BUCKET_COUNT } from './tokens';

export const palette = {
  ground: cssVar('bg'),
  paper: cssVar('surface-2'),
  ink: cssVar('text-primary'),
  inkMuted: cssVar('text-secondary'),
  inkFaint: cssVar('text-muted'),
  rule: cssVar('border'),

  /** @deprecated The brand is `--brand-deep`, and it is purple. */
  green: cssVar('brand-deep'),
  /** @deprecated Reads as ink on `--brand-tint`. Use `--brand-on-tint`. */
  greenDeep: cssVar('brand-on-tint'),
  /** @deprecated The tinted brand surface. Use `--brand-tint`. */
  greenSoft: cssVar('brand-tint'),

  /**
   * @deprecated There is no accent colour any more. This is the wrong-answer
   * grading colour, and STYLEGUIDE.md §2 says grading colours appear only in
   * the feedback flash and the latency histogram. Every other call site — the
   * leech marker on the mastery grid, destructive buttons, lapse counts — needs
   * a decision, not a rename.
   */
  terracotta: cssVar('grade-wrong'),
  /** @deprecated See `terracotta`. */
  terracottaSoft: cssVar('grade-wrong-tint'),

  /**
   * Mastery ramp, index 0..6. Not decorative: index maps to interval bucket.
   * 0 = never introduced, 6 = mature (interval >= 90d).
   *
   * These are token references, so they cannot be measured. Anything computing
   * contrast wants `masteryRamp(mode)` from `./tokens`; anything picking a text
   * colour for a cell wants `bucketInk()` from `@/features/stats/masteryColor`.
   */
  mastery: Array.from({ length: BUCKET_COUNT }, (_unused, index) =>
    cssVar(`mastery-${index}`),
  ) as readonly string[],
} as const;

/**
 * The seven interval buckets. Structure, not styling: the mastery grid's legend
 * and its cell labels both read these, and the count has to stay at seven.
 */
export const masteryBuckets = [
  { label: 'Not started', minInterval: -1 },
  { label: 'Learning', minInterval: 0 },
  { label: '1–3 days', minInterval: 1 },
  { label: '4–9 days', minInterval: 4 },
  { label: '10–29 days', minInterval: 10 },
  { label: '30–89 days', minInterval: 30 },
  { label: '90 days +', minInterval: 90 },
] as const;
