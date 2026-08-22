import { describe, expect, it } from 'vitest';
import type { Code } from './types';
import {
  DAY_STEP_DIRECTIONS,
  DAY_STEP_SIZES,
  anchorMonthLabel,
  dayStepAnswer,
  describeAnchor,
  describeTarget,
  explainDayStep,
  monthLength,
  ordinal,
  ordinalSuffix,
  stepDirection,
  stepSize,
  validTargetDays,
  type DayStepQuestion,
} from './dayStep';
import { ALL_MONTHS, MAX_YEAR, MIN_YEAR, isLeapYear, monthDoomsday, weekdayFor } from './weekday';

/** Every month, in both leap cases. Only January and February differ between them. */
function everyMonth(): { month: number; leapYear: boolean }[] {
  const out: { month: number; leapYear: boolean }[] = [];
  for (const month of ALL_MONTHS) {
    out.push({ month, leapYear: false });
    out.push({ month, leapYear: true });
  }
  return out;
}

function question(
  month: number,
  leapYear: boolean,
  anchorWeekday: Code,
  targetDay: number,
): DayStepQuestion {
  return {
    month,
    leapYear,
    anchorDay: monthDoomsday(month, leapYear),
    anchorWeekday,
    targetDay,
  };
}

describe('monthLength', () => {
  it('gives February its extra day only in the leap case', () => {
    expect(monthLength(2, false)).toBe(28);
    expect(monthLength(2, true)).toBe(29);
  });

  it('leaves every other month alone', () => {
    for (const month of ALL_MONTHS) {
      if (month === 2) continue;
      expect(monthLength(month, true)).toBe(monthLength(month, false));
    }
    expect(monthLength(1, false)).toBe(31);
    expect(monthLength(4, false)).toBe(30);
    expect(monthLength(12, false)).toBe(31);
  });

  it('always leaves room for the month doomsday', () => {
    for (const { month, leapYear } of everyMonth()) {
      expect(monthDoomsday(month, leapYear)).toBeLessThanOrEqual(monthLength(month, leapYear));
    }
  });
});

describe('stepSize', () => {
  it('is the mod-7 distance from the doomsday, forwards or back', () => {
    expect(stepSize(14, 15)).toBe(1);
    expect(stepSize(14, 20)).toBe(6);
    // Counting back three days is the same as adding four.
    expect(stepSize(14, 11)).toBe(4);
    expect(stepSize(14, 8)).toBe(1);
  });

  it('is zero for a day a whole number of weeks away, which is a real answer', () => {
    expect(stepSize(14, 7)).toBe(0);
    expect(stepSize(14, 21)).toBe(0);
    expect(stepSize(14, 28)).toBe(0);
  });

  it('only ever returns a size the breakdown has a column for', () => {
    for (const { month, leapYear } of everyMonth()) {
      const anchor = monthDoomsday(month, leapYear);
      for (const day of validTargetDays(month, leapYear, anchor)) {
        expect(DAY_STEP_SIZES).toContain(stepSize(anchor, day));
      }
    }
  });
});

describe('stepDirection', () => {
  it('reads off the calendar, not off the reduced step', () => {
    expect(stepDirection(14, 20)).toBe('forward');
    // Six days back reduces to +1, and is still counting back.
    expect(stepDirection(14, 8)).toBe('backward');
    expect(DAY_STEP_DIRECTIONS).toEqual(['forward', 'backward']);
  });

  it('refuses the doomsday itself, which is not a step', () => {
    expect(() => stepDirection(14, 14)).toThrow(RangeError);
  });
});

describe('validTargetDays', () => {
  it('offers every day of the month except the doomsday', () => {
    for (const { month, leapYear } of everyMonth()) {
      const anchor = monthDoomsday(month, leapYear);
      const days = validTargetDays(month, leapYear, anchor);
      expect(days).toHaveLength(monthLength(month, leapYear) - 1);
      expect(days).not.toContain(anchor);
      expect(Math.min(...days)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...days)).toBeLessThanOrEqual(monthLength(month, leapYear));
    }
  });
});

describe('dayStepAnswer', () => {
  /**
   * The reference: walk the calendar one day at a time from the doomsday to the
   * day asked for, moving the weekday on by one each step. It is the definition
   * of what the step means, arrived at without any modular arithmetic, so it
   * cannot share a mistake with the implementation.
   */
  function walked(anchorWeekday: number, anchorDay: number, targetDay: number): number {
    let weekday = anchorWeekday;
    const step = targetDay > anchorDay ? 1 : -1;
    for (let day = anchorDay; day !== targetDay; day += step) {
      weekday = (weekday + step + 7) % 7;
    }
    return weekday;
  }

  it('matches a day-by-day walk for every month, weekday and day', () => {
    let checked = 0;
    for (const { month, leapYear } of everyMonth()) {
      const anchorDay = monthDoomsday(month, leapYear);
      const days = validTargetDays(month, leapYear, anchorDay);
      for (let anchorWeekday = 0; anchorWeekday < 7; anchorWeekday += 1) {
        for (const targetDay of days) {
          const answer = dayStepAnswer(question(month, leapYear, anchorWeekday as Code, targetDay));
          expect(answer).toBe(walked(anchorWeekday, anchorDay, targetDay));
          checked += 1;
        }
      }
    }
    // Not a sample: every case the trainer can produce. A common year and a
    // leap year hold 731 days between them, 24 of which are the doomsdays that
    // cannot be asked, and each of the remaining 707 is asked from all seven
    // weekdays the doomsday could fall on.
    expect(checked).toBe(707 * 7);
  });

  it('agrees with the full method on real dates, in both leap cases', () => {
    // For each month and each weekday the doomsday could fall on, find a real
    // year whose doomsday is that weekday, then check the isolated step against
    // the whole calculation for every day of that month.
    for (const { month, leapYear } of everyMonth()) {
      for (let anchorWeekday = 0; anchorWeekday < 7; anchorWeekday += 1) {
        let fullYear: number | null = null;
        for (let year = MIN_YEAR; year <= MAX_YEAR && fullYear === null; year += 1) {
          if (isLeapYear(year) !== leapYear) continue;
          // The doomsday of the year is the weekday its month doomsdays fall on.
          if (weekdayFor(year, month, monthDoomsday(month, leapYear)) === anchorWeekday) {
            fullYear = year;
          }
        }
        expect(fullYear).not.toBeNull();
        const year = fullYear as number;
        const anchorDay = monthDoomsday(month, leapYear);
        for (const targetDay of validTargetDays(month, leapYear, anchorDay)) {
          expect(dayStepAnswer(question(month, leapYear, anchorWeekday as Code, targetDay))).toBe(
            weekdayFor(year, month, targetDay),
          );
        }
      }
    }
  });
});

describe('ordinals', () => {
  it('gets the teens right, which is where the naive rule fails', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(23)).toBe('23rd');
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(4)).toBe('4th');
  });

  it('splits into a number and a suffix that rebuild the same string', () => {
    for (let day = 1; day <= 31; day += 1) {
      expect(`${day}${ordinalSuffix(day)}`).toBe(ordinal(day));
    }
  });
});

describe('prompt copy', () => {
  it('reads as a sentence, with the month spelled out', () => {
    const q = question(3, false, 2, 5);
    expect(describeAnchor(q)).toBe('In March, the 14th is a Tuesday.');
    expect(describeTarget(q)).toBe('What is the 5th?');
  });

  it('says so when the leap-year doomsday is the one in force', () => {
    expect(anchorMonthLabel(question(1, true, 0, 9))).toBe('January of a leap year');
    expect(anchorMonthLabel(question(2, true, 0, 9))).toBe('February of a leap year');
    // Nothing else moves in a leap year, so nothing else says it.
    expect(anchorMonthLabel(question(3, true, 0, 9))).toBe('March');
  });
});

describe('explainDayStep', () => {
  it('labels every number it puts on screen', () => {
    const working = explainDayStep(question(3, false, 2, 5));
    expect(working.offset).toBe(-9);
    expect(working.size).toBe(5);
    expect(working.direction).toBe('backward');
    expect(working.weekday).toBe(0);

    expect(working.lines.map((line) => line.label)).toEqual([
      'Month doomsday',
      'Day asked for',
      'Days from the doomsday',
      'Step, mod 7',
      'Weekday',
    ]);
    // Every line carries a label, an expression saying where the value came
    // from, and the value. None of the three is ever blank.
    for (const line of working.lines) {
      expect(line.label.length).toBeGreaterThan(0);
      expect(line.expression.length).toBeGreaterThan(0);
      expect(line.value.length).toBeGreaterThan(0);
    }
    expect(working.lines[2].expression).toBe('5 - 14');
    expect(working.lines[3].expression).toBe('-9 mod 7');
    expect(working.lines[4].value).toBe('0  Sunday');
  });

  it('names the leap month in the working too', () => {
    const working = explainDayStep(question(2, true, 3, 1));
    expect(working.lines[0].expression).toBe('February, leap year');
    expect(working.lines[0].value).toBe('29  Wednesday');
  });

  it('reports the same answer as the plain function, everywhere', () => {
    for (const { month, leapYear } of everyMonth()) {
      const anchor = monthDoomsday(month, leapYear);
      for (const day of validTargetDays(month, leapYear, anchor)) {
        const q = question(month, leapYear, 4, day);
        expect(explainDayStep(q).weekday).toBe(dayStepAnswer(q));
      }
    }
  });
});
