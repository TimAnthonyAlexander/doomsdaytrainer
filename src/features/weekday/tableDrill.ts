import type { Code, ItemState, TableKind } from '@/domain/types';
import {
  ALL_CENTURIES,
  ALL_MONTHS,
  CENTURY_ANCHORS,
  centuryLabel,
  doomsdayDates,
  doomsdayShifts,
  isDoomsdayDate,
  monthDoomsday,
  monthName,
  ordinalDay,
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

/**
 * One question. An entry asks one of these, except January and February, which
 * ask two: their doomsday is the only thing in either table that depends on the
 * year, so a single answer can only ever be half of what the item is.
 */
export interface TablePrompt {
  kind: TableKind;
  key: number;
  /** Which year kind is being asked. Always false for the ten fixed months. */
  leapYear: boolean;
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
 * The questions this entry asks, in order: the common year first, then the
 * leap year, and only for the two months that move.
 *
 * Both, always, rather than one drawn at random. The leap case is not a harder
 * variant of the same fact, it is the other half of it — knowing February 28
 * and not February 29 gets one date in four wrong — and a drill that asks one
 * of the two lets a user pass the item for years without ever meeting the
 * other. Asking common first is the order the rule is stated in: the leap date
 * is the shifted one, so there has to be something for it to shift from.
 */
export function entryPrompts(kind: TableKind, key: number): TablePrompt[] {
  if (kind === 'month' && doomsdayShifts(key)) {
    return [
      { kind, key, leapYear: false },
      { kind, key, leapYear: true },
    ];
  }
  return [{ kind, key, leapYear: false }];
}

/** The taught answer: the date with the mnemonic, or the century's anchor code. */
export function entryAnswer(kind: TableKind, key: number, leapYear = false): number {
  return kind === 'month' ? monthDoomsday(key, leapYear) : CENTURY_ANCHORS[key];
}

/**
 * Every answer that is actually right.
 *
 * A century anchor is one code. A month has three to five doomsdays, because
 * dates a whole number of weeks apart are the same weekday, and any of them
 * anchors the day step just as well. The taught date is the one worth
 * remembering; it is not the only one that is true.
 */
export function entryAccepted(kind: TableKind, key: number, leapYear = false): readonly number[] {
  return kind === 'month' ? doomsdayDates(key, leapYear) : [CENTURY_ANCHORS[key]];
}

/** Whether that tap answers the question. */
export function entryAccepts(
  kind: TableKind,
  key: number,
  leapYear: boolean,
  value: number,
): boolean {
  return kind === 'month'
    ? isDoomsdayDate(key, leapYear, value)
    : value === CENTURY_ANCHORS[key];
}

/** "The 3rd", "The 10th and 17th", "The 10th, 17th and 24th". */
function joinDays(days: readonly number[]): string {
  const names = days.map(ordinalDay);
  if (names.length === 1) return `The ${names[0]}`;
  return `The ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The fact the question was asking for, once it is on screen. */
export function entryAnswerNote(kind: TableKind, key: number, leapYear = false): string {
  if (kind !== 'month') {
    return `${centuryLabel(key)} start on a ${trueWeekdayName(entryAnswer('century', key) as Code)}.`;
  }
  const day = monthDoomsday(key, leapYear);
  if (doomsdayShifts(key)) {
    return `${monthName(key)} ${day} is the doomsday in a ${leapYear ? 'leap' : 'common'} year.`;
  }
  return `${monthName(key)} ${day} falls on the year's doomsday.`;
}

/**
 * The other dates in the month that land on the same weekday, or null when
 * there are none to name. Shown beside the answer, because the whole reason a
 * month has more than one doomsday is a fact about the calendar worth having.
 */
export function entryAlternatesNote(
  kind: TableKind,
  key: number,
  leapYear = false,
): string | null {
  if (kind !== 'month') return null;
  const others = entryAccepted('month', key, leapYear).filter(
    (day) => day !== monthDoomsday(key, leapYear),
  );
  if (others.length === 0) return null;
  const verb = others.length === 1 ? 'falls' : 'fall';
  return `${joinDays(others)} ${verb} on it too: a week apart is the same weekday.`;
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
