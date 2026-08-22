/**
 * Service worker registration, and the one state worth surfacing.
 *
 * There is no update state here on purpose. The worker skips waiting during
 * install and claims its clients, so a new build is simply the one the next
 * load gets. Nothing asks the user to accept it and nothing reloads a window
 * out from under them. See the comment in `src/sw.ts`.
 */

export interface ServiceWorkerState {
  /** Everything the app needs is cached; it will open with no network. */
  offlineReady: boolean;
}

let snapshot: ServiceWorkerState = { offlineReady: false };
let started = false;

const listeners = new Set<() => void>();

function set(next: ServiceWorkerState): void {
  if (next.offlineReady === snapshot.offlineReady) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

export function getServiceWorkerState(): ServiceWorkerState {
  return snapshot;
}

export function subscribeServiceWorker(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Idempotent. Safe to call from a component effect; React 19 strict mode mounts
 * effects twice in development and the second call does nothing.
 */
export function startServiceWorker(): void {
  if (started) return;
  started = true;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({
        immediate: true,
        // "The worker has taken control and the page would normally reload."
        // It should not: a second tab that hears about an update installed by
        // this one would otherwise reload itself mid-answer. Empty is the whole
        // policy — the page the user is on keeps its code until they leave it.
        onNeedReload() {},
        onOfflineReady() {
          set({ offlineReady: true });
        },
      });
    })
    .catch(() => {
      // No generated worker in this build (dev server). Nothing to register.
    });
}

export function dismissOfflineReady(): void {
  set({ offlineReady: false });
}
