import { describe, expect, it } from 'vitest';
import type { ItemState } from '@/domain/types';
import { createItem } from '@/domain/scheduler';
import { MONTH_DOOMSDAYS } from '@/domain/weekday';
import { defaultCenturyItems, defaultMonthItems } from '@/storage/defaults';
import {
  allTableEntries,
  entryAccepted,
  entryAccepts,
  entryAlternatesNote,
  entryAnswer,
  entryAnswerNote,
  entryId,
  entryLabel,
  entryPrompts,
  nextTableDueAt,
  tableQueue,
} from './tableDrill';

const NOW = 1_700_000_000_000;

function scheduled(key: number, dueAt: number): ItemState {
  return { ...createItem(key), introduced: true, introducedAt: dueAt, dueAt, interval: 4, repetitions: 2 };
}

describe('entries', () => {
  it('names a month and a century the way the spec writes them', () => {
    expect(entryLabel('month', 3)).toBe('March');
    expect(entryLabel('month', 12)).toBe('December');
    expect(entryLabel('century', 19)).toBe('1900s');
    expect(entryId('month', 3)).toBe('month:3');
    expect(entryId('century', 19)).toBe('century:19');
  });

  it('answers a month with its non-leap doomsday', () => {
    for (let month = 1; month <= 12; month += 1) {
      expect(entryAnswer('month', month)).toBe(MONTH_DOOMSDAYS[month - 1]);
    }
  });

  it('answers a century with its anchor', () => {
    expect(entryAnswer('century', 18)).toBe(5);
    expect(entryAnswer('century', 19)).toBe(3);
    expect(entryAnswer('century', 20)).toBe(2);
    expect(entryAnswer('century', 21)).toBe(0);
  });

  it('states which year kind it just asked about', () => {
    expect(entryAnswerNote('month', 1, false)).toBe('January 3 is the doomsday in a common year.');
    expect(entryAnswerNote('month', 1, true)).toBe('January 4 is the doomsday in a leap year.');
    expect(entryAnswerNote('month', 2, false)).toBe('February 28 is the doomsday in a common year.');
    expect(entryAnswerNote('month', 2, true)).toBe('February 29 is the doomsday in a leap year.');
    expect(entryAnswerNote('month', 3)).toBe("March 14 falls on the year's doomsday.");
    expect(entryAnswerNote('century', 19)).toBe('1900s start on a Wednesday.');
  });

  it('names the other dates that fall on the same doomsday', () => {
    expect(entryAlternatesNote('month', 2, false)).toBe(
      'The 7th, 14th and 21st fall on it too: a week apart is the same weekday.',
    );
    expect(entryAlternatesNote('month', 1, false)).toBe(
      'The 10th, 17th, 24th and 31st fall on it too: a week apart is the same weekday.',
    );
    expect(entryAlternatesNote('century', 19)).toBeNull();
  });
});

describe('what an answer accepts', () => {
  /**
   * The bug this closes: February 7 was marked wrong. It is not wrong — it is
   * three weeks before the 28th, so it is the same weekday, and it anchors the
   * day step exactly as well. The table teaches one date per month; it does not
   * get to call the other three false.
   */
  it('takes any date in the month that lands on the doomsday', () => {
    for (const day of [7, 14, 21, 28]) {
      expect(entryAccepts('month', 2, false, day)).toBe(true);
    }
    for (const day of [1, 8, 15, 22, 29]) {
      expect(entryAccepts('month', 2, true, day)).toBe(true);
    }
    expect(entryAccepted('month', 2, false)).toEqual([7, 14, 21, 28]);
  });

  it('still refuses a date that lands anywhere else', () => {
    for (const day of [1, 2, 6, 8, 13, 27]) {
      expect(entryAccepts('month', 2, false, day)).toBe(false);
    }
    // The leap doomsday is not a common-year answer, and the other way round.
    expect(entryAccepts('month', 2, false, 29)).toBe(false);
    expect(entryAccepts('month', 2, true, 28)).toBe(false);
    expect(entryAccepts('month', 1, false, 4)).toBe(false);
    expect(entryAccepts('month', 1, true, 3)).toBe(false);
  });

  it('takes exactly one code for a century anchor', () => {
    expect(entryAccepts('century', 19, false, 3)).toBe(true);
    for (const code of [0, 1, 2, 4, 5, 6]) {
      expect(entryAccepts('century', 19, false, code)).toBe(false);
    }
    expect(entryAccepted('century', 19)).toEqual([3]);
  });
});

describe('entryPrompts', () => {
  it('asks January and February twice, common year first', () => {
    for (const month of [1, 2]) {
      expect(entryPrompts('month', month)).toEqual([
        { kind: 'month', key: month, leapYear: false },
        { kind: 'month', key: month, leapYear: true },
      ]);
    }
  });

  it('asks the ten fixed months and the four centuries once', () => {
    for (let month = 3; month <= 12; month += 1) {
      expect(entryPrompts('month', month)).toEqual([{ kind: 'month', key: month, leapYear: false }]);
    }
    expect(entryPrompts('century', 20)).toEqual([{ kind: 'century', key: 20, leapYear: false }]);
  });
});

describe('allTableEntries', () => {
  it('is sixteen, months first', () => {
    const entries = allTableEntries(defaultMonthItems(), defaultCenturyItems());
    expect(entries).toHaveLength(16);
    expect(entries.slice(0, 12).every((e) => e.kind === 'month')).toBe(true);
    expect(entries.slice(12).map((e) => e.key)).toEqual([18, 19, 20, 21]);
    expect(entries[0]).toMatchObject({ kind: 'month', key: 1 });
  });
});

describe('tableQueue', () => {
  it('offers every item on a fresh document, in reading order', () => {
    const queue = tableQueue(defaultMonthItems(), defaultCenturyItems(), NOW);
    expect(queue).toHaveLength(16);
    expect(queue[0]).toMatchObject({ kind: 'month', key: 1 });
    expect(queue[15]).toMatchObject({ kind: 'century', key: 21 });
  });

  it('puts due items before never-seen ones, oldest due first', () => {
    const months = defaultMonthItems();
    months['5'] = scheduled(5, NOW - 1000);
    months['9'] = scheduled(9, NOW - 90_000);
    const centuries = defaultCenturyItems();
    centuries['20'] = scheduled(20, NOW - 50_000);

    const queue = tableQueue(months, centuries, NOW);
    expect(queue.slice(0, 3).map((e) => entryId(e.kind, e.key))).toEqual([
      'month:9',
      'century:20',
      'month:5',
    ]);
    expect(queue).toHaveLength(16);
  });

  it('leaves out items that are scheduled into the future', () => {
    const months = defaultMonthItems();
    for (let month = 1; month <= 12; month += 1) months[String(month)] = scheduled(month, NOW + 86_400_000);
    const centuries = defaultCenturyItems();
    for (const century of [18, 19, 20, 21]) centuries[String(century)] = scheduled(century, NOW + 86_400_000);

    expect(tableQueue(months, centuries, NOW)).toEqual([]);
  });
});

describe('nextTableDueAt', () => {
  it('is null when nothing is scheduled ahead', () => {
    expect(nextTableDueAt(defaultMonthItems(), defaultCenturyItems(), NOW)).toBeNull();
  });

  it('reports the soonest future due time', () => {
    const months = defaultMonthItems();
    months['4'] = scheduled(4, NOW + 5000);
    months['6'] = scheduled(6, NOW + 900);
    months['8'] = scheduled(8, NOW - 900);
    expect(nextTableDueAt(months, defaultCenturyItems(), NOW)).toBe(NOW + 900);
  });
});
