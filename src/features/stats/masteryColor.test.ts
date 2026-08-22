import { describe, expect, it } from 'vitest';
import { createItem, introduce } from '@/domain/scheduler';
import { masteryBuckets, palette } from '@/theme/palette';
import { colorTokens, masteryRamp, type ThemeMode } from '@/theme/tokens';
import {
  BUCKET_COUNT,
  CELL_BORDER,
  bucketColor,
  bucketInk,
  bucketLabel,
  clampBucket,
  contrastRatio,
  itemColor,
  readableInk,
  relativeLuminance,
} from './masteryColor';

const NOW = new Date(2026, 4, 20, 10, 0, 0).getTime();
const MODES: ThemeMode[] = ['light', 'dark'];

describe('bucketColor', () => {
  it('maps all seven buckets onto the ramp in order', () => {
    for (let bucket = 0; bucket < BUCKET_COUNT; bucket += 1) {
      expect(bucketColor(bucket)).toBe(palette.mastery[bucket]);
      expect(bucketColor(bucket)).toBe(`var(--mastery-${bucket})`);
    }
  });

  it('has exactly seven steps, matching the label list', () => {
    expect(BUCKET_COUNT).toBe(7);
    expect(masteryBuckets).toHaveLength(7);
    for (const mode of MODES) expect(masteryRamp(mode)).toHaveLength(7);
  });

  it('never returns undefined for an out-of-range bucket', () => {
    expect(bucketColor(-3)).toBe(palette.mastery[0]);
    expect(bucketColor(99)).toBe(palette.mastery[6]);
    expect(bucketColor(Number.NaN)).toBe(palette.mastery[0]);
  });
});

describe('clampBucket', () => {
  it('rounds and clamps into 0..6', () => {
    expect(clampBucket(2.4)).toBe(2);
    expect(clampBucket(2.6)).toBe(3);
    expect(clampBucket(-1)).toBe(0);
    expect(clampBucket(7)).toBe(6);
  });
});

describe('bucketLabel', () => {
  it('uses the shipped labels for all seven', () => {
    expect(masteryBuckets.map((_, i) => bucketLabel(i))).toEqual(
      masteryBuckets.map((b) => b.label),
    );
  });
});

describe('itemColor', () => {
  it('gives a never-introduced item the first step', () => {
    expect(itemColor(createItem(42))).toBe(palette.mastery[0]);
  });

  it('gives a mature item the last step', () => {
    const item = { ...introduce(createItem(42), NOW), interval: 120 };
    expect(itemColor(item)).toBe(palette.mastery[6]);
  });

  it('walks up the ramp as the interval grows', () => {
    const base = introduce(createItem(42), NOW);
    const intervals = [0, 1, 5, 20, 60, 200];
    const colors = intervals.map((interval) => itemColor({ ...base, interval }));
    expect(colors).toEqual([
      palette.mastery[1],
      palette.mastery[2],
      palette.mastery[3],
      palette.mastery[4],
      palette.mastery[5],
      palette.mastery[6],
    ]);
  });
});

describe('the ramp itself', () => {
  it('keeps the six styleguide anchors verbatim', () => {
    expect(masteryRamp('light')).toEqual([
      '#EAE8E0',
      '#EEEDFE',
      '#CECBF6',
      '#AFA9EC',
      '#7F77DD',
      '#6861CA',
      '#534AB7',
    ]);
    expect(masteryRamp('dark')).toEqual([
      '#27262E',
      '#26215C',
      '#3C3489',
      '#534AB7',
      '#7F77DD',
      '#9690E5',
      '#AFA9EC',
    ]);
  });

  it('moves in one direction from step 1 up, per mode', () => {
    for (const mode of MODES) {
      const lums = masteryRamp(mode).map((hex) => relativeLuminance(hex, mode));
      for (let i = 2; i < lums.length; i += 1) {
        // Light darkens as mastery grows; dark lightens. Either way, monotone.
        if (mode === 'light') expect(lums[i]).toBeLessThan(lums[i - 1]);
        else expect(lums[i]).toBeGreaterThan(lums[i - 1]);
      }
    }
  });

  it('leaves steps 0 and 1 nearly indistinguishable, as the guide asks', () => {
    for (const mode of MODES) {
      const [zero, one] = masteryRamp(mode);
      expect(contrastRatio(zero, one, mode)).toBeLessThan(1.1);
    }
  });

  it('separates those two steps with the hairline instead', () => {
    expect(CELL_BORDER).toBe('1px solid var(--border)');
    for (const mode of MODES) {
      const border = colorTokens[mode].border;
      for (const step of masteryRamp(mode).slice(0, 2)) {
        expect(contrastRatio(step, border, mode)).toBeGreaterThan(1.1);
      }
    }
  });
});

describe('relativeLuminance', () => {
  it('anchors at black and white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 6);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 6);
  });

  it('accepts three-digit hex', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#FFFFFF'), 6);
  });

  it('resolves a token reference against the mode it is given', () => {
    expect(relativeLuminance('var(--bg)', 'light')).toBeCloseTo(
      relativeLuminance(colorTokens.light.bg),
      6,
    );
    expect(relativeLuminance('var(--bg)', 'dark')).toBeCloseTo(
      relativeLuminance(colorTokens.dark.bg),
      6,
    );
  });

  it('rejects anything that is not a hex colour', () => {
    expect(() => relativeLuminance('rebeccapurple')).toThrow();
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and symmetric', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 3);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 3);
  });

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio(palette.ink, palette.ink, 'light')).toBeCloseTo(1, 6);
  });
});

describe('readableInk', () => {
  it('picks the ink at the pale end and its inverse at the dark end', () => {
    expect(readableInk(masteryRamp('light')[0], 'light')).toBe('var(--text-primary)');
    expect(readableInk(masteryRamp('light')[6], 'light')).toBe('var(--text-inverse)');
    // Dark mode runs the other way: the pale end is the mature end.
    expect(readableInk(masteryRamp('dark')[0], 'dark')).toBe('var(--text-primary)');
    expect(readableInk(masteryRamp('dark')[6], 'dark')).toBe('var(--text-inverse)');
  });

  it('flips somewhere in the middle rather than committing to one colour', () => {
    for (const mode of MODES) {
      const picks = masteryRamp(mode).map((step) => readableInk(step, mode));
      expect(new Set(picks).size).toBe(2);
    }
  });

  it('agrees with the ink baked into the tokens', () => {
    for (const mode of MODES) {
      masteryRamp(mode).forEach((step, index) => {
        const chosen = readableInk(step, mode);
        expect(colorTokens[mode][`mastery-${index}-ink`]).toBe(
          chosen === 'var(--text-primary)'
            ? colorTokens[mode]['text-primary']
            : colorTokens[mode]['text-inverse'],
        );
        expect(bucketInk(index)).toBe(`var(--mastery-${index}-ink)`);
      });
    }
  });
});

/**
 * STYLEGUIDE.md §11 asks for 4.5:1 on body text, and the year inside a grid cell
 * is 11px, so it counts. Six of the seven steps clear it in light mode and all
 * seven clear it in dark.
 *
 * The exception is light-mode step 4, `--mastery-4` (#7F77DD), which is fixed by
 * §2. Its luminance sits close enough to the middle that its best possible
 * contrast is 5.59:1 against pure black and 3.76:1 against pure white; against
 * the guide's own darkest light-mode ink (`--text-primary`, #2C2C2A) it reaches
 * 3.72:1. No ink in the light palette clears 4.5:1 on it, so the number is
 * asserted here rather than the threshold being lowered quietly. Fixing it needs
 * a darker `--text-primary` or a darker `--mastery-4`, both styleguide changes.
 */
const LIGHT_STEP_4_BEST_CONTRAST = 3.76;

describe('cell text contrast', () => {
  it('clears 4.5:1 on every step in dark mode', () => {
    for (const [index, step] of masteryRamp('dark').entries()) {
      const ratio = contrastRatio(step, readableInk(step, 'dark'), 'dark');
      expect(ratio, `dark step ${index}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('clears 4.5:1 on every light-mode step except --mastery-4', () => {
    for (const [index, step] of masteryRamp('light').entries()) {
      const ratio = contrastRatio(step, readableInk(step, 'light'), 'light');
      if (index === 4) continue;
      expect(ratio, `light step ${index}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('records what --mastery-4 can actually reach in light mode', () => {
    const step = masteryRamp('light')[4];
    expect(contrastRatio(step, readableInk(step, 'light'), 'light')).toBeCloseTo(
      LIGHT_STEP_4_BEST_CONTRAST,
      2,
    );
    expect(contrastRatio(step, '#000000', 'light')).toBeGreaterThan(4.5);
  });
});
