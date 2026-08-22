import type { Code, IndexConvention } from '@/domain/types';
import { weekdayName } from '@/domain/yearCodes';
import { MONTH_DOOMSDAY_VALUES, weekdayAbbr } from '@/domain/weekday';

/**
 * What the two answer pads offer, and in what order.
 *
 * The seven weekday buttons keep the pad's contract: exactly seven, fixed
 * positions, one tap per answer. `settings.indexConvention` decides which day
 * sits in position 0 — Sunday-indexed puts Sunday first, Monday-indexed puts
 * Monday first — and that is the only thing it changes. The *value* behind a
 * button is always the Sunday-indexed code, because the shipped tables are.
 */

export interface WeekdayOption {
  /** Sunday-indexed weekday code, 0..6. What the tables produce. */
  value: Code;
  /** "Sunday". */
  name: string;
  /** "Sun". The pad's numerals are wide, so the buttons use this. */
  short: string;
}

export function weekdayOptions(convention: IndexConvention): WeekdayOption[] {
  return Array.from({ length: 7 }, (_unused, position) => {
    // Position 0 is Sunday (code 0) or Monday (code 1) depending on convention.
    const value = ((convention === 'monday' ? position + 1 : position) % 7) as Code;
    return {
      value,
      name: weekdayName(value, 'sunday'),
      short: weekdayAbbr(value, 'sunday'),
    };
  });
}

/**
 * The twelve buttons of the month-doomsday pad: every value a month doomsday
 * can take, ascending, always the same twelve in the same places. The set is a
 * permutation of the answers, so the pad is a genuine forced choice rather
 * than a multiple-choice question with made-up distractors.
 */
export const MONTH_PAD_VALUES: readonly number[] = MONTH_DOOMSDAY_VALUES;
