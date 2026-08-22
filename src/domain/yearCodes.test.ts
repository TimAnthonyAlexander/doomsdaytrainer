import { describe, expect, it } from 'vitest';
import {
  WEEKDAYS_MONDAY,
  WEEKDAYS_SUNDAY,
  YEAR_CODES,
  allYears,
  anchorFor,
  blockOf,
  codeFor,
  decadeOf,
  deriveCode,
  formatYear,
  weekdayName,
} from './yearCodes';
import type { Code } from './types';

describe('YEAR_CODES table', () => {
  it('has exactly 100 entries', () => {
    expect(YEAR_CODES).toHaveLength(100);
  });

  it('holds only valid codes', () => {
    for (const code of YEAR_CODES) {
      expect(Number.isInteger(code)).toBe(true);
      expect(code).toBeGreaterThanOrEqual(0);
      expect(code).toBeLessThanOrEqual(6);
    }
  });

  // The shipped table is the contract; this proves the transcription is right.
  it.each(allYears())('entry %i equals deriveCode', (yy) => {
    expect(YEAR_CODES[yy]).toBe(deriveCode(yy));
  });

  it('matches the spot values quoted in the spec', () => {
    expect(codeFor(0)).toBe(0);
    expect(codeFor(4)).toBe(5);
    expect(codeFor(44)).toBe(6);
    expect(codeFor(72)).toBe(6);
    expect(codeFor(73)).toBe(0);
    expect(codeFor(99)).toBe(4);
  });
});

describe('deriveCode', () => {
  it('is the (yy + floor(yy/4)) mod 7 rule', () => {
    expect(deriveCode(73)).toBe((73 + 18) % 7);
    expect(deriveCode(0)).toBe(0);
    expect(deriveCode(96)).toBe(1);
  });
});

describe('codeFor validation', () => {
  it.each([-1, 100, 3.5, Number.NaN, Number.POSITIVE_INFINITY])('throws for %s', (bad) => {
    expect(() => codeFor(bad)).toThrow(RangeError);
    expect(() => deriveCode(bad)).toThrow(RangeError);
    expect(() => decadeOf(bad)).toThrow(RangeError);
    expect(() => formatYear(bad)).toThrow(RangeError);
    expect(() => blockOf(bad)).toThrow(RangeError);
  });
});

describe('decadeOf', () => {
  it('maps a year to its decade', () => {
    expect(decadeOf(0)).toBe(0);
    expect(decadeOf(9)).toBe(0);
    expect(decadeOf(10)).toBe(1);
    expect(decadeOf(73)).toBe(7);
    expect(decadeOf(99)).toBe(9);
  });
});

describe('allYears', () => {
  it('is 0..99 in order and a fresh array each call', () => {
    const years = allYears();
    expect(years).toHaveLength(100);
    expect(years[0]).toBe(0);
    expect(years[99]).toBe(99);
    expect(years).not.toBe(allYears());
  });
});

describe('formatYear', () => {
  it('zero pads to two digits', () => {
    expect(formatYear(0)).toBe('00');
    expect(formatYear(7)).toBe('07');
    expect(formatYear(9)).toBe('09');
    expect(formatYear(10)).toBe('10');
    expect(formatYear(99)).toBe('99');
  });
});

describe('blockOf', () => {
  it('groups years into runs of four starting at a multiple of four', () => {
    expect(blockOf(73)).toEqual({ start: 72, end: 75, startCode: 6 });
    expect(blockOf(0)).toEqual({ start: 0, end: 3, startCode: 0 });
    expect(blockOf(3)).toEqual({ start: 0, end: 3, startCode: 0 });
    expect(blockOf(99)).toEqual({ start: 96, end: 99, startCode: 1 });
  });

  it('is stable for every member of a block', () => {
    for (let yy = 0; yy < 100; yy++) {
      const block = blockOf(yy);
      expect(yy).toBeGreaterThanOrEqual(block.start);
      expect(yy).toBeLessThanOrEqual(block.end);
      expect(block.start % 4).toBe(0);
      expect(blockOf(block.start)).toEqual(block);
      expect(block.startCode).toBe(codeFor(block.start));
    }
  });

  // The claim that justifies this grouping: +1 inside a block, +2 across one.
  it('codes step by 1 inside a block and jump by 2 across a boundary', () => {
    for (let yy = 0; yy < 99; yy++) {
      const delta = (codeFor(yy + 1) - codeFor(yy) + 7) % 7;
      const sameBlock = blockOf(yy).start === blockOf(yy + 1).start;
      expect(delta).toBe(sameBlock ? 1 : 2);
    }
  });

  it('derives every member from the block start', () => {
    for (let yy = 0; yy < 100; yy++) {
      const { start, startCode } = blockOf(yy);
      expect(codeFor(yy)).toBe((startCode + (yy - start)) % 7);
    }
  });
});

describe('anchorFor', () => {
  it('returns the nearest lower known year', () => {
    const known = (yy: number) => yy === 60 || yy === 72;
    expect(anchorFor(73, known)).toBe(72);
    expect(anchorFor(72, known)).toBe(60);
    expect(anchorFor(61, known)).toBe(60);
  });

  it('is null when nothing below is known', () => {
    expect(anchorFor(50, () => false)).toBeNull();
    expect(anchorFor(0, () => true)).toBeNull();
  });

  it('never returns the year itself or a higher one', () => {
    const anchor = anchorFor(40, (yy) => yy >= 40);
    expect(anchor).toBeNull();
  });

  it('picks the immediate predecessor when everything is known', () => {
    expect(anchorFor(99, () => true)).toBe(98);
    expect(anchorFor(1, () => true)).toBe(0);
  });
});

describe('weekday names', () => {
  it('lists seven days starting at the convention day', () => {
    expect(WEEKDAYS_SUNDAY).toHaveLength(7);
    expect(WEEKDAYS_MONDAY).toHaveLength(7);
    expect(WEEKDAYS_SUNDAY[0]).toBe('Sunday');
    expect(WEEKDAYS_MONDAY[0]).toBe('Monday');
    expect(WEEKDAYS_SUNDAY[6]).toBe('Saturday');
    expect(WEEKDAYS_MONDAY[6]).toBe('Sunday');
  });

  it('resolves a code under both conventions', () => {
    expect(weekdayName(0, 'sunday')).toBe('Sunday');
    expect(weekdayName(0, 'monday')).toBe('Monday');
    expect(weekdayName(3, 'sunday')).toBe('Wednesday');
    expect(weekdayName(3, 'monday')).toBe('Thursday');
  });

  it('rejects codes outside 0..6', () => {
    expect(() => weekdayName(7 as unknown as Code, 'sunday')).toThrow(RangeError);
    expect(() => weekdayName(-1 as unknown as Code, 'monday')).toThrow(RangeError);
  });

  it('does not change any year code', () => {
    const before = [...YEAR_CODES];
    weekdayName(codeFor(73), 'monday');
    expect([...YEAR_CODES]).toEqual(before);
  });
});
