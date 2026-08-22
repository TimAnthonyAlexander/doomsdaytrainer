import { describe, expect, it } from 'vitest';
import { guidedWalk, type GuidedStepId } from '@/domain/guidedDate';
import { ALL_MONTHS, MONTH_DOOMSDAYS, monthDoomsday, trueWeekdayName } from '@/domain/weekday';
import { INTRO_DATE, introExample, introGroups, introTrueWeekday } from './introContent';

const example = introExample();
const walk = guidedWalk(INTRO_DATE);

function answerOf(id: GuidedStepId): number {
  const step = walk.steps.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`No step ${id}`);
  return step.answer;
}

/**
 * The explainer states arithmetic, and stated arithmetic is the first thing to
 * rot: the tables move, the wording stays, and the screen that teaches the
 * method quietly starts teaching a different one. Every figure it prints is
 * checked here against the trainer's own walk of the same date, which is itself
 * checked against the real calendar.
 */
describe('the worked example', () => {
  it('is 20 March 2026', () => {
    expect(INTRO_DATE).toEqual({ fullYear: 2026, month: 3, day: 20 });
    expect(example.dateLabel).toBe('20 March 2026');
  });

  it('lands on the weekday the calendar actually has', () => {
    expect(example.weekday).toBe(introTrueWeekday());
    expect(example.weekdayName).toBe(trueWeekdayName(introTrueWeekday()));
    expect(example.weekdayName).toBe('Friday');
  });

  it('agrees with the trainer step for step', () => {
    expect(example.quarters).toBe(answerOf('leap'));
    expect(example.rawSum).toBe(answerOf('sum'));
    expect(example.yearCode).toBe(answerOf('yearCode'));
    expect(example.doomsdaySum).toBe(answerOf('anchorSum'));
    expect(example.doomsday).toBe(answerOf('yearDoomsday'));
    expect(example.monthDoomsday).toBe(answerOf('nearest'));
    expect(example.daysOn).toBe(answerOf('daysOn'));
    expect(example.finalSum).toBe(answerOf('weekdaySum'));
    expect(example.weekday).toBe(answerOf('weekdayCode'));
  });

  it('states the numbers the copy leans on', () => {
    expect(example.yy).toBe('26');
    expect(example.quarters).toBe(6);
    expect(example.rawSum).toBe(32);
    expect(example.sevensOff).toBe(28);
    expect(example.yearCode).toBe(4);
    expect(example.century).toBe('2000s');
    expect(example.anchor).toBe(2);
    expect(example.doomsday).toBe(6);
    expect(example.doomsdayName).toBe('Saturday');
    expect(example.monthDoomsday).toBe(14);
    expect(example.daysOn).toBe(6);
    expect(example.finalSum).toBe(12);
    expect(example.finalSevensOff).toBe(7);
  });

  it('takes every sum it prints down to the value it prints beside it', () => {
    expect(example.yyValue + example.quarters).toBe(example.rawSum);
    expect(example.rawSum - example.sevensOff).toBe(example.yearCode);
    expect(example.anchor + example.yearCode).toBe(example.doomsdaySum);
    expect(example.day - example.monthDoomsday).toBe(example.daysOn);
    expect(example.doomsday + example.daysOn).toBe(example.finalSum);
    expect(example.finalSum - example.finalSevensOff).toBe(example.weekday);
  });

  it('needs no sevens taken off the century sum, which the screen relies on', () => {
    // The explainer prints "2 + 4" straight to the doomsday with no reducing
    // step between. That is only honest while the sum stays under seven, so a
    // change of date has to fail here rather than print a wrong line.
    expect(example.doomsdaySum).toBeLessThan(7);
    expect(example.doomsdaySum).toBe(example.doomsday);
  });
});

describe('the doomsday dates, grouped the way they are remembered', () => {
  const groups = introGroups();
  const listed = groups.flatMap((group) => group.months);

  it('covers all twelve months, once each', () => {
    expect(listed.map((entry) => entry.month).sort((a, b) => a - b)).toEqual([...ALL_MONTHS]);
  });

  it('holds the shipped table rather than a second copy of it', () => {
    for (const entry of listed) {
      expect(entry.day, entry.short).toBe(MONTH_DOOMSDAYS[entry.month - 1]);
      const leap = monthDoomsday(entry.month, true);
      expect(entry.leapDay, entry.short).toBe(leap === entry.day ? null : leap);
    }
  });

  it('moves January and February in a leap year, and nothing else', () => {
    const moves = listed.filter((entry) => entry.leapDay !== null).map((entry) => entry.month);
    expect(moves.sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('puts the even months on their own number', () => {
    const even = groups.find((group) => group.id === 'even');
    expect(even?.months.map((entry) => entry.month)).toEqual([4, 6, 8, 10, 12]);
    for (const entry of even?.months ?? []) expect(entry.day).toBe(entry.month);
  });

  it('pairs nine to five at seven eleven', () => {
    const odd = groups.find((group) => group.id === 'odd');
    expect(odd?.months.map((entry) => [entry.month, entry.day])).toEqual([
      [5, 9],
      [7, 11],
      [9, 5],
      [11, 7],
    ]);
  });

  it('keeps March on pi day', () => {
    const march = groups.find((group) => group.id === 'march');
    expect(march?.months.map((entry) => [entry.month, entry.day])).toEqual([[3, 14]]);
  });

  it('names every group and gives every one a way to remember it', () => {
    for (const group of groups) {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.hint.length).toBeGreaterThan(0);
    }
  });
});
