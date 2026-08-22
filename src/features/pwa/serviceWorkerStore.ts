/**
 * Service worker registration and the two states worth surfacing.
 *
 * `registerType` is 'prompt', so a new build never swaps itself in mid-session.
 * The user is told a version is ready and reloads when they choose.
 */

export interface ServiceWorkerState {
  /** A new build is installed and waiting. */
  needRefresh: boolean;
  /** Everything the app needs is cached; it will open with no network. */
  offlineReady: boolean;
}

let snapshot: ServiceWorkerState = { needRefresh: false, offlineReady: false };
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
let started = false;

const listeners = new Set<() => void>();

function set(next: ServiceWorkerState): void {
  if (next.needRefresh === snapshot.needRefresh && next.offlineReady === snapshot.offlineReady) return;
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
      applyUpdate = registerSW({
        immediate: true,
        onNeedRefresh() {
          set({ ...snapshot, needRefresh: true });
        },
        onOfflineReady() {
          set({ ...snapshot, offlineReady: true });
        },
      });
    })
    .catch(() => {
      // No generated worker in this build (dev server). Nothing to register.
    });
}

/** Activates the waiting worker and reloads. */
export async function reloadWithUpdate(): Promise<void> {
  if (!applyUpdate) {
    window.location.reload();
    return;
  }
  await applyUpdate(true);
}

export function dismissUpdate(): void {
  set({ ...snapshot, needRefresh: false });
}

export function dismissOfflineReady(): void {
  set({ ...snapshot, offlineReady: false });
}
