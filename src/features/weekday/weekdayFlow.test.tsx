import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData, Settings, WeekdayAttempt, WeekdayMode } from '@/domain/types';
import { formatDate, monthDoomsday, weekdayName, weekdayFor } from '@/domain/weekday';
import { buildWeekdayTotals } from '@/domain/weekdayLifetime';
import { closeDb, loadAppData, saveAppData } from '@/storage/db';
import { MAX_WEEKDAY_ATTEMPTS, defaultAppData, monthItemKey } from '@/storage/defaults';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { FLIP_MS } from '@/components/ui/SplitFlap';
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

/**
 * Answers the prompt on screen, after the frame that starts its latency clock.
 *
 * That frame is no longer the paint. The date flips into place, and for the
 * length of the flip it is on screen without being readable, so the pad holds
 * its clock and refuses taps until it settles — see `armed` in `AnswerPad`.
 * Answering before then is what a real user's second tap on the previous prompt
 * would be, and the pad is right to drop it.
 */
async function tap(label: string): Promise<void> {
  // Order matters: the flip has to settle first, because arming the pad is what
  // schedules the frame the clock starts on. Waiting for the frame and then for
  // the flip would wait for a frame that had not been asked for yet.
  await wait(FLIP_MS + 20);
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

  it('hides the year code by default and shows it in assisted mode', async () => {
    pinDate();
    await seed();
    mount();

    await screen.findByLabelText(formatDate(2000, 1, 1));
    // Unassisted on a fresh device. The year code is the part the app spent ten
    // decades teaching, so the screen does not hand it over unless asked.
    expect(screen.getByRole('radio', { name: 'Unassisted' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('0 (XX00)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Assisted' }));
    // Still a year in the 2000s, so the code is still 0.
    await waitFor(() => expect(screen.getByText('0 (XX00)')).toBeInTheDocument());
  });

  it('comes back on the mode the user last chose', async () => {
    await seed();
    const first = mount();

    fireEvent.click(await screen.findByRole('radio', { name: 'Assisted' }));
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Assisted' })).toHaveAttribute('aria-checked', 'true'),
    );
    first.unmount();

    mount();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('radio', { name: 'Assisted' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Unassisted' })).toHaveAttribute('aria-checked', 'false');
  });

  it('comes back on the range the user last chose', async () => {
    await seed();
    const first = mount();

    fireEvent.click(await screen.findByRole('radio', { name: 'Living memory' }));
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Living memory' })).toHaveAttribute('aria-checked', 'true'),
    );
    first.unmount();

    mount();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('radio', { name: 'Living memory' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'This century' })).toHaveAttribute('aria-checked', 'false');
  });

  it('advances itself after a correct answer', async () => {
    pinDate();
    await seed({ autoAdvanceMs: 0 });
    mount();

    await screen.findByLabelText(formatDate(2000, 1, 1));
    const correct = weekdayName(weekdayFor(2000, 1, 1)).slice(0, 3);
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
    const wrong = weekdayName(((answer + 1) % 7) as 0).slice(0, 3);
    await tap(wrong);

    expect(screen.getByRole('status')).toHaveTextContent(`Incorrect. The answer is ${weekdayName(answer).slice(0, 3)}.`);

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
          node?.tagName === 'SPAN' && node.textContent === `${answer}  ${weekdayName(answer)}`,
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
    await tap(weekdayName(weekdayFor(2000, 1, 1)).slice(0, 3));

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.weekdayAttempts).toHaveLength(1);
    });

    const afterAnswer = await loadAppData();
    expect(afterAnswer.weekdayAttempts[0]).toMatchObject({
      fullYear: 2000,
      month: 1,
      day: 1,
      mode: 'unassisted',
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
      mode: 'unassisted',
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

  /**
   * A setting used to move Monday into position 0. It renamed the seven buttons
   * and moved no number - every anchor, every code and every worked line stayed
   * Sunday-indexed - so the pad and the rest of the app disagreed about what 0
   * meant. One order now, and the value under a button is the code itself.
   */
  it('puts Sunday first, for everybody', async () => {
    await seed();
    mount();

    await screen.findByRole('heading', { level: 1 });
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? '')
      .filter((label) => /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/.test(label));
    expect(labels).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(weekdayAbbr(0)).toBe('Sun');
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
    await tap(weekdayName(weekdayFor(2000, 1, 1)).slice(0, 3));

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.weekdayTotals.unassisted.answered).toBe(1);
    });
    const stored = await loadAppData();
    expect(stored.weekdayTotals.unassisted.correct).toBe(1);
    // Counted apart by mode, and nothing was answered with the year code given.
    expect(stored.weekdayTotals.assisted.answered).toBe(0);
    expect(stored.weekdayTotals.unassisted.latencyBuckets.reduce((sum, n) => sum + n, 0)).toBe(1);

    await waitFor(() =>
      expect(within(block('This session')).queryByText('No dates answered yet.')).not.toBeInTheDocument(),
    );
    expect(within(block('All time')).queryByText('No dates answered yet.')).not.toBeInTheDocument();
  });

  it('keeps the lifetime numbers when the raw log is trimmed', async () => {
    // Unassisted, the mode the screen opens in, so the one new answer lands on
    // the same row as the seeded history.
    const history = Array.from({ length: MAX_WEEKDAY_ATTEMPTS }, (_, i) =>
      weekdayAttempt('unassisted', true, 700 + (i % 5) * 10),
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
    await tap(weekdayName(weekdayFor(2000, 1, 1)).slice(0, 3));

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.weekdayTotals.unassisted.answered).toBe(MAX_WEEKDAY_ATTEMPTS + 1);
    });
    const stored = await loadAppData();
    // The raw log lost its oldest entry. The lifetime count did not.
    expect(stored.weekdayAttempts).toHaveLength(MAX_WEEKDAY_ATTEMPTS);
    expect(stored.weekdayTotals.unassisted.correct).toBe(MAX_WEEKDAY_ATTEMPTS + 1);
    expect(stored.weekdayTotals.unassisted.latencyBuckets.reduce((sum, n) => sum + n, 0)).toBe(
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
