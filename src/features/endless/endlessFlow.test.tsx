import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { NUMERIC_SETTLE_MS } from '@/components/ui/NumericText';
import { createItem, introduce } from '@/domain/scheduler';
import type { AppData, ItemState, Settings } from '@/domain/types';
import { codeFor } from '@/domain/yearCodes';
import { YearCodesScreen } from '@/routes/YearCodesScreen';
import { EndlessScreen } from '@/routes/EndlessScreen';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { closeDb, loadAppData, saveAppData } from '@/storage/db';
import { defaultAppData, itemKey } from '@/storage/defaults';
import { nextPaint } from '@/test/paint';
import { theme } from '@/theme/theme';

const NOW = Date.now();

async function deleteDb(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('doomsday-trainer');
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function seed(years: number[], settings: Partial<Settings> = {}): Promise<void> {
  const data: AppData = defaultAppData(NOW);
  data.settings = { ...data.settings, onboardingComplete: true, autoAdvanceMs: 0, ...settings };
  for (const yy of years) data.items[itemKey(yy)] = introduce(createItem(yy), NOW);
  await saveAppData(data);
  await closeDb();
}

/**
 * Mounted through the grid rather than by rendering the view, because the way
 * in is a part of this that can break on its own — see the day-step tests,
 * where exactly that was the defect.
 */
function mount(at = '/year-codes') {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[at]}>
        <AppStateProvider>
          <AppStateGate>
            <Routes>
              <Route path="/year-codes" element={<YearCodesScreen />} />
              <Route path="/year-codes/endless" element={<EndlessScreen />} />
            </Routes>
          </AppStateGate>
        </AppStateProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

/** The two-digit year currently on screen, read off the prompt's own label. */
function askedYear(): number {
  const label = screen.getByTestId('endless-prompt').getAttribute('aria-label') ?? '';
  const match = /Year (\d{2})/.exec(label);
  if (!match) throw new Error(`No year in prompt label: ${label}`);
  return Number(match[1]);
}

/**
 * Answers the prompt on screen, after the frame that starts its latency clock.
 *
 * Order matters: the transition has to settle first, because arming the pad is
 * what schedules the frame the clock starts on. See weekdayFlow.test.tsx.
 */
async function tap(label: string): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, NUMERIC_SETTLE_MS + 20));
  });
  await nextPaint();
  fireEvent.click(screen.getByRole('button', { name: label }));
}

/** Answers the year on screen correctly and returns which year that was. */
async function answerRight(): Promise<number> {
  const yy = askedYear();
  await tap(String(codeFor(yy)));
  return yy;
}

function scheduling(item: ItemState) {
  const { interval, easeFactor, dueAt, repetitions, lapses, introduced, fluency } = item;
  return { interval, easeFactor, dueAt, repetitions, lapses, introduced, fluency };
}

beforeEach(deleteDb);

describe('Endless', () => {
  it('is reached from the Year codes grid', async () => {
    await seed([40, 41, 42]);
    mount();

    fireEvent.click(await screen.findByRole('link', { name: /^Endless/ }));
    await screen.findByTestId('endless-prompt');
    expect(askedYear()).toBeGreaterThanOrEqual(40);
  });

  it('sends the user to Learn when nothing has been introduced', async () => {
    await seed([]);
    mount('/year-codes/endless');

    expect(await screen.findByText(/Learn a decade block and those ten codes join the pass/)).toBeInTheDocument();
    expect(screen.queryByTestId('endless-prompt')).not.toBeInTheDocument();
  });

  it('asks only years that are both introduced and in scope', async () => {
    await seed([60, 61, 62, 40], { scopeId: 'modern' });
    mount('/year-codes/endless');
    await screen.findByTestId('endless-prompt');

    // Modern is 50–99. Three prompts is enough to leave the 40's decade: the
    // pool has three years in it, so a fourth answer starts a second cycle.
    for (let i = 0; i < 3; i += 1) {
      const yy = await answerRight();
      expect([60, 61, 62]).toContain(yy);
    }
  });

  it('keeps going once every year in the pool has been answered', async () => {
    await seed([40, 41]);
    mount('/year-codes/endless');
    await screen.findByTestId('endless-prompt');

    const seen: number[] = [];
    for (let i = 0; i < 5; i += 1) seen.push(await answerRight());

    expect(seen).toHaveLength(5);
    expect(screen.getByTestId('endless-prompt')).toBeInTheDocument();
  });

  it('records what was answered without moving any scheduling field', async () => {
    await seed([40, 41, 42]);
    mount('/year-codes/endless');
    await screen.findByTestId('endless-prompt');

    const before = await loadAppData();
    const yy = await answerRight();

    await waitFor(async () => {
      const stored = await loadAppData();
      const item = stored.items[itemKey(yy)];
      expect(item.attemptHistory).toHaveLength(1);
      expect(item.attemptHistory[0]).toMatchObject({
        correct: true,
        source: 'endless',
        hintUsed: false,
        answered: codeFor(yy),
      });
      // Every field the scheduler owns, one by one. Invariant 4's contract is
      // what makes this surface safe to sit on for an hour.
      expect(scheduling(item)).toEqual(scheduling(before.items[itemKey(yy)]));
      expect(stored.days).toEqual(before.days);
      expect(stored.drills).toEqual(before.drills);
    });
  });

  it('holds a wrong tap on the same year and names all three numbers', async () => {
    await seed([40, 41, 42]);
    mount('/year-codes/endless');
    await screen.findByTestId('endless-prompt');

    const yy = askedYear();
    const right = codeFor(yy);
    const wrong = ((right + 1) % 7) as number;
    await tap(String(wrong));

    expect(askedYear()).toBe(yy);
    expect(screen.getByText(/Tap the right one to go on/)).toBeInTheDocument();

    // The year, the code it has and the code that was tapped, each named.
    const correction = screen.getByText(/Tap the right one to go on/);
    expect(correction).toHaveTextContent(`${String(yy).padStart(2, '0')} is ${right}, not ${wrong}`);

    // Another wrong code holds too; only the right one moves on.
    await tap(String(((right + 2) % 7)));
    expect(askedYear()).toBe(yy);
    await tap(String(right));
    await waitFor(() => expect(askedYear()).not.toBe(yy));
  });

  it('counts the wrong tap in the sitting and still leaves the schedule alone', async () => {
    await seed([40, 41, 42]);
    mount('/year-codes/endless');
    await screen.findByTestId('endless-prompt');

    const before = await loadAppData();
    const yy = askedYear();
    await tap(String((codeFor(yy) + 1) % 7));

    await waitFor(async () => {
      const stored = await loadAppData();
      const item = stored.items[itemKey(yy)];
      expect(item.attemptHistory).toHaveLength(1);
      expect(item.attemptHistory[0].correct).toBe(false);
      expect(scheduling(item)).toEqual(scheduling(before.items[itemKey(yy)]));
    });

    expect(screen.getByText(/This sitting: 1 answered, 1 wrong/)).toBeInTheDocument();
  });

  it('says nothing rather than showing zeroes before the first answer', async () => {
    await seed([40, 41, 42]);
    mount('/year-codes/endless');
    await screen.findByTestId('endless-prompt');

    expect(screen.getByText('Nothing answered in this sitting.')).toBeInTheDocument();
  });

  it('says on the screen that it does not touch when a code is next due', async () => {
    // It is the same year and the same seven buttons as Revise, one tile over.
    await seed([40, 41, 42]);
    mount('/year-codes/endless');

    expect(
      await screen.findByText(/Nothing here changes when a code is next due/),
    ).toBeInTheDocument();
  });
});
