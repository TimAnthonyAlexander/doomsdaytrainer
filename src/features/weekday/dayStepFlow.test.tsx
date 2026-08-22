import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppData, Code, DayStepAttempt, Settings } from '@/domain/types';
import { dayStepAnswer } from '@/domain/dayStep';
import { trueWeekdayName } from '@/domain/weekday';
import { buildDayStepTotals } from '@/domain/dayStepLifetime';
import { closeDb, loadAppData, saveAppData } from '@/storage/db';
import { MAX_DAY_STEP_ATTEMPTS, defaultAppData, monthItemKey } from '@/storage/defaults';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { DayStepScreen } from '@/routes/DayStepScreen';
import { DoomsdaysScreen } from '@/routes/DoomsdaysScreen';
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

async function seed(settings: Partial<Settings> = {}, patch: Partial<AppData> = {}): Promise<void> {
  const data: AppData = { ...defaultAppData(Date.now()), ...patch };
  data.settings = { ...data.settings, onboardingComplete: true, autoAdvanceMs: 0, ...settings };
  await saveAppData(data);
  await closeDb();
}

/**
 * The grid and the trainer, on the two addresses the app gives them. Entering
 * through the grid rather than rendering the view directly is the point: the
 * tile's status line and the way in are the parts that broke last time.
 */
function mount() {
  return render(
    <ThemeProvider theme={theme}>
      <AppStateProvider>
        <AppStateGate>
          <MemoryRouter initialEntries={['/doomsdays']}>
            <Routes>
              <Route path="/doomsdays" element={<DoomsdaysScreen />} />
              <Route path="/doomsdays/day-step" element={<DayStepScreen />} />
            </Routes>
          </MemoryRouter>
        </AppStateGate>
      </AppStateProvider>
    </ThemeProvider>,
  );
}

async function openDayStep(): Promise<void> {
  fireEvent.click(await screen.findByRole('link', { name: /Day step/ }));
  // The grid's title is an h1 as well, so waiting for "an h1" would resolve on
  // the screen we just left. Only the prompt carries the sentence.
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('aria-label'),
  );
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function weekdayCode(name: string): Code {
  for (let code = 0; code < 7; code += 1) {
    if (trueWeekdayName(code as Code) === name) return code as Code;
  }
  throw new Error(`Not a weekday: ${name}`);
}

interface Prompt {
  label: string;
  anchorDay: number;
  anchorWeekday: Code;
  targetDay: number;
  answer: Code;
}

/**
 * The prompt as a screen reader gets it. Parsed rather than pinned, because
 * everything needed to answer has to be *on the screen* — if the sentence stops
 * naming the doomsday, its weekday or the day asked for, this stops parsing.
 */
function prompt(): Prompt {
  const label = screen.getByRole('heading', { level: 1 }).getAttribute('aria-label') ?? '';
  const match = /^In ([A-Za-z ]+), the (\d+)(?:st|nd|rd|th) is a ([A-Za-z]+)\. What is the (\d+)(?:st|nd|rd|th)\?$/.exec(
    label,
  );
  if (!match) throw new Error(`The prompt did not read as a sentence: "${label}"`);
  const anchorDay = Number(match[2]);
  const anchorWeekday = weekdayCode(match[3]);
  const targetDay = Number(match[4]);
  return {
    label,
    anchorDay,
    anchorWeekday,
    targetDay,
    // Month and leap year do not change the arithmetic; the three numbers do.
    answer: dayStepAnswer({ month: 1, leapYear: false, anchorDay, anchorWeekday, targetDay }),
  };
}

/** Answers the prompt on screen, after the frame that starts its latency clock. */
async function tap(code: Code): Promise<void> {
  await nextPaint();
  fireEvent.click(screen.getByRole('button', { name: trueWeekdayName(code).slice(0, 3) }));
}

function dayStepAttempt(overrides: Partial<DayStepAttempt> = {}): DayStepAttempt {
  return {
    timestamp: 1000,
    month: 3,
    leapYear: false,
    anchorDay: 14,
    anchorWeekday: 2,
    targetDay: 19,
    size: 5,
    direction: 'forward',
    correct: true,
    latencyMs: 800,
    answered: 0,
    ...overrides,
  };
}

beforeEach(deleteDb);

describe('Day step trainer', () => {
  it('states the doomsday, its weekday and the day asked for', async () => {
    await seed();
    mount();
    await openDayStep();

    const current = prompt();
    expect(current.targetDay).not.toBe(current.anchorDay);
    // The same seven buttons as the date trainer, in the same places.
    expect(screen.getByRole('button', { name: 'Sun' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sat' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('advances itself after a correct answer', async () => {
    await seed();
    mount();
    await openDayStep();

    const current = prompt();
    await tap(current.answer);
    expect(screen.getByRole('status')).toHaveTextContent('Correct.');

    await waitFor(() => expect(prompt().label).not.toBe(current.label));
  });

  it('holds a wrong answer on screen with the working until the user continues', async () => {
    await seed();
    mount();
    await openDayStep();

    const current = prompt();
    const wrong = ((current.answer + 3) % 7) as Code;
    await tap(wrong);

    expect(screen.getByRole('status')).toHaveTextContent(
      `Incorrect. The answer is ${trueWeekdayName(current.answer).slice(0, 3)}.`,
    );

    // Every number behind the answer, each with the label that names it.
    expect(screen.getByText('Month doomsday')).toBeInTheDocument();
    expect(screen.getByText('Day asked for')).toBeInTheDocument();
    expect(screen.getByText('Days from the doomsday')).toBeInTheDocument();
    expect(screen.getByText(`${current.targetDay} - ${current.anchorDay}`)).toBeInTheDocument();
    expect(screen.getByText('Step, mod 7')).toBeInTheDocument();
    expect(screen.getByText('Weekday')).toBeInTheDocument();

    // Well past the auto-advance delay: a wrong answer never advances itself.
    await wait(200);
    expect(prompt().label).toBe(current.label);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(prompt().label).not.toBe(current.label));
  });

  it('records the step with its size and direction, and schedules nothing', async () => {
    await seed();
    mount();
    await openDayStep();

    const current = prompt();
    await tap(current.answer);

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.dayStepAttempts).toHaveLength(1);
    });

    const stored = await loadAppData();
    const attempt = stored.dayStepAttempts[0];
    expect(attempt).toMatchObject({
      anchorDay: current.anchorDay,
      anchorWeekday: current.anchorWeekday,
      targetDay: current.targetDay,
      correct: true,
      answered: current.answer,
    });
    expect(attempt.size).toBe((((current.targetDay - current.anchorDay) % 7) + 7) % 7);
    expect(attempt.direction).toBe(
      current.targetDay > current.anchorDay ? 'forward' : 'backward',
    );

    // A day step is a review of nothing. Not the year codes, and not the month
    // doomsday the prompt handed over.
    expect(stored.dayStepTotals.bySize[attempt.size].answered).toBe(1);
    expect(stored.monthItems[monthItemKey(attempt.month)].introduced).toBe(false);
    expect(stored.monthItems[monthItemKey(attempt.month)].repetitions).toBe(0);
    expect(stored.centuryItems['20'].introduced).toBe(false);
    expect(stored.items['0'].repetitions).toBe(0);
    expect(stored.weekdayAttempts).toEqual([]);
  });

  it('states what happened in the sitting, in numbers', async () => {
    await seed();
    mount();
    await openDayStep();

    expect(screen.getByText('Nothing answered in this sitting.')).toBeInTheDocument();

    const current = prompt();
    await tap(current.answer);
    await waitFor(() =>
      expect(screen.getByText(/^This sitting: 1 step, 0 wrong, median /)).toBeInTheDocument(),
    );
  });

  it('counts a step that ran out of time as a miss and moves on', async () => {
    // Invariant 11: the window may count a miss on a surface that writes no
    // scheduling state, and may never turn "no answer" into an answer.
    await seed({ answerWindowMs: 40 });
    mount();
    await openDayStep();

    const current = prompt();
    await nextPaint();
    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.dayStepAttempts).toHaveLength(1);
    });

    const stored = await loadAppData();
    expect(stored.dayStepAttempts[0].answered).toBeNull();
    expect(stored.dayStepAttempts[0].correct).toBe(false);
    await waitFor(() => expect(prompt().label).not.toBe(current.label));
  });
});

describe('Day step totals', () => {
  it('says nothing has been answered rather than showing zeroes', async () => {
    await seed();
    mount();
    await openDayStep();

    const block = screen.getByRole('heading', { name: 'All time, by step' })
      .parentElement as HTMLElement;
    expect(within(block).getByText('No steps answered yet.')).toBeInTheDocument();
  });

  it('reads all time from the stored aggregate, not from the raw log', async () => {
    const history = [
      dayStepAttempt({ size: 1, direction: 'forward', correct: true, latencyMs: 700 }),
      dayStepAttempt({ size: 1, direction: 'forward', correct: true, latencyMs: 900 }),
      dayStepAttempt({ size: 5, direction: 'backward', correct: false, latencyMs: 9000 }),
    ];
    // The raw log has been trimmed away entirely. The lifetime numbers survive.
    await seed({}, { dayStepAttempts: [], dayStepTotals: buildDayStepTotals(history) });
    mount();
    await openDayStep();

    const sizes = screen.getByRole('heading', { name: 'All time, by step' })
      .parentElement as HTMLElement;
    expect(within(sizes).queryByText('No steps answered yet.')).not.toBeInTheDocument();
    const plusOne = within(sizes).getByText('+1').parentElement as HTMLElement;
    expect(within(plusOne).getByText('2')).toBeInTheDocument();
    expect(within(plusOne).getByText(/^0\.\d\ds$/)).toBeInTheDocument();

    const directions = screen.getByRole('heading', { name: 'All time, by direction' })
      .parentElement as HTMLElement;
    const back = within(directions).getByText('Counting back').parentElement as HTMLElement;
    // Kept apart: one nine-second answer must not drag the +1 row.
    expect(within(back).getByText('9.0s')).toBeInTheDocument();
  });

  it('keeps the lifetime numbers when the raw log is trimmed', async () => {
    const history = Array.from({ length: MAX_DAY_STEP_ATTEMPTS }, (_unused, i) =>
      dayStepAttempt({ latencyMs: 700 + (i % 5) * 10 }),
    );
    await seed({}, { dayStepAttempts: history, dayStepTotals: buildDayStepTotals(history) });
    mount();
    await openDayStep();

    const current = prompt();
    await tap(current.answer);

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.dayStepAttempts).toHaveLength(MAX_DAY_STEP_ATTEMPTS);
    });
    const stored = await loadAppData();
    let answered = 0;
    for (const size of [0, 1, 2, 3, 4, 5, 6] as const) {
      answered += stored.dayStepTotals.bySize[size].answered;
    }
    // The raw log lost its oldest entry. The lifetime count did not.
    expect(answered).toBe(MAX_DAY_STEP_ATTEMPTS + 1);
  });

  it('goes back to the doomsday grid', async () => {
    await seed();
    mount();
    await openDayStep();

    fireEvent.click(screen.getByRole('button', { name: 'Doomsdays' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Doomsdays' })).toBeInTheDocument(),
    );
  });
});
