import { useEffect, useSyncExternalStore } from 'react';
import {
  getServiceWorkerState,
  startServiceWorker,
  subscribeServiceWorker,
  type ServiceWorkerState,
} from './serviceWorkerStore';

/** Subscribes to the worker's state and starts registration on first mount. */
export function useServiceWorker(): ServiceWorkerState {
  useEffect(() => {
    startServiceWorker();
  }, []);

  return useSyncExternalStore(subscribeServiceWorker, getServiceWorkerState, getServiceWorkerState);
}
