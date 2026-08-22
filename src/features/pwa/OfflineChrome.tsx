import { useCallback, useEffect, useState } from 'react';
import { OFFLINE_READY_SEEN, readBooleanFlag, writeBooleanFlag } from '@/features/notifications/deviceFlags';
import { ChromeBar } from './ChromeBar';
import { dismissOfflineReady } from './serviceWorkerStore';
import { useServiceWorker } from './useServiceWorker';

/**
 * The one-time offline line, and nothing else.
 *
 * There was an update notice above it: a new build installed, sat in `waiting`,
 * and the bar asked for a reload. A refresh the user did themselves could not
 * clear it — the old worker still controlled the page and served the old
 * precache, so the same bar came back — and the only way to apply an update was
 * to accept a prompt about it. The worker takes over on its own now, so there
 * is nothing to announce.
 */
export function OfflineChrome() {
  const { offlineReady } = useServiceWorker();
  // Read once, at mount: was the offline line already shown on this device?
  const [hidden, setHidden] = useState(() => readBooleanFlag(OFFLINE_READY_SEEN));

  useEffect(() => {
    // Record it as shown the moment it appears, so a reload does not repeat it.
    if (offlineReady && !hidden) writeBooleanFlag(OFFLINE_READY_SEEN, true);
  }, [offlineReady, hidden]);

  const hide = useCallback(() => {
    setHidden(true);
    dismissOfflineReady();
  }, []);

  if (!offlineReady || hidden) return null;

  return (
    <ChromeBar onDismiss={hide} dismissLabel="Dismiss">
      Saved for offline use. The app opens with no connection.
    </ChromeBar>
  );
}
