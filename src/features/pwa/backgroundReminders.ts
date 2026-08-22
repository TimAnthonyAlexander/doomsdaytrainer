/**
 * Background reminder delivery, if the browser is willing.
 *
 * `periodicsync` is the only mechanism a serverless PWA has for firing a
 * notification while it is closed. It exists in Chromium only, only for an
 * installed app, and the browser decides how often it actually runs — a
 * `minInterval` is a floor, never a schedule. Everything below feature-detects
 * and returns false rather than throwing.
 *
 * Registering the job is not enough on its own: the service worker has to carry
 * a `periodicsync` listener. `probeServiceWorker` asks it directly instead of
 * assuming, so `canDeliverInBackground` reports what is actually true of the
 * worker that is running. `src/sw.ts` answers the probe; an older cached worker
 * from a previous build does not, and is reported as unable.
 */

import {
  REMINDER_MIN_INTERVAL_MS,
  REMINDER_PROBE_REPLY,
  REMINDER_PROBE_REQUEST,
  REMINDER_SYNC_TAG,
} from './swMessages';

// Re-exported so callers and tests keep importing the protocol from the side
// they talk to. The definitions live in swMessages.ts because the worker needs
// them too and must not pull a page module in to get them.
export { REMINDER_MIN_INTERVAL_MS, REMINDER_PROBE_REPLY, REMINDER_PROBE_REQUEST, REMINDER_SYNC_TAG };

/** How long the worker gets to answer before we assume it cannot. */
const PROBE_TIMEOUT_MS = 600;

interface PeriodicSyncManager {
  register(tag: string, options?: { minInterval?: number }): Promise<void>;
  getTags(): Promise<string[]>;
}

function periodicSyncOf(registration: ServiceWorkerRegistration): PeriodicSyncManager | null {
  const candidate = (registration as unknown as { periodicSync?: PeriodicSyncManager }).periodicSync;
  return candidate ?? null;
}

async function hasPeriodicSyncPermission(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.permissions) return false;
  try {
    const status = await navigator.permissions.query({
      name: 'periodic-background-sync' as PermissionName,
    });
    return status.state === 'granted';
  } catch {
    // Browsers that do not know the permission name reject the query.
    return false;
  }
}

/** Asks the active worker whether it handles reminder syncs. */
function probeServiceWorker(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      channel.port1.close();
      resolve(value);
    };

    const channel = new MessageChannel();
    channel.port1.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      finish(data?.type === REMINDER_PROBE_REPLY);
    };

    const timer = window.setTimeout(() => finish(false), PROBE_TIMEOUT_MS);

    try {
      worker.postMessage({ type: REMINDER_PROBE_REQUEST }, [channel.port2]);
    } catch {
      finish(false);
    }
  });
}

/**
 * Registers the periodic job and reports whether reminders can genuinely be
 * delivered with the app closed. False is the normal answer on most browsers.
 */
export async function activateBackgroundReminders(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  if (!(await hasPeriodicSyncPermission())) return false;

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.ready;
  } catch {
    return false;
  }

  const periodicSync = periodicSyncOf(registration);
  if (!periodicSync) return false;

  try {
    const tags = await periodicSync.getTags();
    if (!tags.includes(REMINDER_SYNC_TAG)) {
      await periodicSync.register(REMINDER_SYNC_TAG, { minInterval: REMINDER_MIN_INTERVAL_MS });
    }
  } catch {
    return false;
  }

  const worker = registration.active;
  if (!worker) return false;
  return probeServiceWorker(worker);
}
