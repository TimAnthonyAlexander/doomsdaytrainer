import { useSyncExternalStore } from 'react';
import type { ReminderCapability } from './capability';
import { getReminderCapability, subscribeReminderCapability } from './capabilityStore';

/**
 * What this browser can honestly do about reminders, for the settings screen.
 *
 * `reason` is a finished plain-language sentence; render it as-is under the
 * reminder controls. Do not write a second explanation next to it, and do not
 * describe reminders as reliable when `canDeliverInBackground` is false.
 */
export function useReminderCapability(): ReminderCapability {
  return useSyncExternalStore(
    subscribeReminderCapability,
    getReminderCapability,
    getReminderCapability,
  );
}
