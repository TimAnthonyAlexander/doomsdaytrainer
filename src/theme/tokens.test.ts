import { describe, expect, it } from 'vitest';
import {
  BUCKET_COUNT,
  colorDeclarations,
  colorTokens,
  duration,
  masteryRamp,
  radius,
  resolveColor,
  space,
  staticDeclarations,
  themeColor,
  typeScale,
  type ThemeMode,
} from './tokens';

/**
 * This file is the authority for every value in STYLEGUIDE.md §2–§7.
 *
 * `src/index.css` repeats the colour, type, spacing, radius, stroke and motion
 * tokens as CSS custom property literals, because the first paint has to be
 * correct before any JavaScript has run. Those literals are a copy.
 * `colorDeclarations()` and `staticDeclarations()` below emit exactly the lines
 * the stylesheet should contain: change a token, run them, paste the output in.
 *
 * The copy is not asserted against the stylesheet here. Vitest stubs CSS
 * imports to an empty string, so a test cannot read the file without pulling
 * node's fs types into a project that has none.
 */

const MODES: ThemeMode[] = ['light', 'dark'];

describe('the CSS custom properties', () => {
  it('emits one declaration per colour token, per mode', () => {
    for (const mode of MODES) {
      const lines = colorDeclarations(mode);
      expect(lines).toHaveLength(Object.keys(colorTokens[mode]).length);
      for (const [name, value] of Object.entries(colorTokens[mode])) {
        expect(lines).toContain(`--${name}: ${value};`);
      }
    }
  });

  it('emits the type, spacing, radius, stroke and motion tokens once each', () => {
    const lines = staticDeclarations();
    const names = lines.map((line) => line.slice(0, line.indexOf(':')));
    expect(new Set(names).size).toBe(names.length);
    expect(lines).toContain('--space-5: 24px;');
    expect(lines).toContain('--radius-lg: 14px;');
    expect(lines).toContain('--type-prompt: 72px;');
    expect(lines).toContain('--stroke-hairline: 1px solid var(--border);');
    expect(lines).toContain('--shadow-keypad: 0 -1px 0 0 var(--border);');
    expect(lines).toContain('--dur-ui: 180ms;');
    expect(lines).toContain('--ease-out: cubic-bezier(0.2, 0, 0, 1);');
  });

  it('keeps the mode-dependent tokens to colour alone', () => {
    for (const name of Object.keys(colorTokens.dark)) {
      expect(name.startsWith('type-') || name.startsWith('space-') || name.startsWith('dur-')).toBe(
        false,
      );
    }
    expect(Object.keys(colorTokens.light)).toEqual(Object.keys(colorTokens.dark));
  });
});

describe('token values', () => {
  it('uses the 4px spacing scale from §4', () => {
    expect(Object.values(space)).toEqual([4, 8, 12, 16, 24, 32, 48, 64]);
  });

  it('uses the five radii from §5 and no others', () => {
    expect(radius).toEqual({ xs: 3, sm: 6, md: 10, lg: 14, pill: 999 });
  });

  it('uses only weights 400 and 500, the two that are loaded', () => {
    for (const step of Object.values(typeScale)) {
      expect([400, 500]).toContain(step.weight);
    }
  });

  it('gives the prompt, key, stat and cell steps a line height of 1', () => {
    for (const name of ['prompt', 'key', 'stat', 'cell'] as const) {
      expect(typeScale[name].lineHeight, name).toBe(1);
    }
    for (const name of ['title', 'heading', 'body', 'label', 'caption'] as const) {
      expect(typeScale[name].lineHeight, name).toBe(1.5);
    }
  });

  it('renders every digit step in mono', () => {
    for (const name of ['prompt', 'key', 'stat', 'cell'] as const) {
      expect(typeScale[name].family, name).toBe('mono');
    }
  });

  it('keeps the prompt lighter than the selected key', () => {
    expect(typeScale.prompt.weight).toBe(400);
  });

  it('carries the §7 durations', () => {
    expect(duration).toEqual({ instant: 0, advance: 120, flash: 160, ui: 180, hold: 200 });
  });

  it('has a mastery ramp of seven steps with a matching ink per step', () => {
    for (const mode of MODES) {
      expect(masteryRamp(mode)).toHaveLength(BUCKET_COUNT);
      for (let index = 0; index < BUCKET_COUNT; index += 1) {
        expect(colorTokens[mode][`mastery-${index}`]).toBe(masteryRamp(mode)[index]);
        expect(colorTokens[mode][`mastery-${index}-ink`]).toBeTruthy();
      }
    }
  });

  it('names the page ground as the address bar colour', () => {
    expect(themeColor('dark')).toBe('#17161A');
    expect(themeColor('light')).toBe('#FAF9F6');
  });
});

describe('resolveColor', () => {
  it('turns a token reference into the hex for that mode', () => {
    expect(resolveColor('var(--brand)', 'light')).toBe('#7F77DD');
    expect(resolveColor('var(--brand)', 'dark')).toBe('#AFA9EC');
  });

  it('passes a plain colour through untouched', () => {
    expect(resolveColor('#123456', 'dark')).toBe('#123456');
  });

  it('throws on a token that does not exist', () => {
    expect(() => resolveColor('var(--nope)', 'dark')).toThrow();
  });
});

describe('colorDeclarations', () => {
  it('emits one line per token, ready to paste', () => {
    expect(colorDeclarations('dark')).toContain('--bg: #17161A;');
    expect(colorDeclarations('dark')).toHaveLength(Object.keys(colorTokens.dark).length);
  });
});
