import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppData, IndexConvention } from '@/domain/types';
import { ConceptScreen } from '@/routes/ConceptScreen';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { closeDb, loadAppData, saveAppData } from '@/storage/db';
import { defaultAppData } from '@/storage/defaults';
import { nextPaint } from '@/test/paint';
import { theme } from '@/theme/theme';

/**
 * 20 March 1987, the worked example. Answers, in order: the 1900s anchor, 87
 * reduced by 28s, the leap days in what is left, the year code, the year's
 * doomsday, March's doomsday date, the step off it, the weekday number, and the
 * day itself.
 */
const EXAMPLE = '1987-03-20';
const ANSWERS = [3, 3, 0, 3, 6, 14, 6, 5] as const;
const DAY = 'Fri';

async function deleteDb(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('doomsday-trainer');
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function seed(indexConvention: IndexConvention = 'sunday'): Promise<void> {
  const data: AppData = defaultAppData(Date.now());
  data.settings = { ...data.settings, onboardingComplete: true, indexConvention };
  await saveAppData(data);
  await closeDb();
}

function mount() {
  return render(
    <ThemeProvider theme={theme}>
      <AppStateProvider>
        <AppStateGate>
          <MemoryRouter>
            <ConceptScreen />
          </MemoryRouter>
        </AppStateGate>
      </AppStateProvider>
    </ThemeProvider>,
  );
}

async function open(date = EXAMPLE): Promise<void> {
  const input = await screen.findByLabelText('Date');
  fireEvent.change(input, { target: { value: date } });
  await screen.findByTestId('concept-progress');
  expect(progress()).toBe('Step 1 of 9');
}

/** "Step 3 of 9". Read whole, because the numbers are their own elements. */
function progress(): string {
  return screen.getByTestId('concept-progress').textContent ?? '';
}

function stepHeading(): string {
  return screen.getByRole('heading', { level: 2 }).textContent ?? '';
}

/** Answers the step on screen, whichever control it is using. */
async function answer(value: number): Promise<void> {
  await nextPaint();
  const typed = screen.queryByRole('textbox');
  const field = typed ?? screen.queryByLabelText('Year to work with');
  if (field instanceof HTMLInputElement) {
    fireEvent.change(field, { target: { value: String(value) } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    return;
  }
  const pad =
    screen.queryByRole('button', { name: String(value) }) ??
    screen.getByRole('button', { name: `Day ${value}` });
  fireEvent.click(pad);
}

function next(): void {
  fireEvent.click(screen.getByRole('button', { name: /^(Next step|Finish)$/ }));
}

/** Walks the eight numeric steps, then names the day. */
async function walk(day = DAY): Promise<void> {
  for (const value of ANSWERS) {
    await answer(value);
    next();
  }
  await nextPaint();
  fireEvent.click(screen.getByRole('button', { name: day }));
  next();
}

beforeEach(deleteDb);

describe('the concept walkthrough', () => {
  it('takes one date to its weekday in nine steps, all of them answered', async () => {
    await seed();
    mount();
    await open();

    expect(stepHeading()).toBe('Century anchor');
    expect(screen.getByText('1800s')).toBeInTheDocument();
    expect(screen.getByText('Your year')).toBeInTheDocument();

    const titles: string[] = [];
    for (const value of ANSWERS) {
      titles.push(stepHeading());
      await answer(value);
      next();
    }
    titles.push(stepHeading());

    expect(titles).toEqual([
      'Century anchor',
      'Take off the 28s',
      'Leap days',
      'The year code',
      "The year's doomsday",
      'The month doomsday',
      'Days from the doomsday',
      'The weekday number',
      'The day',
    ]);

    await nextPaint();
    fireEvent.click(screen.getByRole('button', { name: DAY }));
    next();

    expect(screen.getByText('20 March 1987 was a Friday.')).toBeInTheDocument();
  });

  it('names the year code and the year doomsday as they are produced', async () => {
    await seed();
    mount();
    await open();

    for (const value of [3, 3, 0]) {
      await answer(value);
      next();
    }
    await answer(3);
    expect(screen.getByText('The year code for 87 is 3.')).toBeInTheDocument();

    next();
    await answer(6);
    expect(screen.getByText('Every doomsday in 1987 falls on 6.')).toBeInTheDocument();
  });

  it('never hands the year code over', async () => {
    await seed();
    mount();
    await open();

    // The code for 87 is 3, and so is the anchor and so is the reduced year, so
    // "3 is on screen" proves nothing. What matters is that no step before the
    // fourth calls a number the year code.
    for (const value of [3, 3, 0]) {
      expect(screen.queryByText(/year code/i)).not.toBeInTheDocument();
      await answer(value);
      next();
    }
    expect(stepHeading()).toBe('The year code');
  });

  it('holds a wrong answer on the step and shows what was wanted', async () => {
    await seed();
    mount();
    await open();

    await nextPaint();
    fireEvent.click(screen.getByRole('button', { name: '5' }));

    expect(screen.getByText('is not it.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText("1987 is in the 1900s. That century's anchor is 3.")).toBeInTheDocument();
    // Invariant 6: nothing moves on. The way forward is answering with the
    // value the working just named.
    expect(stepHeading()).toBe('Century anchor');
    expect(screen.queryByRole('button', { name: 'Next step' })).not.toBeInTheDocument();

    await nextPaint();
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(screen.getByRole('button', { name: 'Next step' })).toBeInTheDocument();
    next();
    expect(stepHeading()).toBe('Take off the 28s');
  });

  it('writes nothing at all', async () => {
    await seed();
    const before = JSON.stringify(await loadAppData());

    mount();
    await open();
    await walk();
    expect(screen.getByText('20 March 1987 was a Friday.')).toBeInTheDocument();

    expect(JSON.stringify(await loadAppData())).toBe(before);
  });

  it('starts a new walk when the date changes', async () => {
    await seed();
    mount();
    await open();

    await answer(3);
    next();
    expect(stepHeading()).toBe('Take off the 28s');

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2001-09-11' } });
    expect(progress()).toBe('Step 1 of 9');
    expect(stepHeading()).toBe('Century anchor');
  });

  it('keeps an unusable date out of the maths', async () => {
    await seed();
    mount();
    await open();

    // Cleared, out of range, and a day February does not have. None of them may
    // reach `guidedWalk`, which throws on all three.
    for (const value of ['', '1799-06-05', '1987-02-31']) {
      fireEvent.change(screen.getByLabelText('Date'), { target: { value } });
    }
    expect(progress()).toBe('Step 1 of 9');
    expect(screen.getByLabelText('Date')).toHaveValue('1800-01-01');
  });
});

describe('the steps a date makes trivial', () => {
  it('states the 28s and moves past them rather than asking', async () => {
    await seed();
    mount();
    // 2012: the year is 12, which is already under 28.
    await open('2012-06-09');

    await answer(2);
    next();

    expect(stepHeading()).toBe('Take off the 28s');
    expect(screen.getByText(/no whole 28s to take off/)).toBeInTheDocument();
    // Nothing to answer, so there is nothing to answer with.
    expect(screen.queryByRole('button', { name: '0' })).not.toBeInTheDocument();

    next();
    expect(stepHeading()).toBe('Leap days');
  });

  it('still counts the step, so the walk is nine either way', async () => {
    await seed();
    mount();
    await open('2012-06-09');

    await answer(2);
    next();
    expect(progress()).toBe('Step 2 of 9');
    next();
    expect(progress()).toBe('Step 3 of 9');
  });

  it('says a leap year moves January and February, with the year named', async () => {
    await seed();
    mount();
    await open('1988-01-20');

    // 1900s anchor 3, then 88 reduces to 4, one leap day, code 5, doomsday 1.
    for (const value of [3, 4, 1, 5, 1]) {
      await answer(value);
      next();
    }
    expect(stepHeading()).toBe('The month doomsday');
    expect(screen.getByText(/1988 is a leap year/)).toBeInTheDocument();

    // And the moved value is the one the rest of the walk uses: January's
    // doomsday is the 4th in 1988, not the 3rd the table shows.
    await answer(4);
    next();
    expect(stepHeading()).toBe('Days from the doomsday');
    await answer(2);
    next();
    await answer(3);
    next();
    await nextPaint();
    fireEvent.click(screen.getByRole('button', { name: 'Wed' }));
    next();
    expect(screen.getByText('20 January 1988 was a Wednesday.')).toBeInTheDocument();
  });
});

describe('the index convention', () => {
  async function collect(convention: IndexConvention): Promise<string[]> {
    await deleteDb();
    await seed(convention);
    const view = mount();
    await open();

    const steps: string[] = [];
    for (const value of ANSWERS) {
      steps.push(screen.getByTestId('concept-step').textContent ?? '');
      await answer(value);
      next();
    }
    view.unmount();
    return steps;
  }

  it('changes nothing in the eight numbered steps', async () => {
    // Invariant 8. Every number in the walk is Sunday-indexed whatever the user
    // picked; the convention only decides which day sits in position 0 of the
    // last pad.
    const sunday = await collect('sunday');
    const monday = await collect('monday');
    expect(monday).toEqual(sunday);
  });

  it('reorders the last pad and nothing else', async () => {
    await seed('monday');
    mount();
    await open();

    for (const value of ANSWERS) {
      await answer(value);
      next();
    }

    expect(screen.getByText('Weekday number')).toBeInTheDocument();
    expect(screen.getByText('Which day is 5?')).toBeInTheDocument();

    const pad = screen.getByRole('button', { name: 'Mon' }).parentElement as HTMLElement;
    expect(within(pad).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    );

    // Same day, same closing line. Only the buttons moved.
    await nextPaint();
    fireEvent.click(screen.getByRole('button', { name: DAY }));
    next();
    expect(screen.getByText('20 March 1987 was a Friday.')).toBeInTheDocument();
  });

  it('puts Sunday first when that is what is set', async () => {
    await seed('sunday');
    mount();
    await open();

    for (const value of ANSWERS) {
      await answer(value);
      next();
    }

    const pad = screen.getByRole('button', { name: 'Sun' }).parentElement as HTMLElement;
    expect(within(pad).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    );
  });
});
