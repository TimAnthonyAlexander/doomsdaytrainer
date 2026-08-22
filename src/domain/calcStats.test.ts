import { describe, expect, it } from 'vitest';
import type { CalcAttempt, CalcStepId, VerifyResultInput } from './types';
import { CALC_STEP_IDS } from './calc';
import { median } from './time';
import { codeFor } from './yearCodes';
import {
  WEEKDAY_BUCKET_COUNT,
  bucketLowerEdge,
  bucketUpperEdge,
  latencyBucket,
} from './weekdayLifetime';
import {
  VERIFY_OUTCOMES,
  WEAKEST_STEP_MIN_SAMPLES,
  addCalcAttempt,
  addVerifyResult,
  buildCalcTotals,
  buildVerifyAttempt,
  buildVerifyTotals,
  calcAnsweredTotal,
  calcStepAccuracy,
  calcStepAnswered,
  calcStepMedian,
  classifyVerify,
  emptyCalcTotals,
  emptyStepTotals,
  emptyVerifyTotals,
  isCalcAttemptShaped,
  isVerifyAttemptShaped,
  repairCalcTotals,
  repairVerifyTotals,
  verifyAgreed,
  verifyAgreementRate,
  verifyCalculationAccuracy,
  verifyChecked,
  verifyDisagreed,
  verifyMemoryAccuracy,
  verifyMemoryWinRate,
  weakestStep,
} from './calcStats';

function attempt(step: CalcStepId, correct: boolean, latencyMs: number, yy = 73): CalcAttempt {
  return { timestamp: 1, yy, step, answered: correct ? 0 : 3, correct, latencyMs, reduced: true };
}

function many(step: CalcStepId, count: number, latencyMs: number, correct = true): CalcAttempt[] {
  return Array.from({ length: count }, () => attempt(step, correct, latencyMs));
}

/* ------------------------------------------------------------------ */
/* Per-step totals                                                     */
/* ------------------------------------------------------------------ */

describe('emptyCalcTotals', () => {
  it('has one bucket array per step, all zero', () => {
    const totals = emptyCalcTotals();
    expect(Object.keys(totals).sort()).toEqual([...CALC_STEP_IDS].sort());
    for (const step of CALC_STEP_IDS) {
      expect(totals[step].answered).toBe(0);
      expect(totals[step].correct).toBe(0);
      expect(totals[step].buckets).toHaveLength(WEEKDAY_BUCKET_COUNT);
      expect(totals[step].buckets.every((n) => n === 0)).toBe(true);
    }
  });

  it('hands out a fresh array each time, not a shared one', () => {
    const a = emptyCalcTotals();
    const b = emptyCalcTotals();
    a.leap.buckets[0] = 9;
    expect(b.leap.buckets[0]).toBe(0);
    expect(emptyStepTotals().buckets).toHaveLength(WEEKDAY_BUCKET_COUNT);
  });
});

describe('addCalcAttempt', () => {
  it('counts an answer against its own step, and never mutates the input', () => {
    const before = emptyCalcTotals();
    const after = addCalcAttempt(before, attempt('leap', true, 3200));

    expect(before.leap.answered).toBe(0);
    expect(after.leap).toMatchObject({ answered: 1, correct: 1 });
    expect(after.leap.buckets[latencyBucket(3200)]).toBe(1);
    expect(after.sum.answered).toBe(0);
  });

  it('counts a wrong answer as answered but not correct', () => {
    const after = addCalcAttempt(emptyCalcTotals(), attempt('mod', false, 8000));
    expect(after.mod).toMatchObject({ answered: 1, correct: 0 });
    expect(calcStepAccuracy(after, 'mod')).toBe(0);
  });

  it('keeps every step apart', () => {
    let totals = emptyCalcTotals();
    for (const one of [
      ...many('reduce', 6, 1800),
      ...many('leap', 6, 3000),
      ...many('sum', 6, 2200),
      ...many('mod', 6, 9000),
      ...many('code', 6, 700),
    ]) {
      totals = addCalcAttempt(totals, one);
    }

    expect(calcStepAnswered(totals, 'mod')).toBe(6);
    expect(calcAnsweredTotal(totals)).toBe(30);
    expect(calcStepMedian(totals, 'code')).toBeLessThan(1000);
    expect(calcStepMedian(totals, 'mod')).toBeGreaterThan(8000);
  });

  it('is the same folded one at a time or built from the log', () => {
    const attempts = [
      attempt('leap', true, 2400),
      attempt('sum', false, 5100),
      attempt('mod', true, 12_000),
      attempt('code', true, 640),
    ];
    let folded = emptyCalcTotals();
    for (const one of attempts) folded = addCalcAttempt(folded, one);
    expect(folded).toEqual(buildCalcTotals(attempts));
  });

  it('skips an entry that is not an attempt, or names a step it does not know', () => {
    const totals = buildCalcTotals([
      null,
      attempt('leap', true, 900),
      7,
      { ...attempt('leap', true, 900), step: 'carry' },
    ] as unknown as CalcAttempt[]);
    expect(calcAnsweredTotal(totals)).toBe(1);
    expect(calcStepAnswered(totals, 'leap')).toBe(1);
  });

  it('pins an unreadable latency into range rather than losing the answer', () => {
    const totals = buildCalcTotals([attempt('sum', true, Number.NaN), attempt('sum', true, -20)]);
    expect(calcStepAnswered(totals, 'sum')).toBe(2);
    expect(totals.sum.buckets.reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe('reading the numbers back', () => {
  it('reports nothing rather than zero before a step has been answered', () => {
    const totals = emptyCalcTotals();
    for (const step of CALC_STEP_IDS) {
      expect(calcStepMedian(totals, step)).toBeNull();
      expect(calcStepAccuracy(totals, step)).toBeNull();
    }
    expect(calcAnsweredTotal(totals)).toBe(0);
  });

  it('lands within a bucket of the true median', () => {
    const latencies = [1800, 2100, 2400, 3000, 3600, 4200, 9000];
    let totals = emptyCalcTotals();
    for (const ms of latencies) totals = addCalcAttempt(totals, attempt('leap', true, ms));

    const estimate = calcStepMedian(totals, 'leap') as number;
    const trueMedian = median(latencies);
    const bucket = latencyBucket(trueMedian);
    expect(estimate).not.toBeNull();
    expect(estimate).toBeGreaterThanOrEqual(bucketLowerEdge(bucket));
    expect(estimate).toBeLessThanOrEqual(bucketUpperEdge(bucket));
  });

  it('reports accuracy as a share of what was answered', () => {
    let totals = emptyCalcTotals();
    for (const one of many('mod', 3, 4000, true)) totals = addCalcAttempt(totals, one);
    totals = addCalcAttempt(totals, attempt('mod', false, 4000));
    expect(calcStepAccuracy(totals, 'mod')).toBe(0.75);
  });
});

describe('the lifetime numbers surviving a trimmed log', () => {
  it('does not move when the raw attempts are capped', () => {
    const all: CalcAttempt[] = [];
    let raw: CalcAttempt[] = [];
    let totals = emptyCalcTotals();
    const cap = 12;
    const steps: CalcStepId[] = ['reduce', 'leap', 'sum', 'mod'];

    for (let i = 0; i < 240; i += 1) {
      const one = attempt(steps[i % 4], i % 5 !== 0, 500 + i * 61, i % 100);
      all.push(one);
      // Exactly what the provider does on every answer: cap the log, fold the
      // aggregate.
      raw = [...raw, one].slice(-cap);
      totals = addCalcAttempt(totals, one);
    }

    expect(raw).toHaveLength(cap);
    expect(calcAnsweredTotal(totals)).toBe(240);
    expect(totals).toEqual(buildCalcTotals(all));
    // The aggregate still describes all 240, not the 12 that are left.
    expect(calcStepMedian(totals, 'mod')).not.toBe(calcStepMedian(buildCalcTotals(raw), 'mod'));
  });
});

describe('weakestStep', () => {
  it('says nothing until a step has been answered enough times', () => {
    let totals = emptyCalcTotals();
    expect(weakestStep(totals)).toBeNull();
    for (const one of many('mod', WEAKEST_STEP_MIN_SAMPLES - 1, 20_000)) {
      totals = addCalcAttempt(totals, one);
    }
    expect(weakestStep(totals)).toBeNull();
    totals = addCalcAttempt(totals, attempt('mod', true, 20_000));
    expect(weakestStep(totals)).toBe('mod');
  });

  it('names the slowest step by median', () => {
    let totals = emptyCalcTotals();
    for (const one of [
      ...many('reduce', 10, 1200),
      ...many('leap', 10, 2600),
      ...many('sum', 10, 1900),
      ...many('mod', 10, 7500),
    ]) {
      totals = addCalcAttempt(totals, one);
    }
    expect(weakestStep(totals)).toBe('mod');
  });

  it('ignores a step that is still short of samples, even when it is slower', () => {
    let totals = emptyCalcTotals();
    for (const one of many('leap', 20, 3000)) totals = addCalcAttempt(totals, one);
    for (const one of many('mod', 2, 25_000)) totals = addCalcAttempt(totals, one);
    expect(weakestStep(totals)).toBe('leap');
  });

  it('never names the recall step, which is not part of the calculation', () => {
    let totals = emptyCalcTotals();
    for (const one of many('code', 40, 30_000)) totals = addCalcAttempt(totals, one);
    expect(weakestStep(totals)).toBeNull();
    for (const one of many('sum', 10, 1000)) totals = addCalcAttempt(totals, one);
    expect(weakestStep(totals)).toBe('sum');
  });

  it('breaks a tie towards the earlier step, deterministically', () => {
    let totals = emptyCalcTotals();
    for (const one of [...many('leap', 10, 3000), ...many('mod', 10, 3000)]) {
      totals = addCalcAttempt(totals, one);
    }
    expect(weakestStep(totals)).toBe('leap');
    expect(weakestStep(totals)).toBe('leap');
  });
});

/* ------------------------------------------------------------------ */
/* Verify mode                                                         */
/* ------------------------------------------------------------------ */

function verify(yy: number, recalled: number, derived: number): VerifyResultInput {
  return {
    timestamp: 10,
    yy,
    recalled,
    derived,
    recallLatencyMs: 900,
    deriveLatencyMs: 6000,
    reduced: true,
  };
}

describe('classifyVerify', () => {
  it('has one outcome per way two answers can meet one truth', () => {
    // 73 → 0.
    expect(classifyVerify(0, 0, 0)).toBe('agreed-right');
    expect(classifyVerify(3, 3, 0)).toBe('agreed-wrong');
    expect(classifyVerify(0, 4, 0)).toBe('memory-right');
    expect(classifyVerify(4, 0, 0)).toBe('calculation-right');
    expect(classifyVerify(2, 5, 0)).toBe('both-wrong');
  });

  it('covers every pair of answers for every year, with nothing left over', () => {
    const seen = new Set<string>();
    for (let yy = 0; yy < 100; yy += 1) {
      const actual = codeFor(yy);
      for (let recalled = 0; recalled < 7; recalled += 1) {
        for (let derived = 0; derived < 7; derived += 1) {
          const outcome = classifyVerify(recalled, derived, actual);
          expect(VERIFY_OUTCOMES).toContain(outcome);
          seen.add(outcome);
          // At most one of two different answers can be the true one.
          if (outcome === 'memory-right') expect(recalled).toBe(actual);
          if (outcome === 'calculation-right') expect(derived).toBe(actual);
          if (outcome === 'both-wrong') {
            expect(recalled).not.toBe(actual);
            expect(derived).not.toBe(actual);
          }
        }
      }
    }
    expect(seen.size).toBe(VERIFY_OUTCOMES.length);
  });
});

describe('buildVerifyAttempt', () => {
  it('takes the truth from the table, never from the caller', () => {
    const built = buildVerifyAttempt(verify(73, 0, 0));
    expect(built.actual).toBe(codeFor(73));
    expect(built.outcome).toBe('agreed-right');
    expect(built.recallLatencyMs).toBe(900);
    expect(built.deriveLatencyMs).toBe(6000);
    expect(built.reduced).toBe(true);
  });

  it('agrees with the table for every year', () => {
    for (let yy = 0; yy < 100; yy += 1) {
      const code = codeFor(yy);
      expect(buildVerifyAttempt(verify(yy, code, code)).outcome).toBe('agreed-right');
      expect(buildVerifyAttempt(verify(yy, (code + 1) % 7, code)).outcome).toBe('calculation-right');
      expect(buildVerifyAttempt(verify(yy, code, (code + 1) % 7)).outcome).toBe('memory-right');
    }
  });

  it('refuses a year outside 00-99 rather than storing a made-up code', () => {
    expect(() => buildVerifyAttempt(verify(200, 0, 0))).toThrow(RangeError);
  });
});

describe('verify totals', () => {
  it('counts nothing at the start, and reports rates as null rather than zero', () => {
    const totals = emptyVerifyTotals();
    expect(verifyChecked(totals)).toBe(0);
    expect(verifyAgreementRate(totals)).toBeNull();
    expect(verifyMemoryAccuracy(totals)).toBeNull();
    expect(verifyCalculationAccuracy(totals)).toBeNull();
    expect(verifyMemoryWinRate(totals)).toBeNull();
  });

  it('answers who was right when the two disagreed', () => {
    const attempts = [
      buildVerifyAttempt(verify(73, 0, 0)), // agreed, both right
      buildVerifyAttempt(verify(73, 3, 3)), // agreed, both wrong
      buildVerifyAttempt(verify(73, 0, 5)), // memory right
      buildVerifyAttempt(verify(73, 6, 0)), // calculation right
      buildVerifyAttempt(verify(73, 2, 4)), // neither right
      buildVerifyAttempt(verify(73, 1, 0)), // calculation right
    ];
    const totals = buildVerifyTotals(attempts);

    expect(totals).toEqual({
      agreedRight: 1,
      agreedWrong: 1,
      memoryRight: 1,
      calculationRight: 2,
      bothWrong: 1,
    });
    expect(verifyChecked(totals)).toBe(6);
    expect(verifyAgreed(totals)).toBe(2);
    expect(verifyDisagreed(totals)).toBe(4);
    expect(verifyAgreementRate(totals)).toBeCloseTo(2 / 6);
    expect(verifyMemoryAccuracy(totals)).toBeCloseTo(2 / 6);
    expect(verifyCalculationAccuracy(totals)).toBeCloseTo(3 / 6);
    // Of the four disagreements, memory won one.
    expect(verifyMemoryWinRate(totals)).toBe(0.25);
  });

  it('reports no win rate when they have never disagreed', () => {
    const totals = buildVerifyTotals([buildVerifyAttempt(verify(73, 0, 0)), buildVerifyAttempt(verify(12, 1, 1))]);
    expect(verifyDisagreed(totals)).toBe(0);
    expect(verifyMemoryWinRate(totals)).toBeNull();
    expect(verifyAgreementRate(totals)).toBe(1);
  });

  it('never mutates what it was given, and skips junk in a log', () => {
    const before = emptyVerifyTotals();
    const after = addVerifyResult(before, buildVerifyAttempt(verify(73, 0, 0)));
    expect(before.agreedRight).toBe(0);
    expect(after.agreedRight).toBe(1);

    const totals = buildVerifyTotals([
      null,
      buildVerifyAttempt(verify(73, 0, 0)),
      { outcome: 'made-up' },
    ] as never);
    expect(verifyChecked(totals)).toBe(1);
  });

  it('is the same folded one at a time or built from the log', () => {
    const attempts = [verify(73, 0, 0), verify(40, 2, 1), verify(99, 4, 4)].map(buildVerifyAttempt);
    let folded = emptyVerifyTotals();
    for (const one of attempts) folded = addVerifyResult(folded, one);
    expect(folded).toEqual(buildVerifyTotals(attempts));
  });
});

/* ------------------------------------------------------------------ */
/* Repair                                                              */
/* ------------------------------------------------------------------ */

describe('repairCalcTotals', () => {
  it('rebuilds from the raw log when there is no aggregate at all', () => {
    const attempts = [attempt('leap', true, 2000), attempt('mod', false, 5000)];
    expect(repairCalcTotals(undefined, attempts)).toEqual(buildCalcTotals(attempts));
    expect(repairCalcTotals(null, attempts)).toEqual(buildCalcTotals(attempts));
    expect(repairCalcTotals([], [])).toEqual(emptyCalcTotals());
  });

  it('leaves a good aggregate exactly as it was', () => {
    const totals = buildCalcTotals([attempt('sum', true, 1500), attempt('sum', false, 9000)]);
    expect(repairCalcTotals(totals)).toEqual(totals);
  });

  it('turns every unusable number into a zero', () => {
    const repaired = repairCalcTotals({
      leap: { answered: Number.NaN, correct: 'four', buckets: [2, Number.NaN, -1, undefined, 5] },
      sum: 'gone',
    });

    for (const step of CALC_STEP_IDS) {
      expect(repaired[step].buckets).toHaveLength(WEEKDAY_BUCKET_COUNT);
      for (const count of repaired[step].buckets) {
        expect(Number.isFinite(count)).toBe(true);
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
    expect(repaired.leap.buckets[0]).toBe(2);
    expect(repaired.leap.buckets[1]).toBe(0);
    expect(repaired.leap.buckets[4]).toBe(5);
    expect(repaired.leap.correct).toBe(0);
    // Seven samples really exist, so the count is raised to cover them.
    expect(repaired.leap.answered).toBe(7);
    expect(repaired.sum).toEqual(emptyStepTotals());
    expect(Number.isFinite(calcStepMedian(repaired, 'leap') as number)).toBe(true);
    expect(calcStepAccuracy(repaired, 'sum')).toBeNull();
  });

  it('never lets accuracy come out above 100%', () => {
    const repaired = repairCalcTotals({ mod: { answered: 2, correct: 90, buckets: [1, 1] } });
    expect(repaired.mod.correct).toBe(2);
    expect(calcStepAccuracy(repaired, 'mod')).toBe(1);
  });

  it('pads a bucket array written by a build with fewer buckets', () => {
    const repaired = repairCalcTotals({ code: { answered: 3, correct: 3, buckets: [3] } });
    expect(repaired.code.buckets).toHaveLength(WEEKDAY_BUCKET_COUNT);
    expect(repaired.code.buckets[0]).toBe(3);
    expect(calcStepMedian(repaired, 'code')).toBe(125);
  });
});

describe('repairVerifyTotals', () => {
  it('rebuilds from the raw log when there is no aggregate at all', () => {
    const attempts = [buildVerifyAttempt(verify(73, 0, 0)), buildVerifyAttempt(verify(73, 1, 0))];
    expect(repairVerifyTotals(undefined, attempts)).toEqual(buildVerifyTotals(attempts));
    expect(repairVerifyTotals(null, attempts)).toEqual(buildVerifyTotals(attempts));
    expect(repairVerifyTotals('nope', [])).toEqual(emptyVerifyTotals());
  });

  it('turns every unusable counter into a zero', () => {
    const repaired = repairVerifyTotals({
      agreedRight: 4,
      agreedWrong: -2,
      memoryRight: 'one',
      calculationRight: Number.NaN,
    });
    expect(repaired).toEqual({
      agreedRight: 4,
      agreedWrong: 0,
      memoryRight: 0,
      calculationRight: 0,
      bothWrong: 0,
    });
    expect(verifyChecked(repaired)).toBe(4);
    expect(verifyAgreementRate(repaired)).toBe(1);
  });
});

describe('the raw log guards', () => {
  it('accepts what the trainer writes', () => {
    expect(isCalcAttemptShaped(attempt('leap', true, 2000))).toBe(true);
    expect(isVerifyAttemptShaped(buildVerifyAttempt(verify(73, 0, 0)))).toBe(true);
  });

  it('rejects anything a screen would choke on', () => {
    const good = attempt('leap', true, 2000);
    for (const bad of [
      null,
      7,
      [],
      { ...good, step: 'carry' },
      { ...good, yy: 300 },
      { ...good, yy: 1.5 },
      { ...good, timestamp: 'now' },
      { ...good, latencyMs: Number.NaN },
      { ...good, correct: 'yes' },
    ]) {
      expect(isCalcAttemptShaped(bad)).toBe(false);
    }

    const goodVerify = buildVerifyAttempt(verify(73, 0, 0));
    for (const bad of [
      null,
      'x',
      { ...goodVerify, outcome: 'maybe' },
      { ...goodVerify, yy: -1 },
      { ...goodVerify, recalled: null },
      { ...goodVerify, derived: '0' },
      { ...goodVerify, recallLatencyMs: Number.NaN },
      { ...goodVerify, deriveLatencyMs: undefined },
    ]) {
      expect(isVerifyAttemptShaped(bad)).toBe(false);
    }
  });
});
