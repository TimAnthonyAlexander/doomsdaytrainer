/**
 * What this browser can honestly do about reminders.
 *
 * There is no server and no VAPID key, so Web Push is out. What remains is a
 * notification fired by the page while it is open, or by the service worker if
 * the browser both supports `periodicsync` and is willing to wake this app.
 * Neither is a guarantee, and the copy below never pretends otherwise.
 */

export interface ReminderEnvironment {
  hasNotification: boolean;
  permission: NotificationPermission;
  hasServiceWorker: boolean;
  hasPeriodicSync: boolean;
  /** The service worker accepted a periodic reminder job and answered a probe. */
  backgroundReminderActive: boolean;
  /** Running as an installed app rather than a browser tab. */
  standalone: boolean;
}

export interface ReminderCapability {
  /** False when the browser has no Notification API at all. */
  supported: boolean;
  permission: NotificationPermission;
  /** True only when a reminder can arrive with the app closed. */
  canDeliverInBackground: boolean;
  /** One or two plain sentences, safe to render as-is. */
  reason: string;
}

const MISSED_FALLBACK = 'If one is missed, the app tells you next time you open it.';

/** Reads the live browser environment, tolerating every API being absent. */
export function readReminderEnvironment(backgroundReminderActive: boolean): ReminderEnvironment {
  const hasNotification = typeof Notification !== 'undefined';
  const hasServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const hasPeriodicSync =
    typeof window !== 'undefined' && 'ServiceWorkerRegistration' in window
      ? 'periodicSync' in window.ServiceWorkerRegistration.prototype
      : false;
  const standalone =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)').matches
      : false;

  return {
    hasNotification,
    permission: hasNotification ? Notification.permission : 'denied',
    hasServiceWorker,
    hasPeriodicSync,
    backgroundReminderActive,
    standalone,
  };
}

export function detectReminderCapability(env: ReminderEnvironment): ReminderCapability {
  if (!env.hasNotification) {
    return {
      supported: false,
      permission: 'denied',
      canDeliverInBackground: false,
      reason: 'This browser cannot show notifications, so reminders are not available here.',
    };
  }

  const canDeliverInBackground =
    env.permission === 'granted' &&
    env.hasServiceWorker &&
    env.hasPeriodicSync &&
    env.backgroundReminderActive;

  if (env.permission === 'denied') {
    return {
      supported: true,
      permission: 'denied',
      canDeliverInBackground: false,
      reason: 'Notifications are blocked for this site. Turn them back on in your browser settings.',
    };
  }

  if (env.permission === 'default') {
    return {
      supported: true,
      permission: 'default',
      canDeliverInBackground: false,
      reason: 'Reminders need your permission before anything can be shown.',
    };
  }

  if (canDeliverInBackground) {
    return {
      supported: true,
      permission: 'granted',
      canDeliverInBackground: true,
      reason:
        'Your browser can wake the app in the background, so a reminder can arrive while the app is closed. The browser picks the moment, so the time is approximate.',
    };
  }

  if (!env.hasServiceWorker || !env.hasPeriodicSync) {
    return {
      supported: true,
      permission: 'granted',
      canDeliverInBackground: false,
      reason: `Reminders only appear while the app is open. This browser has no way to wake a closed app. ${MISSED_FALLBACK}`,
    };
  }

  if (!env.standalone) {
    return {
      supported: true,
      permission: 'granted',
      canDeliverInBackground: false,
      reason: `Reminders only appear while the app is open. Installing it to the home screen may let your browser wake it in the background. ${MISSED_FALLBACK}`,
    };
  }

  return {
    supported: true,
    permission: 'granted',
    canDeliverInBackground: false,
    reason: `Reminders only appear while the app is open. Your browser has not agreed to wake this app in the background. ${MISSED_FALLBACK}`,
  };
}

export function sameCapability(a: ReminderCapability, b: ReminderCapability): boolean {
  return (
    a.supported === b.supported &&
    a.permission === b.permission &&
    a.canDeliverInBackground === b.canDeliverInBackground &&
    a.reason === b.reason
  );
}
