import { describe, expect, it } from 'vitest';
import {
  GUIDED_STEP_COUNT,
  GUIDED_STEP_IDS,
  centuryAnchorRows,
  guidedClosingLine,
  guidedWalk,
  isWalkableDate,
  type GuidedStep,
  type GuidedStepId,
} from './guidedDate';
import { cyclesRemoved, reduce28 } from './calc';
import type { CalendarDate } from './types';
import {
  MAX_YEAR,
  MIN_YEAR,
  daysInMonth,
  isLeapYear,
  monthDoomsday,
  trueWeekdayName,
  weekdayFor,
  yearKeyOf,
} from './weekday';
import { codeFor } from './yearCodes';

function answerOf(steps: readonly GuidedStep[], id: GuidedStepId): number {
  const step = steps.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`No step ${id}`);
  return step.answer;
}

/**
 * A wide sample rather than a handful: every month of a leap year and of a
 * common year, all four centuries, both January and February either side of the
 * leap rule, and the two ends of the supported range. The last step is checked
 * against `weekdayFor`, which is itself checked against the real calendar over a
 * full 400-year cycle, so agreeing with it is agreeing with the calendar.
 */
function sampleDates(): CalendarDate[] {
  const dates: CalendarDate[] = [];
  const years = [1801, 1804, 1900, 1904, 1987, 1988, 2000, 2001, 2024, 2025, 2100, 2104, 2196];
  for (const fullYear of years) {
    for (let month = 1; month <= 12; month += 1) {
      const length = daysInMonth(fullYear, month);
      for (const day of [1, 4, monthDoomsday(month, isLeapYear(fullYear)), 15, length]) {
        if (day >= 1 && day <= length) dates.push({ fullYear, month, day });
      }
    }
  }
  dates.push({ fullYear: MIN_YEAR, month: 1, day: 1 });
  dates.push({ fullYear: MAX_YEAR, month: 12, day: 31 });
  return dates;
}

const SAMPLE = sampleDates();

describe('guidedWalk', () => {
  it('is nine steps for every date, in one fixed order', () => {
    for (const date of SAMPLE) {
      const { steps } = guidedWalk(date);
      expect(steps).toHaveLength(GUIDED_STEP_COUNT);
      expect(steps.map((step) => step.id)).toEqual([...GUIDED_STEP_IDS]);
      expect(steps.map((step) => step.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
  });

  it('ends on the weekday the calendar actually has', () => {
    for (const date of SAMPLE) {
      const walk = guidedWalk(date);
      const real = weekdayFor(date.fullYear, date.month, date.day);
      expect(walk.weekday, walk.dateLabel).toBe(real);
      expect(answerOf(walk.steps, 'weekday'), walk.dateLabel).toBe(real);
      expect(walk.weekdayName).toBe(trueWeekdayName(real));
    }
  });

  it('never hands a step a number that contradicts the answer before it', () => {
    // Every given that claims to carry an earlier answer has to equal it. This
    // is the whole contract of the screen: a user following it can only ever be
    // shown their own working.
    for (const date of SAMPLE) {
      const { steps, dateLabel } = guidedWalk(date);
      for (const step of steps) {
        for (const given of step.givens) {
          if (given.from === null) continue;
          expect(Number(given.value), `${dateLabel} · ${step.id} · ${given.label}`).toBe(
            answerOf(steps, given.from),
          );
        }
      }
    }
  });

  it('only ever carries a value forward from a step already worked', () => {
    for (const date of SAMPLE) {
      const { steps } = guidedWalk(date);
      const seen = new Set<GuidedStepId>();
      for (const step of steps) {
        for (const given of step.givens) {
          if (given.from !== null) expect(seen.has(given.from)).toBe(true);
        }
        seen.add(step.id);
      }
    }
  });

  it('labels every number it puts on screen', () => {
    for (const date of SAMPLE) {
      for (const step of guidedWalk(date).steps) {
        expect(step.answerLabel.length).toBeGreaterThan(0);
        for (const given of step.givens) expect(given.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('derives the year code rather than handing it over', () => {
    for (const date of SAMPLE) {
      const { steps } = guidedWalk(date);
      expect(answerOf(steps, 'yearCode')).toBe(codeFor(yearKeyOf(date.fullYear)));
      // Nothing before step 4 may carry the code, and no step may state it as a
      // given the date supplies.
      const before = steps.filter((step) => step.position < 4);
      for (const step of before) {
        for (const given of step.givens) expect(given.from).not.toBe('yearCode');
      }
    }
  });
});

describe('the worked example, 20 March 1987', () => {
  const walk = guidedWalk({ fullYear: 1987, month: 3, day: 20 });

  it('answers 3, 3, 0, 3, 6, 14, 6, 5, 5', () => {
    expect(walk.steps.map((step) => step.answer)).toEqual([3, 3, 0, 3, 6, 14, 6, 5, 5]);
  });

  it('names the year code and the year doomsday once each is produced', () => {
    expect(answerOf(walk.steps, 'yearCode')).toBe(3);
    expect(walk.steps[3].result).toBe('The year code for 87 is 3.');
    expect(walk.steps[4].result).toBe('Every doomsday in 1987 falls on 6.');
  });

  it('asks every step, none of them a no-op', () => {
    expect(walk.steps.some((step) => step.noop)).toBe(false);
  });

  it('puts the century table on step 1 and the month table on step 6', () => {
    expect(walk.steps.map((step) => step.table)).toEqual([
      'century',
      null,
      null,
      null,
      null,
      'month',
      null,
      null,
      null,
    ]);
  });

  it('closes on the fact', () => {
    expect(guidedClosingLine(walk, Date.UTC(2026, 7, 22))).toBe('20 March 1987 was a Friday.');
  });
});

describe('the steps a date makes trivial', () => {
  it('states the 28s rather than asking when there are none to take off', () => {
    const walk = guidedWalk({ fullYear: 2012, month: 6, day: 9 });
    const reduce = walk.steps[1];
    expect(cyclesRemoved(12)).toBe(0);
    expect(reduce.noop).toBe(true);
    expect(reduce.answer).toBe(12);
    expect(reduce.question).toContain('no whole 28s');
  });

  it('still asks the 28s when something comes off', () => {
    const walk = guidedWalk({ fullYear: 1987, month: 3, day: 20 });
    expect(walk.steps[1].noop).toBe(false);
    expect(walk.steps[1].answer).toBe(reduce28(87));
  });

  it('still asks the leap days when the answer is zero', () => {
    // 87 reduces to 3, so no fourth year has come round. The division and the
    // dropping are both still work, and `calc.ts` asks them too.
    const walk = guidedWalk({ fullYear: 1987, month: 3, day: 20 });
    expect(walk.steps[2].noop).toBe(false);
    expect(walk.steps[2].answer).toBe(0);
  });

  it('states the day step rather than asking when the day is the doomsday', () => {
    // 14 March is March's doomsday, so there is nothing to count.
    const walk = guidedWalk({ fullYear: 1987, month: 3, day: 14 });
    const step = walk.steps[6];
    expect(step.noop).toBe(true);
    expect(step.answer).toBe(0);
    expect(step.question).toContain('nothing to count');
  });

  it('keeps the count at nine whatever a date makes trivial', () => {
    for (const date of [
      { fullYear: 2012, month: 6, day: 9 },
      { fullYear: 1987, month: 3, day: 14 },
      { fullYear: 1900, month: 1, day: 3 },
      { fullYear: 2000, month: 2, day: 29 },
    ]) {
      expect(guidedWalk(date).steps).toHaveLength(9);
    }
  });

  it('never turns a step other than the 28s or the day step into a line to read', () => {
    for (const date of SAMPLE) {
      for (const step of guidedWalk(date).steps) {
        if (step.noop) expect(['reduce', 'dayStep']).toContain(step.id);
      }
    }
  });
});

describe('the day step', () => {
  it('takes the sevens off a forward count', () => {
    const step = guidedWalk({ fullYear: 1987, month: 3, day: 30 }).steps[6];
    expect(step.answer).toBe(2);
    expect(step.working).toBe('30 − 14 = 16. Take 7 away twice: 16 − 14 = 2.');
  });

  it('adds sevens rather than turning the count round', () => {
    // A day before the doomsday is the case a forward-only question gets wrong:
    // the 2nd is 12 days back, and 12 back is 2 on, not 5 on.
    const step = guidedWalk({ fullYear: 1987, month: 3, day: 2 }).steps[6];
    expect(step.answer).toBe(2);
    expect(step.working).toBe('2 − 14 = −12. Add 7 twice: −12 + 14 = 2.');
  });

  it('says so when the count is short enough to need nothing', () => {
    const step = guidedWalk({ fullYear: 1987, month: 3, day: 20 }).steps[6];
    expect(step.answer).toBe(6);
    expect(step.working).toBe('20 − 14 = 6. That is already between 0 and 6, so the step is 6.');
  });

  it('agrees with the day-step trainer on every day of every month', () => {
    for (const fullYear of [1987, 1988]) {
      const leapYear = isLeapYear(fullYear);
      for (let month = 1; month <= 12; month += 1) {
        const anchorDay = monthDoomsday(month, leapYear);
        for (let day = 1; day <= daysInMonth(fullYear, month); day += 1) {
          const step = guidedWalk({ fullYear, month, day }).steps[6];
          const expected = day === anchorDay ? 0 : (((day - anchorDay) % 7) + 7) % 7;
          expect(step.answer, `${fullYear}-${month}-${day}`).toBe(expected);
        }
      }
    }
  });
});

describe('January and February in a leap year', () => {
  it('says the table does not hold, with the year named', () => {
    const jan = guidedWalk({ fullYear: 1988, month: 1, day: 20 }).steps[5];
    expect(jan.note).toContain('1988 is a leap year');
    expect(jan.answer).toBe(4);

    const feb = guidedWalk({ fullYear: 2000, month: 2, day: 10 }).steps[5];
    expect(feb.note).toContain('2000 is a leap year');
    expect(feb.answer).toBe(29);
  });

  it('says nothing about leap years for a month whose doomsday does not move', () => {
    const march = guidedWalk({ fullYear: 1988, month: 3, day: 20 }).steps[5];
    expect(march.note).toBeNull();
    expect(march.answer).toBe(14);
  });

  it('types the answer for February in a leap year, which the month pad has no button for', () => {
    expect(guidedWalk({ fullYear: 2000, month: 2, day: 10 }).steps[5].input).toBe('count');
    expect(guidedWalk({ fullYear: 1900, month: 2, day: 10 }).steps[5].input).toBe('monthDate');
    expect(guidedWalk({ fullYear: 2000, month: 1, day: 10 }).steps[5].input).toBe('monthDate');
  });

  it('uses the moved doomsday in the day step and in the answer', () => {
    const walk = guidedWalk({ fullYear: 1988, month: 1, day: 20 });
    // January's doomsday is the 4th in 1988, so the step is 20 − 4 = 16, mod 7.
    expect(answerOf(walk.steps, 'dayStep')).toBe(2);
    expect(walk.weekday).toBe(weekdayFor(1988, 1, 20));
  });
});

describe('the inputs', () => {
  it('sends every code answer to the seven-button pad', () => {
    for (const date of SAMPLE) {
      for (const step of guidedWalk(date).steps) {
        if (step.input === 'code') {
          expect(step.answer).toBeGreaterThanOrEqual(0);
          expect(step.answer).toBeLessThanOrEqual(6);
        }
        if (step.input === 'weekday') {
          expect(step.answer).toBeGreaterThanOrEqual(0);
          expect(step.answer).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it('keeps a typed answer inside the field it declares', () => {
    for (const date of SAMPLE) {
      for (const step of guidedWalk(date).steps) {
        if (step.input === 'count') expect(step.answer).toBeLessThanOrEqual(step.max);
      }
    }
  });
});

describe('guidedClosingLine', () => {
  const now = Date.UTC(2026, 7, 22);

  it('puts a past date in the past', () => {
    const walk = guidedWalk({ fullYear: 1987, month: 3, day: 20 });
    expect(guidedClosingLine(walk, now)).toBe('20 March 1987 was a Friday.');
  });

  it('puts a future date in the future, because the range runs to 2199', () => {
    const walk = guidedWalk({ fullYear: 2100, month: 1, day: 1 });
    expect(guidedClosingLine(walk, now)).toBe(`1 January 2100 will be a ${walk.weekdayName}.`);
  });

  it('says today is today', () => {
    const walk = guidedWalk({ fullYear: 2026, month: 8, day: 22 });
    expect(guidedClosingLine(walk, now)).toBe(`22 August 2026 is a ${walk.weekdayName}.`);
  });
});

describe('centuryAnchorRows', () => {
  it('is the four anchors, oldest century first', () => {
    expect(centuryAnchorRows()).toEqual([
      { century: 18, label: '1800s', anchor: 5 },
      { century: 19, label: '1900s', anchor: 3 },
      { century: 20, label: '2000s', anchor: 2 },
      { century: 21, label: '2100s', anchor: 0 },
    ]);
  });
});

describe('isWalkableDate', () => {
  it('takes every date in range', () => {
    expect(isWalkableDate({ fullYear: MIN_YEAR, month: 1, day: 1 })).toBe(true);
    expect(isWalkableDate({ fullYear: MAX_YEAR, month: 12, day: 31 })).toBe(true);
    expect(isWalkableDate({ fullYear: 2000, month: 2, day: 29 })).toBe(true);
  });

  it('refuses what the maths would throw on', () => {
    expect(isWalkableDate({ fullYear: 1799, month: 12, day: 31 })).toBe(false);
    expect(isWalkableDate({ fullYear: 2200, month: 1, day: 1 })).toBe(false);
    expect(isWalkableDate({ fullYear: 1900, month: 2, day: 29 })).toBe(false);
    expect(isWalkableDate({ fullYear: 1987, month: 13, day: 1 })).toBe(false);
    expect(isWalkableDate({ fullYear: 1987, month: 3, day: 0 })).toBe(false);
    expect(isWalkableDate({ fullYear: Number.NaN, month: 3, day: 1 })).toBe(false);
  });
});
