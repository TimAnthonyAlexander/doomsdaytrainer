/**
 * The numbers behind the explainer that opens the Concept screen.
 *
 * None of them are typed into the copy. An explainer that states its own
 * arithmetic is the first thing to rot: the tables move, the wording stays, and
 * the screen that teaches the method starts teaching a different one. So every
 * figure here comes out of the same functions the trainer uses, and a test
 * checks the whole worked example against `guidedWalk` for the same date, which
 * is itself checked against the real calendar.
 *
 * The date is fixed. A random one would sometimes land on a month whose
 * doomsday is the awkward case, and an explainer gets one shot at being simple.
 */

import { leapDays, reduce28, sevenStep } from '@/domain/calc';
import { ordinal } from '@/domain/dayStep';
import type { CalendarDate, Code } from '@/domain/types';
import {
  CENTURY_ANCHORS,
  MONTH_DOOMSDAYS,
  centuryAnchor,
  centuryLabel,
  centuryOf,
  formatDate,
  isLeapYear,
  monthDoomsday,
  monthName,
  weekdayName,
  weekdayFor,
  yearKeyOf,
} from '@/domain/weekday';
import { formatYear } from '@/domain/yearCodes';

/** 20 March 2026. The worked example the explainer runs on, start to finish. */
export const INTRO_DATE: CalendarDate = { fullYear: 2026, month: 3, day: 20 };

export interface IntroExample {
  /** "20 March 2026". */
  dateLabel: string;
  fullYear: number;
  /** "26". */
  yy: string;
  /** 26, the last two digits as a number. */
  yyValue: number;
  /** 6. A quarter of the year, dropped to a whole number. */
  quarters: number;
  /** 32. */
  rawSum: number;
  /** 28. The sevens that come off. */
  sevensOff: number;
  /** 4. */
  yearCode: Code;
  /** "2000s". */
  century: string;
  /** 2. */
  anchor: Code;
  /** 6, before the sevens come off. Here they take nothing. */
  doomsdaySum: number;
  /** 6. */
  doomsday: Code;
  /** "Saturday". */
  doomsdayName: string;
  /** "March". */
  month: string;
  /** 14. */
  monthDoomsday: number;
  /** "14th". */
  monthDoomsdayOrdinal: string;
  /** 20. */
  day: number;
  /** "20th". */
  dayOrdinal: string;
  /** 6. */
  daysOn: number;
  /** 12. */
  finalSum: number;
  /** 7. The sevens that come off the final sum. */
  finalSevensOff: number;
  /** 5. */
  weekday: Code;
  /** "Friday". */
  weekdayName: string;
}

export function introExample(): IntroExample {
  const { fullYear, month, day } = INTRO_DATE;
  const yyValue = yearKeyOf(fullYear);
  const reduced = reduce28(yyValue);
  const quarters = leapDays(reduced);
  const rawSum = reduced + quarters;
  const codeStep = sevenStep(rawSum);
  const yearCode = codeStep.remainder as Code;
  const anchor = centuryAnchor(fullYear);
  const doomsdaySum = anchor + yearCode;
  const doomsday = sevenStep(doomsdaySum).remainder as Code;
  const anchorDay = monthDoomsday(month, isLeapYear(fullYear));
  const daysOn = day - anchorDay;
  const finalSum = doomsday + daysOn;
  const finalStep = sevenStep(finalSum);
  const weekday = finalStep.remainder as Code;

  return {
    dateLabel: formatDate(fullYear, month, day),
    fullYear,
    yy: formatYear(yyValue),
    yyValue,
    quarters,
    rawSum,
    sevensOff: codeStep.multiple,
    yearCode,
    century: centuryLabel(centuryOf(fullYear)),
    anchor,
    doomsdaySum,
    doomsday,
    doomsdayName: weekdayName(doomsday),
    month: monthName(month),
    monthDoomsday: anchorDay,
    monthDoomsdayOrdinal: ordinal(anchorDay),
    day,
    dayOrdinal: ordinal(day),
    daysOn,
    finalSum,
    finalSevensOff: finalStep.multiple,
    weekday,
    weekdayName: weekdayName(weekday),
  };
}

/** One month, and the date in it that lands on the year's doomsday. */
export interface IntroMonth {
  month: number;
  /** "Apr". */
  short: string;
  /** The non-leap date. */
  day: number;
  /** The leap-year date, when it differs. Only January and February have one. */
  leapDay: number | null;
}

/**
 * The twelve doomsday dates, in the four groups they are actually remembered
 * in rather than in calendar order.
 *
 * Calendar order is how the table is stored and the worst way to learn it: it
 * hides that five of the twelve are the month's own number and that four more
 * are two swapped pairs. The grouping is the mnemonic.
 */
export interface IntroGroup {
  id: 'even' | 'odd' | 'march' | 'leap';
  /** The mnemonic itself, as it is actually said. */
  title: string;
  /** Which months it covers, in one short line. */
  hint: string;
  /**
   * What the mnemonic unpacks to. A mnemonic nobody can cash out is worse than
   * no mnemonic: "9 to 5 at 7-11" is a phrase until it is spelled out that 9
   * and 5 are a pair working both ways round, and so are 7 and 11.
   */
  detail: string;
  months: readonly IntroMonth[];
}

function entry(month: number): IntroMonth {
  const day = MONTH_DOOMSDAYS[month - 1];
  const leap = monthDoomsday(month, true);
  return {
    month,
    short: monthName(month).slice(0, 3),
    day,
    leapDay: leap === day ? null : leap,
  };
}

export function introGroups(): IntroGroup[] {
  return [
    {
      id: 'even',
      title: 'The date is the month',
      hint: 'Every even month except February.',
      detail: '4/4, 6/6, 8/8, 10/10, 12/12.',
      months: [4, 6, 8, 10, 12].map(entry),
    },
    {
      id: 'odd',
      title: '9-5 at 7-Eleven',
      hint: 'The four odd months that are not March.',
      detail:
        'Two pairs, and each pair works both ways round. 9 and 5 give the 5th of the 9th and the 9th of the 5th. 7 and 11 give the 11th of the 7th and the 7th of the 11th.',
      months: [5, 7, 9, 11].map(entry),
    },
    {
      id: 'march',
      title: 'Pi day',
      hint: 'March, the odd one left over.',
      detail: '3/14, the 14th of March.',
      months: [3].map(entry),
    },
    {
      id: 'leap',
      title: 'The only two that move',
      hint: 'January and February, which a leap day pushes on by one.',
      detail:
        "February is the last day of the month, so the 28th, or the 29th in a leap year. January is the 3rd, or the 4th. If the last day of February is awkward to picture, step back a week: the 7th, or the 8th in a leap year.",
      months: [1, 2].map(entry),
    },
  ];
}

/** One century and the number every year in it starts from. */
export interface IntroCentury {
  /** "2000s". */
  label: string;
  anchor: Code;
  /** True for the century the worked example sits in. */
  current: boolean;
}

/**
 * All four century anchors, oldest first.
 *
 * The explainer used to name only the one the example needed, which left the
 * century looking like a constant rather than a lookup. Four rows is the
 * cheapest way to say "this changes, and here is the whole of it".
 */
export function introCenturies(): IntroCentury[] {
  const here = centuryOf(INTRO_DATE.fullYear);
  return Object.keys(CENTURY_ANCHORS)
    .map(Number)
    .sort((a, b) => a - b)
    .map((century) => ({
      label: centuryLabel(century),
      anchor: CENTURY_ANCHORS[century],
      current: century === here,
    }));
}

/** The weekday of the intro date, straight off the calendar maths. */
export function introTrueWeekday(): Code {
  return weekdayFor(INTRO_DATE.fullYear, INTRO_DATE.month, INTRO_DATE.day);
}
