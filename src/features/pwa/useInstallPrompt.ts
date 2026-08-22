import { useSyncExternalStore } from 'react';
import { getInstallState, promptInstall, subscribeInstall, type InstallState } from './installStore';

export interface InstallPrompt extends InstallState {
  /**
   * Shows the browser's install dialog. Call it from a tap. Resolves to
   * 'unavailable' on browsers that have no programmatic install (Safari, Firefox).
   */
  install(): Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

/**
 * For the settings screen. Render an "Install" control only when `canInstall`
 * is true; there is no banner and nothing appears on its own.
 */
export function useInstallPrompt(): InstallPrompt {
  const state = useSyncExternalStore(subscribeInstall, getInstallState, getInstallState);
  return { ...state, install: promptInstall };
}
