import { describe, expect, it } from 'vitest';
import {
  GUIDED_GOAL_IDS,
  GUIDED_STEP_COUNT,
  GUIDED_STEP_IDS,
  askAnswer,
  askOperands,
  goalOf,
  guidedClosingLine,
  guidedWalk,
  isWalkableDate,
  rowState,
  settledGoals,
  visibleNumbers,
  type GuidedGoalRow,
  type GuidedStep,
  type GuidedStepId,
  type GuidedWalk,
} from './guidedDate';
import { cyclesRemoved } from './calc';
import type { CalendarDate, Code } from './types';
import {
  MAX_YEAR,
  MIN_YEAR,
  daysInMonth,
  isLeapYear,
  monthDoomsday,
  weekdayName,
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

/** Every row of every goal, flattened. */
function allRows(walk: GuidedWalk): GuidedGoalRow[] {
  return walk.goals.flatMap((goal) => [...goal.rows]);
}

/** The row a step fills. Exactly one exists — see the test that pins it. */
function rowFor(walk: GuidedWalk, id: GuidedStepId): GuidedGoalRow {
  const row = allRows(walk).find((candidate) => candidate.from === id);
  if (!row) throw new Error(`No row for ${id}`);
  return row;
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
      expect(walk.weekdayName).toBe(weekdayName(real));
    }
  });

  it('derives the year code rather than handing it over', () => {
    for (const date of SAMPLE) {
      const walk = guidedWalk(date);
      expect(answerOf(walk.steps, 'yearCode')).toBe(codeFor(yearKeyOf(date.fullYear)));

      // Nothing on screen may name the code before the step that produces it.
      // The first goal's rows are the only thing up at that point, and the code
      // is the last of them.
      const upTo = walk.steps.findIndex((step) => step.id === 'yearCode');
      const goal = goalOf(walk, 'yearCode');
      for (let done = 0; done < upTo; done += 1) {
        const shown = goal.rows.filter((row) => rowState(walk, row, done) !== 'pending');
        expect(shown.some((row) => row.from === 'yearCode'), walk.dateLabel).toBe(false);
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

  it('rests every question on numbers the screen is printing at that moment', () => {
    for (const date of SAMPLE) {
      const walk = guidedWalk(date);
      for (const [index, step] of walk.steps.entries()) {
        if (!step.ask) continue;
        const shown = visibleNumbers(walk, index);
        for (const operand of askOperands(step.ask)) {
          expect([...shown], `${walk.dateLabel} · ${step.id} · ${operand}`).toContain(operand);
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
          step.input === 'weekday' ? weekdayName(step.answer as Code) : String(step.answer);
        expect(step.working, `${step.id}`).toContain(wanted);
      }
    }
  });

  it('explains mod 7 wherever it asks for it', () => {
    // The screen said "a week is 7 days, so whole sevens change nothing", which
    // is the reason rather than the operation. Somebody meeting it for the first
    // time needs to be told what to do.
    for (const date of FEW) {
      for (const step of guidedWalk(date).steps) {
        if (step.ask?.kind !== 'sevens') continue;
        expect(step.why, step.id).toBe('mod 7 means take 7 away until less than 7 is left.');
      }
    }
  });

  it('says nothing where the operation explains itself', () => {
    // An addition needs no line under it, and one there anyway is a line the
    // user has to read past to get to the thing they are answering.
    const walk = guidedWalk({ fullYear: 1987, month: 3, day: 20 });
    for (const id of ['sum', 'anchorSum', 'daysOn', 'weekdaySum'] as const) {
      expect(stepOf(walk.steps, id).why, id).toBe('');
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

/**
 * Twelve sums in a row is arithmetic homework. The goals are what make it a
 * walk: one of them on screen at a time, saying what is being built.
 */
describe('the four goals', () => {
  it('is the year code, the doomsday, the days on and the weekday', () => {
    for (const date of FEW) {
      expect(guidedWalk(date).goals.map((goal) => goal.id)).toEqual([...GUIDED_GOAL_IDS]);
    }
  });

  it('gives every step exactly one row, inside its own goal', () => {
    // The screen finds the row to highlight by the step that fills it. A step
    // with no row would render a goal with nothing marked, which is the state
    // this design exists to make impossible.
    for (const date of SAMPLE) {
      const walk = guidedWalk(date);
      for (const step of walk.steps) {
        const owning = allRows(walk).filter((row) => row.from === step.id);
        expect(owning, `${walk.dateLabel} · ${step.id}`).toHaveLength(1);
        expect(goalOf(walk, step.goal).rows).toContain(owning[0]);
      }
    }
  });

  it('names every row and every goal', () => {
    for (const date of SAMPLE) {
      const walk = guidedWalk(date);
      for (const goal of walk.goals) {
        expect(goal.title.length).toBeGreaterThan(0);
        expect(goal.blurb.length).toBeGreaterThan(0);
        for (const row of goal.rows) {
          expect(row.label.length, `${goal.id}`).toBeGreaterThan(0);
          expect(row.value.length, `${goal.id} · ${row.label}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('holds the number the producing step actually answers', () => {
    for (const date of SAMPLE) {
      const walk = guidedWalk(date);
      for (const row of allRows(walk)) {
        if (row.from === null) continue;
        const step = stepOf(walk.steps, row.from);
        const wanted =
          step.input === 'weekday' ? weekdayName(step.answer as Code) : String(step.answer);
        expect(row.value, `${walk.dateLabel} · ${row.label}`).toBe(wanted);
      }
    }
  });

  it('never fills a row before its step, or leaves it empty after', () => {
    for (const date of FEW) {
      const walk = guidedWalk(date);
      const order = walk.steps.map((step) => step.id);
      for (const row of allRows(walk)) {
        const produced = row.from === null ? 0 : order.indexOf(row.from);
        for (let done = 0; done <= GUIDED_STEP_COUNT; done += 1) {
          const state = rowState(walk, row, done);
          const label = `${walk.dateLabel} · ${row.label} · ${done} done`;
          if (row.from === null) expect(state, label).toBe('filled');
          else if (done < produced) expect(state, label).toBe('pending');
          else if (done === produced) expect(state, label).toBe('active');
          else expect(state, label).toBe('filled');
        }
      }
    }
  });

  it('settles a goal only once every one of its rows is filled', () => {
    for (const date of FEW) {
      const walk = guidedWalk(date);
      for (let done = 0; done <= GUIDED_STEP_COUNT; done += 1) {
        const settled = settledGoals(walk, done).map((goal) => goal.id);
        const expected = walk.goals
          .filter((goal) => goal.rows.every((row) => rowState(walk, row, done) === 'filled'))
          .map((goal) => goal.id);
        expect(settled, `${walk.dateLabel} · ${done}`).toEqual(expected);
      }
    }
    // And nothing is settled before anything is answered.
    expect(settledGoals(guidedWalk(FEW[0]), 0)).toEqual([]);
  });

  it('collapses a settled goal to a line carrying its result', () => {
    const walk = guidedWalk({ fullYear: 1987, month: 3, day: 20 });
    expect(walk.goals.map((goal) => goal.summary)).toEqual([
      'Year code 3',
      'Doomsday 6, Saturday',
      'Days on 6',
      // The last goal is the answer. It does not collapse into anything.
      null,
    ]);
  });
});

describe('the worked example, 20 March 1987', () => {
  const walk = guidedWalk({ fullYear: 1987, month: 3, day: 20 });

  it('answers 3, 0, 3, 3, 6, 6, 6, 14, 6, 12, 5, 5', () => {
    expect(walk.steps.map((step) => step.answer)).toEqual([3, 0, 3, 3, 6, 6, 6, 14, 6, 12, 5, 5]);
  });

  it('asks each one as a sum on numbers already printed', () => {
    expect(walk.steps.map((step) => rowFor(walk, step.id).expression)).toEqual([
      '87 − 84',
      '3 ÷ 4',
      '3 + 0',
      '3 mod 7',
      '3 + 3',
      '6 mod 7',
      '6 as a weekday',
      'closest at or under 20',
      '20 − 14',
      '6 + 6',
      '12 mod 7',
      '5 as a weekday',
    ]);
  });

  it('reads as four goals rather than twelve sums', () => {
    expect(walk.goals.map((goal) => goal.title)).toEqual([
      'The year code for 87',
      'The doomsday of 1987',
      'From a doomsday to the 20th',
      'The weekday',
    ]);
  });

  it('states the anchor and the doomsday dates rather than asking for them', () => {
    // The old walk asked which century anchor applied and which date was
    // March's doomsday. Both are lookups, both can be got wrong by not having
    // followed an explanation, and neither is arithmetic.
    const stated = allRows(walk).filter((row) => row.from === null);
    expect(stated.map((row) => `${row.label}: ${row.value}`)).toEqual([
      'Anchor for the 1900s: 3',
      'Doomsdays in March: 7, 14, 21, 28',
      'Your date: 20',
    ]);
  });

  it('asks every step, none of them a line to read', () => {
    expect(walk.steps.some((step) => step.noop)).toBe(false);
  });

  it('offers the four doomsday dates of March as the choice', () => {
    expect(walk.steps[7].choices).toEqual([7, 14, 21, 28]);
    expect(walk.steps[7].input).toBe('choice');
  });

  it('closes on the fact', () => {
    expect(guidedClosingLine(walk, Date.UTC(2026, 7, 22))).toBe('20 March 1987 was a Friday.');
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
    expect(reduce.why).toContain('nothing comes off');
    expect(rowFor(walk, 'reduce').expression).toBe('12 is under 28');
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
    const walk = guidedWalk({ fullYear: 1987, month: 3, day: 14 });
    expect(walk.steps[8].noop).toBe(false);
    expect(rowFor(walk, 'daysOn').expression).toBe('14 − 14');
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
      const walk = guidedWalk({ fullYear, month, day });
      const shifted = goalOf(walk, 'daysOn').rows.some((row) => row.label === 'A week on from it');
      if (shifted) days.push(day);
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
    const rows = goalOf(walk, 'daysOn').rows;
    expect(rows.map((row) => `${row.label}: ${row.value}`)).toEqual([
      'Doomsdays in March: 7, 14, 21, 28',
      'Your date: 3',
      'A week on from it: 10',
      'Nearest doomsday: 7',
      'Days on: 3',
    ]);
    expect(walk.steps[7].why).toContain('A week on is the same weekday');
    expect(walk.steps[7].answer).toBe(7);
    expect(walk.steps[8].answer).toBe(3);
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
