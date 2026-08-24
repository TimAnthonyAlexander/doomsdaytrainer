import { resolveScope, scopeYears } from '@/domain/scope';
import type { Code, Scope, ScopeId, Settings, YearKey } from '@/domain/types';
import { deriveCode, formatYear } from '@/domain/yearCodes';
import { DEFAULT_SETTINGS } from '@/storage/defaults';

/**
 * Everything the onboarding flow decides, with no React in it.
 *
 * The flow holds a draft in component state and writes it once at the end, so a
 * user who abandons halfway gets a clean run next time. That makes the draft the
 * only interesting thing to test, and it lives here.
 */

/**
 * There was an `index` step between `why` and `scope`, asking whether 0 meant
 * Sunday or Monday. It renamed the seven buttons and changed no number
 * anywhere else, so picking Monday left every century anchor, every worked line
 * and every explanation in the app still counting from Sunday. Both the setting
 * and the screen are gone; Sunday is the only convention.
 */
export const ONBOARDING_STEPS = ['intro', 'why', 'scope', 'method'] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const STEP_COUNT = ONBOARDING_STEPS.length;

export interface CustomRange {
  from: YearKey;
  to: YearKey;
}

export interface OnboardingDraft {
  scopeId: ScopeId;
  /**
   * Raw input text, not numbers: a field cleared to "" must stay empty while the
   * user retypes it, rather than snapping back to 0 under the caret.
   */
  customFrom: string;
  customTo: string;
}

export function clampYear(value: number): YearKey {
  if (!Number.isFinite(value)) return 0;
  return Math.min(99, Math.max(0, Math.trunc(value)));
}

/** Digits only, at most two. Typing "250" leaves "25"; year 250 never exists. */
export function sanitiseYearText(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 2);
}

export function yearFromText(text: string): YearKey {
  const parsed = Number.parseInt(text, 10);
  return Number.isNaN(parsed) ? 0 : clampYear(parsed);
}

/** Clamped to 0..99 and ordered low-to-high. `resolveScope` does this too. */
export function normaliseRange(range: CustomRange): CustomRange {
  const a = clampYear(range.from);
  const b = clampYear(range.to);
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

export function draftRange(draft: OnboardingDraft): CustomRange {
  return normaliseRange({ from: yearFromText(draft.customFrom), to: yearFromText(draft.customTo) });
}

export function initialDraft(settings: Settings): OnboardingDraft {
  const range = normaliseRange(settings.customScope ?? { from: 0, to: 99 });
  return {
    scopeId: settings.scopeId,
    customFrom: formatYear(range.from),
    customTo: formatYear(range.to),
  };
}

export type OnboardingResult = Pick<
  Settings,
  'scopeId' | 'customScope' | 'onboardingComplete'
>;

/** The single patch handed to `updateSettings` when the last step is confirmed. */
export function settingsFromDraft(draft: OnboardingDraft): OnboardingResult {
  return {
    scopeId: draft.scopeId,
    customScope: draftRange(draft),
    onboardingComplete: true,
  };
}

/** The scope a draft would produce, resolved through the domain layer. */
export function resolvedScope(scopeId: ScopeId, custom: CustomRange): Scope {
  return resolveScope({ ...DEFAULT_SETTINGS, scopeId, customScope: custom });
}

/** Counted, never typed by hand: the number on screen is the real pool size. */
export function scopeItemCount(scopeId: ScopeId, custom: CustomRange): number {
  return scopeYears(resolvedScope(scopeId, custom)).length;
}

export function scopeRangeLabel(scopeId: ScopeId, custom: CustomRange): string {
  const scope = resolvedScope(scopeId, custom);
  return `${formatYear(scope.from)}–${formatYear(scope.to)}`;
}

export function stepNumber(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step) + 1;
}

/** Null when there is nothing after this step, which means "commit and leave". */
export function nextStep(step: OnboardingStep): OnboardingStep | null {
  const index = ONBOARDING_STEPS.indexOf(step);
  if (index < 0 || index === ONBOARDING_STEPS.length - 1) return null;
  return ONBOARDING_STEPS[index + 1];
}

/** Null on the first step. */
export function previousStep(step: OnboardingStep): OnboardingStep | null {
  const index = ONBOARDING_STEPS.indexOf(step);
  if (index <= 0) return null;
  return ONBOARDING_STEPS[index - 1];
}

export interface Derivation {
  yy: YearKey;
  /** Leap years passed inside the century, floor(yy / 4). */
  leaps: number;
  sum: number;
  code: Code;
}

/**
 * 73 rather than 03: floor(73 / 4) is 18, so the division visibly carries its
 * weight. The code itself comes from `deriveCode`, so the worked example on
 * screen cannot drift away from the table.
 */
export const EXAMPLE_YEAR: YearKey = 73;

/** The two years the index-convention demo holds still while the names change. */
export const INDEX_EXAMPLE_YEARS: readonly YearKey[] = [20, 44];

export function derivation(yy: YearKey): Derivation {
  const leaps = Math.floor(yy / 4);
  return { yy, leaps, sum: yy + leaps, code: deriveCode(yy) };
}
