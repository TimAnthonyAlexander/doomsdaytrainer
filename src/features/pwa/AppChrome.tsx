import { useEffect } from 'react';
import { ReminderChrome } from '@/features/notifications/ReminderChrome';
import {
  refreshReminderCapability,
  setBackgroundReminderActive,
} from '@/features/notifications/capabilityStore';
import { useReminderCapability } from '@/features/notifications/useReminderCapability';
import { activateBackgroundReminders } from './backgroundReminders';
import { UpdateChrome } from './UpdateChrome';
// Side effect only: `beforeinstallprompt` fires early and once. Loading the
// store here means the event is captured at app start rather than whenever the
// settings screen happens to be opened.
import './installStore';

/**
 * The single mount point for everything the app says about itself: the service
 * worker registration, the update notice, and the reminder machinery.
 *
 * It renders one hairline bar at a time, or nothing, which is the usual case.
 */
export function AppChrome() {
  const { permission } = useReminderCapability();

  useEffect(() => {
    refreshReminderCapability();
  }, []);

  // Re-run once permission is granted: a background job cannot be registered
  // before the browser has agreed to notifications at all.
  useEffect(() => {
    if (permission !== 'granted') {
      setBackgroundReminderActive(false);
      return;
    }
    let cancelled = false;
    void activateBackgroundReminders().then((active) => {
      if (!cancelled) setBackgroundReminderActive(active);
    });
    return () => {
      cancelled = true;
    };
  }, [permission]);

  return (
    <>
      <UpdateChrome />
      <ReminderChrome />
    </>
  );
}
