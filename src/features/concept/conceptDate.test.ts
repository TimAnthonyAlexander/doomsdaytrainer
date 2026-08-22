import { describe, expect, it } from 'vitest';
import { isWalkableDate } from '@/domain/guidedDate';
import { MAX_YEAR, MIN_YEAR } from '@/domain/weekday';
import {
  CONCEPT_MAX,
  CONCEPT_MAX_INPUT,
  CONCEPT_MIN,
  CONCEPT_MIN_INPUT,
  clampDate,
  parseDateInput,
  randomConceptDate,
  readDateInput,
  toDateInput,
} from './conceptDate';

const FALLBACK = { fullYear: 1987, month: 3, day: 20 };

describe('the range the picker offers', () => {
  it('is the range the calendar maths is tested across', () => {
    expect(CONCEPT_MIN_INPUT).toBe('1800-01-01');
    expect(CONCEPT_MAX_INPUT).toBe('2199-12-31');
    expect(CONCEPT_MIN.fullYear).toBe(MIN_YEAR);
    expect(CONCEPT_MAX.fullYear).toBe(MAX_YEAR);
  });
});

describe('toDateInput', () => {
  it('zero-pads both halves', () => {
    expect(toDateInput({ fullYear: 2001, month: 4, day: 9 })).toBe('2001-04-09');
  });
});

describe('parseDateInput', () => {
  it('reads a well-formed date', () => {
    expect(parseDateInput('1987-03-20')).toEqual({ fullYear: 1987, month: 3, day: 20 });
  });

  it('refuses anything that is not the shape', () => {
    for (const value of ['', '1987-3-20', '20/03/1987', 'today', '1987-03-20T00:00']) {
      expect(parseDateInput(value), value).toBeNull();
    }
  });

  it('refuses a day the month does not have', () => {
    expect(parseDateInput('1987-02-31')).toBeNull();
    expect(parseDateInput('1900-02-29')).toBeNull();
    expect(parseDateInput('1987-13-01')).toBeNull();
    expect(parseDateInput('1987-00-10')).toBeNull();
  });

  it('takes 29 February in a leap year', () => {
    expect(parseDateInput('2000-02-29')).toEqual({ fullYear: 2000, month: 2, day: 29 });
  });
});

describe('clampDate', () => {
  it('leaves a date in range alone', () => {
    expect(clampDate(FALLBACK)).toEqual(FALLBACK);
  });

  it('pulls a date below the range to the first day of it', () => {
    expect(clampDate({ fullYear: 1799, month: 12, day: 31 })).toEqual(CONCEPT_MIN);
    // Two-digit years are the trap: day arithmetic would map 0099 into 1999.
    expect(clampDate({ fullYear: 99, month: 6, day: 1 })).toEqual(CONCEPT_MIN);
  });

  it('pulls a date above the range to the last day of it', () => {
    expect(clampDate({ fullYear: 2200, month: 1, day: 1 })).toEqual(CONCEPT_MAX);
  });
});

describe('readDateInput', () => {
  it('keeps the walk where it was when the value is unusable', () => {
    for (const value of ['', 'nonsense', '1987-02-31']) {
      expect(readDateInput(value, FALLBACK), value).toEqual(FALLBACK);
    }
  });

  it('clamps rather than handing the maths a date it would throw on', () => {
    expect(readDateInput('1799-06-05', FALLBACK)).toEqual(CONCEPT_MIN);
    expect(readDateInput('2200-06-05', FALLBACK)).toEqual(CONCEPT_MAX);
  });

  it('only ever returns a date the walk can take', () => {
    for (const value of ['', '1799-01-01', '9999-12-31', '2000-02-29', 'x']) {
      expect(isWalkableDate(readDateInput(value, FALLBACK)), value).toBe(true);
    }
  });
});

describe('randomConceptDate', () => {
  it('lands on the first day of the range at the bottom of the draw', () => {
    expect(randomConceptDate(() => 0)).toEqual(CONCEPT_MIN);
  });

  it('lands on the last day of the range at the top of the draw', () => {
    expect(randomConceptDate(() => 0.999999999)).toEqual(CONCEPT_MAX);
  });

  it('always draws a date the walk can take', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(isWalkableDate(randomConceptDate())).toBe(true);
    }
  });
});
