/**
 * Mount `<AppChrome />` once, inside the app state provider. Nothing else in
 * this feature needs wiring; the service worker registers itself from there.
 */
export { AppChrome } from './AppChrome';
export { useInstallPrompt, type InstallPrompt } from './useInstallPrompt';
export { useServiceWorker } from './useServiceWorker';
export type { ServiceWorkerState } from './serviceWorkerStore';
