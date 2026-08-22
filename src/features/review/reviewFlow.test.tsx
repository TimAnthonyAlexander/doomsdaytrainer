import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppData, Settings } from '@/domain/types';
import { closeDb, loadAppData, saveAppData } from '@/storage/db';
import { defaultAppData, itemKey } from '@/storage/defaults';
import { AppStateProvider } from '@/state/AppStateProvider';
import { ReviewScreen } from '@/routes/ReviewScreen';
import { nextPaint } from '@/test/paint';
import { theme } from '@/theme/theme';

interface SeedItem {
  yy: number;
  /** Millis in the past. Smaller is answered first. */
  dueAgo: number;
  consecutiveFailures?: number;
}

async function deleteDb(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('doomsday-trainer');
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function seed(items: SeedItem[], settings: Partial<Settings> = {}): Promise<void> {
  const now = Date.now();
  const data: AppData = defaultAppData(now);
  data.settings = { ...data.settings, onboardingComplete: true, ...settings };
  for (const entry of items) {
    const key = itemKey(entry.yy);
    data.items[key] = {
      ...data.items[key],
      introduced: true,
      introducedAt: now - entry.dueAgo,
      dueAt: now - entry.dueAgo,
      consecutiveFailures: entry.consecutiveFailures ?? 0,
    };
  }
  await saveAppData(data);
  await closeDb();
}

function mount() {
  return render(
    <ThemeProvider theme={theme}>
      <AppStateProvider>
        <MemoryRouter>
          <ReviewScreen />
        </MemoryRouter>
      </AppStateProvider>
    </ThemeProvider>,
  );
}

function pad(label: string): HTMLElement {
  return screen.getByRole('button', { name: label });
}

/** Answers the prompt on screen, after the frame that starts its latency clock. */
async function tap(label: string): Promise<void> {
  await nextPaint();
  fireEvent.click(pad(label));
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

beforeEach(deleteDb);

describe('Review loop', () => {
  it('points at Learn while nothing has been introduced', async () => {
    await seed([]);
    mount();

    const link = await screen.findByRole('link', { name: 'Go to Learn' });
    expect(link).toHaveAttribute('href', '/learn');
  });

  it('shows the oldest due item first and moves on after a correct answer', async () => {
    await seed([
      { yy: 40, dueAgo: 9000 },
      { yy: 73, dueAgo: 4000 },
    ]);
    mount();

    await screen.findByLabelText('Year 40');
    expect(screen.getByText('0 / 2')).toBeInTheDocument();

    await tap('1');
    expect(screen.getByRole('status')).toHaveTextContent('Correct.');

    await waitFor(() => expect(screen.getByLabelText('Year 73')).toBeInTheDocument());
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('holds an error on screen until the user taps Continue', async () => {
    await seed([{ yy: 73, dueAgo: 4000 }]);
    mount();

    await screen.findByLabelText('Year 73');
    await tap('5');

    expect(screen.getByRole('status')).toHaveTextContent('Incorrect. The answer is 0.');
    expect(screen.getByText('73 → 0')).toBeInTheDocument();

    // Well past the auto-advance delay: an error must never advance itself.
    await wait(400);
    expect(screen.getByLabelText('Year 73')).toBeInTheDocument();
    const cont = screen.getByRole('button', { name: 'Continue' });

    fireEvent.click(cont);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument(),
    );
    // A lapse resets the interval, so the same year comes straight back.
    expect(screen.getByLabelText('Year 73')).toBeInTheDocument();

    const stored = await loadAppData();
    const item = stored.items[itemKey(73)];
    expect(item.lapses).toBe(1);
    expect(item.interval).toBe(0);
    expect(item.attemptHistory).toHaveLength(1);
    expect(item.attemptHistory[0]).toMatchObject({ correct: false, answered: 5, source: 'review' });
  });

  it('caps the grade at 3 when a hint was opened', async () => {
    await seed([{ yy: 73, dueAgo: 4000 }]);
    mount();

    await screen.findByLabelText('Year 73');
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    expect(screen.getByText(/Block 72/)).toBeInTheDocument();

    await tap('0');

    await waitFor(async () => {
      const stored = await loadAppData();
      const item = stored.items[itemKey(73)];
      expect(item.attemptHistory[0]?.hintUsed).toBe(true);
      // Grade 3, not 5: ease drops from 2.5 rather than rising.
      expect(item.easeFactor).toBeCloseTo(2.36, 5);
    });
  });

  it('shows the structural hint unasked once an item keeps failing', async () => {
    await seed([{ yy: 73, dueAgo: 4000, consecutiveFailures: 2 }]);
    mount();

    await screen.findByLabelText('Year 73');
    expect(screen.getByText(/Block 72/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hint' })).not.toBeInTheDocument();

    await tap('0');

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.items[itemKey(73)].attemptHistory[0]?.hintUsed).toBe(true);
    });
  });

  it('states the session in numbers once the queue empties', async () => {
    await seed([{ yy: 73, dueAgo: 4000 }]);
    mount();

    await screen.findByLabelText('Year 73');
    await tap('0');

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        /^1 review, 0 wrong, median /,
      ),
    );
    expect(screen.getByText(/Next code due tomorrow\./)).toBeInTheDocument();

    const stored = await loadAppData();
    expect(stored.days[Object.keys(stored.days)[0]].reviewsCompleted).toBe(1);
  });

  it('takes keyboard answers on the number row', async () => {
    await seed([{ yy: 73, dueAgo: 4000 }]);
    mount();

    await screen.findByLabelText('Year 73');
    await nextPaint();
    fireEvent.keyDown(window, { key: '0', code: 'Digit0' });

    expect(screen.getByRole('status')).toHaveTextContent('Correct.');
  });
});
