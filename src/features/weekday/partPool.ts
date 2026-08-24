/**
 * Where the two half-trainers get their prompts.
 *
 * A feature rather than domain code, because it draws at random and the domain
 * layer has no `Math.random` in it at all. Every function here takes its `rng`,
 * so a test can hand it a fixed sequence and get a fixed prompt.
 */

import type { MethodPart, WeekdayRange } from '@/domain/types';
import type { DatePartQuestion, YearPartQuestion } from '@/domain/methodParts';
import { datePartStatesYearKind } from '@/domain/methodParts';
import { ALL_MONTHS, monthLength, monthName } from '@/domain/weekday';

export type Rng = () => number;

export type PartPrompt =
  | { part: 'year'; question: YearPartQuestion }
  | { part: 'date'; question: DatePartQuestion };

/**
 * How many recent prompts a draw avoids.
 *
 * A window, not the growing "already seen" set the full-date trainer keeps.
 * That one can afford to remember everything because its pool is 146,097 dates
 * and a session cannot exhaust it. These pools are small — a hundred years in
 * the default range, and 425 distinct date prompts once January and February
 * are counted in both kinds of year — so a growing set would run out and the
 * trainer would have to start handing back repeats anyway, only after a
 * detour. Twenty is enough that nothing feels like it is repeating and small
 * enough that the draw always terminates.
 */
export const RECENT_WINDOW = 20;

const MAX_DRAWS = 24;

/** Stable identity for a prompt, so recent ones can be avoided. */
export function partPromptKey(prompt: PartPrompt): string {
  if (prompt.part === 'year') return `y:${prompt.question.fullYear}`;
  const { month, day, leapYear } = prompt.question;
  return `d:${month}:${day}:${leapYear ? 'l' : 'c'}`;
}

/** What the prompt says, for a label or a test. */
export function partPromptLabel(prompt: PartPrompt): string {
  if (prompt.part === 'year') return String(prompt.question.fullYear);
  const { month, day, leapYear } = prompt.question;
  const suffix = leapYear && datePartStatesYearKind(month) ? ', leap year' : '';
  return `${monthName(month)} ${day}${suffix}`;
}

function pick<T>(values: readonly T[], rng: Rng): T {
  const index = Math.min(values.length - 1, Math.max(0, Math.floor(rng() * values.length)));
  return values[index];
}

/**
 * A year from the range, uniform over years rather than over days.
 *
 * The full-date trainer is uniform over days on purpose, so the 31-day months
 * are not under-sampled. Here the day is not part of the question — there are
 * only as many prompts as there are years — so weighting by month length would
 * hand out February's years less often for no reason at all.
 *
 * "Living memory" ends today, and its final year is therefore only part of a
 * year. It is still drawn: a doomsday belongs to the whole year, and 2026's
 * exists in January whatever today's date is.
 */
export function randomYearIn(range: WeekdayRange, rng: Rng = Math.random): YearPartQuestion {
  const first = range.start.fullYear;
  const span = range.end.fullYear - first + 1;
  const offset = Math.min(span - 1, Math.max(0, Math.floor(rng() * span)));
  return { fullYear: first + offset };
}

/**
 * A month and a day, with no year anywhere in it.
 *
 * Uniform over months first and then over that month's days, which is
 * deliberately *not* uniform over the 365 pairs: the twelve month doomsdays
 * are twelve things to learn, and a February prompt is worth as much practice
 * as a March one even though February has three fewer days to draw from.
 *
 * The leap flag is drawn only for January and February, and evenly, because
 * they are the only two months whose doomsday moves and a trainer that showed
 * one kind of year far more often would let the other go unmet for weeks — the
 * same argument the Tables drill makes by asking both halves every time. For
 * the other ten months the flag changes neither the doomsday nor the month's
 * length, so it is fixed at false and the prompt never mentions a year kind
 * that does not matter.
 */
export function randomDatePart(rng: Rng = Math.random): DatePartQuestion {
  const month = pick(ALL_MONTHS, rng);
  const leapYear = datePartStatesYearKind(month) ? rng() < 0.5 : false;
  const day = pick(
    Array.from({ length: monthLength(month, leapYear) }, (_unused, index) => index + 1),
    rng,
  );
  return { month, day, leapYear };
}

function drawOnce(part: MethodPart, range: WeekdayRange, rng: Rng): PartPrompt {
  return part === 'year'
    ? { part: 'year', question: randomYearIn(range, rng) }
    : { part: 'date', question: randomDatePart(rng) };
}

/**
 * The next prompt, avoiding the ones just asked.
 *
 * Bounded draws and then whatever came up last, so this always terminates even
 * if the caller passes a `recent` set larger than the pool.
 */
export function nextPartPrompt(
  part: MethodPart,
  range: WeekdayRange,
  recent: ReadonlySet<string>,
  rng: Rng = Math.random,
): PartPrompt {
  let drawn = drawOnce(part, range, rng);
  for (let draw = 1; draw < MAX_DRAWS && recent.has(partPromptKey(drawn)); draw += 1) {
    drawn = drawOnce(part, range, rng);
  }
  return drawn;
}

/** The last `RECENT_WINDOW` keys, oldest dropped. */
export function rememberPrompt(recent: readonly string[], key: string): string[] {
  return [...recent, key].slice(-RECENT_WINDOW);
}
