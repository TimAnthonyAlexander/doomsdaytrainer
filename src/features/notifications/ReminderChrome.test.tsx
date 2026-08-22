import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from '@/domain/types';
import { AppStateProvider } from '@/state/AppStateProvider';
import { closeDb, loadAppData, saveAppData } from '@/storage/db';
import { defaultAppData, itemKey } from '@/storage/defaults';
import { theme } from '@/theme/theme';
import { ReminderChrome } from './ReminderChrome';
import { refreshReminderCapability } from './capabilityStore';
import { LAST_REMINDER_AT, REMINDER_PROMPT_ASKED } from './deviceFlags';
import { formatClock } from './reminderSchedule';

async function deleteDb(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('doomsday-trainer');
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Three days of use and twelve overdue items. */
function seedData(activeDays: number, patch: Partial<AppData['settings']> = {}): AppData {
  const now = Date.now();
  const data = defaultAppData(now);
  data.settings = { ...data.settings, onboardingComplete: true, ...patch };
  for (let yy = 0; yy < 12; yy++) {
    data.items[itemKey(yy)] = {
      ...data.items[itemKey(yy)],
      introduced: true,
      introducedAt: now - 86_400_000,
      dueAt: now - 3_600_000,
    };
  }
  for (let index = 0; index < activeDays; index++) {
    const date = `2026-05-${String(10 + index).padStart(2, '0')}`;
    data.days[date] = { date, reviewsCompleted: 18, newItemsIntroduced: 0 };
  }
  return data;
}

async function mount(data: AppData) {
  await saveAppData(data);
  await closeDb();
  return render(
    <ThemeProvider theme={theme}>
      <AppStateProvider>
        <ReminderChrome />
      </AppStateProvider>
    </ThemeProvider>,
  );
}

let requested = 0;

beforeEach(async () => {
  await deleteDb();
  window.localStorage.clear();
  requested = 0;
  vi.stubGlobal('Notification', {
    permission: 'default',
    async requestPermission() {
      requested += 1;
      vi.stubGlobal('Notification', { permission: 'granted', requestPermission: async () => 'granted' });
      return 'granted';
    },
  });
  refreshReminderCapability();
});

afterEach(() => {
  // Only the globals. Refreshing the capability store here would push state into
  // a component that testing-library has not unmounted yet.
  vi.unstubAllGlobals();
});

describe('the permission ask', () => {
  it('stays away before the third day of use', async () => {
    await mount(seedData(2));
    await waitFor(() => {
      expect(screen.queryByText(/daily reminder can tell you/i)).not.toBeInTheDocument();
    });
  });

  it('appears on the third day, explaining the limit before asking', async () => {
    await mount(seedData(3));
    const line = await screen.findByText(/daily reminder can tell you/i);
    expect(line).toHaveTextContent(/nudge rather than an alarm/i);
    expect(line.textContent).not.toContain('!');
    // Nothing was asked of the browser yet.
    expect(requested).toBe(0);
  });

  it('asks the browser only after a tap, then turns the reminder on', async () => {
    await mount(seedData(3));
    await screen.findByText(/daily reminder can tell you/i);

    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));

    await waitFor(() => {
      expect(requested).toBe(1);
    });
    await waitFor(async () => {
      expect((await loadAppData()).settings.reminderEnabled).toBe(true);
    });
    expect(screen.queryByText(/daily reminder can tell you/i)).not.toBeInTheDocument();
  });

  it('never asks twice once declined', async () => {
    const first = await mount(seedData(3));
    await screen.findByText(/daily reminder can tell you/i);
    fireEvent.click(screen.getByRole('button', { name: 'No reminder' }));
    await waitFor(() => {
      expect(screen.queryByText(/daily reminder can tell you/i)).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem(REMINDER_PROMPT_ASKED)).toBe('1');
    first.unmount();

    await mount(seedData(3));
    await waitFor(() => {
      expect(screen.queryByText(/daily reminder can tell you/i)).not.toBeInTheDocument();
    });
  });
});

describe('a missed reminder', () => {
  it('is a line in the app, not a notification hours late', async () => {
    const now = Date.now();
    const twoHoursAgo = now - 2 * 3_600_000;
    window.localStorage.setItem(LAST_REMINDER_AT, String(now - 24 * 3_600_000));

    await mount(
      seedData(3, { reminderEnabled: true, reminderTime: formatClock(twoHoursAgo) }),
    );

    const line = await screen.findByRole('status');
    expect(line).toHaveTextContent(
      `A reminder was due at ${formatClock(twoHoursAgo)}. 12 codes due.`,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss reminder' }));
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('says nothing when the reminder is off', async () => {
    window.localStorage.setItem(REMINDER_PROMPT_ASKED, '1');
    const twoHoursAgo = Date.now() - 2 * 3_600_000;
    await mount(seedData(3, { reminderEnabled: false, reminderTime: formatClock(twoHoursAgo) }));
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });
});
