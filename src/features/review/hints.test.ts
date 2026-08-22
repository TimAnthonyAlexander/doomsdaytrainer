import { describe, expect, it } from 'vitest';
import type { ItemState } from '@/domain/types';
import { createItem } from '@/domain/scheduler';
import { codeFor } from '@/domain/yearCodes';
import {
  anchorHint,
  arithmeticHint,
  hintFor,
  isAnchorKnown,
  shouldAutoHint,
  structuralHint,
} from './hints';

function item(overrides: Partial<ItemState> = {}): ItemState {
  return { ...createItem(0), ...overrides };
}

describe('structuralHint', () => {
  it('names the block and where it starts', () => {
    expect(structuralHint(73).text).toBe('Block 72–75, starts at 6.');
    expect(structuralHint(72).text).toBe('Block 72–75, starts at 6.');
    expect(structuralHint(7).text).toBe('Block 04–07, starts at 5.');
  });

  it('never contains the answer for a year past the start of its block', () => {
    for (let yy = 0; yy < 100; yy++) {
      if (yy % 4 === 0) continue;
      expect(structuralHint(yy).text).not.toContain(`starts at ${codeFor(yy)}.`);
    }
  });
});

describe('arithmeticHint', () => {
  it('substitutes the real numbers and stops before the mod', () => {
    expect(arithmeticHint(73).text).toBe('73 + 18 = 91');
    expect(arithmeticHint(0).text).toBe('00 + 0 = 0');
    expect(arithmeticHint(99).text).toBe('99 + 24 = 123');
  });

  it('leaves the last step to the user', () => {
    for (let yy = 0; yy < 100; yy++) {
      const hint = arithmeticHint(yy);
      expect(hint.text).not.toContain('mod');
      expect(hint.note).toMatch(/7/);
    }
  });
});

describe('anchorHint', () => {
  it('uses the nearest known year below', () => {
    const hint = anchorHint(73, (yy) => yy === 72);
    expect(hint.type).toBe('anchor');
    expect(hint.text).toBe('72 → 6, so 73 → ?');
  });

  it('falls back to structural rather than showing nothing', () => {
    const hint = anchorHint(73, () => false);
    expect(hint.type).toBe('structural');
    expect(hint.text).toBe('Block 72–75, starts at 6.');
  });
});

describe('isAnchorKnown', () => {
  it('needs an introduced item at the 4-day bucket or better', () => {
    expect(isAnchorKnown(undefined)).toBe(false);
    expect(isAnchorKnown(item({ introduced: false, interval: 40 }))).toBe(false);
    expect(isAnchorKnown(item({ introduced: true, interval: 0 }))).toBe(false);
    expect(isAnchorKnown(item({ introduced: true, interval: 3 }))).toBe(false);
    expect(isAnchorKnown(item({ introduced: true, interval: 4 }))).toBe(true);
    expect(isAnchorKnown(item({ introduced: true, interval: 90 }))).toBe(true);
  });
});

describe('shouldAutoHint', () => {
  it('turns on at the second consecutive failure', () => {
    expect(shouldAutoHint(item({ consecutiveFailures: 0 }))).toBe(false);
    expect(shouldAutoHint(item({ consecutiveFailures: 1 }))).toBe(false);
    expect(shouldAutoHint(item({ consecutiveFailures: 2 }))).toBe(true);
    expect(shouldAutoHint(item({ consecutiveFailures: 9 }))).toBe(true);
  });
});

describe('hintFor', () => {
  const lookup = (yy: number) =>
    yy === 72 ? item({ yy: 72, introduced: true, interval: 30 }) : undefined;

  it('dispatches on the user preference', () => {
    expect(hintFor(73, 'structural', lookup).type).toBe('structural');
    expect(hintFor(73, 'arithmetic', lookup).type).toBe('arithmetic');
    expect(hintFor(73, 'anchor', lookup).text).toBe('72 → 6, so 73 → ?');
  });

  it('falls back to structural when no anchor is known yet', () => {
    expect(hintFor(73, 'anchor', () => undefined).type).toBe('structural');
  });
});
