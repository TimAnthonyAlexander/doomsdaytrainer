import { describe, expect, it } from 'vitest';
import { monthLength, stepSize, validTargetDays } from '@/domain/dayStep';
import { ALL_MONTHS, monthDoomsday } from '@/domain/weekday';
import { systemRng, type Rng } from '@/features/drills/drillPlan';
import { drawDayStepQuestion, nextDayStepQuestion, questionKey } from './dayStepPlan';

/** A pinned rng: hands back the given values in order, then repeats them. */
function fixed(values: number[]): Rng {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

/** A long run of real draws. Cheap, and the properties below are absolute. */
function run(count: number): ReturnType<typeof drawDayStepQuestion>[] {
  const out = [];
  let previous = null as ReturnType<typeof drawDayStepQuestion> | null;
  for (let i = 0; i < count; i += 1) {
    const question = nextDayStepQuestion(previous, systemRng);
    out.push(question);
    previous = question;
  }
  return out;
}

describe('drawDayStepQuestion', () => {
  it('always anchors on the real doomsday of the month it names', () => {
    for (const question of run(600)) {
      expect(question.anchorDay).toBe(monthDoomsday(question.month, question.leapYear));
    }
  });

  it('never asks for the doomsday itself, and never leaves the month', () => {
    for (const question of run(600)) {
      expect(question.targetDay).not.toBe(question.anchorDay);
      expect(question.targetDay).toBeGreaterThanOrEqual(1);
      expect(question.targetDay).toBeLessThanOrEqual(
        monthLength(question.month, question.leapYear),
      );
      expect(validTargetDays(question.month, question.leapYear, question.anchorDay)).toContain(
        question.targetDay,
      );
    }
  });

  it('states a weekday for the doomsday, and it is one of the seven', () => {
    for (const question of run(300)) {
      expect(question.anchorWeekday).toBeGreaterThanOrEqual(0);
      expect(question.anchorWeekday).toBeLessThanOrEqual(6);
      expect(Number.isInteger(question.anchorWeekday)).toBe(true);
    }
  });

  it('varies the leap case for January and February and for nothing else', () => {
    const seen = new Map<number, Set<boolean>>();
    for (const question of run(4000)) {
      const flags = seen.get(question.month) ?? new Set<boolean>();
      flags.add(question.leapYear);
      seen.set(question.month, flags);
    }
    for (const month of ALL_MONTHS) {
      const flags = seen.get(month);
      expect(flags).toBeDefined();
      if (month <= 2) {
        // Both doomsdays get drilled: January moves to the 4th and February to
        // the 29th in a leap year.
        expect([...(flags as Set<boolean>)].sort()).toEqual([false, true]);
      } else {
        expect([...(flags as Set<boolean>)]).toEqual([false]);
      }
    }
  });

  it('is deterministic given the rng, so a pinned draw is a fixed question', () => {
    const rng = fixed([0, 0, 0, 0]);
    const question = drawDayStepQuestion(rng);
    expect(question).toEqual({
      month: 1,
      leapYear: true,
      anchorDay: 4,
      anchorWeekday: 0,
      targetDay: 1,
    });
    // The same seed twice gives the same prompt.
    expect(drawDayStepQuestion(fixed([0, 0, 0, 0]))).toEqual(question);
  });

  it('cannot land on the anchor even when the draw runs to the top of the range', () => {
    // An rng pinned just under 1 draws the last of everything: December, the
    // last weekday, the last legal day.
    const question = drawDayStepQuestion(fixed([0.999999]));
    expect(question.month).toBe(12);
    expect(question.anchorWeekday).toBe(6);
    expect(question.targetDay).toBe(31);
    expect(question.targetDay).not.toBe(question.anchorDay);
  });
});

describe('nextDayStepQuestion', () => {
  it('never repeats the day just answered', () => {
    let previous = nextDayStepQuestion(null, systemRng);
    for (let i = 0; i < 400; i += 1) {
      const question = nextDayStepQuestion(previous, systemRng);
      expect(question.month === previous.month && question.targetDay === previous.targetDay).toBe(
        false,
      );
      previous = question;
    }
  });

  it('does not walk the days of the month in order', () => {
    // Invariant 10: an ordered set of prompts teaches the run rather than the
    // step, and a run can only be entered at its start. Three separate ways of
    // being ordered, all of them out.
    const questions = run(200);
    const days = questions.map((question) => question.targetDay);
    const months = questions.map((question) => question.month);

    const ascending = days.every((day, i) => i === 0 || day >= days[i - 1]);
    expect(ascending).toBe(false);

    const marching = days.every((day, i) => i === 0 || day === days[i - 1] + 1);
    expect(marching).toBe(false);

    // And it does not walk one month to exhaustion before moving on.
    expect(new Set(months.slice(0, 12)).size).toBeGreaterThan(1);
  });

  it('reaches every step size, the zero one included', () => {
    const sizes = new Set(
      run(1500).map((question) => stepSize(question.anchorDay, question.targetDay)),
    );
    expect([...sizes].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('asks in both directions', () => {
    const questions = run(300);
    expect(questions.some((question) => question.targetDay > question.anchorDay)).toBe(true);
    expect(questions.some((question) => question.targetDay < question.anchorDay)).toBe(true);
  });
});

describe('questionKey', () => {
  it('separates two prompts that differ only in the leap case', () => {
    const common = { month: 2, leapYear: false, anchorDay: 28, anchorWeekday: 3 as const, targetDay: 1 };
    const leap = { ...common, leapYear: true, anchorDay: 29 };
    expect(questionKey(common)).not.toBe(questionKey(leap));
  });

  it('separates two prompts that differ only in the stated weekday', () => {
    const base = { month: 3, leapYear: false, anchorDay: 14, anchorWeekday: 0 as const, targetDay: 5 };
    expect(questionKey(base)).not.toBe(questionKey({ ...base, anchorWeekday: 1 }));
  });
});
