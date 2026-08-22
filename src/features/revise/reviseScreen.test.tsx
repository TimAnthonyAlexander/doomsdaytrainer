import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createItem, introduce } from '@/domain/scheduler';
import type { AppData, DrillRecord, ItemState } from '@/domain/types';
import { codeFor } from '@/domain/yearCodes';
import { ReviseScreen } from '@/routes/ReviseScreen';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { closeDb, loadAppData, saveAppData } from '@/storage/db';
import { defaultAppData, itemKey } from '@/storage/defaults';
import { nextPaint } from '@/test/paint';
import { theme } from '@/theme/theme';

const NOW = Date.now();

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <AppStateProvider>
          <AppStateGate>{children}</AppStateGate>
        </AppStateProvider>
      </MemoryRouter>
    </ThemeProvider>
  );
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

async function seed(mutate: (data: AppData) => AppData): Promise<void> {
  await saveAppData(mutate(defaultAppData(NOW)));
  await closeDb();
}

function withIntroduced(data: AppData, years: number[]): AppData {
  const items = { ...data.items };
  for (const yy of years) items[itemKey(yy)] = introduce(createItem(yy), NOW);
  return { ...data, items };
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  await deleteDb();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('ReviseScreen before anything has been learned', () => {
  it('sends the user to Learn instead of offering a mode it cannot fill', async () => {
    render(<ReviseScreen />, { wrapper });
    expect(await screen.findByText(/Nothing to revise yet/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Go to Learn' });
    expect(link).toHaveAttribute('href', '/year-codes/learn');
    expect(screen.queryByRole('heading', { name: 'Revise' })).not.toBeInTheDocument();
  });
});

describe('ReviseScreen with a learned block', () => {
  beforeEach(async () => {
    await seed((data) => withIntroduced(data, [40, 41, 42, 43, 44, 45, 46, 47, 48, 49]));
  });

  it('opens on Revise, with the other three modes listed and unselected', async () => {
    render(<ReviseScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Revise' });

    const modes = screen.getByRole('radiogroup', { name: 'Mode' });
    expect(modes).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Revise/ })).toBeChecked();
    for (const label of ['Sprint', 'Gauntlet', 'Decade']) {
      expect(screen.getByRole('radio', { name: new RegExp(`^${label}`) })).not.toBeChecked();
    }
  });

  it('lists the three drills with one line each', async () => {
    render(<ReviseScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Revise' });
    expect(screen.getByText('Sprint')).toBeInTheDocument();
    expect(screen.getByText(/Sixty seconds of codes you have already learned/)).toBeInTheDocument();
    expect(screen.getByText(/All 100 codes of your scope, one pass, timed/)).toBeInTheDocument();
    expect(
      screen.getByText('The ten codes of one decade, timed. Pick the decade.'),
    ).toBeInTheDocument();
  });

  it('says how many codes are due, and that is the Revise line', async () => {
    render(<ReviseScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Revise' });
    expect(screen.getByText('10 codes due now, oldest first.')).toBeInTheDocument();
  });

  it('has no personal best to show yet', async () => {
    render(<ReviseScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Revise' });
    expect(screen.getAllByText('No best yet').length).toBeGreaterThan(0);
  });

  it('reveals the ten decades once Decade is picked, and holds Start shut until one is', async () => {
    const user = userEvent.setup();
    render(<ReviseScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Revise' });

    expect(screen.queryByRole('radiogroup', { name: 'Decade' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /^Decade/ }));
    for (const label of ['00–09', '40–49', '90–99']) {
      expect(screen.getByRole('radio', { name: `Decade ${label}` })).toBeInTheDocument();
    }

    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Decade 40–49' }));
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
  });

  it('counts a run in before the first prompt, and saves nothing if it is aborted', async () => {
    const user = userEvent.setup();
    render(<ReviseScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Revise' });

    await user.click(screen.getByRole('radio', { name: /^Gauntlet/ }));
    await user.click(screen.getByRole('button', { name: 'Start' }));

    // The count-in is showing and the pad cannot be tapped through it.
    expect(screen.getByLabelText('Starting in 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '0' })).toBeDisabled();
    expect(screen.getByText('Gauntlet. 100 codes, the full 100.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abort' }));

    await waitFor(() =>
      expect(screen.getByText('Run aborted. Nothing was saved.')).toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Revise' })).toBeInTheDocument();
    // Back on the menu with the mode still chosen, so a second go is one tap.
    expect(screen.getByRole('radio', { name: /^Gauntlet/ })).toBeChecked();

    const stored = await loadAppData();
    expect(stored.drills).toHaveLength(0);
    for (const item of Object.values(stored.items)) {
      expect(item.attemptHistory).toHaveLength(0);
      expect(item.repetitions).toBe(0);
      expect(item.dueAt).toBe(item.introduced ? NOW : 0);
    }
  });
});

describe('ReviseScreen handing off to a drill', () => {
  const YEARS = Array.from({ length: 10 }, (_unused, i) => 40 + i);

  /** Deliberately odd values, so an accidental reschedule cannot look like a match. */
  function seededItem(yy: number): ItemState {
    return {
      ...introduce(createItem(yy), NOW - 86_400_000),
      easeFactor: 2.31,
      interval: 12,
      dueAt: NOW + 3 * 86_400_000,
      repetitions: 4,
      lapses: 2,
      consecutiveFailures: 1,
      leech: false,
    };
  }

  /** The year currently on the prompt, read the way the user reads it. */
  function promptYear(): number {
    const heading = screen.getByRole('heading', { level: 1 });
    const label = heading.getAttribute('aria-label') ?? '';
    const match = /^Year (\d{2})$/.exec(label);
    if (!match) throw new Error(`No year on the prompt, got "${label}"`);
    return Number(match[1]);
  }

  beforeEach(async () => {
    await seed((data) => {
      const items = { ...data.items };
      for (const yy of YEARS) items[itemKey(yy)] = seededItem(yy);
      return { ...data, items };
    });
  });

  it(
    'runs the decade that was picked, and reschedules nothing on the way through',
    async () => {
      const user = userEvent.setup();
      render(<ReviseScreen />, { wrapper });
      await screen.findByRole('heading', { name: 'Revise' });

      await user.click(screen.getByRole('radio', { name: /^Decade/ }));
      await user.click(screen.getByRole('radio', { name: 'Decade 40–49' }));
      await user.click(screen.getByRole('button', { name: 'Start' }));

      // The drill replaced the menu, and it is the drill that was asked for.
      expect(screen.getByText('Decade 40–49. 10 codes.')).toBeInTheDocument();
      expect(screen.queryByRole('radiogroup', { name: 'Mode' })).not.toBeInTheDocument();

      // Three seconds of count-in, then the ten codes.
      await screen.findByRole('heading', { level: 1 }, { timeout: 6000 });
      for (let i = 0; i < 10; i += 1) {
        // The frame first: the pad refuses a tap until the prompt has painted.
        await nextPaint();
        await user.click(screen.getByRole('button', { name: String(codeFor(promptYear())) }));
      }

      expect(await screen.findByRole('heading', { name: 'Decade 40–49' })).toBeInTheDocument();
      expect(screen.getByText('10 codes, 10 correct.')).toBeInTheDocument();

      await waitFor(async () => expect((await loadAppData()).drills).toHaveLength(1));
      const stored = await loadAppData();
      const reference = seededItem(YEARS[0]);
      for (const yy of YEARS) {
        const item = stored.items[itemKey(yy)];
        expect(item.attemptHistory).toHaveLength(1);
        expect(item.attemptHistory[0].source).toBe('decade');
        expect(item.interval).toBe(reference.interval);
        expect(item.easeFactor).toBe(reference.easeFactor);
        expect(item.dueAt).toBe(reference.dueAt);
        expect(item.repetitions).toBe(reference.repetitions);
        expect(item.lapses).toBe(reference.lapses);
        expect(item.consecutiveFailures).toBe(reference.consecutiveFailures);
      }

      // Done returns to the menu with the same decade still chosen.
      await user.click(screen.getByRole('button', { name: 'Done' }));
      expect(await screen.findByRole('heading', { name: 'Revise' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Decade 40–49' })).toBeChecked();
    },
    20_000,
  );
});

describe('ReviseScreen with a scope that excludes everything learned', () => {
  beforeEach(async () => {
    await seed((data) => ({
      ...withIntroduced(data, [40, 41, 42]),
      settings: { ...data.settings, scopeId: 'modern' },
    }));
  });

  it('turns the sprint off and says why in one line', async () => {
    render(<ReviseScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Revise' });

    expect(
      screen.getByText('No learned codes inside modern, 50 to 99. Learn a block first.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Sprint/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^Gauntlet/ })).toBeEnabled();
  });

  it('sizes the gauntlet to the scope, so its time is comparable to itself', async () => {
    render(<ReviseScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Revise' });
    expect(screen.getByText(/All 50 codes of your scope/)).toBeInTheDocument();
  });
});

describe('ReviseScreen and the trouble drill', () => {
  function withLeeches(data: AppData, years: number[], interval = 1): AppData {
    const items = { ...data.items };
    for (const yy of years) {
      items[itemKey(yy)] = { ...introduce(createItem(yy), NOW), lapses: 7, leech: true, interval };
    }
    return { ...data, items };
  }

  it('stays off the screen while nothing is flagged', async () => {
    await seed((data) => withIntroduced(data, [40, 41, 42]));
    render(<ReviseScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Revise' });
    expect(screen.queryByRole('link', { name: /Trouble spots/ })).not.toBeInTheDocument();
  });

  it('appears once codes are flagged, and links to its own screen', async () => {
    await seed((data) => withLeeches(withIntroduced(data, [40, 41, 42]), [73, 88]));
    render(<ReviseScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Revise' });

    const link = screen.getByRole('link', { name: /Trouble spots/ });
    expect(link).toHaveAttribute('href', '/year-codes/trouble');
    expect(link).toHaveTextContent('2 codes flagged after six lapses');
    // The one drill that does reschedule says so where the others say they do not.
    expect(link).toHaveTextContent('This one does change your schedule.');
    // And it is not a mode: it cannot be selected and Start cannot reach it.
    expect(screen.queryByRole('radio', { name: /Trouble spots/ })).not.toBeInTheDocument();
  });

  it('uses the pool rule of the drill itself, so a recovered code does not count', async () => {
    await seed((data) => withLeeches(withIntroduced(data, [40, 41, 42]), [73], 30));
    render(<ReviseScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Revise' });
    expect(screen.queryByRole('link', { name: /Trouble spots/ })).not.toBeInTheDocument();
  });
});

describe('ReviseScreen personal bests', () => {
  function gauntlet(total: number, score: number): DrillRecord {
    return {
      id: `g${total}-${score}`,
      mode: 'gauntlet',
      decade: null,
      timestamp: NOW - 7_200_000,
      score,
      correct: total,
      total,
      medianLatencyMs: 800,
    };
  }

  it('never shows a 50 code gauntlet time as the best for a 100 code run', async () => {
    await seed((data) => ({
      ...withIntroduced(data, [40, 41, 42]),
      drills: [gauntlet(50, 30_000), gauntlet(100, 92_400)],
    }));

    render(<ReviseScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Revise' });

    // Scope is full, so the comparable set is the 100 code runs.
    expect(screen.getByText('Best 1:32.4')).toBeInTheDocument();
    expect(screen.queryByText('Best 30.0s')).not.toBeInTheDocument();
  });
});
