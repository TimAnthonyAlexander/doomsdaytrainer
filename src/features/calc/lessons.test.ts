import { describe, expect, it } from 'vitest';
import { CYCLE, leapDays, rawSum, reduce28, sevenStep } from '@/domain/calc';
import { codeFor } from '@/domain/yearCodes';
import { methodLessons, shortcutLesson, type DrillItem, type Lesson } from './lessons';

const lessons = methodLessons();
const byId = (id: string): Lesson => {
  const found = lessons.find((lesson) => lesson.id === id);
  if (!found) throw new Error(`No lesson ${id}`);
  return found;
};

/** The number a drill item is about, read back out of its labelled givens. */
function subject(item: DrillItem): number {
  return Number(item.givens[0].value);
}

describe('methodLessons', () => {
  it('splits the three-step formula into five single-idea lessons, in order', () => {
    expect(lessons.map((lesson) => lesson.id)).toEqual([
      'divide',
      'drop',
      'sum',
      'sevens',
      'remainder',
    ]);
  });

  it('gives every lesson a reason and at least one worked example before any drill', () => {
    for (const lesson of lessons) {
      expect(lesson.why.length).toBeGreaterThan(0);
      expect(lesson.worked.length).toBeGreaterThan(0);
      expect(lesson.items.length).toBeGreaterThan(0);
      for (const example of lesson.worked) {
        expect(example.lines.length).toBeGreaterThan(1);
        expect(example.close).not.toBe('');
      }
    }
  });

  it('labels every number it puts on screen', () => {
    const lines = lessons.flatMap((lesson) => [
      ...lesson.worked.flatMap((example) => example.lines),
      ...lesson.items.flatMap((item) => [...item.givens, ...item.working]),
    ]);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.label.trim()).not.toBe('');
      expect(line.value.trim()).not.toBe('');
    }
  });

  it('drills the plain division on years that divide by four exactly', () => {
    const lesson = byId('divide');
    for (const item of lesson.items) {
      const year = subject(item);
      expect(year % 4).toBe(0);
      expect(item.answer).toBe(leapDays(year));
    }
  });

  it('drills the discarding on years that always leave something over', () => {
    const lesson = byId('drop');
    for (const item of lesson.items) {
      const year = subject(item);
      expect(year % 4).not.toBe(0);
      expect(item.answer).toBe(leapDays(year));
      // The leftover is named on the working, or the lesson has not taught it.
      expect(item.working.some((line) => line.label.includes('thrown away'))).toBe(true);
    }
  });

  it('hands the leap-day count to the adding lesson rather than hiding a second step in it', () => {
    for (const item of byId('sum').items) {
      const year = subject(item);
      expect(item.givens).toHaveLength(2);
      expect(Number(item.givens[1].value)).toBe(leapDays(year));
      expect(item.answer).toBe(rawSum(year));
    }
  });

  it('asks for the multiple of seven, then for the leftover, as two lessons', () => {
    for (const item of byId('sevens').items) {
      expect(item.answer).toBe(sevenStep(rawSum(subject(item))).multiple);
    }
    for (const item of byId('remainder').items) {
      expect(item.answer).toBe(sevenStep(rawSum(subject(item))).remainder);
    }
  });

  it('keeps the year on screen for the two lessons that work on a sum', () => {
    for (const id of ['sevens', 'remainder']) {
      for (const item of byId(id).items) {
        // A sum that appeared from nowhere is an unlabelled number. The year it
        // came from stays on screen, and the answer is that year's real code.
        expect(item.givens[0].label).toBe('Year');
        expect(item.givens[1]).toEqual({
          label: 'Year plus leap days',
          value: String(rawSum(subject(item))),
        });
      }
    }
    for (const item of byId('remainder').items) {
      expect(item.answer).toBe(codeFor(subject(item)));
    }
  });

  it('sends only the 0-6 answers to the seven-button pad', () => {
    for (const lesson of lessons) {
      for (const item of lesson.items) {
        expect(item.pad).toBe(item.answer >= 0 && item.answer <= 6 && lesson.id === 'remainder');
      }
    }
  });

  it('sets the digit cap from the range and never from the answer', () => {
    for (const lesson of lessons) {
      for (const item of lesson.items) {
        expect(item.max).toBeGreaterThanOrEqual(item.answer);
      }
      // Every item of a lesson shares one cap, so the field width cannot leak
      // how long this particular answer is.
      const caps = new Set(lesson.items.map((item) => item.max));
      expect(caps.size).toBe(1);
    }
  });

  it('covers a remainder of zero, so the code 0 is not a surprise', () => {
    expect(byId('remainder').items.some((item) => item.answer === 0)).toBe(true);
  });
});

describe('shortcutLesson', () => {
  const lesson = shortcutLesson();

  it('shows real pairs that are 28 apart and share a code', () => {
    expect(lesson.pairs.length).toBeGreaterThan(1);
    for (const pair of lesson.pairs) {
      expect(pair.high - pair.low).toBe(CYCLE);
      expect(codeFor(pair.high)).toBe(pair.code);
      expect(codeFor(pair.low)).toBe(pair.code);
    }
  });

  it('names the two pairs the brief names', () => {
    const shown = lesson.pairs.map((pair) => [pair.high, pair.low, pair.code]);
    expect(shown).toContainEqual([44, 16, 6]);
    expect(shown).toContainEqual([99, 71, 4]);
  });

  it('gives the reason as labelled numbers, not as a claim', () => {
    const values = lesson.reason.map((line) => line.value);
    expect(values).toContain(String(CYCLE));
    expect(values).toContain(String(leapDays(CYCLE)));
    // 28 + 7 = 35, and 35 is five whole weeks with nothing left over.
    expect(values.some((value) => value.includes('35'))).toBe(true);
    expect(lesson.reason[lesson.reason.length - 1]).toEqual({ label: 'Left over', value: '0' });
  });

  it('drills the reduction on its own', () => {
    for (const item of lesson.items) {
      const year = Number(item.givens[0].value);
      expect(item.answer).toBe(reduce28(year));
      expect(item.pad).toBe(false);
    }
    expect(lesson.items.map((item) => item.answer)).toContain(17);
  });
});
