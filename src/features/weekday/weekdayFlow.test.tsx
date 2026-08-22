import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData, Settings, WeekdayAttempt, WeekdayMode } from '@/domain/types';
import { formatDate, monthDoomsday, trueWeekdayName, weekdayFor } from '@/domain/weekday';
import { buildWeekdayTotals } from '@/domain/weekdayLifetime';
import { closeDb, loadAppData, saveAppData } from '@/storage/db';
import { MAX_WEEKDAY_ATTEMPTS, defaultAppData, monthItemKey } from '@/storage/defaults';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { WeekdayScreen } from '@/routes/WeekdayScreen';
import { nextPaint } from '@/test/paint';
import { theme } from '@/theme/theme';
import { weekdayAbbr } from '@/domain/weekday';

async function deleteDb(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('doomsday-trainer');
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function seed(settings: Partial<Settings> = {}): Promise<void> {
  const data: AppData = defaultAppData(Date.now());
  data.settings = { ...data.settings, onboardingComplete: true, ...settings };
  await saveAppData(data);
  await closeDb();
}

function mount() {
  return render(
    <ThemeProvider theme={theme}>
      <AppStateProvider>
        {/* The app gates every route on the loaded document; so does this. */}
        <AppStateGate>
          <MemoryRouter>
            <WeekdayScreen />
          </MemoryRouter>
        </AppStateGate>
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

/**
 * Pin the random draw. The pool is uniform over 36,525 days, so without this
 * the assertions would have to be about "some date", which tests nothing.
 */
function pinDate(): void {
  vi.spyOn(Math, 'random').mockReturnValue(0);
}

function weekdayAttempt(mode: WeekdayMode, correct: boolean, latencyMs: number): WeekdayAttempt {
  return { timestamp: 1000, fullYear: 1987, month: 3, day: 14, mode, correct, latencyMs, answered: 6 };
}

beforeEach(deleteDb);
afterEach(() => vi.restoreAllMocks());

describe('Weekday trainer', () => {
  it('spells the month out and takes a weekday answer', async () => {
    await seed();
    mount();

    const heading = await screen.findByRole('heading', { level: 1 });
    const label = heading.getAttribute('aria-label') ?? '';
    // "14 March 1987", never "3/14/87".
    expect(label).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
    expect(screen.getByRole('button', { name: 'Sun' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sat' })).toBeInTheDocument();
  });

  it('shows the year code in assisted mode and hides it in unassisted', async () => {
    pinDate();
    await seed();
    mount();

    await screen.findByLabelText(formatDate(2000, 1, 1));
    // 2000-01-01: year code for 00 is 0.
    expect(screen.getByText('0 (XX00)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Unassisted' }));
    await waitFor(() => expect(screen.queryByText('0 (XX00)')).not.toBeInTheDocument());
  });

  it('advances itself after a correct answer', async () => {
    pinDate();
    await seed({ autoAdvanceMs: 0 });
    mount();

    await screen.findByLabelText(formatDate(2000, 1, 1));
    const correct = trueWeekdayName(weekdayFor(2000, 1, 1)).slice(0, 3);
    await tap(correct);
    expect(screen.getByRole('status')).toHaveTextContent('Correct.');

    // A fresh date, and never the one just asked.
    await waitFor(() =>
      expect(screen.queryByLabelText(formatDate(2000, 1, 1))).not.toBeInTheDocument(),
    );
  });

  it('holds an error on screen with the full working until the user continues', async () => {
    pinDate();
    await seed({ autoAdvanceMs: 0 });
    mount();

    await screen.findByLabelText(formatDate(2000, 1, 1));
    const answer = weekdayFor(2000, 1, 1);
    const wrong = trueWeekdayName(((answer + 1) % 7) as 0).slice(0, 3);
    await tap(wrong);

    expect(screen.getByRole('status')).toHaveTextContent(`Incorrect. The answer is ${trueWeekdayName(answer).slice(0, 3)}.`);

    // Five lines of working, with this date's real numbers.
    expect(screen.getByText('Century anchor')).toBeInTheDocument();
    expect(screen.getByText('2000s')).toBeInTheDocument();
    // "Year code" also labels the assisted-mode hint above the date, so this
    // one is scoped to the working table rather than matched app-wide.
    expect(screen.getAllByText('Year code').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Month doomsday')).toBeInTheDocument();
    expect(screen.getByText('January, leap year')).toBeInTheDocument();
    expect(screen.getByText('Day offset')).toBeInTheDocument();
    expect(screen.getByText(`1 - ${monthDoomsday(1, true)}`)).toBeInTheDocument();
    expect(screen.getByText('Weekday')).toBeInTheDocument();
    expect(
      screen.getByText(
        (_text, node) =>
          node?.tagName === 'SPAN' && node.textContent === `${answer}  ${trueWeekdayName(answer)}`,
      ),
    ).toBeInTheDocument();

    // Well past the auto-advance delay: an error must never advance itself.
    await wait(200);
    expect(screen.getByLabelText(formatDate(2000, 1, 1))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument(),
    );
  });

  it('records the attempt and the run without touching any scheduling state', async () => {
    pinDate();
    await seed({ autoAdvanceMs: 0 });
    const { unmount } = mount();

    await screen.findByLabelText(formatDate(2000, 1, 1));
    await tap(trueWeekdayName(weekdayFor(2000, 1, 1)).slice(0, 3));

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.weekdayAttempts).toHaveLength(1);
    });

    const afterAnswer = await loadAppData();
    expect(afterAnswer.weekdayAttempts[0]).toMatchObject({
      fullYear: 2000,
      month: 1,
      day: 1,
      mode: 'assisted',
      correct: true,
    });
    // A weekday answer is not a review of anything.
    expect(afterAnswer.items['0'].repetitions).toBe(0);
    expect(afterAnswer.monthItems[monthItemKey(1)].introduced).toBe(false);
    expect(afterAnswer.monthItems[monthItemKey(1)].repetitions).toBe(0);
    expect(afterAnswer.centuryItems['20'].introduced).toBe(false);

    // Leaving the screen closes the run.
    unmount();
    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.weekdayRuns).toHaveLength(1);
    });
    const final = await loadAppData();
    expect(final.weekdayRuns[0]).toMatchObject({
      mode: 'assisted',
      rangeId: 'century',
      correct: 1,
      total: 1,
    });
  });

  it('never asks the same date twice in one session', async () => {
    await seed({ autoAdvanceMs: 0 });
    mount();

    const seen = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      const heading = await screen.findByRole('heading', { level: 1 });
      const label = heading.getAttribute('aria-label') ?? '';
      expect(seen.has(label)).toBe(false);
      seen.add(label);
      await tap('Sun');
      // Wrong answers need the tap; correct ones advance on their own.
      const cont = screen.queryByRole('button', { name: 'Continue' });
      if (cont) fireEvent.click(cont);
      await waitFor(() =>
        expect(screen.getByRole('heading', { level: 1 }).getAttribute('aria-label')).not.toBe(label),
      );
    }
    expect(seen.size).toBe(12);
  });

  it('orders the pad by the index convention without renaming a day', async () => {
    await seed({ indexConvention: 'monday' });
    mount();

    await screen.findByRole('heading', { level: 1 });
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? '')
      .filter((label) => /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/.test(label));
    expect(labels).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    // Reordered, never renamed: Sunday is still Sunday.
    expect(weekdayAbbr(0, 'sunday')).toBe('Sun');
  });

  it('changes the range and draws from the new one', async () => {
    pinDate();
    await seed();
    mount();

    await screen.findByLabelText(formatDate(2000, 1, 1));
    fireEvent.click(screen.getByRole('radio', { name: 'Full range' }));
    await waitFor(() => expect(screen.getByLabelText(formatDate(1800, 1, 1))).toBeInTheDocument());
  });
});

describe('Tables', () => {
  it('drills a month doomsday and schedules only that item', async () => {
    await seed({ autoAdvanceMs: 0 });
    mount();

    fireEvent.click(await screen.findByRole('button', { name: /Tables/ }));

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('January');
    await nextPaint();
    fireEvent.click(screen.getByRole('button', { name: `Day ${monthDoomsday(1, false)}` }));

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.monthItems[monthItemKey(1)].introduced).toBe(true);
    });
    const stored = await loadAppData();
    expect(stored.monthItems[monthItemKey(1)].repetitions).toBe(1);
    expect(stored.monthItems[monthItemKey(1)].attemptHistory[0].source).toBe('month');
    // Nothing else moved.
    expect(stored.monthItems[monthItemKey(2)].introduced).toBe(false);
    expect(stored.centuryItems['18'].introduced).toBe(false);
    expect(stored.weekdayAttempts).toEqual([]);
  });

  it('offers twelve day buttons, always the same twelve', async () => {
    await seed();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Tables/ }));
    await screen.findByRole('heading', { level: 1 });

    const days = screen.getAllByRole('button').filter((b) => /^Day \d+$/.test(b.getAttribute('aria-label') ?? ''));
    expect(days.map((b) => b.getAttribute('aria-label'))).toEqual(
      [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 28].map((n) => `Day ${n}`),
    );
  });

  it('states the leap rule after a wrong January answer', async () => {
    await seed({ autoAdvanceMs: 0 });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Tables/ }));
    await screen.findByRole('heading', { level: 1 });

    await nextPaint();
    fireEvent.click(screen.getByRole('button', { name: 'Day 28' }));
    expect(await screen.findByText('January 3, and the 4th in a leap year.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('goes back to the dates', async () => {
    await seed();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Tables/ }));
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Dates' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Assisted' })).toBeInTheDocument());
  });
});

describe('Lifetime totals under the pad', () => {
  function block(title: string): HTMLElement {
    return screen.getByRole('heading', { name: title }).parentElement as HTMLElement;
  }

  it('says nothing has been answered rather than showing zeroes', async () => {
    await seed();
    mount();

    await screen.findByRole('heading', { level: 1 });
    // Both blocks, both honest. A zero here would read as a measurement.
    expect(within(block('This session')).getByText('No dates answered yet.')).toBeInTheDocument();
    expect(within(block('All time')).getByText('No dates answered yet.')).toBeInTheDocument();
  });

  it('reads all time from the stored totals, not from the raw log', async () => {
    const data = defaultAppData(Date.now());
    data.settings = { ...data.settings, onboardingComplete: true };
    // The raw log has been trimmed away entirely. The lifetime numbers survive.
    data.weekdayAttempts = [];
    data.weekdayTotals = buildWeekdayTotals([
      weekdayAttempt('assisted', true, 800),
      weekdayAttempt('assisted', true, 900),
      weekdayAttempt('assisted', false, 1100),
      weekdayAttempt('unassisted', false, 9000),
    ]);
    await saveAppData(data);
    await closeDb();
    mount();

    await screen.findByRole('heading', { level: 1 });

    const lifetime = within(block('All time'));
    expect(lifetime.queryByText('No dates answered yet.')).not.toBeInTheDocument();
    const assisted = lifetime.getByText('Assisted').parentElement as HTMLElement;
    expect(within(assisted).getByText('2')).toBeInTheDocument();
    expect(within(assisted).getByText('1')).toBeInTheDocument();
    // Sub-second history, so the median estimate is still sub-second.
    expect(within(assisted).getByText(/^0\.\d\ds$/)).toBeInTheDocument();

    const unassisted = lifetime.getByText('Unassisted').parentElement as HTMLElement;
    // Kept apart: one wrong nine-second answer must not drag the assisted row.
    expect(within(unassisted).getByText('9.0s')).toBeInTheDocument();

    // Nothing has been answered in this sitting.
    expect(within(block('This session')).getByText('No dates answered yet.')).toBeInTheDocument();
  });

  it('counts an answer into both the session and the lifetime totals', async () => {
    pinDate();
    await seed({ autoAdvanceMs: 0 });
    mount();

    await screen.findByLabelText(formatDate(2000, 1, 1));
    await tap(trueWeekdayName(weekdayFor(2000, 1, 1)).slice(0, 3));

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.weekdayTotals.assisted.answered).toBe(1);
    });
    const stored = await loadAppData();
    expect(stored.weekdayTotals.assisted.correct).toBe(1);
    expect(stored.weekdayTotals.unassisted.answered).toBe(0);
    expect(stored.weekdayTotals.assisted.latencyBuckets.reduce((sum, n) => sum + n, 0)).toBe(1);

    await waitFor(() =>
      expect(within(block('This session')).queryByText('No dates answered yet.')).not.toBeInTheDocument(),
    );
    expect(within(block('All time')).queryByText('No dates answered yet.')).not.toBeInTheDocument();
  });

  it('keeps the lifetime numbers when the raw log is trimmed', async () => {
    const history = Array.from({ length: MAX_WEEKDAY_ATTEMPTS }, (_, i) =>
      weekdayAttempt('assisted', true, 700 + (i % 5) * 10),
    );
    const data = defaultAppData(Date.now());
    data.settings = { ...data.settings, onboardingComplete: true, autoAdvanceMs: 0 };
    data.weekdayAttempts = history;
    data.weekdayTotals = buildWeekdayTotals(history);
    await saveAppData(data);
    await closeDb();

    pinDate();
    mount();
    await screen.findByLabelText(formatDate(2000, 1, 1));
    await tap(trueWeekdayName(weekdayFor(2000, 1, 1)).slice(0, 3));

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.weekdayTotals.assisted.answered).toBe(MAX_WEEKDAY_ATTEMPTS + 1);
    });
    const stored = await loadAppData();
    // The raw log lost its oldest entry. The lifetime count did not.
    expect(stored.weekdayAttempts).toHaveLength(MAX_WEEKDAY_ATTEMPTS);
    expect(stored.weekdayTotals.assisted.correct).toBe(MAX_WEEKDAY_ATTEMPTS + 1);
    expect(stored.weekdayTotals.assisted.latencyBuckets.reduce((sum, n) => sum + n, 0)).toBe(
      MAX_WEEKDAY_ATTEMPTS + 1,
    );
  });
});

describe('Weekday stats', () => {
  it('breaks the record down by mode, month and century', async () => {
    const now = Date.now();
    const data = defaultAppData(now);
    data.settings = { ...data.settings, onboardingComplete: true };
    data.weekdayAttempts = [
      { timestamp: now, fullYear: 1987, month: 3, day: 14, mode: 'assisted', correct: true, latencyMs: 2000, answered: 6 },
      { timestamp: now, fullYear: 1987, month: 3, day: 15, mode: 'assisted', correct: false, latencyMs: 8000, answered: 0 },
      { timestamp: now, fullYear: 2024, month: 9, day: 1, mode: 'unassisted', correct: true, latencyMs: 5000, answered: 0 },
    ];
    await saveAppData(data);
    await closeDb();
    mount();

    fireEvent.click(await screen.findByRole('button', { name: /Stats/ }));
    await screen.findByRole('heading', { name: 'Weekday stats' });

    expect(screen.getByText('3 dates answered.')).toBeInTheDocument();

    const modes = screen.getByRole('heading', { name: 'By mode' }).parentElement as HTMLElement;
    expect(within(modes).getByText('Assisted')).toBeInTheDocument();
    // Two assisted attempts, one right: 50%.
    expect(within(modes).getByText('50%')).toBeInTheDocument();

    const months = screen.getByRole('heading', { name: 'By month' }).parentElement as HTMLElement;
    expect(within(months).getAllByText('—').length).toBeGreaterThan(0);
    expect(within(months).getByText('March')).toBeInTheDocument();

    const centuries = screen.getByRole('heading', { name: 'By century' }).parentElement as HTMLElement;
    expect(within(centuries).getByText('1900s')).toBeInTheDocument();
    expect(within(centuries).getByText('2000s')).toBeInTheDocument();
  });
});
