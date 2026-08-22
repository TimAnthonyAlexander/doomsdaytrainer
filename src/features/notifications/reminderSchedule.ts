import type { SessionDay } from '@/domain/types';
import { addDays, dayKey } from '@/domain/time';

/**
 * When a reminder is due, and whether the app can still honestly deliver it.
 *
 * Everything here is pure. The browser cannot be relied on to run anything at a
 * chosen instant, so the schedule is expressed as "which reminder instant is the
 * most recent one that has not been dealt with", and the caller decides whether
 * that is close enough to now to notify (`reminderToFire`) or already stale and
 * only worth a quiet line in the app (`missedReminder`).
 */

/** The optional second reminder. Settings carry a flag, not a time, so it is fixed. */
export const EVENING_REMINDER_TIME = '21:00';

/** How late a reminder may be and still be shown as a notification. */
export const FIRE_WINDOW_MS = 5 * 60_000;

/** Past this age a missed reminder is not worth mentioning at all. */
export const MISS_WINDOW_MS = 24 * 60 * 60_000;

export type ReminderSlot = 'daily' | 'evening';

export interface TimeOfDay {
  hours: number;
  minutes: number;
}

export interface PendingReminder {
  slot: ReminderSlot;
  /** Epoch millis of the instant the reminder was scheduled for. */
  at: number;
  /** Items due when the reminder was worked out. */
  dueCount: number;
  /** The whole notification body. "12 codes due." */
  body: string;
}

export interface ReminderContext {
  reminderEnabled: boolean;
  /** "HH:MM", 24h, local. */
  reminderTime: string;
  eveningReminderEnabled: boolean;
  /** Epoch millis of the last reminder instant already dealt with. 0 = never. */
  lastNotifiedAt: number;
  /** Items due right now, inside the active scope. */
  dueCount: number;
  days: Record<string, SessionDay>;
  now: number;
}

/** "19:00" → { hours: 19, minutes: 0 }. Null for anything malformed. */
export function parseTimeOfDay(value: string): TimeOfDay | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

export function minutesOfDay(time: TimeOfDay): number {
  return time.hours * 60 + time.minutes;
}

/**
 * The wall-clock time on the local calendar day containing `ts`.
 *
 * Wall clock, not elapsed millis: on the spring-forward day a 02:30 reminder has
 * no instant, and the platform resolves it to 03:30 rather than to a time on the
 * wrong day. That is the behaviour we want.
 */
function atTimeOnDay(ts: number, time: TimeOfDay): number {
  const date = new Date(ts);
  date.setHours(time.hours, time.minutes, 0, 0);
  return date.getTime();
}

/** The first occurrence of `time` strictly after `from`. Null if `time` is malformed. */
export function nextReminderAt(time: string, from: number): number | null {
  const parsed = parseTimeOfDay(time);
  if (!parsed) return null;
  const today = atTimeOnDay(from, parsed);
  if (today > from) return today;
  return atTimeOnDay(addDays(from, 1), parsed);
}

/** The most recent occurrence of `time` at or before `from`. */
export function previousReminderAt(time: string, from: number): number | null {
  const parsed = parseTimeOfDay(time);
  if (!parsed) return null;
  const today = atTimeOnDay(from, parsed);
  if (today <= from) return today;
  return atTimeOnDay(addDays(from, -1), parsed);
}

/** Millis from `from` until the next occurrence, or null when unschedulable. */
export function msUntilNextReminder(time: string, from: number): number | null {
  const next = nextReminderAt(time, from);
  return next === null ? null : next - from;
}

/**
 * The evening reminder's time, or null when it would land at or before the daily
 * one. Two notifications in the same minute is worse than one.
 */
export function eveningReminderTime(dailyTime: string): string | null {
  const daily = parseTimeOfDay(dailyTime);
  const evening = parseTimeOfDay(EVENING_REMINDER_TIME);
  if (!daily || !evening) return null;
  if (minutesOfDay(daily) >= minutesOfDay(evening)) return null;
  return EVENING_REMINDER_TIME;
}

/** A day counts as done once any review has been completed on it. */
export function sessionCompletedOn(days: Record<string, SessionDay>, ts: number): boolean {
  const day = days[dayKey(ts)];
  return day !== undefined && day.reviewsCompleted > 0;
}

/** "12 codes due." Never gamified, never exclaimed. */
export function reminderBody(dueCount: number): string {
  return dueCount === 1 ? '1 code due.' : `${dueCount} codes due.`;
}

/** 24h local clock for a reminder instant: "19:00". */
export function formatClock(ts: number): string {
  const date = new Date(ts);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * The latest reminder instant at or before `now` that has not been dealt with.
 * Null when reminders are off, nothing is due, or every slot is already handled.
 */
export function pendingReminder(context: ReminderContext): PendingReminder | null {
  if (!context.reminderEnabled) return null;
  if (context.dueCount <= 0) return null;

  const candidates: { slot: ReminderSlot; at: number }[] = [];

  const daily = previousReminderAt(context.reminderTime, context.now);
  if (daily !== null) candidates.push({ slot: 'daily', at: daily });

  const eveningTime = context.eveningReminderEnabled ? eveningReminderTime(context.reminderTime) : null;
  if (eveningTime !== null) {
    const at = previousReminderAt(eveningTime, context.now);
    // The second reminder exists only for a day whose session never happened.
    if (at !== null && !sessionCompletedOn(context.days, at)) {
      candidates.push({ slot: 'evening', at });
    }
  }

  const fresh = candidates
    .filter((candidate) => candidate.at > context.lastNotifiedAt)
    .sort((a, b) => b.at - a.at);

  const latest = fresh[0];
  if (!latest) return null;
  return {
    slot: latest.slot,
    at: latest.at,
    dueCount: context.dueCount,
    body: reminderBody(context.dueCount),
  };
}

/** A reminder recent enough that showing a notification is still the truth. */
export function reminderToFire(context: ReminderContext): PendingReminder | null {
  const pending = pendingReminder(context);
  if (!pending) return null;
  return context.now - pending.at <= FIRE_WINDOW_MS ? pending : null;
}

/**
 * A reminder whose moment has passed. Notifying now would tell the user about
 * something hours old, so this is surfaced as a line in the app instead.
 */
export function missedReminder(context: ReminderContext): PendingReminder | null {
  const pending = pendingReminder(context);
  if (!pending) return null;
  const age = context.now - pending.at;
  return age > FIRE_WINDOW_MS && age <= MISS_WINDOW_MS ? pending : null;
}
