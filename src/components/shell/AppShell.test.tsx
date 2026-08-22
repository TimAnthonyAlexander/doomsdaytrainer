import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from '@/domain/types';
import { refreshReminderCapability } from '@/features/notifications/capabilityStore';
import { LAST_REMINDER_AT } from '@/features/notifications/deviceFlags';
import { formatClock } from '@/features/notifications/reminderSchedule';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { closeDb, saveAppData } from '@/storage/db';
import { defaultAppData, itemKey } from '@/storage/defaults';
import { theme } from '@/theme/theme';
import { AppShell } from './AppShell';

/**
 * The shell is a frame: one viewport tall, never scrolling, with `main` as the
 * only thing inside it that moves. jsdom has no layout, so the height cannot be
 * asserted — but the structure that produces it can, and the structure is what
 * regressed. A notice bar rendered above the router added its height to a full
 * viewport, which grew the document, brought a scrollbar in on desktop and
 * pushed every screen down by 52px the moment a reminder came due.
 *
 * So: exactly one scroller, the notice bar outside it, and the bottom bar
 * outside it too. Any of the three moving back inside `main` — or the bar
 * moving back above the shell — is the same bug again.
 */

async function deleteDb(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('doomsday-trainer');
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Onboarding finished, twelve codes overdue, and a reminder missed two hours ago. */
function seedMissedReminder(): AppData {
  const now = Date.now();
  const data = defaultAppData(now);
  data.settings = {
    ...data.settings,
    onboardingComplete: true,
    reminderEnabled: true,
    reminderTime: formatClock(now - 2 * 3_600_000),
  };
  for (let yy = 0; yy < 12; yy++) {
    data.items[itemKey(yy)] = {
      ...data.items[itemKey(yy)],
      introduced: true,
      introducedAt: now - 86_400_000,
      dueAt: now - 3_600_000,
    };
  }
  return data;
}

async function mount(data: AppData) {
  await saveAppData(data);
  await closeDb();
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={['/']}>
        <AppStateProvider>
          <AppStateGate>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<p>the screen</p>} />
              </Route>
              <Route path="/welcome" element={<p>onboarding</p>} />
            </Routes>
          </AppStateGate>
        </AppStateProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(async () => {
  await deleteDb();
  window.localStorage.clear();
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: async () => 'default' });
  refreshReminderCapability();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the shell frame', () => {
  it('has one scroller, and the screen is inside it', async () => {
    await mount(seedMissedReminder());
    await screen.findByText('the screen');

    const mains = document.querySelectorAll('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toContainElement(screen.getByText('the screen'));
  });

  it('puts the notice bar in the frame rather than in the scroller', async () => {
    window.localStorage.setItem(LAST_REMINDER_AT, String(Date.now() - 24 * 3_600_000));
    await mount(seedMissedReminder());

    const bar = await screen.findByRole('status');
    expect(bar).toHaveTextContent(/A reminder was due at/);

    const main = document.querySelector('main');
    expect(main).not.toBeNull();
    // Beside the scroller, not in it: the bar's height comes out of `main`, so
    // the frame stays exactly one viewport tall and nothing else moves.
    expect(main).not.toContainElement(bar);
    expect(bar.compareDocumentPosition(main as HTMLElement)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('keeps the bottom bar out of the scroller too', async () => {
    await mount(seedMissedReminder());
    await screen.findByText('the screen');

    const main = document.querySelector('main');
    const bars = document.querySelectorAll('nav[aria-label="Main"]');
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      expect(main).not.toContainElement(bar as HTMLElement);
    }
  });

  it('sends an unfinished onboarding to the welcome screen', async () => {
    const data = defaultAppData(Date.now());
    await mount({ ...data, settings: { ...data.settings, onboardingComplete: false } });

    await screen.findByText('onboarding');
    // No frame at all until onboarding is done, so nothing there has to account
    // for a rail or a bottom bar it never sees.
    expect(document.querySelector('main')).toBeNull();
  });
});
