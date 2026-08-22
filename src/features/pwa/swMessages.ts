/**
 * The wire between the page and `src/sw.ts`.
 *
 * Both sides compile from this file, so a rename cannot leave the page talking
 * to a worker that answers a different word. Nothing here touches `window` or
 * `self`: the service worker imports it too.
 */

/** The `periodicsync` tag the page registers and the worker listens for. */
export const REMINDER_SYNC_TAG = 'doomsday-reminder';

/** Twelve hours. The browser will do less than this, never more. */
export const REMINDER_MIN_INTERVAL_MS = 12 * 60 * 60_000;

/**
 * Page → worker, over a `MessageChannel`: "do you handle reminder syncs?"
 * The worker replies with `REMINDER_PROBE_REPLY` on the transferred port.
 */
export const REMINDER_PROBE_REQUEST = 'doomsday-reminder-probe';
export const REMINDER_PROBE_REPLY = 'doomsday-reminder-probe-ok';
