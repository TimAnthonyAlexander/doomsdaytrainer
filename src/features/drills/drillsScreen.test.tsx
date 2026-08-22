import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createItem, introduce } from '@/domain/scheduler';
import type { AppData, DrillRecord } from '@/domain/types';
import { DrillsScreen } from '@/routes/DrillsScreen';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { closeDb, saveAppData } from '@/storage/db';
import { defaultAppData, itemKey } from '@/storage/defaults';
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

describe('DrillsScreen before anything has been learned', () => {
  it('sends the user to Learn instead of offering a drill it cannot fill', async () => {
    render(<DrillsScreen />, { wrapper });
    expect(
      await screen.findByText(/Drills ask codes you have already met/),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Go to Learn' });
    expect(link).toHaveAttribute('href', '/learn');
    expect(screen.queryByRole('heading', { name: 'Drills' })).not.toBeInTheDocument();
  });
});

describe('DrillsScreen with a learned block', () => {
  beforeEach(async () => {
    await seed((data) => withIntroduced(data, [40, 41, 42, 43, 44, 45, 46, 47, 48, 49]));
  });

  it('lists the three modes with one line each', async () => {
    render(<DrillsScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Drills' });
    expect(screen.getByText('Sprint')).toBeInTheDocument();
    expect(screen.getByText(/Sixty seconds of codes you have already learned/)).toBeInTheDocument();
    expect(screen.getByText(/All 100 codes of your scope, one pass, timed/)).toBeInTheDocument();
    expect(screen.getByText('The ten codes of one decade, timed. Pick the decade.')).toBeInTheDocument();
  });

  it('has no personal best to show yet', async () => {
    render(<DrillsScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Drills' });
    expect(screen.getAllByText('No best yet').length).toBeGreaterThan(0);
  });

  it('opens the ten decades and marks the bests it has', async () => {
    const user = userEvent.setup();
    render(<DrillsScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Drills' });

    await user.click(screen.getByText('Decade'));
    for (const label of ['00–09', '40–49', '90–99']) {
      expect(screen.getByRole('button', { name: `Decade ${label}` })).toBeInTheDocument();
    }
  });

  it('counts a run in before the first prompt, and saves nothing if it is aborted', async () => {
    const user = userEvent.setup();
    render(<DrillsScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Drills' });

    await user.click(screen.getByText('Gauntlet'));

    // The count-in is showing and the pad cannot be tapped through it.
    expect(screen.getByLabelText('Starting in 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '0' })).toBeDisabled();
    expect(screen.getByText('Gauntlet. 100 codes, the full 100.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abort' }));

    await waitFor(() =>
      expect(screen.getByText('Run aborted. Nothing was saved.')).toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Drills' })).toBeInTheDocument();
  });
});

describe('DrillsScreen with a scope that excludes everything learned', () => {
  beforeEach(async () => {
    await seed((data) => ({
      ...withIntroduced(data, [40, 41, 42]),
      settings: { ...data.settings, scopeId: 'modern' },
    }));
  });

  it('turns the sprint off and says why in one line', async () => {
    render(<DrillsScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Drills' });

    expect(
      screen.getByText('No learned codes inside modern, 50 to 99. Learn a block first.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Sprint').closest('button')).toBeDisabled();
    expect(screen.getByText('Gauntlet').closest('button')).toBeEnabled();
  });

  it('sizes the gauntlet to the scope, so its time is comparable to itself', async () => {
    render(<DrillsScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Drills' });
    expect(screen.getByText(/All 50 codes of your scope/)).toBeInTheDocument();
  });
});

describe('DrillsScreen and the trouble drill', () => {
  function withLeeches(data: AppData, years: number[], interval = 1): AppData {
    const items = { ...data.items };
    for (const yy of years) {
      items[itemKey(yy)] = { ...introduce(createItem(yy), NOW), lapses: 7, leech: true, interval };
    }
    return { ...data, items };
  }

  it('stays out of the list while nothing is flagged', async () => {
    await seed((data) => withIntroduced(data, [40, 41, 42]));
    render(<DrillsScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Drills' });
    expect(screen.queryByRole('link', { name: /Trouble spots/ })).not.toBeInTheDocument();
  });

  it('appears as a fourth row once codes are flagged, and links to the drill', async () => {
    await seed((data) => withLeeches(withIntroduced(data, [40, 41, 42]), [73, 88]));
    render(<DrillsScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Drills' });

    const link = screen.getByRole('link', { name: /Trouble spots/ });
    expect(link).toHaveAttribute('href', '/trouble');
    expect(link).toHaveTextContent('2 codes flagged after six lapses');
    // The one drill that does reschedule says so where the others say they do not.
    expect(link).toHaveTextContent('This one does change your schedule.');
  });

  it('uses the pool rule of the drill itself, so a recovered code does not count', async () => {
    await seed((data) =>
      withLeeches(withIntroduced(data, [40, 41, 42]), [73], 30),
    );
    render(<DrillsScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Drills' });
    expect(screen.queryByRole('link', { name: /Trouble spots/ })).not.toBeInTheDocument();
  });
});

describe('DrillsScreen personal bests', () => {
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

    render(<DrillsScreen />, { wrapper });
    await screen.findByRole('heading', { name: 'Drills' });

    // Scope is full, so the comparable set is the 100 code runs.
    expect(screen.getByText('Best 1:32.4')).toBeInTheDocument();
    expect(screen.queryByText('Best 30.0s')).not.toBeInTheDocument();
  });
});
