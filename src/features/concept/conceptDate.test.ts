import { describe, expect, it } from 'vitest';
import { isWalkableDate } from '@/domain/guidedDate';
import { MAX_YEAR, MIN_YEAR } from '@/domain/weekday';
import {
  CONCEPT_MAX,
  CONCEPT_MAX_INPUT,
  CONCEPT_MIN,
  CONCEPT_MIN_INPUT,
  parseDateInput,
  randomConceptDate,
  toDateInput,
  usableDate,
} from './conceptDate';

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

describe('usableDate', () => {
  it('takes a date the walk can stand on', () => {
    expect(usableDate('1987-03-20')).toEqual({ fullYear: 1987, month: 3, day: 20 });
    expect(usableDate(CONCEPT_MIN_INPUT)).toEqual(CONCEPT_MIN);
    expect(usableDate(CONCEPT_MAX_INPUT)).toEqual(CONCEPT_MAX);
  });

  it('refuses rather than pulls a year outside the range', () => {
    // It used to clamp, and the clamp is what broke typing. A year is entered a
    // digit at a time, so 2012 arrives as 0002, then 0020, then 0201. Clamping
    // turned each of those into 1800-01-01 and wrote it back into the field,
    // eating the digit that had just been typed.
    expect(usableDate('1799-06-05')).toBeNull();
    expect(usableDate('2200-06-05')).toBeNull();
  });

  it('refuses every prefix of a year being typed', () => {
    // The range floor is 1800, so no prefix of a four-digit year can be in
    // range. That is what makes half-typed and finished years distinguishable.
    for (const value of ['0002-06-09', '0020-06-09', '0201-06-09']) {
      expect(usableDate(value), value).toBeNull();
    }
    expect(usableDate('2012-06-09')).toEqual({ fullYear: 2012, month: 6, day: 9 });
  });

  it('refuses what is not a date at all', () => {
    for (const value of ['', 'nonsense', '1987-02-31', '1900-02-29']) {
      expect(usableDate(value), value).toBeNull();
    }
  });

  it('only ever returns a date the walk can take', () => {
    for (const value of ['', '1799-01-01', '9999-12-31', '2000-02-29', 'x', '2012-06-09']) {
      const date = usableDate(value);
      if (date !== null) expect(isWalkableDate(date), value).toBe(true);
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
