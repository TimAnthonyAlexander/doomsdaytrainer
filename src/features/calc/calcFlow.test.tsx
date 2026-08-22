import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from '@/domain/types';
import { CalcScreen } from '@/routes/CalcScreen';
import { AppStateProvider } from '@/state/AppStateProvider';
import { closeDb, loadAppData, saveAppData } from '@/storage/db';
import { defaultAppData } from '@/storage/defaults';
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

async function seed(): Promise<void> {
  const data: AppData = defaultAppData(Date.now());
  data.settings = { ...data.settings, onboardingComplete: true };
  await saveAppData(data);
  await closeDb();
}

function mount() {
  return render(
    <ThemeProvider theme={theme}>
      <AppStateProvider>
        <MemoryRouter>
          <CalcScreen />
        </MemoryRouter>
      </AppStateProvider>
    </ThemeProvider>,
  );
}

function press(name: string | RegExp): void {
  fireEvent.click(screen.getByRole('button', { name }));
}

/** Types an arithmetic answer and submits it, after the frame that starts the clock. */
async function type(label: string, value: string): Promise<void> {
  await nextPaint();
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
  press('Check');
}

/** "2 of 3", read off the one element that holds it. Numerals sit in their own spans. */
function progress(): string {
  return screen.getByTestId('calc-progress').textContent ?? '';
}

/** Taps a code on the seven-button pad, after the frame that starts the clock. */
async function tap(code: string): Promise<void> {
  await nextPaint();
  fireEvent.click(screen.getByRole('button', { name: code }));
}

beforeEach(async () => {
  await deleteDb();
  await seed();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Calculate landing', () => {
  it('lists the four paths and says plainly that nothing is measured yet', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'Calculate' })).toBeInTheDocument();
    for (const name of [
      /Learn the method/,
      /The 28-year shortcut/,
      /Practice the whole thing/,
      /Check against memory/,
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/Nothing measured yet/)).toBeInTheDocument();
  });
});

describe('Learn the method', () => {
  it('teaches the division and the discarding as two lessons, not one', async () => {
    mount();
    press(/Learn the method/);

    const titles = ['How many fours fit', 'Throw the leftover away', 'Add the leap days to the year'];
    for (const title of titles) {
      expect(screen.getByRole('button', { name: new RegExp(title) })).toBeInTheDocument();
    }
  });

  it('shows the reason and a worked example before it asks anything', async () => {
    mount();
    press(/Learn the method/);
    press(/How many fours fit/);

    expect(screen.getByRole('heading', { name: 'Why' })).toBeInTheDocument();
    expect(screen.getByText(/A leap day is added every fourth year/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Worked out' })).toBeInTheDocument();
    // Real numbers, named. Not a symbolic example.
    expect(screen.getByText('Year 24')).toBeInTheDocument();
    expect(screen.getAllByText('Whole fours in it').length).toBeGreaterThan(0);
    expect(screen.getByText('6 × 4 = 24')).toBeInTheDocument();
    expect(screen.queryByLabelText('Leap days')).not.toBeInTheDocument();
  });

  it('holds a wrong answer, shows the whole thing worked out, and waits for the right one', async () => {
    mount();
    press(/Learn the method/);
    press(/How many fours fit/);
    press('Practice this step');

    expect(progress()).toBe('1 of 4');
    await type('Leap days', '5');

    expect(screen.getByText(/is not it. Here it is worked out./)).toBeInTheDocument();
    expect(screen.getByText('Because')).toBeInTheDocument();
    expect(screen.getByText('6 × 4 = 24')).toBeInTheDocument();
    // Still the same question.
    expect(progress()).toBe('1 of 4');

    await type('Leap days', '6');
    await waitFor(() => expect(progress()).toBe('2 of 4'));
  });
});

describe('The 28-year shortcut', () => {
  it('shows the repeat with real pairs, then the reason, then what it saves', async () => {
    mount();
    press(/The 28-year shortcut/);

    expect(screen.getByText('Code of 44')).toBeInTheDocument();
    expect(screen.getByText('Code of 16')).toBeInTheDocument();
    expect(screen.getByText('Code of 99')).toBeInTheDocument();
    expect(screen.getByText('Code of 71')).toBeInTheDocument();
    expect(screen.getByText('Leap days inside those years')).toBeInTheDocument();
    expect(screen.getByText('28 + 7 = 35')).toBeInTheDocument();
    expect(screen.getByText(/the only sevens you ever need are 7, 14, 21 and 28/)).toBeInTheDocument();
  });

  it('drills the reduction on its own', async () => {
    mount();
    press(/The 28-year shortcut/);
    press('Practice reducing');

    await type('Year to work with', '17');
    await waitFor(() => expect(progress()).toBe('2 of 4'));
  });
});

describe('Practice the whole thing', () => {
  it('asks three questions straight through and four with reduce-first on', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.735);
    mount();
    press(/Practice the whole thing/);

    expect(progress()).toBe('1 of 3');
    expect(screen.getByText(/73 ÷ 4/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Reduce first' }));
    expect(progress()).toBe('1 of 4');
    expect(screen.getByText(/Take whole 28s out of 73/)).toBeInTheDocument();
  });

  it('times each step on its own and holds a wrong step until it is right', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.735);
    mount();
    press(/Practice the whole thing/);

    await screen.findByTestId('calc-progress');
    await type('Leap days', '19');
    expect(screen.getByText(/is not it/)).toBeInTheDocument();
    expect(screen.getByText('73 ÷ 4 = 18 remainder 1, so 18.')).toBeInTheDocument();
    expect(progress()).toBe('1 of 3');

    await type('Leap days', '18');
    await waitFor(() => expect(progress()).toBe('2 of 3'));
    await type('Year plus leap days', '91');
    await waitFor(() => expect(progress()).toBe('3 of 3'));
    await tap('0');

    expect(await screen.findByText('How long each step took')).toBeInTheDocument();
    expect(screen.getByText(/Leap days · wrong first time/)).toBeInTheDocument();

    await waitFor(async () => {
      const stored = await loadAppData();
      // One record per step, the first attempt only.
      expect(stored.calcAttempts).toHaveLength(3);
      expect(stored.calcAttempts.map((a) => [a.step, a.correct, a.reduced])).toEqual([
        ['leap', false, false],
        ['sum', true, false],
        ['mod', true, false],
      ]);
      expect(stored.calcTotals.leap.answered).toBe(1);
      expect(stored.calcTotals.leap.correct).toBe(0);
    });
  });
});

describe('Check against memory', () => {
  it('takes the code from memory first, then the working, then names the outcome', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.735);
    mount();
    press(/Check against memory/);

    expect(await screen.findByText('Say the code from memory. Do not work it out yet.')).toBeInTheDocument();
    // 73 is 0. Say 3 instead.
    await tap('3');

    expect(await screen.findByText(/Now work it out/)).toBeInTheDocument();
    await type('Leap days', '18');
    await waitFor(() => expect(progress()).toBe('2 of 3'));
    await type('Year plus leap days', '91');
    await waitFor(() => expect(progress()).toBe('3 of 3'));
    await tap('0');

    expect(await screen.findByRole('heading', { name: 'The working caught it' })).toBeInTheDocument();
    expect(screen.getByText('What memory said')).toBeInTheDocument();
    expect(screen.getByText('What the working said')).toBeInTheDocument();
    expect(screen.getByText('The true code')).toBeInTheDocument();

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.verifyTotals.calculationRight).toBe(1);
      expect(stored.verifyAttempts[0]).toMatchObject({ yy: 73, recalled: 3, derived: 0, actual: 0 });
    });
  });

  it('lets the working be wrong, and says so when both were', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.735);
    mount();
    press(/Check against memory/);

    await screen.findByText('Say the code from memory. Do not work it out yet.');
    await tap('3');

    await screen.findByText(/Now work it out/);
    await type('Leap days', '18');
    await waitFor(() => expect(progress()).toBe('2 of 3'));
    await type('Year plus leap days', '91');
    await waitFor(() => expect(progress()).toBe('3 of 3'));
    // Wrong, and not corrected: verify has to be able to reach a wrong answer.
    await tap('5');
    press('Next step');

    expect(await screen.findByRole('heading', { name: 'Both wrong' })).toBeInTheDocument();

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.verifyTotals.bothWrong).toBe(1);
      expect(stored.verifyAttempts[0]).toMatchObject({ recalled: 3, derived: 5, actual: 0 });
    });
  });
});
