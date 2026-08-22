import { describe, expect, it } from 'vitest';
import { codeFor } from '@/domain/yearCodes';
import { DEFAULT_SETTINGS } from '@/storage/defaults';
import {
  EXAMPLE_YEAR,
  INDEX_EXAMPLE_YEARS,
  ONBOARDING_STEPS,
  STEP_COUNT,
  clampYear,
  derivation,
  draftRange,
  initialDraft,
  nextStep,
  normaliseRange,
  previousStep,
  sanitiseYearText,
  scopeItemCount,
  scopeRangeLabel,
  settingsFromDraft,
  stepNumber,
  yearFromText,
  type OnboardingDraft,
} from './onboardingModel';

const draft = (overrides: Partial<OnboardingDraft> = {}): OnboardingDraft => ({
  indexConvention: 'sunday',
  scopeId: 'full',
  customFrom: '00',
  customTo: '99',
  ...overrides,
});

describe('steps', () => {
  it('has the five steps, in order, the walk last', () => {
    expect(ONBOARDING_STEPS).toEqual(['intro', 'why', 'index', 'scope', 'walk']);
    expect(STEP_COUNT).toBe(5);
  });

  it('numbers steps from one', () => {
    expect(stepNumber('intro')).toBe(1);
    expect(stepNumber('walk')).toBe(5);
  });

  it('walks forward and back', () => {
    expect(nextStep('intro')).toBe('why');
    expect(nextStep('why')).toBe('index');
    expect(nextStep('index')).toBe('scope');
    expect(nextStep('scope')).toBe('walk');
    expect(nextStep('walk')).toBeNull();

    expect(previousStep('walk')).toBe('scope');
    expect(previousStep('scope')).toBe('index');
    expect(previousStep('intro')).toBeNull();
  });

  it('lands on the index step whether step two is read or skipped', () => {
    // Skipping is the same jump as continuing; the difference is only the label.
    expect(nextStep('why')).toBe('index');
  });
});

describe('year input', () => {
  it('keeps at most two digits, so 250 can never be typed', () => {
    expect(sanitiseYearText('250')).toBe('25');
    expect(sanitiseYearText('9')).toBe('9');
    expect(sanitiseYearText('')).toBe('');
  });

  it('drops anything that is not a digit', () => {
    expect(sanitiseYearText('-4')).toBe('4');
    expect(sanitiseYearText('1e5')).toBe('15');
    expect(sanitiseYearText('.,')).toBe('');
  });

  it('reads empty text as zero', () => {
    expect(yearFromText('')).toBe(0);
    expect(yearFromText('07')).toBe(7);
    expect(yearFromText('99')).toBe(99);
  });

  it('clamps out-of-range numbers', () => {
    expect(clampYear(-8)).toBe(0);
    expect(clampYear(250)).toBe(99);
    expect(clampYear(12.9)).toBe(12);
    expect(clampYear(Number.NaN)).toBe(0);
  });
});

describe('custom range', () => {
  it('orders reversed bounds', () => {
    expect(normaliseRange({ from: 80, to: 20 })).toEqual({ from: 20, to: 80 });
  });

  it('clamps and orders together', () => {
    expect(normaliseRange({ from: 400, to: -3 })).toEqual({ from: 0, to: 99 });
  });

  it('allows a single year', () => {
    expect(normaliseRange({ from: 73, to: 73 })).toEqual({ from: 73, to: 73 });
  });

  it('reads a draft with half-typed fields', () => {
    expect(draftRange(draft({ customFrom: '', customTo: '5' }))).toEqual({ from: 0, to: 5 });
  });
});

describe('initialDraft', () => {
  it('starts from the stored settings so a rerun is not a reset', () => {
    const result = initialDraft({
      ...DEFAULT_SETTINGS,
      indexConvention: 'monday',
      scopeId: 'custom',
      customScope: { from: 60, to: 12 },
    });
    expect(result).toEqual({
      indexConvention: 'monday',
      scopeId: 'custom',
      customFrom: '12',
      customTo: '60',
    });
  });

  it('zero-pads single-digit bounds', () => {
    const result = initialDraft({ ...DEFAULT_SETTINGS, customScope: { from: 3, to: 9 } });
    expect(result.customFrom).toBe('03');
    expect(result.customTo).toBe('09');
  });
});

describe('settingsFromDraft', () => {
  it('carries every choice and completes onboarding', () => {
    expect(settingsFromDraft(draft({ indexConvention: 'monday', scopeId: 'living' }))).toEqual({
      indexConvention: 'monday',
      scopeId: 'living',
      customScope: { from: 0, to: 99 },
      onboardingComplete: true,
    });
  });

  it('normalises the custom range it writes', () => {
    const result = settingsFromDraft(draft({ scopeId: 'custom', customFrom: '90', customTo: '40' }));
    expect(result.customScope).toEqual({ from: 40, to: 90 });
  });

  it('never writes a bound above 99', () => {
    const result = settingsFromDraft(draft({ scopeId: 'custom', customFrom: '99', customTo: '' }));
    expect(result.customScope).toEqual({ from: 0, to: 99 });
  });
});

describe('scope figures', () => {
  it('counts each fixed scope from the domain layer', () => {
    const full = { from: 0, to: 99 };
    expect(scopeItemCount('full', full)).toBe(100);
    expect(scopeItemCount('living', full)).toBe(75);
    expect(scopeItemCount('modern', full)).toBe(50);
    expect(scopeItemCount('current', full)).toBe(50);
  });

  it('counts a custom range inclusively', () => {
    expect(scopeItemCount('custom', { from: 40, to: 44 })).toBe(5);
    expect(scopeItemCount('custom', { from: 73, to: 73 })).toBe(1);
  });

  it('ignores the custom range for fixed scopes', () => {
    expect(scopeItemCount('modern', { from: 0, to: 2 })).toBe(50);
    expect(scopeRangeLabel('modern', { from: 0, to: 2 })).toBe('50–99');
  });

  it('labels bounds zero-padded', () => {
    expect(scopeRangeLabel('full', { from: 0, to: 99 })).toBe('00–99');
    expect(scopeRangeLabel('custom', { from: 5, to: 9 })).toBe('05–09');
  });
});

describe('derivation', () => {
  it('works the example through with real numbers', () => {
    const worked = derivation(EXAMPLE_YEAR);
    expect(worked).toEqual({ yy: 73, leaps: 18, sum: 91, code: 0 });
  });

  it('picks an example where the floor division does something', () => {
    expect(derivation(EXAMPLE_YEAR).leaps).toBeGreaterThan(0);
  });

  it('agrees with the shipped table for every year', () => {
    for (let yy = 0; yy < 100; yy++) {
      const worked = derivation(yy);
      expect(worked.sum % 7).toBe(worked.code);
      expect(worked.code).toBe(codeFor(yy));
    }
  });

  it('demonstrates the index convention on years whose code is not zero', () => {
    for (const yy of INDEX_EXAMPLE_YEARS) {
      expect(codeFor(yy)).not.toBe(0);
    }
  });
});
