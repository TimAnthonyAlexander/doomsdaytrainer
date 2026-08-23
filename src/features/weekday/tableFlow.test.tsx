import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppData, Settings } from '@/domain/types';
import { monthDoomsday } from '@/domain/weekday';
import { closeDb, loadAppData, saveAppData } from '@/storage/db';
import { defaultAppData, monthItemKey } from '@/storage/defaults';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { DoomsdaysScreen } from '@/routes/DoomsdaysScreen';
import { TablesScreen } from '@/routes/TablesScreen';
import { nextPaint } from '@/test/paint';
import { theme } from '@/theme/theme';

/**
 * The sixteen supporting items, drilled from the grid they now sit behind.
 *
 * These used to be reached from a row under the Weekday screen's answer pad,
 * which on a phone put them below the fold on every visit. Entering through
 * `/doomsdays` rather than rendering the view directly is deliberate: the way
 * in is the part that was broken, so it is the part worth walking.
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

async function seed(settings: Partial<Settings> = {}): Promise<void> {
  const data: AppData = defaultAppData(Date.now());
  data.settings = { ...data.settings, onboardingComplete: true, ...settings };
  await saveAppData(data);
  await closeDb();
}

function mount() {
  return render(
    <ThemeProvider theme={theme}>
      <AppStateProvider>
        {/* The app gates every route on the loaded document; so does this. */}
        <AppStateGate>
          <MemoryRouter initialEntries={['/doomsdays']}>
            <Routes>
              <Route path="/doomsdays" element={<DoomsdaysScreen />} />
              <Route path="/doomsdays/tables" element={<TablesScreen />} />
            </Routes>
          </MemoryRouter>
        </AppStateGate>
      </AppStateProvider>
    </ThemeProvider>,
  );
}

/** Through the tile, and waits for the drill rather than for "an h1". */
async function openTables(): Promise<void> {
  fireEvent.click(await screen.findByRole('link', { name: /Tables/ }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('Doomsdays'),
  );
}

beforeEach(deleteDb);

/** One tap, after the prompt has painted so the timer is running. */
async function tapDay(day: number): Promise<void> {
  await nextPaint();
  fireEvent.click(screen.getByRole('button', { name: `Day ${day}` }));
}

describe('Tables', () => {
  it('drills a month doomsday and schedules only that item', async () => {
    await seed({ autoAdvanceMs: 0 });
    mount();
    await openTables();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('January');
    // January is asked twice: the common year, then the leap year.
    await tapDay(monthDoomsday(1, false));
    await waitFor(() =>
      expect(screen.getByText('Which date is the doomsday in a leap year?')).toBeInTheDocument(),
    );
    await tapDay(monthDoomsday(1, true));

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.monthItems[monthItemKey(1)].introduced).toBe(true);
    });
    const stored = await loadAppData();
    // Two questions, one item, one review. Two would advance the interval
    // twice for a single showing.
    expect(stored.monthItems[monthItemKey(1)].repetitions).toBe(1);
    expect(stored.monthItems[monthItemKey(1)].attemptHistory).toHaveLength(1);
    expect(stored.monthItems[monthItemKey(1)].attemptHistory[0].source).toBe('month');
    expect(stored.monthItems[monthItemKey(1)].attemptHistory[0].correct).toBe(true);
    // Nothing else moved.
    expect(stored.monthItems[monthItemKey(2)].introduced).toBe(false);
    expect(stored.centuryItems['18'].introduced).toBe(false);
    expect(stored.weekdayAttempts).toEqual([]);
  });

  it('writes nothing until both halves of a leap month are answered', async () => {
    await seed({ autoAdvanceMs: 0 });
    mount();
    await openTables();

    await tapDay(monthDoomsday(1, false));
    await waitFor(() =>
      expect(screen.getByText('Which date is the doomsday in a leap year?')).toBeInTheDocument(),
    );
    const stored = await loadAppData();
    expect(stored.monthItems[monthItemKey(1)].introduced).toBe(false);
  });

  it('marks the pair wrong when either half is, and stores the half that failed', async () => {
    await seed({ autoAdvanceMs: 0 });
    mount();
    await openTables();

    await tapDay(28); // Wrong for January in a common year.
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await tapDay(monthDoomsday(1, true)); // Right for the leap year.

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.monthItems[monthItemKey(1)].introduced).toBe(true);
    });
    const stored = await loadAppData();
    const attempt = stored.monthItems[monthItemKey(1)].attemptHistory[0];
    expect(attempt.correct).toBe(false);
    expect(attempt.answered).toBe(28);
  });

  it('offers every day the month has, so every doomsday date can be tapped', async () => {
    await seed();
    mount();
    await openTables();

    const days = screen.getAllByRole('button').filter((b) => /^Day \d+$/.test(b.getAttribute('aria-label') ?? ''));
    expect(days.map((b) => b.getAttribute('aria-label'))).toEqual(
      Array.from({ length: 31 }, (_unused, index) => `Day ${index + 1}`),
    );
  });

  /**
   * The user's anchor is the user's. January 10 is a week past the 3rd, so it
   * is the same weekday and it anchors the day step just as well — it passes
   * without the screen stopping to name the date the table happens to teach.
   */
  it('takes any date that falls on the doomsday, without arguing about it', async () => {
    await seed({ autoAdvanceMs: 0 });
    mount();
    await openTables();

    await tapDay(10);
    await waitFor(() =>
      expect(screen.getByText('Which date is the doomsday in a leap year?')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(screen.queryByText(/is the doomsday in a common year/)).toBeNull();

    await tapDay(11); // A week past the 4th, and the leap half of the same anchor.
    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.monthItems[monthItemKey(1)].attemptHistory[0].correct).toBe(true);
    });
  });

  it('states the answer after a wrong January answer', async () => {
    await seed({ autoAdvanceMs: 0 });
    mount();
    await openTables();

    await tapDay(28);
    expect(
      await screen.findByText(/January 3 is the doomsday in a common year\./),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('goes back to the doomsday grid', async () => {
    await seed();
    mount();
    await openTables();

    fireEvent.click(screen.getByRole('button', { name: 'Doomsdays' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Doomsdays' })).toBeInTheDocument(),
    );
  });
});
