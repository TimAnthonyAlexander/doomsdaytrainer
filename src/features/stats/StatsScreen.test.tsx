import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData, Attempt, ItemState } from '@/domain/types';
import { emptyFluency } from '@/domain/fluency';
import { createItem, introduce } from '@/domain/scheduler';
import { addDays, dayKey } from '@/domain/time';
import { StatsScreen } from '@/routes/StatsScreen';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { closeDb, saveAppData } from '@/storage/db';
import { defaultAppData, itemKey } from '@/storage/defaults';
import { theme } from '@/theme/theme';

/**
 * Renders the real screen against the real storage layer. The point is the two
 * ends of its life: a day-one install with nothing to draw, and a seeded one.
 */

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

function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    timestamp: NOW,
    correct: true,
    latencyMs: 900,
    answered: 0,
    hintUsed: false,
    source: 'review',
    ...over,
  };
}

async function seed(mutate: (data: AppData) => AppData): Promise<void> {
  await saveAppData(mutate(defaultAppData(NOW)));
  await closeDb();
}

function put(data: AppData, item: ItemState): AppData {
  return { ...data, items: { ...data.items, [itemKey(item.yy)]: item } };
}

async function mount() {
  render(<StatsScreen />, { wrapper });
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Stats' })).toBeInTheDocument());
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

describe('StatsScreen on a fresh install', () => {
  it('still draws all 100 cells, because the grid is the map of what is ahead', async () => {
    await mount();
    const cells = screen.getAllByRole('button', { name: /Not started$/ });
    expect(cells).toHaveLength(100);
  });

  it('shows real zeroes for the counts and a dash where there is no ratio', async () => {
    await mount();
    expect(screen.getByText('Due today').nextSibling).toHaveTextContent('0');
    expect(screen.getByText('Due this week').nextSibling).toHaveTextContent('0');
    expect(screen.getByText('Streak, days').nextSibling).toHaveTextContent('0');
    expect(screen.getByText('Accuracy, review attempts').nextSibling).toHaveTextContent('—');
    expect(screen.getByText('Overall median').nextSibling).toHaveTextContent('—');
  });

  it('says plainly that the chart has nothing to draw', async () => {
    await mount();
    expect(screen.getByText(/Not enough data yet/)).toBeInTheDocument();
  });

  it('names every one of the seven mastery steps in the legend', async () => {
    await mount();
    // The ramp reports fluency now, not the interval, so the middle steps name
    // what the answer is doing rather than how long it has survived.
    for (const label of [
      'Not started',
      'Introduced',
      'Still slow',
      'One fast answer',
      'Fluent',
      'Fluent, 10–89 days',
      'Fluent, 90 days +',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('Leech, 6+ lapses')).toBeInTheDocument();
    expect(screen.getByText('Outside your scope')).toBeInTheDocument();
  });
});

describe('StatsScreen with a seeded store', () => {
  beforeEach(async () => {
    await seed((data) => {
      let out = data;
      out = put(out, {
        ...introduce(createItem(73), NOW),
        interval: 12,
        repetitions: 4,
        dueAt: addDays(NOW, 3),
        attemptHistory: [
          attempt({ timestamp: addDays(NOW, -2), latencyMs: 1400 }),
          attempt({ timestamp: NOW, latencyMs: 800 }),
          attempt({ timestamp: NOW, latencyMs: 6000, correct: false }),
        ],
      });
      out = put(out, {
        ...introduce(createItem(41), NOW),
        interval: 0,
        lapses: 7,
        leech: true,
        dueAt: NOW - 1000,
        attemptHistory: [attempt({ timestamp: NOW, latencyMs: 4000, correct: false })],
      });
      const today = dayKey(NOW);
      const yesterday = dayKey(addDays(NOW, -1));
      return {
        ...out,
        settings: { ...out.settings, scopeId: 'modern' },
        days: {
          [today]: { date: today, reviewsCompleted: 4, newItemsIntroduced: 0 },
          [yesterday]: { date: yesterday, reviewsCompleted: 9, newItemsIntroduced: 10 },
        },
      };
    });
  });

  it('reports accuracy over the attempts it actually has', async () => {
    await mount();
    // Four review attempts on record, two of them wrong.
    expect(screen.getByText('Accuracy, last 4 review attempts').nextSibling).toHaveTextContent('50%');
  });

  it('counts the streak and the due items inside the chosen scope', async () => {
    await mount();
    expect(screen.getByText('Streak, days').nextSibling).toHaveTextContent('2');
    // 41 is overdue but the Modern scope starts at 50, so it does not count.
    expect(screen.getByText('Due today').nextSibling).toHaveTextContent('0');
    expect(screen.getByText('Due this week').nextSibling).toHaveTextContent('1');
  });

  it('marks the leech and the out-of-scope years in the cell labels', async () => {
    await mount();
    expect(screen.getByRole('button', { name: '41, Introduced, 7 lapses, outside scope' })).toBeInTheDocument();
    // 73 holds a twelve-day interval and used to read as "10–29 days" on that
    // alone. It has never been answered fast, so the grid says so instead.
    expect(screen.getByRole('button', { name: '73, Still slow' })).toBeInTheDocument();
  });

  it('separates a fluent year from one held up only by its interval', async () => {
    // Seeded on top of the fixture, so 73 is still the slow twelve-day item and
    // 88 differs from it in one field only.
    await seed((data) => {
      const slow: ItemState = {
        ...introduce(createItem(73), NOW),
        interval: 12,
        repetitions: 4,
        dueAt: addDays(NOW, 3),
      };
      return put(put(data, slow), {
        ...slow,
        yy: 88,
        fluency: { ...emptyFluency(), consecutiveFast: 2, fluent: true, fluentAt: NOW },
      });
    });
    await mount();
    expect(screen.getByRole('button', { name: '73, Still slow' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '88, Fluent, 10–89 days' })).toBeInTheDocument();
  });

  it('opens per-item detail on a tap and closes again', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole('button', { name: '73, Still slow' }));

    const sheet = await screen.findByRole('presentation');
    expect(within(sheet).getByRole('heading', { name: 'Year 73' })).toBeInTheDocument();
    expect(within(sheet).getByText('Interval').nextSibling).toHaveTextContent('12 days');
    expect(within(sheet).getByText('Next due').nextSibling).toHaveTextContent('In 3 days');
    expect(within(sheet).getByText('Median latency').nextSibling).toHaveTextContent('1.4s');
    expect(within(sheet).getByText(/Last 3 attempts/)).toBeInTheDocument();
    expect(within(sheet).getAllByText('Correct')).toHaveLength(2);
    expect(within(sheet).getAllByText('Wrong')).toHaveLength(1);

    await user.click(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Year 73' })).not.toBeInTheDocument());
  });

  it('reports a per-decade median only for the decades that were reviewed', async () => {
    await mount();
    expect(screen.getByText('40–49').nextSibling).toHaveTextContent('4.0s');
    expect(screen.getByText('70–79').nextSibling).toHaveTextContent('1.4s');
    expect(screen.getByText('00–09').nextSibling).toHaveTextContent('—');
  });

  it('keeps the trouble link away while the only leech is outside the scope', async () => {
    await mount();
    // 41 has seven lapses, but the Modern scope starts at 50 and the drill
    // would open empty.
    expect(screen.queryByRole('link', { name: 'Trouble spots' })).not.toBeInTheDocument();
  });
});

describe('StatsScreen and the trouble drill', () => {
  it('offers the drill next to the grid once a leech is in scope', async () => {
    await seed((data) =>
      put(data, {
        ...introduce(createItem(88), NOW),
        lapses: 6,
        leech: true,
        interval: 0,
      }),
    );
    await mount();

    const link = screen.getByRole('link', { name: 'Trouble spots' });
    expect(link).toHaveAttribute('href', '/trouble');
    expect(screen.getByText(/1 code is waiting in the trouble drill/)).toBeInTheDocument();
  });
});
