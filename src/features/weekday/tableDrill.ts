import type { Code, ItemState, TableKind } from '@/domain/types';
import {
  ALL_CENTURIES,
  ALL_MONTHS,
  CENTURY_ANCHORS,
  centuryLabel,
  monthDoomsday,
  monthName,
  trueWeekdayName,
} from '@/domain/weekday';

/**
 * The sixteen supporting items: twelve month doomsdays and four century
 * anchors. Small and fixed, so they go through the same SM-2 machinery as the
 * year codes — and only through a direct answer here. A wrong weekday on the
 * trainer never touches them: after a computation done in the user's head,
 * which of the four steps failed is unknowable.
 */

export interface TableEntry {
  kind: TableKind;
  /** Month 1..12, or century 18..21. */
  key: number;
  item: ItemState;
}

/** Stable identity for a queue entry. */
export function entryId(kind: TableKind, key: number): string {
  return `${kind}:${key}`;
}

/** "March", "1900s". */
export function entryLabel(kind: TableKind, key: number): string {
  return kind === 'month' ? monthName(key) : centuryLabel(key);
}

/**
 * The answer. Month items are drilled on the plain, non-leap doomsday: the
 * leap shift is one rule over two months, not two more items to memorise.
 */
export function entryAnswer(kind: TableKind, key: number): number {
  return kind === 'month' ? monthDoomsday(key, false) : CENTURY_ANCHORS[key];
}

/** What the answer means, once it is on screen. */
export function entryAnswerNote(kind: TableKind, key: number): string {
  if (kind === 'month') {
    const day = monthDoomsday(key, false);
    if (key === 1) return `${monthName(1)} ${day}, and the 4th in a leap year.`;
    if (key === 2) return `${monthName(2)} ${day}, and the 29th in a leap year.`;
    return `${monthName(key)} ${day} falls on the year's doomsday.`;
  }
  return `${centuryLabel(key)} start on a ${trueWeekdayName(entryAnswer('century', key) as Code)}.`;
}

/* ------------------------------------------------------------------ */
/* The queue                                                           */
/* ------------------------------------------------------------------ */

function collect(kind: TableKind, keys: readonly number[], items: Record<string, ItemState>): TableEntry[] {
  return keys.map((key) => ({ kind, key, item: items[String(key)] }))
    .filter((entry): entry is TableEntry => Boolean(entry.item));
}

/** All sixteen in reading order: the twelve months, then the four centuries. */
export function allTableEntries(
  monthItems: Record<string, ItemState>,
  centuryItems: Record<string, ItemState>,
): TableEntry[] {
  return [...collect('month', ALL_MONTHS, monthItems), ...collect('century', ALL_CENTURIES, centuryItems)];
}

/**
 * What to ask next: everything due, oldest first, then anything never seen.
 * Sixteen items do not need a Learn mode of their own, so an item joins the
 * queue by being answered once.
 */
export function tableQueue(
  monthItems: Record<string, ItemState>,
  centuryItems: Record<string, ItemState>,
  now: number,
): TableEntry[] {
  const all = allTableEntries(monthItems, centuryItems);
  const due = all
    .filter((entry) => entry.item.introduced && entry.item.dueAt <= now)
    .sort((a, b) => a.item.dueAt - b.item.dueAt);
  const fresh = all.filter((entry) => !entry.item.introduced);
  return [...due, ...fresh];
}

/** Items that are introduced but not due yet, soonest first. */
export function nextTableDueAt(
  monthItems: Record<string, ItemState>,
  centuryItems: Record<string, ItemState>,
  now: number,
): number | null {
  let soonest: number | null = null;
  for (const entry of allTableEntries(monthItems, centuryItems)) {
    if (!entry.item.introduced || entry.item.dueAt <= now) continue;
    if (soonest === null || entry.item.dueAt < soonest) soonest = entry.item.dueAt;
  }
  return soonest;
}
