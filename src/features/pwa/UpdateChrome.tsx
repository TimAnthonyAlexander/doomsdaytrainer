import Button from '@mui/material/Button';
import { useCallback, useEffect, useState } from 'react';
import { OFFLINE_READY_SEEN, readBooleanFlag, writeBooleanFlag } from '@/features/notifications/deviceFlags';
import { ChromeBar } from './ChromeBar';
import { dismissOfflineReady, dismissUpdate, reloadWithUpdate } from './serviceWorkerStore';
import { useServiceWorker } from './useServiceWorker';

/**
 * The update notice and the one-time offline line.
 *
 * `registerType` is 'prompt', so a waiting build never activates on its own and
 * cannot swap the code out from under a review in progress. The bar is
 * dismissible; the update is still there on the next load.
 */
export function UpdateChrome() {
  const { needRefresh, offlineReady } = useServiceWorker();
  // Read once, at mount: was the offline line already shown on this device?
  const [offlineHidden, setOfflineHidden] = useState(() => readBooleanFlag(OFFLINE_READY_SEEN));

  useEffect(() => {
    // Record it as shown the moment it appears, so a reload does not repeat it.
    if (offlineReady && !offlineHidden) writeBooleanFlag(OFFLINE_READY_SEEN, true);
  }, [offlineReady, offlineHidden]);

  const hideOffline = useCallback(() => {
    setOfflineHidden(true);
    dismissOfflineReady();
  }, []);

  if (needRefresh) {
    return (
      <ChromeBar
        onDismiss={dismissUpdate}
        dismissLabel="Keep this version"
        action={
          <Button size="small" variant="outlined" onClick={() => void reloadWithUpdate()}>
            Reload
          </Button>
        }
      >
        A new version is ready.
      </ChromeBar>
    );
  }

  if (offlineReady && !offlineHidden) {
    return (
      <ChromeBar onDismiss={hideOffline} dismissLabel="Dismiss">
        Saved for offline use. The app opens with no connection.
      </ChromeBar>
    );
  }

  return null;
}
