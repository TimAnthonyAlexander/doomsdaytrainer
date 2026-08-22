import { describe, expect, it } from 'vitest';
import type { SessionDay } from '@/domain/types';
import {
  REMINDER_PROMPT_DAY_THRESHOLD,
  activeDayCount,
  shouldOfferReminderPrompt,
  type PromptDecisionInput,
} from './promptTiming';

function log(entries: [string, number, number][]): Record<string, SessionDay> {
  const out: Record<string, SessionDay> = {};
  for (const [date, reviewsCompleted, newItemsIntroduced] of entries) {
    out[date] = { date, reviewsCompleted, newItemsIntroduced };
  }
  return out;
}

const THREE_ACTIVE_DAYS = log([
  ['2026-05-10', 18, 0],
  ['2026-05-11', 22, 10],
  ['2026-05-12', 9, 0],
]);

function input(patch: Partial<PromptDecisionInput>): PromptDecisionInput {
  return {
    days: THREE_ACTIVE_DAYS,
    alreadyAsked: false,
    reminderEnabled: false,
    supported: true,
    permission: 'default',
    ...patch,
  };
}

describe('activeDayCount', () => {
  it('counts distinct days that carry activity', () => {
    expect(activeDayCount(THREE_ACTIVE_DAYS)).toBe(3);
    expect(activeDayCount({})).toBe(0);
  });

  it('ignores days logged with nothing done', () => {
    expect(
      activeDayCount(
        log([
          ['2026-05-10', 0, 0],
          ['2026-05-11', 0, 0],
          ['2026-05-12', 1, 0],
        ]),
      ),
    ).toBe(1);
  });

  it('counts a day of new items with no reviews', () => {
    expect(activeDayCount(log([['2026-05-10', 0, 20]]))).toBe(1);
  });

  it('is distinct days, not elapsed time', () => {
    // Three months apart, still three days of use.
    const sparse = log([
      ['2026-01-04', 5, 0],
      ['2026-04-19', 5, 0],
      ['2026-08-30', 5, 0],
    ]);
    expect(activeDayCount(sparse)).toBe(REMINDER_PROMPT_DAY_THRESHOLD);

    // One long day is still one day, however much was done in it.
    expect(activeDayCount(log([['2026-01-04', 400, 40]]))).toBe(1);
  });
});

describe('shouldOfferReminderPrompt', () => {
  it('offers once three days of use exist', () => {
    expect(shouldOfferReminderPrompt(input({}))).toBe(true);
  });

  it('stays quiet on the first two days', () => {
    expect(
      shouldOfferReminderPrompt(
        input({
          days: log([
            ['2026-05-10', 18, 0],
            ['2026-05-11', 22, 0],
          ]),
        }),
      ),
    ).toBe(false);
    expect(shouldOfferReminderPrompt(input({ days: {} }))).toBe(false);
  });

  it('never asks twice', () => {
    expect(shouldOfferReminderPrompt(input({ alreadyAsked: true }))).toBe(false);
  });

  it('does not ask when the reminder is already on', () => {
    expect(shouldOfferReminderPrompt(input({ reminderEnabled: true }))).toBe(false);
  });

  it('does not ask when the browser cannot show notifications', () => {
    expect(shouldOfferReminderPrompt(input({ supported: false }))).toBe(false);
  });

  it('does not ask again once the browser has an answer', () => {
    expect(shouldOfferReminderPrompt(input({ permission: 'granted' }))).toBe(false);
    expect(shouldOfferReminderPrompt(input({ permission: 'denied' }))).toBe(false);
  });
});
