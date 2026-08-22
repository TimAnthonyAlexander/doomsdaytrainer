/**
 * Showing one notification, from whichever surface the browser allows.
 *
 * Android Chrome refuses `new Notification()` entirely and requires the service
 * worker registration, so that path is tried first and the constructor is the
 * fallback for desktop browsers without an active worker.
 */

export const REMINDER_TITLE = 'Doomsday Trainer';

/** One tag, so a second reminder replaces the first instead of stacking. */
export const REMINDER_TAG = 'doomsday-reminder';

export async function showReminderNotification(body: string): Promise<boolean> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;

  const options: NotificationOptions = {
    body,
    tag: REMINDER_TAG,
    icon: '/icon-192.png',
    badge: '/favicon.svg',
    silent: false,
  };

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(REMINDER_TITLE, options);
        return true;
      }
    } catch {
      // Fall through to the page-level constructor below.
    }
  }

  try {
    new Notification(REMINDER_TITLE, options);
    return true;
  } catch {
    return false;
  }
}
