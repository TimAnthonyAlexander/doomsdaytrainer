import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createItem, introduce } from '@/domain/scheduler';
import { dayKey } from '@/domain/time';
import type { AppData } from '@/domain/types';
import { YearCodesScreen } from '@/routes/YearCodesScreen';
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

function withLeeches(data: AppData, years: number[], interval = 1): AppData {
  const items = { ...data.items };
  for (const yy of years) {
    items[itemKey(yy)] = { ...introduce(createItem(yy), NOW), lapses: 7, leech: true, interval };
  }
  return { ...data, items };
}

async function mount() {
  render(<YearCodesScreen />, { wrapper });
  await screen.findByRole('heading', { name: 'Year codes' });
}

const tile = (name: RegExp) => screen.getByRole('link', { name });

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  await deleteDb();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('YearCodesScreen', () => {
  it('says what a year code is before offering anything to do with one', async () => {
    await mount();
    expect(screen.getByText(/turns a century anchor into that year's doomsday/)).toBeInTheDocument();
  });

  it('offers Learn, Revise, Endless and Calc, each pointing under /year-codes', async () => {
    await mount();
    expect(tile(/^Learn/)).toHaveAttribute('href', '/year-codes/learn');
    expect(tile(/^Revise/)).toHaveAttribute('href', '/year-codes/revise');
    expect(tile(/^Endless/)).toHaveAttribute('href', '/year-codes/endless');
    expect(tile(/^Calc/)).toHaveAttribute('href', '/year-codes/calc');
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });

  it('gives each tile one line of what is actually left', async () => {
    await seed((data) => withIntroduced(data, [40, 41, 42, 43, 44, 45, 46, 47, 48, 49]));
    await mount();
    expect(tile(/^Learn/)).toHaveTextContent('9 blocks of ten still to learn.');
    expect(tile(/^Revise/)).toHaveTextContent('10 codes due now, oldest first.');
    expect(tile(/^Endless/)).toHaveTextContent('10 codes learned, asked over and over.');
    expect(tile(/^Calc/)).toHaveTextContent('Work any code out from the year, one step at a time.');
  });

  it('says nothing is due rather than showing a zero', async () => {
    await mount();
    expect(tile(/^Revise/)).toHaveTextContent('Nothing due now.');
  });

  it('keeps Trouble spots off the grid while nothing is flagged', async () => {
    await seed((data) => withIntroduced(data, [40, 41, 42]));
    await mount();
    expect(screen.queryByRole('link', { name: /^Trouble spots/ })).not.toBeInTheDocument();
  });

  it('adds Trouble spots as a fifth tile once codes are flagged', async () => {
    await seed((data) => withLeeches(withIntroduced(data, [40, 41, 42]), [73, 88]));
    await mount();

    const trouble = tile(/^Trouble spots/);
    expect(trouble).toHaveAttribute('href', '/year-codes/trouble');
    expect(trouble).toHaveTextContent('2 codes flagged after six lapses.');
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  it('uses the drill pool rule, so a recovered code does not bring the tile back', async () => {
    await seed((data) => withLeeches(withIntroduced(data, [40, 41, 42]), [73], 30));
    await mount();
    expect(screen.queryByRole('link', { name: /^Trouble spots/ })).not.toBeInTheDocument();
  });

  it('hands the daily cap the Learn line once the allowance is spent', async () => {
    const today = dayKey(NOW);
    await seed((data) => ({
      ...withIntroduced(data, [40, 41, 42]),
      days: {
        ...data.days,
        [today]: { date: today, reviewsCompleted: 0, newItemsIntroduced: 20 },
      },
    }));
    await mount();
    expect(tile(/^Learn/)).toHaveTextContent('Next block unlocks tomorrow.');
  });
});
