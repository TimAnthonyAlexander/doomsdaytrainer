/**
 * Which date the walkthrough is standing on, and how it gets there.
 *
 * The control is a native `<input type="date">` with `min` and `max`. It gets a
 * real picker on a phone, needs no dependency, and is not an answer field, so
 * the seven-button rule is not in play. What it hands back is a string, and a
 * string from a control the user can also type into. Everything here exists so
 * that string cannot reach the maths: `guidedWalk` throws on a date outside
 * 1800-2199 or on a day the month does not have, and a screen is not the place
 * to find that out.
 */

import type { CalendarDate, WeekdayRange } from '@/domain/types';
import { isWalkableDate } from '@/domain/guidedDate';
import { MAX_YEAR, MIN_YEAR, daysInMonth } from '@/domain/weekday';
import { dateKey, randomDateIn, type Rng } from '@/features/weekday/datePool';

/** The first and last dates the app's calendar maths is tested across. */
export const CONCEPT_MIN: CalendarDate = { fullYear: MIN_YEAR, month: 1, day: 1 };
export const CONCEPT_MAX: CalendarDate = { fullYear: MAX_YEAR, month: 12, day: 31 };

/** The `min` and `max` attributes, in the format the input speaks. */
export const CONCEPT_MIN_INPUT = dateKey(CONCEPT_MIN);
export const CONCEPT_MAX_INPUT = dateKey(CONCEPT_MAX);

const FULL_RANGE: WeekdayRange = {
  id: 'full',
  label: 'Full range',
  start: CONCEPT_MIN,
  end: CONCEPT_MAX,
};

/** "1987-03-20". What the input's `value` wants. */
export function toDateInput(date: CalendarDate): string {
  return dateKey(date);
}

/**
 * The date a "YYYY-MM-DD" string names, or null.
 *
 * Null for anything that is not that shape and for anything that is not a day
 * of the month it names. 31 February is not a date to clamp into range, it is a
 * date to refuse.
 */
export function parseDateInput(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date: CalendarDate = {
    fullYear: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  if (date.month < 1 || date.month > 12) return null;
  if (date.day < 1 || date.day > daysInMonth(date.fullYear, date.month)) return null;
  return date;
}

/**
 * Pulled into range by year.
 *
 * The ends of the range are 1 January and 31 December, so comparing years is
 * exact and there is no day arithmetic to get wrong. Day arithmetic would also
 * be quietly hostile here: `Date.UTC` maps a two-digit year onto the 1900s, so
 * a typed year of 0099 would land inside the range instead of below it.
 */
export function clampDate(date: CalendarDate): CalendarDate {
  if (date.fullYear < MIN_YEAR) return CONCEPT_MIN;
  if (date.fullYear > MAX_YEAR) return CONCEPT_MAX;
  return date;
}

/**
 * What the walk should use after the picker changes. Anything unparseable
 * leaves the walk where it was rather than emptying the screen.
 */
export function readDateInput(value: string, fallback: CalendarDate): CalendarDate {
  const parsed = parseDateInput(value);
  if (parsed === null) return fallback;
  const clamped = clampDate(parsed);
  return isWalkableDate(clamped) ? clamped : fallback;
}

/** Uniform over every day in range. Randomness lives here, never in the domain. */
export function randomConceptDate(rng: Rng = Math.random): CalendarDate {
  return randomDateIn(FULL_RANGE, rng);
}
