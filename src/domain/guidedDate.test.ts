import { describe, expect, it } from 'vitest';
import {
  GUIDED_STEP_COUNT,
  GUIDED_STEP_IDS,
  askAnswer,
  askOperands,
  centuryAnchorRows,
  equationTerms,
  filledSlots,
  guidedClosingLine,
  guidedWalk,
  isWalkableDate,
  type GuidedSlotId,
  type GuidedStep,
  type GuidedStepId,
} from './guidedDate';
import { cyclesRemoved } from './calc';
import type { CalendarDate, Code } from './types';
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

function stepOf(steps: readonly GuidedStep[], id: GuidedStepId): GuidedStep {
  const step = steps.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`No step ${id}`);
  return step;
}

function answerOf(steps: readonly GuidedStep[], id: GuidedStepId): number {
  return stepOf(steps, id).answer;
}

/**
 * Every number a step actually prints, taken out of the givens rather than
 * listed by hand. A given holding a list — the doomsday dates of a month —
 * yields all of them, which is what makes the choice step answerable.
 */
function shownNumbers(step: GuidedStep): number[] {
  return step.givens.flatMap((given) => (given.value.match(/\d+/g) ?? []).map(Number));
}

/**
 * A wide sample rather than a handful: every month of a leap year and of a
 * common year, all four centuries, both January and February either side of the
 * leap rule, the first days of a month (which are the ones that need a week
 * added), and the two ends of the supported range. The last step is checked
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

/** A handful, for the tests that walk every step against every prefix. */
const FEW: CalendarDate[] = [
  { fullYear: 1987, month: 3, day: 20 },
  { fullYear: 1987, month: 3, day: 3 },
  { fullYear: 2012, month: 6, day: 9 },
  { fullYear: 1988, month: 1, day: 20 },
  { fullYear: 2000, month: 2, day: 29 },
  { fullYear: 2196, month: 11, day: 1 },
];

describe('guidedWalk', () => {
  it('is twelve steps for every date, in one fixed order', () => {
    for (const date of SAMPLE) {
      const { steps } = guidedWalk(date);
      expect(steps).toHaveLength(GUIDED_STEP_COUNT);
      expect(steps.map((step) => step.id)).toEqual([...GUIDED_STEP_IDS]);
      expect(steps.map((step) => step.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    }
  });

  it('ends on the weekday the calendar actually has', () => {
    for (const date of SAMPLE) {
      const walk = guidedWalk(date);
      const real = weekdayFor(date.fullYear, date.month, date.day);
      expect(walk.weekday, walk.dateLabel).toBe(real);
      expect(answerOf(walk.steps, 'weekdayName'), walk.dateLabel).toBe(real);
      expect(answerOf(walk.steps, 'weekdayCode'), walk.dateLabel).toBe(real);
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
      // Nothing before the step that produces it may carry the code.
      const code = stepOf(steps, 'yearCode');
      for (const step of steps) {
        if (step.position > code.position) continue;
        for (const given of step.givens) expect(given.from).not.toBe('yearCode');
      }
    }
  });
});

/**
 * The point of the rework, and the reason `GuidedAsk` exists at all. A
 * walkthrough shown to somebody who has never heard of the method cannot ask a
 * question they could get wrong by not following an explanation.
 */
describe('every question is answerable from what is on screen', () => {
  it('asks nothing but arithmetic and which weekday a number names', () => {
    const kinds = new Set<string>();
    for (const date of SAMPLE) {
      for (const step of guidedWalk(date).steps) {
        if (step.ask) kinds.add(step.ask.kind);
      }
    }
    expect([...kinds].sort()).toEqual(['add', 'name', 'nearest', 'quarter', 'sevens', 'subtract']);
  });

  it('rests every question on numbers the same step prints', () => {
    for (const date of SAMPLE) {
      const walk = guidedWalk(date);
      for (const step of walk.steps) {
        if (!step.ask) continue;
        const shown = shownNumbers(step);
        for (const operand of askOperands(step.ask)) {
          expect(shown, `${walk.dateLabel} · ${step.id} · ${operand}`).toContain(operand);
        }
      }
    }
  });

  it('answers each question with the sum it stated, and nothing else', () => {
    for (const date of SAMPLE) {
      for (const step of guidedWalk(date).steps) {
        expect(step.noop).toBe(step.ask === null);
        if (step.ask) expect(step.answer).toBe(askAnswer(step.ask));
      }
    }
  });

  it('puts the wanted value in the working, so a wrong answer can always be recovered', () => {
    // Invariant 6: a wrong answer never advances, and the way on is answering
    // with what the screen just showed. The working is what shows it.
    for (const date of SAMPLE) {
      for (const step of guidedWalk(date).steps) {
        const wanted =
          step.input === 'weekday' ? trueWeekdayName(step.answer as Code) : String(step.answer);
        expect(step.working, `${step.id}`).toContain(wanted);
      }
    }
  });
});

describe('the rhythm', () => {
  it('takes the sevens off as its own question, three times, however small the sum', () => {
    for (const date of SAMPLE) {
      const { steps } = guidedWalk(date);
      const sevens = steps.filter((step) => step.ask?.kind === 'sevens');
      expect(sevens.map((step) => step.id)).toEqual(['yearCode', 'yearDoomsday', 'weekdayCode']);
      for (const step of sevens) expect(step.noop).toBe(false);
    }
  });

  it('follows every addition with a sevens step, never folding the two together', () => {
    for (const date of SAMPLE) {
      const { steps } = guidedWalk(date);
      for (const [index, step] of steps.entries()) {
        if (step.ask?.kind !== 'add') continue;
        expect(steps[index + 1].ask?.kind).toBe('sevens');
      }
    }
  });
});

describe('the worked example, 20 March 1987', () => {
  const walk = guidedWalk({ fullYear: 1987, month: 3, day: 20 });

  it('answers 3, 0, 3, 3, 6, 6, 6, 14, 6, 12, 5, 5', () => {
    expect(walk.steps.map((step) => step.answer)).toEqual([
      3, 0, 3, 3, 6, 6, 6, 14, 6, 12, 5, 5,
    ]);
  });

  it('asks each one as a sum on numbers it has just printed', () => {
    expect(walk.steps.map((step) => step.question)).toEqual([
      '87 − 84 = ?',
      '3 ÷ 4 = ?',
      '3 + 0 = ?',
      '3 mod 7 = ?',
      '3 + 3 = ?',
      '6 mod 7 = ?',
      'Which weekday is 6?',
      'Which of those is closest to the 20th without going past it?',
      '20 − 14 = ?',
      '6 + 6 = ?',
      '12 mod 7 = ?',
      'Which weekday is 5?',
    ]);
  });

  it('names the year code and the year doomsday once each is produced', () => {
    expect(walk.steps[3].result).toBe('That is the year code for 87.');
    expect(walk.steps[5].result).toBe('Every doomsday in 1987 falls on 6.');
    expect(walk.steps[6].result).toBe('Every doomsday in 1987 is a Saturday.');
  });

  it('asks every step, none of them a line to read', () => {
    expect(walk.steps.some((step) => step.noop)).toBe(false);
  });

  it('offers the four doomsday dates of March as the choice', () => {
    expect(walk.steps[7].choices).toEqual([7, 14, 21, 28]);
    expect(walk.steps[7].input).toBe('choice');
    expect(walk.steps[7].note).toBeNull();
  });

  it('puts the century table on the anchor step and the month table on the choice', () => {
    expect(walk.steps.map((step) => step.table)).toEqual([
      null,
      null,
      null,
      null,
      'century',
      null,
      null,
      'month',
      null,
      null,
      null,
      null,
    ]);
  });

  it('closes on the fact', () => {
    expect(guidedClosingLine(walk, Date.UTC(2026, 7, 22))).toBe('20 March 1987 was a Friday.');
  });
});

describe('the three equations', () => {
  it('is year code, days on and weekday, in that order', () => {
    const walk = guidedWalk({ fullYear: 1987, month: 3, day: 20 });
    expect(walk.equations.map((equation) => equation.result.slot)).toEqual([
      'yearCode',
      'daysOn',
      'weekday',
    ]);
  });

  it('labels every term, filled or not', () => {
    for (const date of SAMPLE) {
      for (const equation of guidedWalk(date).equations) {
        for (const term of equationTerms(equation)) {
          expect(term.label.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('gives every slot one source and one value, wherever it appears', () => {
    for (const date of SAMPLE) {
      const walk = guidedWalk(date);
      const sources = new Map<GuidedSlotId, string>();
      for (const equation of walk.equations) {
        for (const term of equationTerms(equation)) {
          const signature = `${term.from}:${term.value}`;
          const seen = sources.get(term.slot);
          if (seen === undefined) sources.set(term.slot, signature);
          else expect(signature, `${walk.dateLabel} · ${term.slot}`).toBe(seen);
        }
      }
    }
  });

  it('holds the number the producing step actually answers', () => {
    for (const date of SAMPLE) {
      const walk = guidedWalk(date);
      for (const equation of walk.equations) {
        for (const term of equationTerms(equation)) {
          if (term.from === null) continue;
          expect(Number(term.value), `${walk.dateLabel} · ${term.slot}`).toBe(
            answerOf(walk.steps, term.from),
          );
        }
      }
    }
  });

  it('never shows a slot filled before its step, or empty after it', () => {
    for (const date of FEW) {
      const walk = guidedWalk(date);
      const order = walk.steps.map((step) => step.id);
      for (const equation of walk.equations) {
        for (const term of equationTerms(equation)) {
          const produced = term.from === null ? 0 : order.indexOf(term.from) + 1;
          for (let done = 0; done <= GUIDED_STEP_COUNT; done += 1) {
            expect(
              filledSlots(walk, done).has(term.slot),
              `${walk.dateLabel} · ${term.slot} · ${done} done`,
            ).toBe(done >= produced);
          }
        }
      }
    }
  });

  it('starts with the date and the anchor already standing, and nothing else', () => {
    const walk = guidedWalk({ fullYear: 1987, month: 3, day: 20 });
    expect([...filledSlots(walk, 0)].sort()).toEqual(['anchor', 'day']);
    expect([...filledSlots(walk, GUIDED_STEP_COUNT)].sort()).toEqual([
      'anchor',
      'day',
      'daysOn',
      'leapDays',
      'nearest',
      'reduced',
      'weekday',
      'yearCode',
    ]);
  });

  it('shows the sum that will fill the first slot rather than a bare dash', () => {
    const walk = guidedWalk({ fullYear: 1987, month: 3, day: 20 });
    const reduced = equationTerms(walk.equations[0]).find((term) => term.slot === 'reduced');
    expect(reduced?.pending).toBe('87 − 84');

    // Nothing comes off a year under 28, so there is no sum to show.
    const small = guidedWalk({ fullYear: 2012, month: 6, day: 9 });
    const none = equationTerms(small.equations[0]).find((term) => term.slot === 'reduced');
    expect(none?.pending).toBeNull();
  });
});

describe('the step a date makes trivial', () => {
  it('states the 28s rather than asking when there are none to take off', () => {
    const walk = guidedWalk({ fullYear: 2012, month: 6, day: 9 });
    const reduce = walk.steps[0];
    expect(cyclesRemoved(12)).toBe(0);
    expect(reduce.noop).toBe(true);
    expect(reduce.ask).toBeNull();
    expect(reduce.answer).toBe(12);
    expect(reduce.question).toContain('no 28s come off');
  });

  it('still asks the 28s when something comes off', () => {
    const walk = guidedWalk({ fullYear: 1987, month: 3, day: 20 });
    expect(walk.steps[0].noop).toBe(false);
    expect(walk.steps[0].answer).toBe(3);
  });

  it('still asks the leap days when the answer is zero', () => {
    // 87 reduces to 3, so no fourth year has come round. The division and the
    // dropping are both still work, and `calc.ts` asks them too.
    const walk = guidedWalk({ fullYear: 1987, month: 3, day: 20 });
    expect(walk.steps[1].noop).toBe(false);
    expect(walk.steps[1].answer).toBe(0);
  });

  it('still asks the count when the date is the doomsday itself', () => {
    // 14 March is March's doomsday. Under the old walk that was a line to read;
    // it is a subtraction like every other date, and the rhythm is the point.
    const walk = guidedWalk({ fullYear: 1987, month: 3, day: 14 });
    expect(walk.steps[8].noop).toBe(false);
    expect(walk.steps[8].question).toBe('14 − 14 = ?');
    expect(walk.steps[8].answer).toBe(0);
  });

  it('keeps the count at twelve whatever a date makes trivial', () => {
    for (const date of FEW) {
      expect(guidedWalk(date).steps).toHaveLength(GUIDED_STEP_COUNT);
    }
  });

  it('never turns a step other than the 28s into a line to read', () => {
    for (const date of SAMPLE) {
      for (const step of guidedWalk(date).steps) {
        if (step.noop) expect(step.id).toBe('reduce');
      }
    }
  });
});

describe('the nearest doomsday', () => {
  it('offers every doomsday date in the month, ascending', () => {
    expect(guidedWalk({ fullYear: 1987, month: 1, day: 20 }).steps[7].choices).toEqual([
      3, 10, 17, 24, 31,
    ]);
    expect(guidedWalk({ fullYear: 1988, month: 1, day: 20 }).steps[7].choices).toEqual([
      4, 11, 18, 25,
    ]);
    expect(guidedWalk({ fullYear: 2000, month: 2, day: 20 }).steps[7].choices).toEqual([
      1, 8, 15, 22, 29,
    ]);
    expect(guidedWalk({ fullYear: 1900, month: 2, day: 20 }).steps[7].choices).toEqual([
      7, 14, 21, 28,
    ]);
  });

  it('is always four or five buttons, every one of them a real doomsday date', () => {
    for (const date of SAMPLE) {
      const walk = guidedWalk(date);
      const step = walk.steps[7];
      const anchorDay = monthDoomsday(date.month, isLeapYear(date.fullYear));
      expect(step.choices.length, walk.dateLabel).toBeGreaterThanOrEqual(4);
      expect(step.choices.length, walk.dateLabel).toBeLessThanOrEqual(5);
      for (const choice of step.choices) {
        expect(choice % 7, `${walk.dateLabel} · ${choice}`).toBe(anchorDay % 7);
        expect(choice).toBeGreaterThanOrEqual(1);
        expect(choice).toBeLessThanOrEqual(daysInMonth(date.fullYear, date.month));
      }
      expect(step.choices).toContain(step.answer);
    }
  });
});

describe('a day below every doomsday date in the month', () => {
  /** The days that get a week added before the subtraction, for one month. */
  function shiftedDays(fullYear: number, month: number): number[] {
    const days: number[] = [];
    for (let day = 1; day <= daysInMonth(fullYear, month); day += 1) {
      if (guidedWalk({ fullYear, month, day }).steps[7].note !== null) days.push(day);
    }
    return days;
  }

  it('adds the week for exactly the days that need it, common year', () => {
    // March's doomsday is the 14th, so the earliest doomsday date is the 7th
    // and the 1st to the 6th have nothing at or below them.
    expect(shiftedDays(1987, 1)).toEqual([1, 2]);
    expect(shiftedDays(1987, 2)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(shiftedDays(1987, 3)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(shiftedDays(1987, 4)).toEqual([1, 2, 3]);
    expect(shiftedDays(1987, 5)).toEqual([1]);
    expect(shiftedDays(1987, 6)).toEqual([1, 2, 3, 4, 5]);
    expect(shiftedDays(1987, 7)).toEqual([1, 2, 3]);
    expect(shiftedDays(1987, 8)).toEqual([]);
    expect(shiftedDays(1987, 9)).toEqual([1, 2, 3, 4]);
    expect(shiftedDays(1987, 10)).toEqual([1, 2]);
    expect(shiftedDays(1987, 11)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(shiftedDays(1987, 12)).toEqual([1, 2, 3, 4]);
  });

  it('follows the doomsday when a leap year moves it', () => {
    // January's doomsday goes from the 3rd to the 4th, so the 3rd joins the
    // days that need a week. February's goes to the 29th, whose earliest date
    // is the 1st, so nothing in February needs one.
    expect(shiftedDays(1988, 1)).toEqual([1, 2, 3]);
    expect(shiftedDays(1988, 2)).toEqual([]);
    expect(shiftedDays(1988, 3)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('states the week rather than asking, and counts forward from there', () => {
    const walk = guidedWalk({ fullYear: 1987, month: 3, day: 3 });
    const nearest = walk.steps[7];
    expect(nearest.note).toBe(
      'The 3rd has no doomsday at or before it. A week either way is the same weekday, so use the 10th.',
    );
    expect(nearest.question).toBe('Which of those is closest to the 10th without going past it?');
    expect(nearest.answer).toBe(7);

    const count = walk.steps[8];
    expect(count.question).toBe('10 − 7 = ?');
    expect(count.answer).toBe(3);
    expect(walk.weekday).toBe(weekdayFor(1987, 3, 3));
  });

  it('never asks a subtraction that could go negative', () => {
    for (const fullYear of [1987, 1988]) {
      for (let month = 1; month <= 12; month += 1) {
        for (let day = 1; day <= daysInMonth(fullYear, month); day += 1) {
          const step = guidedWalk({ fullYear, month, day }).steps[8];
          expect(step.answer, `${fullYear}-${month}-${day}`).toBeGreaterThanOrEqual(0);
          expect(step.answer, `${fullYear}-${month}-${day}`).toBeLessThanOrEqual(6);
        }
      }
    }
  });
});

describe('the inputs', () => {
  it('sends every answer to a control that can take it', () => {
    for (const date of SAMPLE) {
      for (const step of guidedWalk(date).steps) {
        if (step.input === 'code' || step.input === 'weekday') {
          expect(step.answer, step.id).toBeGreaterThanOrEqual(0);
          expect(step.answer, step.id).toBeLessThanOrEqual(6);
          expect(step.choices).toEqual([]);
        }
        if (step.input === 'count') {
          expect(step.answer, step.id).toBeLessThanOrEqual(step.max);
          expect(step.answer, step.id).toBeGreaterThanOrEqual(0);
          expect(step.choices).toEqual([]);
        }
        if (step.input === 'choice') expect(step.choices).toContain(step.answer);
      }
    }
  });

  it('types only the four sums that can run past six', () => {
    for (const date of SAMPLE) {
      const typed = guidedWalk(date)
        .steps.filter((step) => step.input === 'count')
        .map((step) => step.id);
      expect(typed).toEqual(['reduce', 'sum', 'anchorSum', 'weekdaySum']);
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
