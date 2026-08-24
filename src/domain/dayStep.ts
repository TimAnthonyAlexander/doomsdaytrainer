/**
 * The last step of the Doomsday method, on its own: from a month's doomsday to
 * any other day in that month.
 *
 * The weekday trainer asks for a whole date end to end, so when an answer takes
 * six seconds it cannot say which part of the method spent them — the century
 * anchor, the year code, the month doomsday, or this final count off the
 * doomsday. David Turner's doomsday writeup memorises day-of-month mod 7 for 1
 * to 31 outright, precisely because this step is done while the rest of the
 * date is still being read out. It is a component skill, and a component skill
 * needs its own clock.
 *
 * The arithmetic is one line: `(anchorWeekday + targetDay - anchorDay) mod 7`.
 * Everything else here exists to say which numbers went into it.
 *
 * The anchor is always a real month doomsday, from `monthDoomsday`, so the step
 * being drilled is the step the method actually asks for. The weekday that
 * doomsday falls on is given by the prompt rather than taken from a real year:
 * a stated weekday cannot be recalled, so the only way to the answer is to
 * count.
 *
 * Pure and framework-free, and there is no `Math.random` here. The question
 * generator lives in src/features/weekday/dayStepPlan.ts, where randomness is
 * allowed and injectable.
 */

import type { Code, DayStepDirection, DayStepSize } from './types';
import { daysInMonth, monthName, weekdayName } from './weekday';

/** Every step size a question can have, ascending. Persisted as keys. */
export const DAY_STEP_SIZES: readonly DayStepSize[] = [0, 1, 2, 3, 4, 5, 6];

/** Both directions, in the order the breakdown lists them. */
export const DAY_STEP_DIRECTIONS: readonly DayStepDirection[] = ['forward', 'backward'];

/**
 * One prompt: a month, the weekday its doomsday falls on, and the day being
 * asked for. Nothing here is a real date, and that is the point — see the file
 * comment.
 */
export interface DayStepQuestion {
  /** 1..12, 1 = January. */
  month: number;
  /** Whether the leap-year doomsday is in force. Only moves January and February. */
  leapYear: boolean;
  /** The month's doomsday date. Always `monthDoomsday(month, leapYear)`. */
  anchorDay: number;
  /** The weekday the prompt states for that doomsday, Sunday-indexed. */
  anchorWeekday: Code;
  /** Any other day of the month. Never the doomsday itself. */
  targetDay: number;
}

/* ------------------------------------------------------------------ */
/* Calendar helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * 28..31, taken from the leap flag rather than from a year.
 *
 * `daysInMonth` needs a real year and a day-step prompt has none: it names a
 * month and says whether the leap-year doomsday is in force. 2000 and 1900 are
 * the two years handed over, because 2000 is a leap year and 1900 is not, and
 * the month lengths depend on nothing else.
 */
export function monthLength(month: number, leapYear: boolean): number {
  return daysInMonth(leapYear ? 2000 : 1900, month);
}

/**
 * How far the target sits from the doomsday, reduced mod 7. This is the number
 * that gets added to the anchor weekday, so it is what the user actually works
 * with, and it is what the per-step breakdown is keyed by.
 *
 * Zero is a real answer, not an error: the 7th, 14th, 21st and 28th of a month
 * whose doomsday is the 14th are all a whole number of weeks away and all fall
 * on the doomsday's weekday. Those are the cheapest steps in the method and the
 * ones worth watching, because a user who is slow on them has not noticed the
 * pattern yet.
 */
export function stepSize(anchorDay: number, targetDay: number): DayStepSize {
  return ((((targetDay - anchorDay) % 7) + 7) % 7) as DayStepSize;
}

/**
 * Which way along the calendar the target sits. Counting back off the doomsday
 * is the harder half — the addition turns into a subtraction that can go
 * negative — so the two are never averaged together.
 *
 * A target equal to the doomsday is not a step at all; nothing may ask it.
 */
export function stepDirection(anchorDay: number, targetDay: number): DayStepDirection {
  if (targetDay === anchorDay) {
    throw new RangeError(`The target day is the doomsday itself: ${targetDay}`);
  }
  return targetDay > anchorDay ? 'forward' : 'backward';
}

/** Every day of the month that can be asked: all of them but the doomsday. */
export function validTargetDays(month: number, leapYear: boolean, anchorDay: number): number[] {
  const length = monthLength(month, leapYear);
  const days: number[] = [];
  for (let day = 1; day <= length; day += 1) {
    if (day !== anchorDay) days.push(day);
  }
  return days;
}

/* ------------------------------------------------------------------ */
/* The answer                                                          */
/* ------------------------------------------------------------------ */

/** The whole trainer in one line. Sunday-indexed, like every code in the app. */
export function dayStepAnswer(question: DayStepQuestion): Code {
  const { anchorWeekday, anchorDay, targetDay } = question;
  return ((((anchorWeekday + targetDay - anchorDay) % 7) + 7) % 7) as Code;
}

/* ------------------------------------------------------------------ */
/* Copy                                                               */
/* ------------------------------------------------------------------ */

/**
 * "st", "nd", "rd" or "th". Split from the number so a screen can put the digits
 * through the mono face and leave the suffix in the text face, which is what
 * keeps a prompt from changing width when the 9th becomes the 10th.
 */
export function ordinalSuffix(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return 'th';
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

/** "1st", "2nd", "3rd", "4th", "11th", "21st". */
export function ordinal(day: number): string {
  return `${day}${ordinalSuffix(day)}`;
}

/**
 * "March", or "March of a leap year" when the leap doomsday is in force. Only
 * January and February ever carry the second form, because they are the only
 * two whose doomsday moves.
 */
export function anchorMonthLabel(question: DayStepQuestion): string {
  return question.leapYear && question.month <= 2
    ? `${monthName(question.month)} of a leap year`
    : monthName(question.month);
}

/**
 * "In March, the 14th is a Tuesday." The month is spelled out and the day is an
 * ordinal, so neither number on the prompt can be read as the other one.
 */
export function describeAnchor(question: DayStepQuestion): string {
  const weekday = weekdayName(question.anchorWeekday);
  return `In ${anchorMonthLabel(question)}, the ${ordinal(question.anchorDay)} is a ${weekday}.`;
}

/** "What is the 5th?" */
export function describeTarget(question: DayStepQuestion): string {
  return `What is the ${ordinal(question.targetDay)}?`;
}

/* ------------------------------------------------------------------ */
/* The worked answer                                                   */
/* ------------------------------------------------------------------ */

/** One row of the working. Every value is named by its label. */
export interface DayStepLine {
  label: string;
  /** Where the value came from. */
  expression: string;
  value: string;
}

export interface DayStepWorking {
  question: DayStepQuestion;
  /** Signed, before the reduction: `targetDay - anchorDay`. */
  offset: number;
  size: DayStepSize;
  direction: DayStepDirection;
  weekday: Code;
  lines: DayStepLine[];
}

function signedDays(offset: number): string {
  const days = Math.abs(offset) === 1 ? 'day' : 'days';
  return offset < 0 ? `${Math.abs(offset)} ${days} back` : `${offset} ${days} on`;
}

/**
 * Every number for one prompt, each with the label that says what it is.
 *
 * A wrong tap here has only two places to have gone wrong — the subtraction or
 * the reduction — so unlike the full-date working this one is short. It is
 * still four labelled rows rather than a bare `(2 + 5 - 14) mod 7`, because a
 * line of arithmetic with nothing naming its terms teaches nothing about where
 * they came from.
 */
export function explainDayStep(question: DayStepQuestion): DayStepWorking {
  const { month, leapYear, anchorDay, anchorWeekday, targetDay } = question;
  const offset = targetDay - anchorDay;
  const size = stepSize(anchorDay, targetDay);
  const weekday = dayStepAnswer(question);
  const monthLabel = leapYear && month <= 2 ? `${monthName(month)}, leap year` : monthName(month);

  return {
    question,
    offset,
    size,
    direction: stepDirection(anchorDay, targetDay),
    weekday,
    lines: [
      {
        label: 'Month doomsday',
        expression: monthLabel,
        value: `${anchorDay}  ${weekdayName(anchorWeekday)}`,
      },
      { label: 'Day asked for', expression: monthLabel, value: String(targetDay) },
      {
        label: 'Days from the doomsday',
        expression: `${targetDay} - ${anchorDay}`,
        value: `${offset}  (${signedDays(offset)})`,
      },
      { label: 'Step, mod 7', expression: `${offset} mod 7`, value: String(size) },
      {
        label: 'Weekday',
        expression: `${weekdayName(anchorWeekday)} + ${size}`,
        value: `${weekday}  ${weekdayName(weekday)}`,
      },
    ],
  };
}
