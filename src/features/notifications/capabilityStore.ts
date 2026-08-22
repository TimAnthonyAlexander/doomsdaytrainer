import {
  detectReminderCapability,
  readReminderEnvironment,
  sameCapability,
  type ReminderCapability,
} from './capability';

/**
 * A tiny external store so every consumer sees the same capability snapshot and
 * re-renders when it changes. Permission and background availability both change
 * outside React, and polling them in an effect produces act() noise in tests.
 */

let backgroundActive = false;
let snapshot: ReminderCapability = detectReminderCapability(readReminderEnvironment(false));
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getReminderCapability(): ReminderCapability {
  return snapshot;
}

export function subscribeReminderCapability(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-reads the browser. Cheap, and a no-op re-render when nothing changed. */
export function refreshReminderCapability(): void {
  const next = detectReminderCapability(readReminderEnvironment(backgroundActive));
  if (sameCapability(next, snapshot)) return;
  snapshot = next;
  emit();
}

/**
 * Called by the PWA layer once it knows whether the service worker actually
 * accepted a periodic reminder job. Until it does, background delivery is
 * reported as unavailable, which is the truthful default.
 */
export function setBackgroundReminderActive(active: boolean): void {
  if (backgroundActive === active) return;
  backgroundActive = active;
  refreshReminderCapability();
}

/**
 * Asks the browser. Always call this from a user gesture: an unprompted
 * permission dialog is the single fastest way to get permanently blocked.
 */
export async function requestReminderPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  try {
    const result = await Notification.requestPermission();
    refreshReminderCapability();
    return result;
  } catch {
    refreshReminderCapability();
    return Notification.permission;
  }
}
