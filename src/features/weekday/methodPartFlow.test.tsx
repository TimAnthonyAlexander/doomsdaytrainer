import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData, Settings } from '@/domain/types';
import { datePartAnswer, yearPartAnswer } from '@/domain/methodParts';
import { closeDb, loadAppData, saveAppData } from '@/storage/db';
import { defaultAppData } from '@/storage/defaults';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { WeekdayScreen } from '@/routes/WeekdayScreen';
import { nextPaint } from '@/test/paint';
import { theme } from '@/theme/theme';

/**
 * The method's two halves, reached the way the user reaches them: by switching
 * the trainer on the weekday screen. Entering through the toggle rather than
 * rendering the trainer directly is deliberate — the toggle is the whole
 * feature, and a test that skipped it would pass with the modes unreachable.
 */

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
        <AppStateGate>
          <MemoryRouter>
            <WeekdayScreen />
          </MemoryRouter>
        </AppStateGate>
      </AppStateProvider>
    </ThemeProvider>,
  );
}

/** Pins the draw, so the assertions can be about a known prompt. */
function pinDraw(value: number): void {
  vi.spyOn(Math, 'random').mockReturnValue(value);
}

async function openTrainer(name: 'Year' | 'Date' | 'Full date'): Promise<void> {
  fireEvent.click(await screen.findByRole('radio', { name }));
  await waitFor(() => expect(screen.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true'));
}

/** Answers, after the frame that starts the latency clock. */
async function tapDigit(value: number): Promise<void> {
  await nextPaint();
  fireEvent.click(screen.getByRole('button', { name: String(value) }));
}

beforeEach(deleteDb);
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('the trainer toggle', () => {
  it('offers all three and opens on the full date', async () => {
    await seed();
    mount();
    expect(await screen.findByRole('radio', { name: 'Full date' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Year' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Date' })).toBeInTheDocument();
  });

  /**
   * Assisted hands over the year code, and the year half *is* the year code
   * plus an anchor. Offering help there would be offering the answer.
   */
  it('drops the help toggle on both halves and the range on the date half', async () => {
    await seed();
    mount();
    expect(await screen.findByRole('radio', { name: 'Assisted' })).toBeInTheDocument();

    await openTrainer('Year');
    expect(screen.queryByRole('radio', { name: 'Assisted' })).toBeNull();
    // The year half still draws from a range of years, so that control stays.
    expect(screen.getByRole('radio', { name: 'This century' })).toBeInTheDocument();

    await openTrainer('Date');
    expect(screen.queryByRole('radio', { name: 'Assisted' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'This century' })).toBeNull();
  });

  it('comes back on the half it was left on', async () => {
    await seed();
    const first = mount();
    await openTrainer('Date');
    first.unmount();

    mount();
    expect(await screen.findByRole('radio', { name: 'Date' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});

describe('the year half', () => {
  it('asks for a year and records the answer without touching the date log', async () => {
    await seed({ autoAdvanceMs: 0 });
    pinDraw(0); // The first year of the range: 2000.
    mount();
    await openTrainer('Year');

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('2000');
    await tapDigit(yearPartAnswer({ fullYear: 2000 }));

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.partAttempts).toHaveLength(1);
    });
    const stored = await loadAppData();
    const attempt = stored.partAttempts[0];
    expect(attempt.part).toBe('year');
    expect(attempt).toMatchObject({ fullYear: 2000, correct: true });
    // The 2000s anchor, and nothing else on the document, moved.
    expect(stored.partTotals.yearByCentury['20'].answered).toBe(1);
    expect(stored.partTotals.yearByCentury['19'].answered).toBe(0);
    expect(stored.weekdayAttempts).toEqual([]);
  });

  /**
   * Neither half is a fixed item set, so neither one schedules. A wrong year
   * half cannot even say whether the anchor or the code was the miss, which is
   * the same reason a wrong full date never touches them either.
   */
  it('schedules nothing at all', async () => {
    await seed({ autoAdvanceMs: 0 });
    pinDraw(0);
    mount();
    await openTrainer('Year');

    const before = await loadAppData();
    await tapDigit(yearPartAnswer({ fullYear: 2000 }));
    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.partAttempts).toHaveLength(1);
    });

    const after = await loadAppData();
    expect(after.items).toEqual(before.items);
    expect(after.monthItems).toEqual(before.monthItems);
    expect(after.centuryItems).toEqual(before.centuryItems);
    expect(after.days).toEqual(before.days);
  });
});

describe('the date half', () => {
  /**
   * A pinned draw of 0 picks the first month, the leap branch for it, and its
   * first day — so this is January 1 in a leap year, and the prompt has to say
   * so. January and February are the only two months whose doomsday moves, and
   * without the year kind on screen the question has two different right
   * answers: January 1 is 5 in a common year and 4 in a leap one.
   */
  it('asks for a month and a day, and names the year kind where it decides the answer', async () => {
    await seed({ autoAdvanceMs: 0 });
    pinDraw(0);
    mount();
    await openTrainer('Date');

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('January 1, leap year');
    // A four-digit year would mean the wrong half is on screen.
    expect(heading.textContent).not.toMatch(/\d{4}/);
    expect(datePartAnswer({ month: 1, day: 1, leapYear: true })).not.toBe(
      datePartAnswer({ month: 1, day: 1, leapYear: false }),
    );

    await tapDigit(datePartAnswer({ month: 1, day: 1, leapYear: true }));
    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.partAttempts).toHaveLength(1);
    });
    const stored = await loadAppData();
    expect(stored.partAttempts[0]).toMatchObject({
      part: 'date',
      month: 1,
      day: 1,
      leapYear: true,
      correct: true,
    });
    expect(stored.partTotals.dateByMonth['1'].answered).toBe(1);
  });

  /** The other ten months ignore the flag, so the prompt must not raise it. */
  it('says nothing about the year kind for a month that does not move', async () => {
    await seed({ autoAdvanceMs: 0 });
    pinDraw(0.5); // The seventh month, and its sixteenth day: July 16.
    mount();
    await openTrainer('Date');

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('July 16');
    expect(heading.textContent).not.toContain('leap');

    await tapDigit(datePartAnswer({ month: 7, day: 16, leapYear: false }));
    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.partAttempts[0]?.correct).toBe(true);
    });
  });

  /**
   * A wrong answer never advances, on any surface. The working is the only
   * thing that says whether the month doomsday or the subtraction was the miss.
   */
  it('holds on a wrong answer and shows every number behind the right one', async () => {
    await seed({ autoAdvanceMs: 0 });
    pinDraw(0);
    mount();
    await openTrainer('Date');

    const answer = datePartAnswer({ month: 1, day: 1, leapYear: true });
    await tapDigit((answer + 1) % 7);

    expect(await screen.findByRole('button', { name: 'Continue' })).toBeInTheDocument();
    // Still the same prompt: a wrong tap does not move on.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('January 1, leap year');
    // Invariant 7: the numbers are labelled, not printed bare.
    expect(screen.getByText('Month doomsday')).toBeInTheDocument();
    expect(screen.getByText('Days from the doomsday')).toBeInTheDocument();
    expect(screen.getByText('Step, mod 7')).toBeInTheDocument();

    const stored = await loadAppData();
    expect(stored.partAttempts[0].correct).toBe(false);
  });
});
