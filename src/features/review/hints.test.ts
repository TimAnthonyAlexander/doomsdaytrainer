import { describe, expect, it } from 'vitest';
import type { ItemState } from '@/domain/types';
import { emptyFluency } from '@/domain/fluency';
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

/** An item that has earned fluency, holding at `interval` days. */
function fluent(interval: number): Partial<ItemState> {
  return {
    repetitions: 3,
    interval,
    fluency: { ...emptyFluency(), consecutiveFast: 2, fluent: true, fluentAt: 1 },
  };
}

describe('structuralHint', () => {
  it('names the block and labels every number it shows', () => {
    const hint = structuralHint(73);
    expect(hint.text).toBe('73 sits in the block 72–75.');
    expect(hint.steps).toEqual([
      { label: 'Block', value: '72–75' },
      { label: 'Code of 72', value: '6' },
      { label: 'Years from 72 to 73', value: '1' },
    ]);
    expect(structuralHint(7).steps[1]).toEqual({ label: 'Code of 04', value: '5' });
  });

  it('never states the answer for a year past the start of its block', () => {
    for (let yy = 0; yy < 100; yy++) {
      if (yy % 4 === 0) continue;
      const hint = structuralHint(yy);
      // The block's own starting code is fair game; this year's is not.
      expect(hint.steps.some((step) => step.label.startsWith('Code of'))).toBe(true);
      expect(hint.steps).not.toContainEqual({
        label: `Code of ${String(yy).padStart(2, '0')}`,
        value: String(codeFor(yy)),
      });
    }
  });
});

describe('arithmeticHint', () => {
  it('substitutes the real numbers and stops before the mod', () => {
    expect(arithmeticHint(73).text).toBe('73 + 18 = 91');
    expect(arithmeticHint(0).text).toBe('00 + 0 = 0');
    expect(arithmeticHint(99).text).toBe('99 + 24 = 123');
  });

  it('says what the middle number actually is', () => {
    // The unexplained "+ 18" is the whole reason this hint used to teach
    // nothing: it is the leap-day count, and the label has to say so.
    const hint = arithmeticHint(73);
    expect(hint.steps).toEqual([
      { label: 'The year', value: '73' },
      { label: 'Leap days since 00 (73 ÷ 4, rounded down)', value: '18' },
      { label: 'Year plus leap days', value: '91' },
    ]);
    expect(hint.note).toBe('Divide 91 by 7 and keep the remainder. That remainder is the code.');
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
  it('uses the nearest known year below, with each number named', () => {
    const hint = anchorHint(73, (yy) => yy === 72);
    expect(hint.type).toBe('anchor');
    expect(hint.text).toBe('You already know 72.');
    expect(hint.steps).toEqual([
      { label: 'Nearest code you know', value: '72' },
      { label: 'Code of 72', value: '6' },
      { label: 'Year you want', value: '73' },
    ]);
  });

  it('never names the gap, which would finish the derivation', () => {
    const hint = anchorHint(73, (yy) => yy === 72);
    expect(JSON.stringify(hint)).not.toContain('1 year');
    expect(hint.steps.map((step) => step.value)).not.toContain(String(codeFor(73)));
  });

  it('falls back to structural rather than showing nothing', () => {
    const hint = anchorHint(73, () => false);
    expect(hint.type).toBe('structural');
    expect(hint.text).toBe('73 sits in the block 72–75.');
  });
});

describe('isAnchorKnown', () => {
  // Was "an interval of 4 days or more". A long interval only says the answer
  // survives, not that it arrives, so a year the user counts their way to could
  // become the anchor another year was counted from.
  it('needs an introduced, fluent item', () => {
    expect(isAnchorKnown(undefined)).toBe(false);
    expect(isAnchorKnown(item({ introduced: false, ...fluent(40) }))).toBe(false);
    expect(isAnchorKnown(item({ introduced: true, repetitions: 3, interval: 40 }))).toBe(false);
    expect(isAnchorKnown(item({ introduced: true, ...fluent(1) }))).toBe(true);
    expect(isAnchorKnown(item({ introduced: true, ...fluent(90) }))).toBe(true);
  });

  it('refuses an item that is only fast once', () => {
    const once = item({
      introduced: true,
      repetitions: 3,
      interval: 40,
      fluency: { ...emptyFluency(), consecutiveFast: 1 },
    });
    expect(isAnchorKnown(once)).toBe(false);
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
    yy === 72 ? item({ yy: 72, introduced: true, ...fluent(30) }) : undefined;

  it('dispatches on the user preference', () => {
    expect(hintFor(73, 'structural', lookup).type).toBe('structural');
    expect(hintFor(73, 'arithmetic', lookup).type).toBe('arithmetic');
    expect(hintFor(73, 'anchor', lookup).text).toBe('You already know 72.');
  });

  it('falls back to structural when no anchor is known yet', () => {
    expect(hintFor(73, 'anchor', () => undefined).type).toBe('structural');
  });
});
