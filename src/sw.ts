/// <reference lib="webworker" />

/**
 * The service worker.
 *
 * Two jobs. The first is the precache and the SPA navigation fallback, which is
 * what the generated worker did before and what makes the app open with no
 * network. The second is the reminder: `periodicsync` is the only way a
 * serverless PWA can say anything while it is closed, and it needs a listener
 * here or the whole reminder feature is a promise the app cannot keep.
 *
 * The timing rules are not reimplemented here. `pendingReminder` decides which
 * reminder instant is outstanding, `dueItems` and `resolveScope` decide how many
 * codes that is. This file only reads the document, asks those functions, and
 * shows the answer.
 */

import { openDB } from 'idb';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import type { PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { dueItems } from '@/domain/scheduler';
import { resolveScope } from '@/domain/scope';
import type { AppData } from '@/domain/types';
import { REMINDER_TAG, REMINDER_TITLE } from '@/features/notifications/notifier';
import { pendingReminder, sessionCompletedOn } from '@/features/notifications/reminderSchedule';
import {
  REMINDER_PROBE_REPLY,
  REMINDER_PROBE_REQUEST,
  REMINDER_SYNC_TAG,
  SKIP_WAITING,
} from '@/features/pwa/swMessages';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | PrecacheEntry)[];
};

/** `periodicsync` is Chromium-only and has no lib.dom type. */
interface PeriodicSyncEvent extends ExtendableEvent {
  readonly tag: string;
}

/* ------------------------------------------------------------------ */
/* Precache                                                            */
/* ------------------------------------------------------------------ */

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Deep links have to resolve offline: /year-codes/learn is served by the
// cached shell.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

/* ------------------------------------------------------------------ */
/* Spoken clips                                                        */
/* ------------------------------------------------------------------ */

/**
 * The two hundred spoken clips are cached as they are played, not precached.
 *
 * They are deliberately outside `injectManifest.globPatterns`, which lists
 * js/css/html/svg/png/woff2 and no audio. Precaching them would put roughly a
 * megabyte in front of every first install, for a hundred years the user will
 * meet ten at a time over weeks, and would make every app update re-verify all
 * of them. Cache-first from the moment one is actually heard costs nothing up
 * front and still leaves a learned decade fully offline.
 *
 * Hand-rolled rather than `workbox-strategies`, because the whole strategy is
 * the six lines below and a dependency for that is not worth carrying.
 */
const AUDIO_CACHE = 'doomsday-audio';

registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/audio/'),
  async ({ request }) => {
    const cache = await caches.open(AUDIO_CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    // Only a real clip is kept. A 404 cached here would be silence for good,
    // and the filenames carry a set version, so a good one never goes stale.
    if (response.ok) await cache.put(request, response.clone());
    return response;
  },
);

/* ------------------------------------------------------------------ */
/* Reading the app's data                                              */
/* ------------------------------------------------------------------ */

/*
 * A worker-side reader rather than an import of src/storage/db.ts, for two
 * reasons that both matter here. That module opens the database at a pinned
 * version, and a worker left over from an older build would then fail against a
 * database the page has already upgraded. It also writes a default document
 * when it finds none, and a background sync must never create data.
 *
 * The name, store and key below mirror src/storage/db.ts exactly.
 */
const DB_NAME = 'doomsday-trainer';
const STORE = 'state';
const KEY = 'app';

/** The document, or null when there is nothing to read. Never throws. */
async function readAppData(): Promise<AppData | null> {
  try {
    const db = await openDB(DB_NAME, undefined, {
      upgrade(_db, _oldVersion, _newVersion, transaction) {
        // An upgrade means the database did not exist. The page owns the
        // schema, so roll the creation back rather than leaving an empty one
        // behind that the page would then never populate.
        transaction.abort();
      },
    });
    try {
      if (!db.objectStoreNames.contains(STORE)) return null;
      return ((await db.get(STORE, KEY)) as AppData | undefined) ?? null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* The worker's own note of what it has already said                   */
/* ------------------------------------------------------------------ */

/*
 * The page keeps `lastNotifiedAt` in localStorage, which a worker cannot see.
 * Its own tiny database keeps the two sides from notifying about the same
 * instant twice. It is deliberately separate from the app's data: a background
 * job must not be able to corrupt a review history.
 */
const SW_DB_NAME = 'doomsday-trainer-sw';
const SW_STORE = 'reminder';
const LAST_NOTIFIED_KEY = 'lastNotifiedAt';

function swDb() {
  return openDB(SW_DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(SW_STORE)) db.createObjectStore(SW_STORE);
    },
  });
}

async function readLastNotifiedAt(): Promise<number> {
  try {
    const db = await swDb();
    try {
      const value = await db.get(SW_STORE, LAST_NOTIFIED_KEY);
      return typeof value === 'number' && Number.isFinite(value) ? value : 0;
    } finally {
      db.close();
    }
  } catch {
    return 0;
  }
}

async function writeLastNotifiedAt(at: number): Promise<void> {
  try {
    const db = await swDb();
    try {
      await db.put(SW_STORE, at, LAST_NOTIFIED_KEY);
    } finally {
      db.close();
    }
  } catch {
    // No storage, so the worker may repeat a reminder. The shared notification
    // tag means it replaces the previous one rather than stacking.
  }
}

/* ------------------------------------------------------------------ */
/* The reminder                                                        */
/* ------------------------------------------------------------------ */

/**
 * How late a background reminder may be and still be worth showing.
 *
 * The page uses a five-minute window because it polls every thirty seconds.
 * A periodic sync runs when the browser feels like it, perhaps twice a day, so
 * five minutes would mean never firing at all. Four hours keeps "19:00" honest
 * — a reminder that turns up the next morning is not a reminder — while giving
 * the browser a window it can realistically hit.
 */
const BACKGROUND_FIRE_WINDOW_MS = 4 * 60 * 60_000;

async function deliverReminder(): Promise<void> {
  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return;

  const data = await readAppData();
  if (!data) return;

  const now = Date.now();
  const { settings } = data;
  if (!settings.reminderEnabled) return;

  // The user has already sat down with it today. Same test the evening slot
  // uses in the page, applied to the whole day here: nothing the app can say in
  // the background is worth interrupting someone who already did the work.
  if (sessionCompletedOn(data.days, now)) return;

  const dueCount = dueItems(Object.values(data.items), resolveScope(settings), now).length;
  const lastNotifiedAt = await readLastNotifiedAt();

  const pending = pendingReminder({
    reminderEnabled: settings.reminderEnabled,
    reminderTime: settings.reminderTime,
    eveningReminderEnabled: settings.eveningReminderEnabled,
    lastNotifiedAt,
    dueCount,
    days: data.days,
    now,
  });
  if (!pending) return;
  if (now - pending.at > BACKGROUND_FIRE_WINDOW_MS) return;

  // Written before the notification, so a failure to show cannot leave the
  // worker firing the same instant on every sync.
  await writeLastNotifiedAt(pending.at);

  await self.registration.showNotification(REMINDER_TITLE, {
    body: pending.body,
    tag: REMINDER_TAG,
    icon: '/icon-192.png',
    badge: '/favicon.svg',
  });
}

self.addEventListener('periodicsync', (event) => {
  const sync = event as PeriodicSyncEvent;
  if (sync.tag !== REMINDER_SYNC_TAG) return;
  sync.waitUntil(deliverReminder());
});

/* ------------------------------------------------------------------ */
/* Messages and clicks                                                 */
/* ------------------------------------------------------------------ */

self.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | null;
  if (!data) return;

  // The page owns the update prompt; a waiting worker never activates itself.
  if (data.type === SKIP_WAITING) {
    void self.skipWaiting();
    return;
  }

  if (data.type === REMINDER_PROBE_REQUEST) {
    event.ports[0]?.postMessage({ type: REMINDER_PROBE_REPLY });
  }
});

async function openApp(): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = clients[0];
  if (existing) {
    await existing.focus();
    return;
  }
  // The reminder is about codes that have fallen due, so it opens the queue
  // rather than the app's front door.
  await self.clients.openWindow('/year-codes/revise');
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openApp());
});
