import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppData, ItemState, Settings } from '@/domain/types';
import { NUMERIC_SETTLE_MS } from '@/components/ui/NumericText';
import { closeDb, loadAppData, saveAppData } from '@/storage/db';
import { defaultAppData, itemKey } from '@/storage/defaults';
import { AppStateProvider } from '@/state/AppStateProvider';
import { TroubleScreen } from '@/routes/TroubleScreen';
import { nextPaint } from '@/test/paint';
import { theme } from '@/theme/theme';

async function deleteDb(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('doomsday-trainer');
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function seed(
  entries: Array<{ yy: number } & Partial<ItemState>>,
  settings: Partial<Settings> = {},
): Promise<void> {
  const now = Date.now();
  const data: AppData = defaultAppData(now);
  data.settings = { ...data.settings, onboardingComplete: true, ...settings };
  for (const entry of entries) {
    const key = itemKey(entry.yy);
    data.items[key] = { ...data.items[key], introduced: true, introducedAt: now, dueAt: now, ...entry };
  }
  await saveAppData(data);
  await closeDb();
}

function mount() {
  return render(
    <ThemeProvider theme={theme}>
      <AppStateProvider>
        <MemoryRouter>
          <TroubleScreen />
        </MemoryRouter>
      </AppStateProvider>
    </ThemeProvider>,
  );
}

function pad(label: string): HTMLElement {
  return screen.getByRole('button', { name: label });
}

/**
 * Answers the prompt on screen, after the frame that starts its latency
 * clock.
 *
 * Order matters: the transition has to settle first, because arming the pad
 * is what schedules the frame the clock starts on. See weekdayFlow.test.tsx.
 */
async function tap(label: string): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, NUMERIC_SETTLE_MS + 20));
  });
  await nextPaint();
  fireEvent.click(pad(label));
}

beforeEach(deleteDb);

describe('Trouble spots', () => {
  it('says so plainly when nothing is flagged', async () => {
    await seed([{ yy: 73, lapses: 2 }]);
    mount();

    expect(await screen.findByText(/A code lands here after six lapses/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Year 73')).not.toBeInTheDocument();
  });

  it('drills the worst item first with its block already on screen', async () => {
    await seed([
      { yy: 73, lapses: 6, leech: true },
      { yy: 40, lapses: 8, leech: true },
    ]);
    mount();

    await screen.findByLabelText('Year 40');
    expect(screen.getByText('40 sits in the block 40–43.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hint' })).not.toBeInTheDocument();
    expect(screen.getByText('0 / 2')).toBeInTheDocument();
  });

  it('leaves out an item whose interval has reached ten days', async () => {
    await seed([
      { yy: 73, lapses: 9, leech: true, interval: 12 },
      { yy: 40, lapses: 6, leech: true, interval: 1 },
    ]);
    mount();

    await screen.findByLabelText('Year 40');
    expect(screen.getByText('0 / 1')).toBeInTheDocument();
    expect(screen.getByText(/leaves this list once its interval reaches 10 days/)).toBeInTheDocument();
  });

  it('records the answer as trouble-sourced and reschedules it at grade 3', async () => {
    await seed([{ yy: 73, lapses: 6, leech: true }]);
    mount();

    await screen.findByLabelText('Year 73');
    await tap('0');

    await waitFor(async () => {
      const stored = await loadAppData();
      const item = stored.items[itemKey(73)];
      expect(item.attemptHistory).toHaveLength(1);
      expect(item.attemptHistory[0]).toMatchObject({
        correct: true,
        source: 'trouble',
        hintUsed: true,
      });
      // Grade 3, so the ease drops even though the answer was instant.
      expect(item.easeFactor).toBeCloseTo(2.36, 5);
      expect(item.repetitions).toBe(1);
      expect(item.interval).toBe(1);
      // The flag and the history stay put; only the interval can end the drill.
      expect(item.leech).toBe(true);
      expect(item.lapses).toBe(6);
    });
  });

  it('counts a wrong answer as another lapse and waits for the right code', async () => {
    await seed([{ yy: 73, lapses: 6, leech: true }]);
    mount();

    await screen.findByLabelText('Year 73');
    await tap('5');

    expect(screen.getByRole('status')).toHaveTextContent('Incorrect. The answer is 0.');
    expect(screen.getByText(/You tapped/)).toBeInTheDocument();

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.items[itemKey(73)].lapses).toBe(7);
    });

    // Another wrong code holds; only the right one moves on.
    await tap('4');
    expect(screen.getByLabelText('Year 73')).toBeInTheDocument();
    await tap('0');
    // One pass per session: the item does not come straight back.
    await waitFor(() => expect(screen.queryByLabelText('Year 73')).not.toBeInTheDocument());
    expect(screen.getByText(/answered,/)).toBeInTheDocument();
  });
});
