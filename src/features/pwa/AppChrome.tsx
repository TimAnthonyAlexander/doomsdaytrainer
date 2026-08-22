import { useEffect } from 'react';
import { ReminderChrome } from '@/features/notifications/ReminderChrome';
import {
  refreshReminderCapability,
  setBackgroundReminderActive,
} from '@/features/notifications/capabilityStore';
import { useReminderCapability } from '@/features/notifications/useReminderCapability';
import { activateBackgroundReminders } from './backgroundReminders';
import { OfflineChrome } from './OfflineChrome';

/**
 * Everything the app says about itself: the one-time offline line and the
 * reminder machinery. It renders one hairline bar at a time, or nothing, which
 * is the usual case.
 *
 * It sits inside the shell's frame rather than above the router, so the bar
 * takes its height out of the one scroller instead of adding it to a document
 * that was already exactly one viewport tall.
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
      <OfflineChrome />
      <ReminderChrome />
    </>
  );
}
