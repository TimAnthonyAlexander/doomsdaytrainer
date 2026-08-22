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
 * The seven mastery buckets. Structure, not styling: the mastery grid's legend
 * and its cell labels both read these, and the count has to stay at seven.
 *
 * They stopped being pure interval buckets when the grid started reporting
 * fluency. `detail` is the one-line explanation the legend shows, because
 * "Still slow" on its own does not say what would move the cell along.
 */
export const masteryBuckets = [
  { label: 'Not started', detail: 'Not introduced yet.' },
  { label: 'Introduced', detail: 'Learned, not yet answered right in review.' },
  { label: 'Still slow', detail: 'Right, but worked out rather than recalled.' },
  { label: 'One fast answer', detail: 'Recalled once inside the fast threshold.' },
  { label: 'Fluent', detail: 'Two fast answers, on different days.' },
  { label: 'Fluent, 10–89 days', detail: 'Fast, and holding across weeks.' },
  { label: 'Fluent, 90 days +', detail: 'Fast, and holding across months.' },
] as const;
