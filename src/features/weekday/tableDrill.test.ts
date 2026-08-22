import { describe, expect, it } from 'vitest';
import type { ItemState } from '@/domain/types';
import { createItem } from '@/domain/scheduler';
import { MONTH_DOOMSDAYS } from '@/domain/weekday';
import { defaultCenturyItems, defaultMonthItems } from '@/storage/defaults';
import {
  allTableEntries,
  entryAnswer,
  entryAnswerNote,
  entryId,
  entryLabel,
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

  it('states the leap shift for the two months that have one', () => {
    expect(entryAnswerNote('month', 1)).toBe('January 3, and the 4th in a leap year.');
    expect(entryAnswerNote('month', 2)).toBe('February 28, and the 29th in a leap year.');
    expect(entryAnswerNote('month', 3)).toBe("March 14 falls on the year's doomsday.");
    expect(entryAnswerNote('century', 19)).toBe('1900s start on a Wednesday.');
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
