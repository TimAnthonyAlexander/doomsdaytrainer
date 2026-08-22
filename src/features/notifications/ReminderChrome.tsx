import Button from '@mui/material/Button';
import { Numeral } from '@/components/ui/Numeral';
import { ChromeBar } from '@/features/pwa/ChromeBar';
import { formatClock } from './reminderSchedule';
import { useReminders } from './useReminders';

/**
 * Two quiet lines, at most one at a time.
 *
 * The permission ask is an in-app explanation first; the browser dialog only
 * follows a tap, because a dialog fired cold gets blocked once and forever. The
 * copy says what the app can actually do, which is less than a native reminder.
 */
export function ReminderChrome() {
  const { offerPrompt, missed, acceptPrompt, declinePrompt, dismissMissed } = useReminders();

  if (offerPrompt) {
    return (
      <ChromeBar
        onDismiss={declinePrompt}
        dismissLabel="No reminder"
        action={
          <Button size="small" variant="outlined" onClick={() => void acceptPrompt()}>
            Turn on
          </Button>
        }
      >
        A daily reminder can tell you how many codes are due. It only arrives when your browser
        lets the app run, so it is a nudge rather than an alarm.
      </ChromeBar>
    );
  }

  if (missed) {
    return (
      <ChromeBar onDismiss={dismissMissed} dismissLabel="Dismiss reminder">
        A reminder was due at <Numeral>{formatClock(missed.at)}</Numeral>.{' '}
        <Numeral>{missed.dueCount}</Numeral> {missed.dueCount === 1 ? 'code' : 'codes'} due.
      </ChromeBar>
    );
  }

  return null;
}
