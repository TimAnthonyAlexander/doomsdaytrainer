import type { HintType, ItemState, YearKey } from '@/domain/types';
import { masteryBucket } from '@/domain/scheduler';
import { anchorFor, blockOf, codeFor, formatYear } from '@/domain/yearCodes';

/**
 * One labelled line of a hint. Every number a hint puts on screen gets a label
 * saying what it is — an unlabelled `6 + 1 = 7` tells the user nothing about
 * which number came from where, so it cannot teach the method.
 */
export interface HintStep {
  label: string;
  value: string;
}

export interface Hint {
  /** What was actually rendered. Anchor falls back to structural. */
  type: HintType;
  /** The line the user reads. */
  text: string;
  /** The named parts behind that line. */
  steps: HintStep[];
  /** What is left for them to do. Omitted when the text already says it. */
  note?: string;
}

/** Consecutive failures at which the structural hint appears unasked. */
export const AUTO_HINT_FAILURES = 2;

export function shouldAutoHint(item: ItemState): boolean {
  return item.consecutiveFailures >= AUTO_HINT_FAILURES;
}

/**
 * An item counts as an anchor once it is introduced and has reached the
 * 4-9 day bucket. Anchoring off something the user is themselves still
 * learning would hand them two guesses instead of one fact.
 */
export function isAnchorKnown(item: ItemState | undefined): boolean {
  return item !== undefined && item.introduced && masteryBucket(item) >= 3;
}

/** The block this year sits in, and where that block starts. */
export function structuralHint(yy: YearKey): Hint {
  const { start, end, startCode } = blockOf(yy);
  return {
    type: 'structural',
    text: `${formatYear(yy)} sits in the block ${formatYear(start)}–${formatYear(end)}.`,
    steps: [
      { label: 'Block', value: `${formatYear(start)}–${formatYear(end)}` },
      { label: `Code of ${formatYear(start)}`, value: String(startCode) },
      { label: `Years from ${formatYear(start)} to ${formatYear(yy)}`, value: String(yy - start) },
    ],
    note: 'Inside a block each year adds one. Count up from the block start, and wrap past 6 back to 0.',
  };
}

/**
 * The escape hatch: the formula with this year's numbers in it and each one
 * named, stopping one step short of the answer.
 *
 * The middle number is the one that confuses people — it is how many leap days
 * have gone by since the start of the century, which is why the code drifts an
 * extra day every four years. Saying "+ 1" without saying that teaches nothing.
 */
export function arithmeticHint(yy: YearKey): Hint {
  const leapDays = Math.floor(yy / 4);
  return {
    type: 'arithmetic',
    text: `${formatYear(yy)} + ${leapDays} = ${yy + leapDays}`,
    steps: [
      { label: 'The year', value: formatYear(yy) },
      { label: `Leap days since 00 (${formatYear(yy)} ÷ 4, rounded down)`, value: String(leapDays) },
      { label: 'Year plus leap days', value: String(yy + leapDays) },
    ],
    note: `Divide ${yy + leapDays} by 7 and keep the remainder. That remainder is the code.`,
  };
}

/** The nearest year the user already knows, to count on from. */
export function anchorHint(yy: YearKey, known: (candidate: YearKey) => boolean): Hint {
  const anchor = anchorFor(yy, known);
  if (anchor === null) return structuralHint(yy);
  // The gap in years is deliberately not given: naming it would finish the
  // derivation, and it is wrong across a block boundary, where the code
  // jumps by two rather than one.
  return {
    type: 'anchor',
    text: `You already know ${formatYear(anchor)}.`,
    steps: [
      { label: 'Nearest code you know', value: formatYear(anchor) },
      { label: `Code of ${formatYear(anchor)}`, value: String(codeFor(anchor)) },
      { label: 'Year you want', value: formatYear(yy) },
    ],
    note: 'Step forward from there. Each year adds one, except where a block ends, which adds two.',
  };
}

/**
 * The hint for this item under the user's preference. `lookup` reads item state
 * by year, used only by the anchor hint to decide what counts as known.
 */
export function hintFor(
  yy: YearKey,
  type: HintType,
  lookup: (candidate: YearKey) => ItemState | undefined,
): Hint {
  if (type === 'arithmetic') return arithmeticHint(yy);
  if (type === 'anchor') return anchorHint(yy, (candidate) => isAnchorKnown(lookup(candidate)));
  return structuralHint(yy);
}
