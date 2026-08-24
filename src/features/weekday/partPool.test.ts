import { describe, expect, it } from 'vitest';
import { monthLength } from '@/domain/weekday';
import { rangeById } from './datePool';
import {
  RECENT_WINDOW,
  nextPartPrompt,
  partPromptKey,
  partPromptLabel,
  randomDatePart,
  randomYearIn,
  rememberPrompt,
} from './partPool';

/** Deterministic and spread over [0,1). Enough to walk every branch. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

/** Exactly these values, in order, then repeating. */
function fixed(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

const NOW = Date.UTC(2026, 7, 24);

describe('randomDatePart', () => {
  it('only ever produces a day the month actually has', () => {
    const rng = lcg(7);
    for (let draw = 0; draw < 5000; draw += 1) {
      const question = randomDatePart(rng);
      expect(question.month).toBeGreaterThanOrEqual(1);
      expect(question.month).toBeLessThanOrEqual(12);
      expect(question.day).toBeGreaterThanOrEqual(1);
      expect(question.day).toBeLessThanOrEqual(monthLength(question.month, question.leapYear));
    }
  });

  /**
   * The leap flag is a question about the year, and it only changes an answer
   * in January and February. Drawing it anywhere else would make the prompt
   * carry a fact that does not matter, and `datePartPrompt` would then have to
   * decide whether to print it.
   */
  it('draws the leap flag for January and February and for nothing else', () => {
    const rng = lcg(11);
    const leapMonths = new Set<number>();
    for (let draw = 0; draw < 5000; draw += 1) {
      const question = randomDatePart(rng);
      if (question.leapYear) leapMonths.add(question.month);
    }
    expect([...leapMonths].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('reaches every month, so no month doomsday goes undrilled', () => {
    const rng = lcg(3);
    const months = new Set<number>();
    for (let draw = 0; draw < 2000; draw += 1) months.add(randomDatePart(rng).month);
    expect(months.size).toBe(12);
  });

  it('reaches February 29, which only exists in one kind of year', () => {
    const rng = lcg(5);
    let seen = false;
    for (let draw = 0; draw < 20_000 && !seen; draw += 1) {
      const question = randomDatePart(rng);
      seen = question.month === 2 && question.day === 29;
    }
    expect(seen).toBe(true);
  });
});

describe('randomYearIn', () => {
  it('stays inside the range, both ends included', () => {
    const range = rangeById('century', NOW);
    const rng = lcg(13);
    const years = new Set<number>();
    for (let draw = 0; draw < 4000; draw += 1) years.add(randomYearIn(range, rng).fullYear);
    expect(Math.min(...years)).toBe(2000);
    expect(Math.max(...years)).toBe(2099);
  });

  it('reaches the first and last year of the range', () => {
    const range = rangeById('century', NOW);
    expect(randomYearIn(range, fixed([0])).fullYear).toBe(2000);
    // Clamped rather than allowed off the end: an rng that returns exactly 1
    // would otherwise index one past the last year.
    expect(randomYearIn(range, fixed([0.999_999])).fullYear).toBe(2099);
    expect(randomYearIn(range, fixed([1])).fullYear).toBe(2099);
  });

  /**
   * "Living memory" ends today, so its last year is only part of a year. It is
   * still drawn: a doomsday belongs to the whole year, and 2026's exists in
   * January whatever today's date is.
   */
  it('includes the part-year at the end of living memory', () => {
    const range = rangeById('living', NOW);
    expect(randomYearIn(range, fixed([1])).fullYear).toBe(2026);
  });
});

describe('nextPartPrompt', () => {
  it('avoids a prompt just asked', () => {
    const range = rangeById('century', NOW);
    const rng = lcg(17);
    const recent = new Set<string>();
    for (let draw = 0; draw < 200; draw += 1) {
      const prompt = nextPartPrompt('year', range, recent, rng);
      expect(recent.has(partPromptKey(prompt))).toBe(false);
      recent.add(partPromptKey(prompt));
      // The window is what the session keeps; this test keeps everything, which
      // is the harder case and still has 100 years to draw from.
      if (recent.size > 60) recent.clear();
    }
  });

  /**
   * The pool is small enough to exhaust, unlike the full-date trainer's. The
   * draw is bounded and falls back to whatever came up last, so it terminates
   * rather than looping when there is nothing fresh left.
   */
  it('still returns a prompt when everything is recent', () => {
    const range = rangeById('century', NOW);
    const everything = new Set<string>();
    for (let year = 2000; year <= 2099; year += 1) everything.add(`y:${year}`);
    const prompt = nextPartPrompt('year', range, everything, lcg(19));
    expect(prompt.part).toBe('year');
    expect(everything.has(partPromptKey(prompt))).toBe(true);
  });

  it('draws the half it was asked for', () => {
    const range = rangeById('century', NOW);
    expect(nextPartPrompt('year', range, new Set(), lcg(2)).part).toBe('year');
    expect(nextPartPrompt('date', range, new Set(), lcg(2)).part).toBe('date');
  });
});

describe('keys and labels', () => {
  it('tells the two kinds of year apart in January and February', () => {
    const common = { part: 'date', question: { month: 2, day: 6, leapYear: false } } as const;
    const leap = { part: 'date', question: { month: 2, day: 6, leapYear: true } } as const;
    expect(partPromptKey(common)).not.toBe(partPromptKey(leap));
    expect(partPromptLabel(common)).toBe('February 6');
    expect(partPromptLabel(leap)).toBe('February 6, leap year');
  });

  it('does not mention a year kind where it changes nothing', () => {
    expect(partPromptLabel({ part: 'date', question: { month: 9, day: 6, leapYear: true } })).toBe(
      'September 6',
    );
  });

  it('labels a year prompt with the year', () => {
    expect(partPromptLabel({ part: 'year', question: { fullYear: 1973 } })).toBe('1973');
  });
});

describe('rememberPrompt', () => {
  it('keeps the last window and drops the oldest', () => {
    let recent: string[] = [];
    for (let i = 0; i < RECENT_WINDOW + 5; i += 1) recent = rememberPrompt(recent, `k${i}`);
    expect(recent).toHaveLength(RECENT_WINDOW);
    expect(recent[0]).toBe('k5');
    expect(recent[recent.length - 1]).toBe(`k${RECENT_WINDOW + 4}`);
  });
});
