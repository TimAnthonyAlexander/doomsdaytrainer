/**
 * Named colour roles, each resolving to a `var(--token)` from `./tokens.ts`
 * rather than a hex literal, so every consumer follows the active theme mode
 * without being touched.
 *
 * New code should prefer a MUI theme key where one exists; these names are for
 * the places `sx` needs a raw colour.
 */
import { cssVar, BUCKET_COUNT } from './tokens';

export const palette = {
  ground: cssVar('bg'),
  paper: cssVar('surface-2'),
  surface: cssVar('surface-1'),
  ink: cssVar('text-primary'),
  inkMuted: cssVar('text-secondary'),
  inkFaint: cssVar('text-muted'),
  inkInverse: cssVar('text-inverse'),
  rule: cssVar('border'),
  ruleStrong: cssVar('border-strong'),

  /**
   * The brand. Reserved for the mastery ramp, progress, focus rings and
   * navigation. STYLEGUIDE.md §2: it must never appear on a control the user
   * taps during a rep, because the feedback flash has to own that moment.
   */
  brand: cssVar('brand'),
  brandDeep: cssVar('brand-deep'),
  brandTint: cssVar('brand-tint'),
  brandOnTint: cssVar('brand-on-tint'),

  /**
   * Grading. STYLEGUIDE.md §2 allows these in exactly two places: the feedback
   * flash, and the latency histogram. Anywhere else weakens the association and
   * the flash stops reading pre-attentively, so reach for a neutral or the
   * brand instead of borrowing one of these because the hue looks right.
   */
  gradeFast: cssVar('grade-fast'),
  gradeMedium: cssVar('grade-medium'),
  gradeSlow: cssVar('grade-slow'),
  gradeWrong: cssVar('grade-wrong'),
  gradeFastTint: cssVar('grade-fast-tint'),
  gradeWrongTint: cssVar('grade-wrong-tint'),

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
