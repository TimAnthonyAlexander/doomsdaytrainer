import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppData, Settings } from '@/domain/types';
import { codeFor } from '@/domain/yearCodes';
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

  it('holds an error on screen until the user taps the right code', async () => {
    await seed([{ yy: 73, dueAgo: 4000 }]);
    mount();

    await screen.findByLabelText('Year 73');
    await tap('5');

    expect(screen.getByRole('status')).toHaveTextContent('Incorrect. The answer is 0.');
    // The answer is shown under a label, and so is what the user tapped.
    expect(screen.getByText(/You tapped/)).toBeInTheDocument();

    // Well past the auto-advance delay: an error must never advance itself.
    await wait(400);
    expect(screen.getByLabelText('Year 73')).toBeInTheDocument();

    // A wrong code does not move on either. Only the right one does.
    await tap('4');
    await wait(200);
    expect(screen.getByLabelText('Year 73')).toBeInTheDocument();
    expect(screen.getByText(/You tapped/)).toBeInTheDocument();

    await tap('0');
    await waitFor(() => expect(screen.queryByText(/You tapped/)).not.toBeInTheDocument());
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
    // The default hint is the arithmetic one now. Structural told the user to
    // find the block and count up from its first year, which is the counting
    // strategy the trainer is trying to starve.
    expect(screen.getByText(/73 \+ 18 = 91/)).toBeInTheDocument();

    await tap('0');

    await waitFor(async () => {
      const stored = await loadAppData();
      const item = stored.items[itemKey(73)];
      expect(item.attemptHistory[0]?.hintUsed).toBe(true);
      // Grade 3, not 5: ease drops from 2.5 rather than rising.
      expect(item.easeFactor).toBeCloseTo(2.36, 5);
    });
  });

  it('shows the hint unasked once an item keeps failing', async () => {
    await seed([{ yy: 73, dueAgo: 4000, consecutiveFailures: 2 }]);
    mount();

    await screen.findByLabelText('Year 73');
    // The default hint is the arithmetic one now. Structural told the user to
    // find the block and count up from its first year, which is the counting
    // strategy the trainer is trying to starve.
    expect(screen.getByText(/73 \+ 18 = 91/)).toBeInTheDocument();
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

  it('passes over the rest of a decade once one of its years has been asked', async () => {
    // 63 is oldest, so it leads. 64 is due next by age, but answering it right
    // after 63 is a +1 step rather than a recall, so the queue reaches past it.
    // Anki buries siblings for the same reason; these are cousins.
    await seed([
      { yy: 63, dueAgo: 9000 },
      { yy: 64, dueAgo: 8000 },
      { yy: 12, dueAgo: 3000 },
    ]);
    mount();

    await screen.findByLabelText('Year 63');
    await tap(String(codeFor(63)));
    await waitFor(() => expect(screen.getByLabelText('Year 12')).toBeInTheDocument());

    await tap(String(codeFor(12)));
    await waitFor(() => expect(screen.getByLabelText('Year 64')).toBeInTheDocument());
  });

  it('asks a buried year anyway rather than ending the session early', async () => {
    // A narrow scope makes an all-cousins queue routine. Burying is a
    // preference; it is never a reason to stop asking.
    await seed([
      { yy: 63, dueAgo: 9000 },
      { yy: 64, dueAgo: 8000 },
    ]);
    mount();

    await screen.findByLabelText('Year 63');
    await tap(String(codeFor(63)));
    await waitFor(() => expect(screen.getByLabelText('Year 64')).toBeInTheDocument());
  });
});

describe('the optional answer window', () => {
  it('is off by default, so a slow answer is still the user’s answer', async () => {
    await seed([{ yy: 73, dueAgo: 4000 }]);
    mount();

    await screen.findByLabelText('Year 73');
    await wait(300);
    expect(screen.queryByText(/73 \+ 18 = 91/)).not.toBeInTheDocument();

    await tap(String(codeFor(73)));
    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.items[itemKey(73)].attemptHistory[0]?.hintUsed).toBe(false);
    });
  });

  it('running out shows the hint and records nothing at all', async () => {
    await seed([{ yy: 73, dueAgo: 4000 }], { answerWindowMs: 100 });
    mount();

    await screen.findByLabelText('Year 73');
    await wait(400);

    // The hint is on screen and the year has not moved.
    expect(screen.getByText(/73 \+ 18 = 91/)).toBeInTheDocument();
    expect(screen.getByLabelText('Year 73')).toBeInTheDocument();

    // Nothing was written. A window that scored a tap would be recording a
    // forced guess, wrong six times in seven on a seven-button pad.
    const stored = await loadAppData();
    expect(stored.items[itemKey(73)].attemptHistory).toHaveLength(0);
    expect(stored.items[itemKey(73)].repetitions).toBe(0);
  });

  it('still takes the answer after the window, capped at grade 3 by the hint', async () => {
    await seed([{ yy: 73, dueAgo: 4000 }], { answerWindowMs: 100 });
    mount();

    await screen.findByLabelText('Year 73');
    await wait(400);
    await tap(String(codeFor(73)));

    await waitFor(async () => {
      const stored = await loadAppData();
      const item = stored.items[itemKey(73)];
      expect(item.attemptHistory).toHaveLength(1);
      expect(item.attemptHistory[0].hintUsed).toBe(true);
      // Grade 3: ease drops from 2.5 rather than rising.
      expect(item.easeFactor).toBeCloseTo(2.36, 5);
      // And a hinted answer can never count towards fluency.
      expect(item.fluency.consecutiveFast).toBe(0);
      expect(item.fluency.fluent).toBe(false);
    });
  });
});
