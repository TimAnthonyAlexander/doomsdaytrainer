import { describe, expect, it } from 'vitest';
import type { SessionDay } from '@/domain/types';
import { dayKey } from '@/domain/time';
import {
  EVENING_REMINDER_TIME,
  FIRE_WINDOW_MS,
  MISS_WINDOW_MS,
  eveningReminderTime,
  formatClock,
  minutesOfDay,
  missedReminder,
  msUntilNextReminder,
  nextReminderAt,
  parseTimeOfDay,
  pendingReminder,
  previousReminderAt,
  reminderBody,
  reminderToFire,
  sessionCompletedOn,
  type ReminderContext,
} from './reminderSchedule';

/** Local midnights of every day in `year`. */
function localMidnights(year: number): number[] {
  const out: number[] = [];
  const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) {
    out.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * Local midnights of days in the current runtime zone that are not 24 hours
 * long. Empty in UTC, which is what CI usually runs in, so the DST tests below
 * pass vacuously there rather than asserting something false.
 */
function dstDays(year: number): number[] {
  const midnights = localMidnights(year);
  const out: number[] = [];
  for (let i = 1; i < midnights.length; i++) {
    if (midnights[i] - midnights[i - 1] !== 86_400_000) out.push(midnights[i - 1]);
  }
  return out;
}

/** Local noon on the calendar day containing `ts`. */
function noonOn(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0).getTime();
}

function days(entries: { ts: number; reviewsCompleted: number }[]): Record<string, SessionDay> {
  const out: Record<string, SessionDay> = {};
  for (const entry of entries) {
    const date = dayKey(entry.ts);
    out[date] = { date, reviewsCompleted: entry.reviewsCompleted, newItemsIntroduced: 0 };
  }
  return out;
}

function context(patch: Partial<ReminderContext>): ReminderContext {
  return {
    reminderEnabled: true,
    reminderTime: '19:00',
    eveningReminderEnabled: false,
    lastNotifiedAt: 0,
    dueCount: 12,
    days: {},
    now: new Date(2026, 4, 12, 19, 1).getTime(),
    ...patch,
  };
}

describe('parseTimeOfDay', () => {
  it('reads a 24h HH:MM string', () => {
    expect(parseTimeOfDay('19:00')).toEqual({ hours: 19, minutes: 0 });
    expect(parseTimeOfDay('00:00')).toEqual({ hours: 0, minutes: 0 });
    expect(parseTimeOfDay('23:59')).toEqual({ hours: 23, minutes: 59 });
    expect(parseTimeOfDay('7:05')).toEqual({ hours: 7, minutes: 5 });
    expect(parseTimeOfDay(' 08:30 ')).toEqual({ hours: 8, minutes: 30 });
  });

  it('rejects anything that is not a real time of day', () => {
    for (const bad of ['', '19', '19:0', '24:00', '19:60', '-1:00', '7:5', 'noon', '19:00:00']) {
      expect(parseTimeOfDay(bad)).toBeNull();
    }
  });

  it('orders times by minutes of day', () => {
    expect(minutesOfDay({ hours: 19, minutes: 0 })).toBe(1140);
    expect(minutesOfDay({ hours: 0, minutes: 0 })).toBe(0);
  });
});

describe('nextReminderAt', () => {
  it('returns today when the time is still ahead', () => {
    const from = new Date(2026, 4, 12, 8, 0).getTime();
    const next = nextReminderAt('19:00', from);
    expect(next).toBe(new Date(2026, 4, 12, 19, 0).getTime());
  });

  it('rolls to tomorrow when the time has passed', () => {
    const from = new Date(2026, 4, 12, 19, 30).getTime();
    expect(nextReminderAt('19:00', from)).toBe(new Date(2026, 4, 13, 19, 0).getTime());
  });

  it('treats the exact instant as already gone', () => {
    const from = new Date(2026, 4, 12, 19, 0, 0, 0).getTime();
    expect(nextReminderAt('19:00', from)).toBe(new Date(2026, 4, 13, 19, 0).getTime());
  });

  it('crosses the local day boundary', () => {
    const from = new Date(2026, 4, 12, 23, 59, 30).getTime();
    expect(nextReminderAt('00:30', from)).toBe(new Date(2026, 4, 13, 0, 30).getTime());

    const justAfterMidnight = new Date(2026, 4, 13, 0, 0, 1).getTime();
    expect(nextReminderAt('00:30', justAfterMidnight)).toBe(new Date(2026, 4, 13, 0, 30).getTime());
  });

  it('crosses a month and a year boundary', () => {
    expect(nextReminderAt('06:00', new Date(2026, 0, 31, 22, 0).getTime())).toBe(
      new Date(2026, 1, 1, 6, 0).getTime(),
    );
    expect(nextReminderAt('06:00', new Date(2026, 11, 31, 22, 0).getTime())).toBe(
      new Date(2027, 0, 1, 6, 0).getTime(),
    );
  });

  it('is always strictly in the future, for every minute of a day', () => {
    const base = new Date(2026, 2, 15, 0, 0).getTime();
    for (let minute = 0; minute < 1440; minute += 7) {
      const from = base + minute * 60_000;
      const next = nextReminderAt('19:00', from);
      expect(next).not.toBeNull();
      expect(next as number).toBeGreaterThan(from);
    }
  });

  it('keeps the wall-clock hour across a DST change', () => {
    for (const dstDay of dstDays(2026)) {
      // Noon the day before, so the next 12:00 spans the shift.
      const from = noonOn(dstDay - 12 * 3_600_000);
      const next = nextReminderAt('12:00', from);
      expect(next).not.toBeNull();

      const landed = new Date(next as number);
      expect(landed.getHours()).toBe(12);
      expect(landed.getMinutes()).toBe(0);
      expect(dayKey(next as number)).toBe(dayKey(dstDay));
      // The wall clock is preserved, so the elapsed gap is 23h or 25h, not 24h.
      expect((next as number) - from).not.toBe(86_400_000);
      expect(Math.abs((next as number) - from - 86_400_000)).toBe(3_600_000);
    }
  });

  it('resolves a reminder inside a skipped DST hour to a real instant', () => {
    for (const dstDay of dstDays(2026)) {
      for (const time of ['00:30', '01:30', '02:30', '03:30']) {
        const from = dstDay - 60_000;
        const next = nextReminderAt(time, from);
        expect(next).not.toBeNull();
        expect(next as number).toBeGreaterThan(from);
        expect(Number.isFinite(next as number)).toBe(true);
        // Whatever the platform resolves a nonexistent hour to, it stays on the
        // same calendar day rather than sliding into the next one.
        expect(dayKey(next as number)).toBe(dayKey(dstDay));
      }
    }
  });

  it('returns null for a malformed time', () => {
    expect(nextReminderAt('half past seven', Date.now())).toBeNull();
    expect(msUntilNextReminder('25:00', Date.now())).toBeNull();
  });

  it('reports the gap until the next occurrence', () => {
    const from = new Date(2026, 4, 12, 18, 0).getTime();
    expect(msUntilNextReminder('19:00', from)).toBe(3_600_000);
  });
});

describe('previousReminderAt', () => {
  it('returns today when the time has passed', () => {
    const from = new Date(2026, 4, 12, 19, 30).getTime();
    expect(previousReminderAt('19:00', from)).toBe(new Date(2026, 4, 12, 19, 0).getTime());
  });

  it('includes the exact instant', () => {
    const from = new Date(2026, 4, 12, 19, 0, 0, 0).getTime();
    expect(previousReminderAt('19:00', from)).toBe(from);
  });

  it('falls back to yesterday before the time', () => {
    const from = new Date(2026, 4, 12, 8, 0).getTime();
    expect(previousReminderAt('19:00', from)).toBe(new Date(2026, 4, 11, 19, 0).getTime());
  });

  it('crosses a year boundary backwards', () => {
    expect(previousReminderAt('22:00', new Date(2027, 0, 1, 6, 0).getTime())).toBe(
      new Date(2026, 11, 31, 22, 0).getTime(),
    );
  });

  it('is never in the future, for every minute of a DST day', () => {
    for (const dstDay of dstDays(2026)) {
      for (let minute = 0; minute < 1440; minute += 11) {
        const from = dstDay + minute * 60_000;
        const previous = previousReminderAt('02:30', from);
        expect(previous).not.toBeNull();
        expect(previous as number).toBeLessThanOrEqual(from);
      }
    }
  });
});

describe('eveningReminderTime', () => {
  it('is the fixed evening slot when the daily one is earlier', () => {
    expect(eveningReminderTime('08:00')).toBe(EVENING_REMINDER_TIME);
    expect(eveningReminderTime('20:59')).toBe(EVENING_REMINDER_TIME);
  });

  it('is dropped when the daily reminder is already at or after it', () => {
    expect(eveningReminderTime('21:00')).toBeNull();
    expect(eveningReminderTime('22:30')).toBeNull();
    expect(eveningReminderTime('23:59')).toBeNull();
  });

  it('is dropped for a malformed daily time', () => {
    expect(eveningReminderTime('nope')).toBeNull();
  });
});

describe('sessionCompletedOn', () => {
  const ts = new Date(2026, 4, 12, 21, 0).getTime();

  it('is false with no entry for the day', () => {
    expect(sessionCompletedOn({}, ts)).toBe(false);
  });

  it('is false when the day exists but no review was completed', () => {
    expect(sessionCompletedOn(days([{ ts, reviewsCompleted: 0 }]), ts)).toBe(false);
  });

  it('is true after a single review', () => {
    expect(sessionCompletedOn(days([{ ts, reviewsCompleted: 1 }]), ts)).toBe(true);
  });

  it('reads the local day of the instant, not another day', () => {
    const yesterday = new Date(2026, 4, 11, 21, 0).getTime();
    const log = days([{ ts: yesterday, reviewsCompleted: 30 }]);
    expect(sessionCompletedOn(log, yesterday)).toBe(true);
    expect(sessionCompletedOn(log, ts)).toBe(false);
  });
});

describe('reminderBody', () => {
  it('states the count and nothing else', () => {
    expect(reminderBody(12)).toBe('12 codes due.');
    expect(reminderBody(1)).toBe('1 code due.');
    expect(reminderBody(0)).toBe('0 codes due.');
  });
});

describe('formatClock', () => {
  it('renders a zero-padded 24h local time', () => {
    expect(formatClock(new Date(2026, 4, 12, 19, 0).getTime())).toBe('19:00');
    expect(formatClock(new Date(2026, 4, 12, 7, 5).getTime())).toBe('07:05');
    expect(formatClock(new Date(2026, 4, 12, 0, 0).getTime())).toBe('00:00');
  });
});

describe('pendingReminder', () => {
  it('is null when reminders are off', () => {
    expect(pendingReminder(context({ reminderEnabled: false }))).toBeNull();
  });

  it('is null when nothing is due', () => {
    expect(pendingReminder(context({ dueCount: 0 }))).toBeNull();
  });

  it('is null once the slot has been handled', () => {
    const at = new Date(2026, 4, 12, 19, 0).getTime();
    expect(pendingReminder(context({ lastNotifiedAt: at }))).toBeNull();
  });

  it('reports the daily slot with the due count as the body', () => {
    const pending = pendingReminder(context({}));
    expect(pending).toEqual({
      slot: 'daily',
      at: new Date(2026, 4, 12, 19, 0).getTime(),
      dueCount: 12,
      body: '12 codes due.',
    });
  });

  it('reaches back to yesterday before today’s time', () => {
    const pending = pendingReminder(context({ now: new Date(2026, 4, 12, 8, 0).getTime() }));
    expect(pending?.at).toBe(new Date(2026, 4, 11, 19, 0).getTime());
  });
});

describe('the evening reminder', () => {
  const eveningAt = new Date(2026, 4, 12, 21, 0).getTime();
  const dailyAt = new Date(2026, 4, 12, 19, 0).getTime();
  const now = new Date(2026, 4, 12, 21, 2).getTime();

  it('fires when the day has no completed reviews', () => {
    const pending = pendingReminder(
      context({ eveningReminderEnabled: true, lastNotifiedAt: dailyAt, now }),
    );
    expect(pending?.slot).toBe('evening');
    expect(pending?.at).toBe(eveningAt);
  });

  it('does not fire once the session was completed that day', () => {
    const pending = pendingReminder(
      context({
        eveningReminderEnabled: true,
        lastNotifiedAt: dailyAt,
        now,
        days: days([{ ts: eveningAt, reviewsCompleted: 18 }]),
      }),
    );
    expect(pending).toBeNull();
  });

  it('does not fire when it is switched off', () => {
    const pending = pendingReminder(
      context({ eveningReminderEnabled: false, lastNotifiedAt: dailyAt, now }),
    );
    expect(pending).toBeNull();
  });

  it('is suppressed entirely when the daily reminder is at or after it', () => {
    const pending = pendingReminder(
      context({
        reminderTime: '21:30',
        eveningReminderEnabled: true,
        lastNotifiedAt: new Date(2026, 4, 12, 21, 30).getTime(),
        now: new Date(2026, 4, 12, 22, 0).getTime(),
      }),
    );
    expect(pending).toBeNull();
  });

  it('wins over the daily slot when both are unhandled, being the later one', () => {
    const pending = pendingReminder(context({ eveningReminderEnabled: true, now }));
    expect(pending?.slot).toBe('evening');
  });
});

describe('reminderToFire', () => {
  const at = new Date(2026, 4, 12, 19, 0).getTime();

  it('fires a reminder that has only just come due', () => {
    expect(reminderToFire(context({ now: at }))?.at).toBe(at);
    expect(reminderToFire(context({ now: at + FIRE_WINDOW_MS }))?.at).toBe(at);
  });

  it('refuses a reminder whose moment has passed', () => {
    expect(reminderToFire(context({ now: at + FIRE_WINDOW_MS + 1 }))).toBeNull();
    expect(reminderToFire(context({ now: at + 4 * 3_600_000 }))).toBeNull();
  });

  it('refuses when nothing is due, even at the exact instant', () => {
    expect(reminderToFire(context({ now: at, dueCount: 0 }))).toBeNull();
  });
});

describe('missedReminder', () => {
  const at = new Date(2026, 4, 12, 19, 0).getTime();

  it('is null inside the firing window, where a notification is still honest', () => {
    expect(missedReminder(context({ now: at + FIRE_WINDOW_MS }))).toBeNull();
  });

  it('reports a reminder the app was closed for', () => {
    const missed = missedReminder(context({ now: at + 3 * 3_600_000 }));
    expect(missed?.at).toBe(at);
    expect(missed?.body).toBe('12 codes due.');
  });

  it('still reports one from the previous evening the next morning', () => {
    const nextMorning = new Date(2026, 4, 13, 8, 0).getTime();
    expect(missedReminder(context({ now: nextMorning }))?.at).toBe(at);
  });

  it('gives up on anything older than a day', () => {
    // Two days of silence: the reported slot is the recent one, not the old one.
    const later = new Date(2026, 4, 13, 20, 0).getTime();
    expect(later - at).toBeGreaterThan(MISS_WINDOW_MS);
    const missed = missedReminder(context({ now: later }));
    expect(missed?.at).toBe(new Date(2026, 4, 13, 19, 0).getTime());
  });

  it('says nothing when the slot was already handled', () => {
    expect(missedReminder(context({ now: at + 3 * 3_600_000, lastNotifiedAt: at }))).toBeNull();
  });

  it('says nothing when nothing is due', () => {
    expect(missedReminder(context({ now: at + 3 * 3_600_000, dueCount: 0 }))).toBeNull();
  });
});
