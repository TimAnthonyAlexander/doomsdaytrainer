import type { HintType, YearKey } from '@/domain/types';
import { anchorHint, arithmeticHint, structuralHint, type Hint } from '@/features/review/hints';

/**
 * Everything the settings screen decides, with no React in it.
 *
 * The interesting part is the latency pair: two numbers that are only meaningful
 * relative to each other, edited independently. The rule lives here so the
 * screen cannot hold an impossible pair even for one render.
 */

/** Mirrors the version field in package.json. Shown once, in About. */
export const APP_VERSION = '1.0.0';

export const NEW_ITEMS_MIN = 0;
export const NEW_ITEMS_MAX = 40;

export const AUTO_ADVANCE_MIN = 0;
export const AUTO_ADVANCE_MAX = 1000;
export const AUTO_ADVANCE_STEP = 50;

export const LATENCY_MIN_MS = 200;
export const LATENCY_MAX_MS = 20_000;
/** Smallest distance between the two cutoffs, so grade 4 always has room. */
export const LATENCY_GAP_MS = 100;

export interface Thresholds {
  fastThresholdMs: number;
  mediumThresholdMs: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Raising `fast` to or past `medium` pushes `medium` up rather than refusing the
 * edit: the user asked for a wider grade-5 band, and moving the other cutoff is
 * the only reading of that which stays valid.
 */
export function withFastThreshold(current: Thresholds, raw: number): Thresholds {
  const fastThresholdMs = clamp(raw, LATENCY_MIN_MS, LATENCY_MAX_MS - LATENCY_GAP_MS);
  return {
    fastThresholdMs,
    mediumThresholdMs: Math.max(current.mediumThresholdMs, fastThresholdMs + LATENCY_GAP_MS),
  };
}

/** The mirror image: lowering `medium` under `fast` drags `fast` down with it. */
export function withMediumThreshold(current: Thresholds, raw: number): Thresholds {
  const mediumThresholdMs = clamp(raw, LATENCY_MIN_MS + LATENCY_GAP_MS, LATENCY_MAX_MS);
  return {
    fastThresholdMs: Math.min(current.fastThresholdMs, mediumThresholdMs - LATENCY_GAP_MS),
    mediumThresholdMs,
  };
}

/** Digits only, at most five. Nothing above 20000ms is accepted anyway. */
export function sanitiseMsText(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 5);
}

export function msFromText(text: string, fallback: number): number {
  const parsed = Number.parseInt(text, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** "HH:MM", 24h. An empty or half-typed time field must not be persisted. */
export function isReminderTime(text: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(text)) return false;
  const [hours, minutes] = text.split(':').map((part) => Number.parseInt(part, 10));
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/* ------------------------------------------------------------------ */
/* Hint preview                                                        */
/* ------------------------------------------------------------------ */

/** 73 for the same reason the onboarding derivation uses it: the maths shows. */
export const HINT_EXAMPLE_YEAR: YearKey = 73;
/** The neighbour the anchor preview pretends is already mastered. */
export const HINT_EXAMPLE_ANCHOR: YearKey = 72;

export interface HintChoice {
  type: HintType;
  label: string;
  hint: Hint;
  /**
   * What this hint asks the user to do to get from the hint to the answer,
   * when that is a walk along the table rather than a jump to one year.
   *
   * Both the structural and anchor hints are counting procedures, and offering
   * them without saying so is how the app came to teach the run instead of the
   * pairs. Arithmetic is the only one of the three that can be entered at any
   * year, which is why it leads the list and carries no caution.
   */
  caution: string | null;
}

/**
 * One rendered example per hint type, from the real renderers.
 *
 * The anchor example is handed a fixed "72 is known" predicate rather than the
 * user's item state. Left to real state it would fall back to the structural
 * hint on a fresh install, and the user would be picking between two options
 * that print the same line.
 */
export function hintChoices(): HintChoice[] {
  return [
    {
      type: 'arithmetic',
      label: 'Arithmetic',
      hint: arithmeticHint(HINT_EXAMPLE_YEAR),
      caution: null,
    },
    {
      type: 'structural',
      label: 'Structural',
      hint: structuralHint(HINT_EXAMPLE_YEAR),
      caution: 'Asks you to count up from the start of a block.',
    },
    {
      type: 'anchor',
      label: 'Anchor',
      hint: anchorHint(HINT_EXAMPLE_YEAR, (candidate) => candidate === HINT_EXAMPLE_ANCHOR),
      caution: 'Asks you to step forward from a year you already know.',
    },
  ];
}

/* ------------------------------------------------------------------ */
/* The optional answer window                                          */
/* ------------------------------------------------------------------ */

/**
 * The window choices, in millis, with null for off.
 *
 * The numbers are not free-form because the useful range is narrow and the
 * ends of it are both traps. Too short and every prompt expires into a hint,
 * which teaches nothing and makes the grade cap permanent. Too long and it
 * stops separating anything: XtraMath, who publish their reasoning, put their
 * own cut at three seconds and say plainly that six seconds does not measure
 * fluency at all.
 */
export const ANSWER_WINDOW_OFF = 0;

export const ANSWER_WINDOW_CHOICES: readonly { value: number; label: string }[] = [
  { value: ANSWER_WINDOW_OFF, label: 'Off' },
  { value: 4000, label: '4s' },
  { value: 3000, label: '3s' },
  { value: 2000, label: '2s' },
];

/**
 * `null` is the stored "off", but a toggle group cannot hold null as a value,
 * so 0 stands in for it at the UI edge and only there.
 */
export function answerWindowToSetting(value: number): number | null {
  return value === ANSWER_WINDOW_OFF ? null : value;
}

export function answerWindowToChoice(windowMs: number | null): number {
  return windowMs ?? ANSWER_WINDOW_OFF;
}

export function answerWindowLabel(windowMs: number | null): string {
  const value = answerWindowToChoice(windowMs);
  return ANSWER_WINDOW_CHOICES.find((choice) => choice.value === value)?.label ?? 'Off';
}
