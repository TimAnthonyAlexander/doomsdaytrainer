/**
 * WCAG contrast maths, kept framework-free so tokens can be derived from it.
 *
 * The mastery ramp picks its own text colour per step rather than committing to
 * one, and that decision has to be computed from the ramp values instead of
 * eyeballed. It lives here rather than in the stats feature because
 * `src/theme/tokens.ts` derives the per-step ink token from it at module load.
 */

function parseHex(hex: string): [number, number, number] {
  const raw = hex.trim().replace('#', '');
  const full =
    raw.length === 3 ? `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}` : raw.slice(0, 6);
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) {
    throw new Error(`Not a hex colour: ${hex}`);
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function linearise(channel8: number): number {
  const s = channel8 / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(linearise) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. Order of the arguments does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Whichever of `a` or `b` reads better on `background`. Ties go to `a`. */
export function betterInk(background: string, a: string, b: string): string {
  return contrastRatio(background, a) >= contrastRatio(background, b) ? a : b;
}
