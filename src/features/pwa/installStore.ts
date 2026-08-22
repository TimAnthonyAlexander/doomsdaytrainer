/**
 * The install affordance.
 *
 * Chromium fires `beforeinstallprompt` once, early, and only if the app is
 * installable. The event has to be captured the moment it arrives or the
 * opportunity is gone, so the listeners are attached at module load rather than
 * in an effect. Nothing is shown unprompted: the captured event sits here until
 * the settings screen offers an Install control and the user taps it.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallState {
  /** A real install prompt is held and can be shown. */
  canInstall: boolean;
  /** Already running as an installed app. */
  installed: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
let snapshot: InstallState = { canInstall: false, installed: detectStandalone() };
const listeners = new Set<() => void>();

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  // iOS Safari predates display-mode and reports it here instead.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function set(next: InstallState): void {
  if (next.canInstall === snapshot.canInstall && next.installed === snapshot.installed) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    set({ ...snapshot, canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ canInstall: false, installed: true });
  });
}

export function getInstallState(): InstallState {
  return snapshot;
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Shows the browser's install dialog. Resolves to the user's answer, or
 * 'unavailable' when no prompt was ever captured (Safari, Firefox, already
 * installed). The event is single-use, so it is cleared either way.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred;
  if (!event) return 'unavailable';
  deferred = null;
  set({ ...snapshot, canInstall: false });
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}
