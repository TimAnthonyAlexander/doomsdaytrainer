/**
 * Mount `<AppChrome />` once, in the shell's frame, so a notice takes its height
 * out of the scroll area rather than out of the document. `startServiceWorker()`
 * is called from `App` instead, because registration should not wait for
 * onboarding to finish.
 */
export { AppChrome } from './AppChrome';
export { useInstallPrompt, type InstallPrompt } from './useInstallPrompt';
export { useServiceWorker } from './useServiceWorker';
export { startServiceWorker } from './serviceWorkerStore';
export type { ServiceWorkerState } from './serviceWorkerStore';
