import type { CalendarDate, WeekdayRange, WeekdayRangeId } from '@/domain/types';
import { MAX_YEAR, MIN_YEAR } from '@/domain/weekday';

/**
 * Where the trainer's dates come from.
 *
 * Pure, and deliberately uniform over *days* rather than over year/month/day
 * triples: picking a year and then a month would over-sample February and
 * under-sample the 31-day months. The conversion runs through `Date.UTC`, which
 * is arithmetic on a fixed calendar — no timezone, no DST, no string parsing.
 */

const MS_PER_DAY = 86_400_000;

/** Days since the epoch for a calendar date. Month is 1-based. */
export function dayNumber(date: CalendarDate): number {
  return Date.UTC(date.fullYear, date.month - 1, date.day) / MS_PER_DAY;
}

export function dateFromDayNumber(days: number): CalendarDate {
  const d = new Date(days * MS_PER_DAY);
  return { fullYear: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** "1987-03-14". The identity of a date within one session. */
export function dateKey(date: CalendarDate): string {
  const month = date.month < 10 ? `0${date.month}` : String(date.month);
  const day = date.day < 10 ? `0${date.day}` : String(date.day);
  return `${date.fullYear}-${month}-${day}`;
}

export function sameDate(a: CalendarDate, b: CalendarDate): boolean {
  return a.fullYear === b.fullYear && a.month === b.month && a.day === b.day;
}

/* ------------------------------------------------------------------ */
/* Ranges                                                              */
/* ------------------------------------------------------------------ */

/** Local today, clamped into the supported range. */
function today(now: number): CalendarDate {
  const d = new Date(now);
  const fullYear = Math.min(MAX_YEAR, Math.max(MIN_YEAR, d.getFullYear()));
  return { fullYear, month: d.getMonth() + 1, day: d.getDate() };
}

/**
 * The three filters, independent of the year-code Scope setting. Living memory
 * runs to today rather than to the end of this year, because a birthday in
 * November 2026 is not yet a date anybody remembers.
 */
export function weekdayRanges(now: number): WeekdayRange[] {
  return [
    {
      id: 'century',
      label: 'This century',
      start: { fullYear: 2000, month: 1, day: 1 },
      end: { fullYear: 2099, month: 12, day: 31 },
    },
    {
      id: 'living',
      label: 'Living memory',
      start: { fullYear: 1925, month: 1, day: 1 },
      end: today(now),
    },
    {
      id: 'full',
      label: 'Full range',
      start: { fullYear: MIN_YEAR, month: 1, day: 1 },
      end: { fullYear: MAX_YEAR, month: 12, day: 31 },
    },
  ];
}

export function rangeById(id: WeekdayRangeId, now: number): WeekdayRange {
  const ranges = weekdayRanges(now);
  return ranges.find((range) => range.id === id) ?? ranges[2];
}

/** Days in the range, both ends included. */
export function rangeSize(range: WeekdayRange): number {
  return dayNumber(range.end) - dayNumber(range.start) + 1;
}

export function inRange(date: CalendarDate, range: WeekdayRange): boolean {
  const n = dayNumber(date);
  return n >= dayNumber(range.start) && n <= dayNumber(range.end);
}

/* ------------------------------------------------------------------ */
/* Drawing a prompt                                                    */
/* ------------------------------------------------------------------ */

export type Rng = () => number;

/** Uniform over every day in the range. */
export function randomDateIn(range: WeekdayRange, rng: Rng = Math.random): CalendarDate {
  const first = dayNumber(range.start);
  const size = rangeSize(range);
  const offset = Math.min(size - 1, Math.max(0, Math.floor(rng() * size)));
  return dateFromDayNumber(first + offset);
}

const MAX_DRAWS = 24;

/**
 * The next prompt, never one the session has already asked. Random draws first,
 * because the sequence has to look random; a linear walk only takes over once
 * the draws keep colliding, which guarantees the function terminates even if a
 * session somehow exhausts a range.
 */
export function nextDate(
  range: WeekdayRange,
  seen: ReadonlySet<string>,
  rng: Rng = Math.random,
): CalendarDate {
  const size = rangeSize(range);
  const first = dayNumber(range.start);

  let drawn = randomDateIn(range, rng);
  for (let draw = 1; draw < MAX_DRAWS && seen.has(dateKey(drawn)); draw += 1) {
    drawn = randomDateIn(range, rng);
  }
  if (!seen.has(dateKey(drawn))) return drawn;

  const from = dayNumber(drawn);
  for (let step = 1; step < size; step += 1) {
    const candidate = dateFromDayNumber(first + ((from - first + step) % size));
    if (!seen.has(dateKey(candidate))) return candidate;
  }
  // Every date in the range has been asked. Nothing left to avoid.
  return drawn;
}
