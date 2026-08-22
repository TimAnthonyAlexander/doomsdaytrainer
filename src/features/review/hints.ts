import type { HintType, ItemState, YearKey } from '@/domain/types';
import { masteryBucket } from '@/domain/scheduler';
import { anchorFor, blockOf, codeFor, formatYear } from '@/domain/yearCodes';

export interface Hint {
  /** What was actually rendered. Anchor falls back to structural. */
  type: HintType;
  /** The line the user reads. */
  text: string;
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

/** "Block 72-75, starts at 6." The derivation stays the user's job. */
export function structuralHint(yy: YearKey): Hint {
  const { start, end, startCode } = blockOf(yy);
  return {
    type: 'structural',
    text: `Block ${formatYear(start)}–${formatYear(end)}, starts at ${startCode}.`,
    note: 'Inside a block the code steps up by one each year.',
  };
}

/**
 * The escape hatch: the sum, worked out, stopping one step short.
 * `(yy + floor(yy / 4)) mod 7` with this year's numbers in it, minus the mod.
 */
export function arithmeticHint(yy: YearKey): Hint {
  const quarters = Math.floor(yy / 4);
  return {
    type: 'arithmetic',
    text: `${formatYear(yy)} + ${quarters} = ${yy + quarters}`,
    note: 'Now take the remainder after dividing by 7.',
  };
}

/** "72 → 6, so 73 → ?" Falls back to structural when nothing below is known. */
export function anchorHint(yy: YearKey, known: (candidate: YearKey) => boolean): Hint {
  const anchor = anchorFor(yy, known);
  if (anchor === null) return structuralHint(yy);
  // No note: naming the gap in years would finish the derivation for them,
  // and it would be wrong across a leap boundary, where the code jumps by two.
  return { type: 'anchor', text: `${formatYear(anchor)} → ${codeFor(anchor)}, so ${formatYear(yy)} → ?` };
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
