import { describe, expect, it } from 'vitest';
import type { CalcStepId, YearKey } from './types';
import { allYears, codeFor } from './yearCodes';
import {
  CALC_DERIVATION_STEPS,
  CALC_STEP_IDS,
  CYCLE,
  CYCLE_SUM_STEP,
  MAX_RAW_SUM,
  MAX_REDUCED_SUM,
  type CalcStep,
  baseYears,
  cyclesRemoved,
  explain,
  leapDays,
  rawSum,
  reduce28,
  reducedStepsFor,
  sevenStep,
  stepsFor,
  stepsFromAnswers,
} from './calc';

const YEARS = allYears();

describe('the pieces of the formula', () => {
  it('counts leap days as the whole part of a quarter', () => {
    expect(leapDays(0)).toBe(0);
    expect(leapDays(3)).toBe(0);
    expect(leapDays(4)).toBe(1);
    expect(leapDays(73)).toBe(18);
    expect(leapDays(99)).toBe(24);
  });

  it('sums the year with its leap days', () => {
    expect(rawSum(73)).toBe(91);
    expect(rawSum(0)).toBe(0);
    expect(rawSum(99)).toBe(123);
    for (const yy of YEARS) expect(rawSum(yy)).toBe(yy + Math.floor(yy / 4));
  });

  it('refuses a year outside 00-99', () => {
    for (const bad of [-1, 100, 1.5, Number.NaN]) {
      expect(() => leapDays(bad)).toThrow(RangeError);
      expect(() => reduce28(bad)).toThrow(RangeError);
      expect(() => stepsFor(bad)).toThrow(RangeError);
      expect(() => reducedStepsFor(bad)).toThrow(RangeError);
      expect(() => explain(bad)).toThrow(RangeError);
    }
  });
});

describe('the 28-year cycle', () => {
  it('reduces below 28 and says how many cycles came out', () => {
    expect(reduce28(73)).toBe(17);
    expect(cyclesRemoved(73)).toBe(2);
    expect(reduce28(27)).toBe(27);
    expect(cyclesRemoved(27)).toBe(0);
    expect(reduce28(99)).toBe(15);
    expect(cyclesRemoved(99)).toBe(3);
    for (const yy of YEARS) {
      expect(reduce28(yy)).toBeLessThan(CYCLE);
      expect(cyclesRemoved(yy)).toBeGreaterThanOrEqual(0);
      expect(cyclesRemoved(yy)).toBeLessThanOrEqual(3);
      expect(cyclesRemoved(yy) * CYCLE + reduce28(yy)).toBe(yy);
    }
  });

  it('gives a year and its reduction the same code, for all 100', () => {
    for (const yy of YEARS) expect(codeFor(yy)).toBe(codeFor(reduce28(yy)));
  });

  it('holds because a cycle moves the sum by exactly 35, which is five weeks', () => {
    for (const yy of YEARS) {
      if (yy + CYCLE > 99) continue;
      expect(rawSum(yy + CYCLE) - rawSum(yy)).toBe(CYCLE_SUM_STEP);
    }
    expect(CYCLE_SUM_STEP % 7).toBe(0);
  });

  it('has 28 as the shortest repeat, not a multiple of something smaller', () => {
    for (let period = 1; period < CYCLE; period += 1) {
      const breaks = YEARS.some((yy) => yy + period <= 99 && codeFor(yy) !== codeFor(yy + period));
      expect(breaks).toBe(true);
    }
  });

  it('generates all seven codes from 00-27 alone', () => {
    expect(baseYears()).toHaveLength(CYCLE);
    expect(baseYears()[0]).toBe(0);
    expect(baseYears()[CYCLE - 1]).toBe(27);
    expect(new Set(baseYears().map(codeFor)).size).toBe(7);
  });
});

describe('sevenStep', () => {
  it('takes out no whole week below seven', () => {
    for (let n = 0; n < 7; n += 1) {
      expect(sevenStep(n)).toEqual({ multiple: 0, remainder: n });
    }
  });

  it('lands exactly on the boundaries', () => {
    expect(sevenStep(7)).toEqual({ multiple: 7, remainder: 0 });
    expect(sevenStep(14)).toEqual({ multiple: 14, remainder: 0 });
    expect(sevenStep(27)).toEqual({ multiple: 21, remainder: 6 });
    expect(sevenStep(33)).toEqual({ multiple: 28, remainder: 5 });
    expect(sevenStep(123)).toEqual({ multiple: 119, remainder: 4 });
  });

  it('always rebuilds the number it was given', () => {
    for (let n = 0; n <= 200; n += 1) {
      const { multiple, remainder } = sevenStep(n);
      expect(multiple + remainder).toBe(n);
      expect(multiple % 7).toBe(0);
      expect(remainder).toBeGreaterThanOrEqual(0);
      expect(remainder).toBeLessThan(7);
    }
  });

  it('pins nonsense to zero rather than producing a NaN for a screen', () => {
    for (const bad of [-1, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(sevenStep(bad)).toEqual({ multiple: 0, remainder: 0 });
    }
  });
});

describe('the bound that makes reducing worth doing', () => {
  it('caps the reduced sum at exactly 33, and the raw sum at exactly 123', () => {
    const rawSums = YEARS.map(rawSum);
    expect(Math.max(...rawSums)).toBe(MAX_RAW_SUM);
    expect(MAX_RAW_SUM).toBe(123);
    expect(rawSums.indexOf(MAX_RAW_SUM)).toBe(99);

    const reducedSums = YEARS.map((yy) => rawSum(reduce28(yy)));
    expect(Math.max(...reducedSums)).toBe(MAX_REDUCED_SUM);
    expect(MAX_REDUCED_SUM).toBe(33);
    expect(YEARS.filter((yy) => rawSum(reduce28(yy)) === MAX_REDUCED_SUM)).toEqual([27, 55, 83]);
  });

  it('needs only 7, 14, 21 and 28 once reduced', () => {
    const used = new Set<number>();
    for (const yy of YEARS) {
      const { multiple } = sevenStep(rawSum(reduce28(yy)));
      if (multiple > 0) used.add(multiple);
    }
    expect([...used].sort((a, b) => a - b)).toEqual([7, 14, 21, 28]);
  });

  it('needs multiples all the way to 119 when the year is left alone', () => {
    const used = new Set<number>();
    for (const yy of YEARS) {
      const { multiple } = sevenStep(rawSum(yy));
      if (multiple > 0) used.add(multiple);
    }
    expect(Math.max(...used)).toBe(119);
    expect(used.size).toBeGreaterThan(4);
  });
});

describe('explain', () => {
  it('names every intermediate value for a year', () => {
    expect(explain(73)).toEqual({
      yy: 73,
      leapDays: 18,
      rawSum: 91,
      reduced: 17,
      cyclesRemoved: 2,
      reducedLeapDays: 4,
      reducedSum: 21,
      code: 0,
    });
  });

  it('agrees with the table and with itself for all 100 years', () => {
    for (const yy of YEARS) {
      const e = explain(yy);
      expect(e.code).toBe(codeFor(yy));
      expect(e.rawSum % 7).toBe(e.code);
      expect(e.reducedSum % 7).toBe(e.code);
      expect(e.reducedSum).toBeLessThanOrEqual(MAX_REDUCED_SUM);
      expect(e.cyclesRemoved * CYCLE + e.reduced).toBe(yy);
    }
  });
});

/* ------------------------------------------------------------------ */
/* The steps                                                           */
/* ------------------------------------------------------------------ */

describe('stepsFor', () => {
  it('is leap, sum, remainder, in that order', () => {
    expect(stepsFor(73).map((s) => s.id)).toEqual(['leap', 'sum', 'mod']);
  });

  it('works 73 the way a person would say it', () => {
    const [leap, sum, mod] = stepsFor(73);
    expect(leap.answer).toBe(18);
    expect(leap.working).toBe('73 ÷ 4 = 18 remainder 1, so 18.');
    expect(sum.answer).toBe(91);
    expect(sum.working).toBe('73 + 18 = 91.');
    expect(mod.answer).toBe(0);
    expect(mod.working).toBe('91 − 7 × 13 = 0.');
  });

  it('ends at the true code for every one of the 100 years', () => {
    for (const yy of YEARS) {
      const steps = stepsFor(yy);
      expect(steps).toHaveLength(3);
      expect(steps[steps.length - 1].answer).toBe(codeFor(yy));
    }
  });

  it('carries the answer of each step into the next one', () => {
    for (const yy of YEARS) {
      const [leap, sum, mod] = stepsFor(yy);
      expect(leap.answer).toBe(leapDays(yy));
      expect(sum.answer).toBe(yy + leap.answer);
      expect(mod.answer).toBe(sum.answer % 7);
    }
  });
});

describe('reducedStepsFor', () => {
  it('is reduce, leap, sum, remainder, in that order, always four steps', () => {
    for (const yy of YEARS) {
      expect(reducedStepsFor(yy).map((s) => s.id)).toEqual(['reduce', 'leap', 'sum', 'mod']);
    }
  });

  it('works 73 through 17 instead of through 91', () => {
    const [reduce, leap, sum, mod] = reducedStepsFor(73);
    expect(reduce.answer).toBe(17);
    expect(reduce.working).toBe('73 − 2 × 28 = 17.');
    expect(leap.answer).toBe(4);
    expect(sum.answer).toBe(21);
    expect(mod.answer).toBe(0);
    expect(mod.working).toBe('21 − 7 × 3 = 0.');
  });

  it('keeps the reduce step even when nothing comes out', () => {
    const [reduce] = reducedStepsFor(17);
    expect(reduce.answer).toBe(17);
    expect(reduce.working).toBe('17 is under 28 on its own, so 17.');
  });

  it('ends at the true code for every one of the 100 years', () => {
    for (const yy of YEARS) {
      const steps = reducedStepsFor(yy);
      expect(steps).toHaveLength(4);
      expect(steps[steps.length - 1].answer).toBe(codeFor(yy));
    }
  });

  it('never asks for a sum above 33', () => {
    for (const yy of YEARS) {
      const sum = reducedStepsFor(yy).find((s) => s.id === 'sum');
      expect(sum?.answer).toBeLessThanOrEqual(MAX_REDUCED_SUM);
    }
  });

  it('reaches the same code as the long way round, every year', () => {
    for (const yy of YEARS) {
      const long = stepsFor(yy);
      const short = reducedStepsFor(yy);
      expect(short[short.length - 1].answer).toBe(long[long.length - 1].answer);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

/** Anything that means a template was rendered wrong or not at all. */
const PLACEHOLDERS = ['yy', '{', '}', 'NaN', 'undefined', 'Infinity', '$'];

/** The numbers this step must name for the line to mean anything. */
function required(step: CalcStep, yy: YearKey, working: YearKey): string[] {
  const l = leapDays(working);
  const s = rawSum(working);
  switch (step.id) {
    case 'reduce':
      return [String(yy), String(reduce28(yy)), '28'];
    case 'leap':
      return [String(working), String(l), '4'];
    case 'sum':
      return [String(working), String(l), String(s)];
    case 'mod':
      return [String(s), String(step.answer), '7'];
    default:
      return [];
  }
}

function checkStrings(step: CalcStep, yy: YearKey, working: YearKey): void {
  for (const field of [step.question, step.why, step.working]) {
    expect(field.length).toBeGreaterThan(0);
    for (const placeholder of PLACEHOLDERS) {
      expect(field).not.toContain(placeholder);
    }
    // Copy rules: no exclamation marks anywhere in the product.
    expect(field).not.toContain('!');
  }
  // The worked line always shows the answer it produced.
  expect(step.working).toContain(String(step.answer));
  // Every number the step turns on appears somewhere in what the user reads.
  const all = `${step.question} ${step.why} ${step.working}`;
  for (const number of required(step, yy, working)) {
    expect(all).toContain(number);
  }
}

describe('the copy on every step', () => {
  it('names this year’s real numbers, on both paths, for all 100 years', () => {
    for (const yy of YEARS) {
      for (const step of stepsFor(yy)) checkStrings(step, yy, yy);
      for (const step of reducedStepsFor(yy)) checkStrings(step, yy, reduce28(yy));
    }
  });

  it('is different for two different years', () => {
    const a = stepsFor(73).map((s) => s.working);
    const b = stepsFor(74).map((s) => s.working);
    expect(a).not.toEqual(b);
  });

  it('tells the user why reducing helps, and why it is allowed', () => {
    const reduce = reducedStepsFor(73)[0];
    expect(reduce.why).toContain('28');
    expect(reduce.why).toContain('35');
    const mod = reducedStepsFor(73)[3];
    expect(mod.why).toContain('33');
    // The long way says what it costs instead.
    expect(stepsFor(73)[2].why).toContain('123');
  });
});

describe('the step ids', () => {
  it('lists the four derivation steps plus the recall id', () => {
    expect(CALC_DERIVATION_STEPS).toEqual(['reduce', 'leap', 'sum', 'mod']);
    expect(CALC_STEP_IDS).toEqual(['reduce', 'leap', 'sum', 'mod', 'code']);
  });

  it('covers every id a derivation can produce', () => {
    const seen = new Set<CalcStepId>();
    for (const yy of YEARS) {
      for (const step of [...stepsFor(yy), ...reducedStepsFor(yy)]) seen.add(step.id);
    }
    expect([...seen].sort()).toEqual(['leap', 'mod', 'reduce', 'sum']);
    for (const id of seen) expect(CALC_STEP_IDS).toContain(id);
  });
});

describe('stepsFromAnswers', () => {
  it('matches the true derivation when nothing has been answered yet', () => {
    for (let yy = 0; yy < 100; yy++) {
      expect(stepsFromAnswers(yy, {}, false)).toEqual(stepsFor(yy));
      expect(stepsFromAnswers(yy, {}, true)).toEqual(reducedStepsFor(yy));
    }
  });

  it('carries a wrong leap count into the sum instead of correcting it', () => {
    // True: 73 + 18 = 91. The user says 17.
    const steps = stepsFromAnswers(73, { leap: 17 }, false);
    const sum = steps[1];
    expect(sum.question).toContain('73 + 17');
    expect(sum.answer).toBe(90);
    expect(sum.working).toBe('73 + 17 = 90.');
  });

  it('carries a wrong sum into the remainder', () => {
    const steps = stepsFromAnswers(73, { leap: 17, sum: 90 }, false);
    const mod = steps[2];
    expect(mod.question).toContain('90');
    expect(mod.answer).toBe(90 % 7);
  });

  it('carries a wrong reduction through every later step', () => {
    // True: 73 reduces to 17. The user says 18.
    const steps = stepsFromAnswers(73, { reduce: 18 }, true);
    expect(steps[1].answer).toBe(leapDays(18));
    expect(steps[2].question).toContain('18 + 4');
    expect(steps[3].answer).toBe(22 % 7);
  });

  it('makes one slip produce one wrong code, not a cascade of wrong steps', () => {
    // A user who miscounts the leap days and is then consistent should get
    // every later step right against their own chain, and only the code wrong.
    const steps = stepsFromAnswers(73, { leap: 17, sum: 90 }, false);
    expect(steps[2].answer).not.toBe(codeFor(73));
    expect(steps[1].answer).toBe(73 + 17);
  });
});
