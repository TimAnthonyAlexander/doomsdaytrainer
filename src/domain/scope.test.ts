import { describe, expect, it } from 'vitest';
import type { ScopeId, Settings } from './types';
import { SCOPES, inScope, resolveScope, scopeYears } from './scope';

const settings: Settings = {
  indexConvention: 'sunday',
  scopeId: 'full',
  customScope: { from: 0, to: 99 },
  newItemsPerDay: 20,
  fastThresholdMs: 2000,
  mediumThresholdMs: 5000,
  hintType: 'structural',
  answerWindowMs: null,
  autoAdvanceMs: 250,
  keyboardInput: false,
  reminderEnabled: false,
  reminderTime: '19:00',
  eveningReminderEnabled: false,
  onboardingComplete: true,
};

const withScope = (scopeId: ScopeId, custom?: { from: number; to: number }): Settings => ({
  ...settings,
  scopeId,
  customScope: custom ?? settings.customScope,
});

describe('SCOPES', () => {
  it('lists the five scopes from the spec with their bounds', () => {
    expect(SCOPES.map((s) => [s.id, s.from, s.to])).toEqual([
      ['full', 0, 99],
      ['living', 25, 99],
      ['modern', 50, 99],
      ['current', 0, 49],
      ['custom', 0, 99],
    ]);
  });

  it('labels every scope', () => {
    for (const scope of SCOPES) {
      expect(scope.label.length).toBeGreaterThan(0);
      expect(scope.from).toBeLessThanOrEqual(scope.to);
    }
  });
});

describe('resolveScope', () => {
  it.each([
    ['full', 0, 99],
    ['living', 25, 99],
    ['modern', 50, 99],
    ['current', 0, 49],
  ] as [ScopeId, number, number][])('resolves %s to %i..%i', (id, from, to) => {
    const scope = resolveScope(withScope(id));
    expect(scope.id).toBe(id);
    expect(scope.from).toBe(from);
    expect(scope.to).toBe(to);
  });

  it('takes custom bounds from settings', () => {
    const scope = resolveScope(withScope('custom', { from: 30, to: 45 }));
    expect(scope.id).toBe('custom');
    expect(scope.from).toBe(30);
    expect(scope.to).toBe(45);
  });

  it('normalises reversed custom bounds', () => {
    const scope = resolveScope(withScope('custom', { from: 80, to: 20 }));
    expect(scope.from).toBe(20);
    expect(scope.to).toBe(80);
  });

  it('clamps custom bounds to 0..99', () => {
    expect(resolveScope(withScope('custom', { from: -40, to: 500 }))).toMatchObject({
      from: 0,
      to: 99,
    });
    expect(resolveScope(withScope('custom', { from: 120, to: 130 }))).toMatchObject({
      from: 99,
      to: 99,
    });
  });

  it('survives nonsense custom bounds', () => {
    expect(resolveScope(withScope('custom', { from: Number.NaN, to: 12.6 }))).toMatchObject({
      from: 0,
      to: 13,
    });
  });

  it('falls back to full for an unknown scope id', () => {
    const scope = resolveScope({ ...settings, scopeId: 'nonsense' as ScopeId });
    expect(scope.id).toBe('full');
    expect(scope.from).toBe(0);
    expect(scope.to).toBe(99);
  });

  it('does not mutate the settings it reads', () => {
    const input = withScope('custom', { from: 90, to: 10 });
    const snapshot = structuredClone(input);
    resolveScope(input);
    expect(input).toEqual(snapshot);
  });
});

describe('inScope', () => {
  it('is inclusive at both ends', () => {
    const living = resolveScope(withScope('living'));
    expect(inScope(24, living)).toBe(false);
    expect(inScope(25, living)).toBe(true);
    expect(inScope(99, living)).toBe(true);
  });

  it('respects an upper-bounded scope', () => {
    const current = resolveScope(withScope('current'));
    expect(inScope(0, current)).toBe(true);
    expect(inScope(49, current)).toBe(true);
    expect(inScope(50, current)).toBe(false);
  });

  it('handles a single-year custom scope', () => {
    const one = resolveScope(withScope('custom', { from: 73, to: 73 }));
    expect(inScope(72, one)).toBe(false);
    expect(inScope(73, one)).toBe(true);
    expect(inScope(74, one)).toBe(false);
  });
});

describe('scopeYears', () => {
  it('enumerates the whole inclusive range', () => {
    expect(scopeYears(resolveScope(withScope('full')))).toHaveLength(100);
    expect(scopeYears(resolveScope(withScope('living')))).toHaveLength(75);
    expect(scopeYears(resolveScope(withScope('modern')))).toHaveLength(50);
    expect(scopeYears(resolveScope(withScope('current')))).toHaveLength(50);
  });

  it('starts and ends on the bounds', () => {
    const years = scopeYears(resolveScope(withScope('custom', { from: 40, to: 44 })));
    expect(years).toEqual([40, 41, 42, 43, 44]);
  });

  it('agrees with inScope for every year', () => {
    for (const scope of SCOPES) {
      const years = scopeYears(scope);
      for (let yy = 0; yy < 100; yy++) {
        expect(years.includes(yy)).toBe(inScope(yy, scope));
      }
    }
  });

  it('returns a fresh array', () => {
    const scope = resolveScope(settings);
    expect(scopeYears(scope)).not.toBe(scopeYears(scope));
  });
});
