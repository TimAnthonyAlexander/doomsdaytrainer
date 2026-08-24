/**
 * The design tokens. STYLEGUIDE.md §2–§7, transcribed once.
 *
 * Nothing else in the app defines a colour, a type size, a radius, a stroke or
 * a duration. Two consumers read from here:
 *
 *  - `src/index.css` declares the colour tokens as CSS custom properties on
 *    `:root` and `[data-theme='dark']`. Those literals are checked against this
 *    file by `tokens.test.ts`, so this file stays the authority and the
 *    stylesheet stays static (a static stylesheet is what makes the first paint
 *    correct before any JavaScript has run).
 *  - `src/theme/theme.ts` builds the MUI theme per mode from the same values.
 *
 * Components should reach for `var(--token)` through `src/theme/palette.ts` or
 * for a MUI theme key, not for a hex literal from here. The hexes exist so the
 * stylesheet and the contrast maths have something real to work with.
 */
import { betterInk } from './contrast';

export type ThemeMode = 'light' | 'dark';

/** What the user picked. `system` follows `prefers-color-scheme`. */
export type ThemePreference = ThemeMode | 'system';

/* ------------------------------------------------------------------ */
/* §2 Colour                                                           */
/* ------------------------------------------------------------------ */

/**
 * The mastery ramp is seven buckets here and six in the guide. The guide's six
 * values are anchors and are used verbatim; one step is interpolated to make up
 * the seventh.
 *
 * Placement and value are computed, not chosen. Step 0 is the neutral
 * "not started" grey and step 1 is the guide's palest purple — the guide says
 * those two must stay nearly indistinguishable, so the extra step cannot go
 * between them. Of the remaining joins, the widest in OKLab (dE 0.152 in dark
 * mode) is `--mastery-4` to `--mastery-5`, so the new step lands there, at the
 * OKLab midpoint of the pair. Dark decides the placement because dark is the
 * default mode; light uses the same index so a bucket means the same position
 * in both. Light's widest remaining join is then 0.152, which is exactly the
 * widest join the guide's own six-step ramp already contains.
 */
const MASTERY_LIGHT = [
  '#EAE8E0', // --mastery-0
  '#EEEDFE', // --mastery-1
  '#CECBF6', // --mastery-2
  '#AFA9EC', // --mastery-3
  '#7F77DD', // --mastery-4
  '#6861CA', // interpolated, OKLab midpoint of --mastery-4 and --mastery-5
  '#534AB7', // --mastery-5
] as const;

const MASTERY_DARK = [
  '#27262E', // --mastery-0
  '#26215C', // --mastery-1
  '#3C3489', // --mastery-2
  '#534AB7', // --mastery-3
  '#7F77DD', // --mastery-4
  '#9690E5', // interpolated, OKLab midpoint of --mastery-4 and --mastery-5
  '#AFA9EC', // --mastery-5
] as const;

export const BUCKET_COUNT = MASTERY_LIGHT.length;

const BASE = {
  light: {
    bg: '#FAF9F6',
    'surface-1': '#F1EFE8',
    'surface-2': '#FFFFFF',
    border: '#DEDCD3',
    'border-strong': '#C4C2B8',

    'text-primary': '#2C2C2A',
    'text-secondary': '#5F5E5A',
    'text-muted': '#888780',
    'text-inverse': '#FFFFFF',

    brand: '#7F77DD',
    'brand-deep': '#534AB7',
    'brand-light': '#AFA9EC',
    'brand-tint': '#EEEDFE',
    'brand-on-tint': '#3C3489',

    'grade-fast': '#639922',
    'grade-medium': '#EF9F27',
    'grade-slow': '#D85A30',
    'grade-wrong': '#E24B4A',

    'grade-fast-tint': '#EAF3DE',
    'grade-wrong-tint': '#FCEBEB',
  },
  dark: {
    bg: '#17161A',
    'surface-1': '#1F1E24',
    'surface-2': '#27262E',
    border: '#34333C',
    'border-strong': '#46454F',

    'text-primary': '#EDEBE4',
    'text-secondary': '#A5A29A',
    'text-muted': '#75736D',
    'text-inverse': '#17161A',

    brand: '#AFA9EC',
    'brand-deep': '#7F77DD',
    'brand-light': '#CECBF6',
    'brand-tint': '#26215C',
    'brand-on-tint': '#CECBF6',

    'grade-fast': '#97C459',
    'grade-medium': '#FAC775',
    'grade-slow': '#F0997B',
    'grade-wrong': '#F09595',

    'grade-fast-tint': '#173404',
    'grade-wrong-tint': '#501313',
  },
} as const;

type BaseColorName = keyof (typeof BASE)['light'];
type MasteryName = `mastery-${number}` | `mastery-${number}-ink`;
export type ColorName = BaseColorName | MasteryName;

/**
 * Each ramp step carries the text colour that reads best on it, resolved once
 * here rather than at render time. A cell only has to say
 * `color: var(--mastery-3-ink)` and the answer is already correct for the mode
 * the document is in.
 *
 * The candidates are `--text-primary` and `--text-inverse`. The guide's §8 names
 * `--text-secondary` for the light steps, but §11 asks for 4.5:1 and
 * `--text-secondary` misses it on the middle of the ramp, so the stronger of the
 * two inks wins. See `masteryColor.test.ts` for the measured figures, including
 * the one step that cannot reach 4.5:1 at all.
 */
function masteryTokens(mode: ThemeMode): Record<string, string> {
  const ramp = mode === 'light' ? MASTERY_LIGHT : MASTERY_DARK;
  const out: Record<string, string> = {};
  ramp.forEach((fill, index) => {
    out[`mastery-${index}`] = fill;
    out[`mastery-${index}-ink`] = betterInk(
      fill,
      BASE[mode]['text-primary'],
      BASE[mode]['text-inverse'],
    );
  });
  return out;
}

export const colorTokens: Record<ThemeMode, Record<string, string>> = {
  light: { ...BASE.light, ...masteryTokens('light') },
  dark: { ...BASE.dark, ...masteryTokens('dark') },
};

/** The ramp as raw hex, for contrast maths. Rendering uses `var(--mastery-N)`. */
export function masteryRamp(mode: ThemeMode): readonly string[] {
  return mode === 'light' ? MASTERY_LIGHT : MASTERY_DARK;
}

/** `var(--name)`, the form every component should use. */
export function cssVar(name: ColorName): string {
  return `var(--${name})`;
}

/**
 * Resolves a token reference back to hex. Accepts a hex string unchanged, so a
 * caller can hand it either and still get a number out.
 */
export function resolveColor(value: string, mode: ThemeMode): string {
  const match = /^var\(\s*--([a-z0-9-]+)\s*\)$/i.exec(value.trim());
  if (!match) return value;
  const hex = colorTokens[mode][match[1]];
  if (!hex) throw new Error(`Unknown colour token: ${value}`);
  return hex;
}

/** The address bar / status bar colour. The page ground, per mode. */
export function themeColor(mode: ThemeMode): string {
  return colorTokens[mode].bg;
}

/* ------------------------------------------------------------------ */
/* §3 Type                                                             */
/* ------------------------------------------------------------------ */

export const fontFamily = {
  sans: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

/** 400 and 500 are the only weights loaded. Asking for anything else fakes it. */
export const fontWeight = { regular: 400, medium: 500 } as const;

export interface TypeStep {
  size: number;
  weight: 400 | 500;
  family: 'sans' | 'mono';
  tracking: string;
  lineHeight: number;
}

export const typeScale = {
  prompt: { size: 72, weight: 400, family: 'mono', tracking: '-0.02em', lineHeight: 1 },
  key: { size: 24, weight: 400, family: 'mono', tracking: '0', lineHeight: 1 },
  title: { size: 22, weight: 500, family: 'sans', tracking: '-0.01em', lineHeight: 1.5 },
  heading: { size: 17, weight: 500, family: 'sans', tracking: '0', lineHeight: 1.5 },
  body: { size: 15, weight: 400, family: 'sans', tracking: '0', lineHeight: 1.5 },
  label: { size: 13, weight: 400, family: 'sans', tracking: '0.01em', lineHeight: 1.5 },
  caption: { size: 11, weight: 400, family: 'sans', tracking: '0.02em', lineHeight: 1.5 },
  cell: { size: 11, weight: 400, family: 'mono', tracking: '0', lineHeight: 1 },
  stat: { size: 28, weight: 400, family: 'mono', tracking: '-0.01em', lineHeight: 1 },
} as const satisfies Record<string, TypeStep>;

export type TypeStepName = keyof typeof typeScale;

/** A type step as a `sx`-ready object. */
export function typeStyle(name: TypeStepName) {
  const step: TypeStep = typeScale[name];
  return {
    fontFamily: fontFamily[step.family],
    fontSize: step.size,
    fontWeight: step.weight,
    letterSpacing: step.tracking,
    lineHeight: step.lineHeight,
    ...(step.family === 'mono' ? { fontVariantNumeric: 'tabular-nums' as const } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* §4 Spacing · §5 Radius · §6 Borders and elevation                   */
/* ------------------------------------------------------------------ */

/** 4px base. MUI's `spacing(n)` is wired to the same unit, so `p: 4` is 16px. */
export const SPACE_UNIT = 4;
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 } as const;

/** Screen horizontal padding, every screen, every breakpoint. */
export const SCREEN_PADDING_X = space[5];

export const radius = { xs: 3, sm: 6, md: 10, lg: 14, pill: 999 } as const;

export const stroke = {
  hairline: `1px solid ${cssVar('border')}`,
  strong: `1px solid ${cssVar('border-strong')}`,
} as const;

/** The only shadow in the app. A hairline above the keypad, no blur, no spread. */
export const shadow = { keypad: `0 -1px 0 0 ${cssVar('border')}` } as const;

/* ------------------------------------------------------------------ */
/* §7 Motion                                                           */
/* ------------------------------------------------------------------ */

/**
 * `numeric` is a changed value moving to replace the one that was there: the
 * old glyph leaving vertically as the new one arrives from the other side.
 *
 * It has its own duration because borrowing `advance` is what broke the first
 * attempt at this. `advance` describes a crossfade, where 120ms is right
 * because opacity has no intermediate shape worth watching. A glyph that
 * travels does have one, and at 120ms there are barely seven frames to draw it
 * in. This is a single-stage move, so unlike the two-stage flap it replaced,
 * the whole duration is the whole animation.
 *
 * `numericSettle` is when the incoming glyph is readable, which is earlier
 * than when the motion stops. See `NUMERIC_SETTLE_MS`.
 */
export const duration = {
  instant: 0,
  advance: 120,
  flash: 160,
  ui: 180,
  hold: 200,
  numeric: 280,
  numericSettle: 140,
} as const;

/**
 * `out` is the app's curve for anything that arrives and settles.
 *
 * `numeric` is the same idea pushed much further, and the asymmetry is load
 * bearing rather than stylistic: weighting the travel hard toward deceleration
 * puts the incoming glyph almost in place within the first third, so the
 * prompt becomes readable well before the animation ends. A symmetric
 * ease-in-out would hold the value ambiguous across the whole duration, and
 * the answer pad waits on that readability.
 */
export const easing = {
  out: 'cubic-bezier(0.2, 0, 0, 1)',
  numeric: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

/**
 * `--dur-hold` is how long a correct fill stays on screen before the prompt
 * advances. That is timing, not decoration, so reduced motion leaves it alone
 * and zeroes everything else.
 */
export const REDUCED_MOTION_KEEPS: readonly (keyof typeof duration)[] = ['hold'];

/* ------------------------------------------------------------------ */
/* CSS custom properties                                               */
/* ------------------------------------------------------------------ */

/** The colour declarations for one mode, as they appear in `src/index.css`. */
export function colorDeclarations(mode: ThemeMode): string[] {
  return Object.entries(colorTokens[mode]).map(([name, value]) => `--${name}: ${value};`);
}

/** `flapAway` -> `flap-away`. The token names are kebab, the keys are not. */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** The mode-independent declarations: type, spacing, radius, stroke, motion. */
export function staticDeclarations(): string[] {
  const lines: string[] = [
    `--font-sans: ${fontFamily.sans};`,
    `--font-mono: ${fontFamily.mono};`,
  ];
  for (const [name, step] of Object.entries(typeScale)) {
    lines.push(`--type-${name}: ${step.size}px;`);
  }
  for (const [step, px] of Object.entries(space)) {
    lines.push(`--space-${step}: ${px}px;`);
  }
  for (const [name, value] of Object.entries(radius)) {
    lines.push(`--radius-${name}: ${value}px;`);
  }
  lines.push(`--stroke-hairline: ${stroke.hairline};`);
  lines.push(`--stroke-strong: ${stroke.strong};`);
  lines.push(`--shadow-keypad: ${shadow.keypad};`);
  for (const [name, ms] of Object.entries(duration)) {
    lines.push(`--dur-${name}: ${ms}ms;`);
  }
  // Iterated rather than written out one by one, the way the durations above
  // are. A hardcoded `--ease-out` line meant adding a curve here left the
  // stylesheet without it, and the component reaching for `var(--ease-flap-in)`
  // would have silently fallen back to the browser's default easing.
  for (const [name, curve] of Object.entries(easing)) {
    lines.push(`--ease-${kebab(name)}: ${curve};`);
  }
  return lines;
}
