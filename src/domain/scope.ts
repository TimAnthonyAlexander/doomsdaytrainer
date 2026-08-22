import type { Scope, Settings, YearKey } from './types';

/**
 * The fixed scopes. 'custom' carries placeholder bounds; `resolveScope` fills
 * them from settings.
 */
export const SCOPES: readonly Scope[] = [
  { id: 'full', label: 'Full', from: 0, to: 99 },
  { id: 'living', label: 'Living memory', from: 25, to: 99 },
  { id: 'modern', label: 'Modern', from: 50, to: 99 },
  { id: 'current', label: 'Current era', from: 0, to: 49 },
  { id: 'custom', label: 'Custom range', from: 0, to: 99 },
];

const FULL: Scope = SCOPES[0];

function clampYear(yy: number): YearKey {
  if (!Number.isFinite(yy)) return 0;
  return Math.min(99, Math.max(0, Math.round(yy)));
}

/** The scope actually in force, with custom bounds clamped and normalised. */
export function resolveScope(settings: Settings): Scope {
  const base = SCOPES.find((s) => s.id === settings.scopeId);
  if (!base) return FULL;
  if (base.id !== 'custom') return base;

  const raw = settings.customScope ?? { from: 0, to: 99 };
  const a = clampYear(raw.from);
  const b = clampYear(raw.to);
  return { id: 'custom', label: base.label, from: Math.min(a, b), to: Math.max(a, b) };
}

export function inScope(yy: YearKey, scope: Scope): boolean {
  return yy >= scope.from && yy <= scope.to;
}

export function scopeYears(scope: Scope): YearKey[] {
  const years: YearKey[] = [];
  for (let yy = scope.from; yy <= scope.to; yy++) years.push(yy);
  return years;
}
