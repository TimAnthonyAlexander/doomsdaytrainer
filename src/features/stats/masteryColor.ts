import type { ItemState } from '@/domain/types';
import { masteryBucket } from '@/domain/scheduler';
import { masteryBuckets } from '@/theme/palette';
import { contrastRatio as rawContrast, relativeLuminance as rawLuminance } from '@/theme/contrast';
import {
  BUCKET_COUNT,
  colorTokens,
  cssVar,
  masteryRamp,
  resolveColor,
  type ThemeMode,
} from '@/theme/tokens';

/**
 * The mastery ramp is the only colour scale in the app, so everything that
 * reads it goes through here rather than indexing the tokens directly.
 *
 * The colours returned are `var(--mastery-N)` references, not hex, so a cell
 * follows the mode without re-rendering. Anything that needs a number — the
 * contrast helpers below, the legend's decision about whether a swatch needs an
 * outline — resolves the reference against the mode the document is actually in.
 */

export { BUCKET_COUNT };

/** The mode stamped on the html element by index.html, then by the provider. */
export function documentMode(): ThemeMode {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function clampBucket(bucket: number): number {
  if (!Number.isFinite(bucket)) return 0;
  return Math.min(BUCKET_COUNT - 1, Math.max(0, Math.round(bucket)));
}

export function bucketColor(bucket: number): string {
  return cssVar(`mastery-${clampBucket(bucket)}`);
}

/**
 * The text colour for a cell of that bucket, resolved when the tokens were
 * written rather than at render time. Whichever of `--text-primary` and
 * `--text-inverse` reads better on the step, per mode.
 */
export function bucketInk(bucket: number): string {
  return cssVar(`mastery-${clampBucket(bucket)}-ink`);
}

/**
 * Steps 0 and 1 are deliberately near-identical — an unseen item and a
 * barely-introduced one are functionally the same thing — so the grid separates
 * cells with a hairline instead of with a colour step. Every cell takes it, in
 * both modes, or the pair reads as one block.
 */
export const CELL_BORDER = `1px solid ${cssVar('border')}`;

export function bucketLabel(bucket: number): string {
  return masteryBuckets[clampBucket(bucket)].label;
}

export function itemColor(item: ItemState): string {
  return bucketColor(masteryBucket(item));
}

/* ------------------------------------------------------------------ */
/* Contrast                                                            */
/* ------------------------------------------------------------------ */

/**
 * WCAG relative luminance, 0 (black) to 1 (white). Accepts a hex colour or a
 * `var(--token)` reference, which is resolved against `mode`.
 */
export function relativeLuminance(color: string, mode: ThemeMode = documentMode()): number {
  return rawLuminance(resolveColor(color, mode));
}

/** WCAG contrast ratio, 1 to 21. Order of the arguments does not matter. */
export function contrastRatio(
  a: string,
  b: string,
  mode: ThemeMode = documentMode(),
): number {
  return rawContrast(resolveColor(a, mode), resolveColor(b, mode));
}

/**
 * Ink or its inverse, whichever has more contrast against `background`.
 *
 * The year printed inside a grid cell has to stay legible across a seven-step
 * ramp and the flip happens partway up it, differently in each mode. Computed,
 * not guessed. For a ramp step prefer `bucketInk()`, which reads the answer
 * straight off the tokens.
 */
export function readableInk(background: string, mode: ThemeMode = documentMode()): string {
  const fill = resolveColor(background, mode);
  const primary = colorTokens[mode]['text-primary'];
  const inverse = colorTokens[mode]['text-inverse'];
  return rawContrast(fill, primary) >= rawContrast(fill, inverse)
    ? cssVar('text-primary')
    : cssVar('text-inverse');
}

/** The ramp as raw hex for a given mode. For audits and tests, not for render. */
export { masteryRamp };
