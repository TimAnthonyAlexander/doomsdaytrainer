import { describe, expect, it } from 'vitest';
import { CALC_STEP_IDS, CYCLE, MAX_RAW_SUM, leapDays, reduce28 } from '@/domain/calc';
import { allYears, codeFor } from '@/domain/yearCodes';
import { answerLabel, answerMax, stepLabel, stepProse, stepsForMode, usesPad } from './stepView';

describe('stepsForMode', () => {
  it('asks three questions straight through and four with the reduce toggle on', () => {
    expect(stepsForMode(73, false).map((step) => step.id)).toEqual(['leap', 'sum', 'mod']);
    expect(stepsForMode(73, true).map((step) => step.id)).toEqual(['reduce', 'leap', 'sum', 'mod']);
  });

  it('reduces the year first, so every number after it is smaller', () => {
    const plain = stepsForMode(99, false);
    const reduced = stepsForMode(99, true);
    expect(reduced[0].answer).toBe(reduce28(99));
    expect(plain[0].answer).toBe(leapDays(99));
    expect(reduced[1].answer).toBe(leapDays(reduce28(99)));
    expect(reduced[2].answer).toBeLessThan(plain[1].answer);
  });

  it('lands on the same code either way, for every year', () => {
    for (const yy of allYears()) {
      const plain = stepsForMode(yy, false);
      const reduced = stepsForMode(yy, true);
      expect(plain[plain.length - 1].answer).toBe(codeFor(yy));
      expect(reduced[reduced.length - 1].answer).toBe(codeFor(yy));
    }
  });

  it('keeps the reduce question even when nothing comes out of it', () => {
    const steps = stepsForMode(17, true);
    expect(steps.map((step) => step.id)).toEqual(['reduce', 'leap', 'sum', 'mod']);
    expect(steps[0].answer).toBe(17);
  });
});

describe('usesPad', () => {
  it('sends the two code-answering steps to the pad and nothing else', () => {
    for (const yy of allYears()) {
      for (const step of stepsForMode(yy, true)) {
        expect(usesPad(step)).toBe(step.id === 'mod');
      }
    }
  });

  it('refuses a step whose answer would not fit on a 0-6 pad', () => {
    expect(usesPad({ id: 'mod', answer: 9, question: '', why: '', working: '' })).toBe(false);
    expect(usesPad({ id: 'code', answer: 4, question: '', why: '', working: '' })).toBe(true);
  });
});

describe('labels', () => {
  it('names every step id in every form', () => {
    for (const id of CALC_STEP_IDS) {
      expect(stepLabel(id)).not.toBe('');
      expect(stepProse(id)).not.toBe('');
      expect(answerLabel(id)).not.toBe('');
      expect(answerMax(id)).toBeGreaterThan(0);
    }
  });

  it('caps each answer at the range, never at the answer on screen', () => {
    expect(answerMax('reduce')).toBe(CYCLE - 1);
    expect(answerMax('leap')).toBe(leapDays(99));
    expect(answerMax('sum')).toBe(MAX_RAW_SUM);
    expect(answerMax('mod')).toBe(6);

    for (const yy of allYears()) {
      for (const step of stepsForMode(yy, true)) {
        expect(step.answer).toBeLessThanOrEqual(answerMax(step.id));
      }
    }
  });
});
