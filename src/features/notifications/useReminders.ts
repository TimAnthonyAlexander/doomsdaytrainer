import { useCallback, useEffect, useMemo, useState } from 'react';
import { dueItems } from '@/domain/scheduler';
import { resolveScope } from '@/domain/scope';
import { useAppState } from '@/state/useAppState';
import {
  LAST_REMINDER_AT,
  MISSED_REMINDER_SEEN,
  REMINDER_PROMPT_ASKED,
  readBooleanFlag,
  readNumberFlag,
  writeBooleanFlag,
  writeFlag,
} from './deviceFlags';
import { showReminderNotification } from './notifier';
import { shouldOfferReminderPrompt } from './promptTiming';
import {
  missedReminder,
  reminderToFire,
  type PendingReminder,
  type ReminderContext,
} from './reminderSchedule';
import { requestReminderPermission } from './capabilityStore';
import { useReminderCapability } from './useReminderCapability';

/**
 * A poll, not a timer.
 *
 * `setTimeout` for "19:00 tomorrow" is wrong twice over: it overflows past 24.8
 * days, and it drifts or never fires at all when the device sleeps. Checking the
 * clock every half minute costs nothing and survives sleep, wake, DST and the
 * user changing the reminder time mid-session.
 */
const TICK_MS = 30_000;

export interface RemindersState {
  /** Show the in-app explanation before the browser's permission dialog. */
  offerPrompt: boolean;
  /** A reminder whose moment passed while the app was closed, or null. */
  missed: PendingReminder | null;
  /** Asks the browser and, if granted, turns the daily reminder on. */
  acceptPrompt(): Promise<void>;
  declinePrompt(): void;
  dismissMissed(): void;
}

export function useReminders(): RemindersState {
  const { data, settings, itemList, updateSettings } = useAppState();
  const capability = useReminderCapability();

  const [now, setNow] = useState(() => Date.now());
  const [asked, setAsked] = useState(() => readBooleanFlag(REMINDER_PROMPT_ASKED));
  const [lastNotifiedAt, setLastNotifiedAt] = useState(() => readNumberFlag(LAST_REMINDER_AT));
  const [missedSeenAt, setMissedSeenAt] = useState(() => readNumberFlag(MISSED_REMINDER_SEEN));

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, TICK_MS);
    // Coming back to the tab is the moment a missed reminder becomes relevant.
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  /**
   * Turning the reminder on sets the baseline. Without it, enabling a 19:00
   * reminder at 20:00 would immediately claim a reminder had been missed.
   */
  useEffect(() => {
    if (!settings.reminderEnabled) return;
    if (lastNotifiedAt !== 0) return;
    const baseline = Date.now();
    setLastNotifiedAt(baseline);
    writeFlag(LAST_REMINDER_AT, String(baseline));
  }, [settings.reminderEnabled, lastNotifiedAt]);

  const dueCount = useMemo(
    () => dueItems(itemList, resolveScope(settings), now).length,
    [itemList, settings, now],
  );

  const context = useMemo<ReminderContext>(
    () => ({
      reminderEnabled: settings.reminderEnabled,
      reminderTime: settings.reminderTime,
      eveningReminderEnabled: settings.eveningReminderEnabled,
      lastNotifiedAt,
      dueCount,
      days: data.days,
      now,
    }),
    [settings, lastNotifiedAt, dueCount, data.days, now],
  );

  const fire = useMemo(
    () => (capability.permission === 'granted' ? reminderToFire(context) : null),
    [capability.permission, context],
  );
  const fireAt = fire?.at ?? 0;
  const fireBody = fire?.body ?? '';

  useEffect(() => {
    if (fireAt === 0) return;
    setLastNotifiedAt(fireAt);
    writeFlag(LAST_REMINDER_AT, String(fireAt));
    // The user is looking at the app; the due count is already on screen. Mark
    // the slot handled and skip the notification rather than duplicating it.
    if (document.visibilityState === 'visible') return;
    void showReminderNotification(fireBody);
  }, [fireAt, fireBody]);

  const missed = useMemo(() => {
    const candidate = missedReminder(context);
    if (!candidate) return null;
    return candidate.at > missedSeenAt ? candidate : null;
  }, [context, missedSeenAt]);

  const offerPrompt =
    !asked &&
    shouldOfferReminderPrompt({
      days: data.days,
      alreadyAsked: asked,
      reminderEnabled: settings.reminderEnabled,
      supported: capability.supported,
      permission: capability.permission,
    });

  const markAsked = useCallback(() => {
    setAsked(true);
    writeBooleanFlag(REMINDER_PROMPT_ASKED, true);
  }, []);

  const acceptPrompt = useCallback(async () => {
    markAsked();
    const permission = await requestReminderPermission();
    if (permission === 'granted') {
      await updateSettings({ reminderEnabled: true });
    }
  }, [markAsked, updateSettings]);

  const dismissMissed = useCallback(() => {
    const at = missed?.at ?? Date.now();
    setMissedSeenAt(at);
    writeFlag(MISSED_REMINDER_SEEN, String(at));
  }, [missed]);

  return { offerPrompt, missed, acceptPrompt, declinePrompt: markAsked, dismissMissed };
}
