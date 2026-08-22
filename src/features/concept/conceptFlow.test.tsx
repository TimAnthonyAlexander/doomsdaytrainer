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
 * 20 March 1987, the worked example. Twelve answers, in order: 87 with its 28s
 * taken off, the leap days in what is left, the two added, the sevens off that,
 * the anchor added, the sevens off that, the day it names, the nearest doomsday
 * date, the count on from it, that added to the doomsday, the sevens off, and
 * the day it names.
 *
 * Every one of them is a sum on numbers the screen has already printed, which
 * is the whole point of the walk. A number is typed or tapped; a string is a
 * weekday button.
 */
const EXAMPLE = '1987-03-20';
const ANSWERS = [3, 0, 3, 3, 6, 6, 'Sat', 14, 6, 12, 5, 'Fri'] as const;

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
  expect(progress()).toBe('Step 1 of 12');
}

/** "Step 3 of 12". Read whole, because the numbers are their own elements. */
function progress(): string {
  return screen.getByTestId('concept-progress').textContent ?? '';
}

function stepHeading(): string {
  return screen.getByRole('heading', { level: 2 }).textContent ?? '';
}

/** The equation strip, which is on screen at every step. */
function strip(): HTMLElement {
  return screen.getByTestId('concept-equations');
}

/**
 * What the strip shows in the slot with this label. Joined with a pipe when a
 * slot appears in two equations, so both copies are asserted at once.
 */
function slot(label: string): string {
  return within(strip())
    .getAllByText(label)
    .map((element) => (element.parentElement?.textContent ?? '').slice(label.length))
    .join('|');
}

/** The typed answer field, which is not the date picker. */
function field(): HTMLInputElement | undefined {
  return screen
    .queryAllByRole('textbox')
    .find((element): element is HTMLInputElement => element.id !== 'concept-date');
}

/** Answers the step on screen, whichever of its four controls it is using. */
async function answer(value: number | string): Promise<void> {
  await nextPaint();
  const typed = typeof value === 'number' ? field() : undefined;
  if (typed) {
    fireEvent.change(typed, { target: { value: String(value) } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    return;
  }
  const label = String(value);
  fireEvent.click(
    screen.queryByRole('button', { name: label }) ??
      screen.getByRole('button', { name: `Day ${label}` }),
  );
}

function next(): void {
  fireEvent.click(screen.getByRole('button', { name: /^(Next step|Finish)$/ }));
}

function hasNext(): boolean {
  return screen.queryByRole('button', { name: /^(Next step|Finish)$/ }) !== null;
}

/** Walks all twelve steps, answering each correctly. */
async function walk(): Promise<void> {
  for (const value of ANSWERS) {
    await answer(value);
    next();
  }
}

beforeEach(deleteDb);

describe('the concept walkthrough', () => {
  it('takes one date to its weekday in twelve steps, all of them answered', async () => {
    await seed();
    mount();
    await open();

    const titles: string[] = [];
    for (const value of ANSWERS) {
      titles.push(stepHeading());
      await answer(value);
      next();
    }

    expect(titles).toEqual([
      'Take the 28s off',
      'Leap days',
      'Add them',
      'Take the sevens off',
      'Add the anchor',
      'Take the sevens off',
      'Name it',
      'The nearest doomsday',
      'Count on',
      'Add them',
      'Take the sevens off',
      'Name it',
    ]);

    expect(screen.getByText('20 March 1987 was a Friday.')).toBeInTheDocument();
  });

  it('asks nothing but sums on numbers it has already printed', async () => {
    await seed();
    mount();
    await open();

    const questions: string[] = [];
    for (const value of ANSWERS) {
      questions.push(screen.getByTestId('concept-question').textContent ?? '');
      await answer(value);
      next();
    }

    expect(questions).toEqual([
      '87 − 84 = ?',
      '3 ÷ 4 = ?',
      '3 + 0 = ?',
      '3 mod 7 = ?',
      '3 + 3 = ?',
      '6 mod 7 = ?',
      'Which weekday is 6?',
      'Which of those is closest to the 20th without going past it?',
      '20 − 14 = ?',
      '6 + 6 = ?',
      '12 mod 7 = ?',
      'Which weekday is 5?',
    ]);
  });

  it('names the year code and the year doomsday as they are produced', async () => {
    await seed();
    mount();
    await open();

    for (const value of [3, 0, 3]) {
      await answer(value);
      next();
    }
    await answer(3);
    expect(screen.getByText('That is the year code for 87.')).toBeInTheDocument();

    next();
    await answer(6);
    next();
    await answer(6);
    expect(screen.getByText('Every doomsday in 1987 falls on 6.')).toBeInTheDocument();
  });

  it('shows the whole computation from the start and fills it in as it goes', async () => {
    await seed();
    mount();
    await open();

    // The date and the anchor are handed over. Everything else stands empty,
    // and the first slot shows the sum that will fill it.
    expect(slot('Your date')).toBe('20');
    expect(slot('Century anchor, 1900s')).toBe('3');
    expect(slot('Year, 28s off')).toBe('87 − 84');
    expect(slot('Leap days')).toBe('–');
    expect(slot('Year code, 87')).toBe('–|–');
    expect(slot('Days on')).toBe('–|–');
    expect(slot('Weekday number')).toBe('–');

    await answer(3);
    next();
    expect(slot('Year, 28s off')).toBe('3');
    // The code is still four steps away and is not on the strip yet.
    expect(slot('Year code, 87')).toBe('–|–');

    await answer(0);
    next();
    await answer(3);
    next();
    await answer(3);
    next();
    expect(slot('Year code, 87')).toBe('3|3');

    for (const value of [6, 6, 'Sat', 14, 6, 12, 5, 'Fri'] as const) {
      await answer(value);
      next();
    }
    expect(within(strip()).queryAllByText('–')).toHaveLength(0);
    expect(slot('Weekday number')).toBe('5');
  });

  it('holds a wrong answer on every kind of control and shows what was wanted', async () => {
    await seed();
    mount();
    await open();

    // Typed.
    await answer(5);
    expect(screen.getByText('is not it.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('87 − 84 = 3.')).toBeInTheDocument();
    expect(hasNext()).toBe(false);
    await answer(3);
    expect(hasNext()).toBe(true);
    next();

    // The seven-button pad.
    await answer(4);
    expect(screen.getByText('3 ÷ 4 = 0 remainder 3, so 0.')).toBeInTheDocument();
    expect(hasNext()).toBe(false);
    await answer(0);
    next();

    for (const value of [3, 3, 6, 6]) {
      await answer(value);
      next();
    }

    // The weekday pad.
    expect(stepHeading()).toBe('Name it');
    await answer('Sun');
    expect(screen.getByText('6 is Saturday.')).toBeInTheDocument();
    expect(hasNext()).toBe(false);
    await answer('Sat');
    next();

    // The doomsday-date buttons.
    expect(stepHeading()).toBe('The nearest doomsday');
    await answer(7);
    expect(
      screen.getByText('The 14th is the closest doomsday at or before the 20th.'),
    ).toBeInTheDocument();
    expect(hasNext()).toBe(false);
    await answer(14);
    expect(hasNext()).toBe(true);
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
    expect(stepHeading()).toBe('Leap days');

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2001-09-11' } });
    expect(progress()).toBe('Step 1 of 12');
    expect(stepHeading()).toBe('Take the 28s off');
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
    expect(progress()).toBe('Step 1 of 12');
    expect(screen.getByLabelText('Date')).toHaveValue('1800-01-01');
  });
});

describe('the step a date makes trivial', () => {
  it('states the 28s and moves past them rather than asking', async () => {
    await seed();
    mount();
    // 2012: the year is 12, which is already under 28.
    await open('2012-06-09');

    expect(stepHeading()).toBe('Take the 28s off');
    expect(screen.getByText(/no 28s come off/)).toBeInTheDocument();
    // Nothing to answer, so there is nothing to answer with.
    expect(field()).toBeUndefined();
    expect(screen.queryByRole('button', { name: '0' })).not.toBeInTheDocument();

    next();
    expect(stepHeading()).toBe('Leap days');
  });

  it('still counts the step, so the walk is twelve either way', async () => {
    await seed();
    mount();
    await open('2012-06-09');

    expect(progress()).toBe('Step 1 of 12');
    next();
    expect(progress()).toBe('Step 2 of 12');
  });
});

describe('a day below every doomsday date in the month', () => {
  it('adds a week rather than counting backwards', async () => {
    await seed();
    mount();
    // 3 March 1987. March's doomsday dates are the 7th, 14th, 21st and 28th,
    // so there is nothing at or below the 3rd.
    await open('1987-03-03');

    for (const value of [3, 0, 3, 3, 6, 6, 'Sat'] as const) {
      await answer(value);
      next();
    }

    expect(stepHeading()).toBe('The nearest doomsday');
    expect(
      screen.getByText(
        'The 3rd has no doomsday at or before it. A week either way is the same weekday, so use the 10th.',
      ),
    ).toBeInTheDocument();
    expect(slot('Date, a week on')).toBe('10');

    await answer(7);
    next();
    expect(screen.getByText('10 − 7 = ?')).toBeInTheDocument();

    for (const value of [3, 9, 2, 'Tue'] as const) {
      await answer(value);
      next();
    }
    expect(screen.getByText('3 March 1987 was a Tuesday.')).toBeInTheDocument();
  });
});

describe('the index convention', () => {
  /** Everything the screen says, minus the buttons, for all twelve steps. */
  async function collect(convention: IndexConvention): Promise<string[]> {
    await deleteDb();
    await seed(convention);
    const view = mount();
    await open();

    const steps: string[] = [];
    for (const value of ANSWERS) {
      steps.push(
        `${strip().textContent ?? ''}${screen.getByTestId('concept-ask').textContent ?? ''}`,
      );
      await answer(value);
      next();
    }
    view.unmount();
    return steps;
  }

  it('changes not one number or word in the twelve steps', async () => {
    // Invariant 8. Every number in the walk is Sunday-indexed whatever the user
    // picked; the convention only decides which day sits in position 0 of the
    // weekday pad.
    const sunday = await collect('sunday');
    const monday = await collect('monday');
    expect(monday).toEqual(sunday);
  });

  it('reorders the weekday pad and nothing else', async () => {
    await seed('monday');
    mount();
    await open();

    for (const value of [3, 0, 3, 3, 6, 6] as const) {
      await answer(value);
      next();
    }

    expect(screen.getByText('Which weekday is 6?')).toBeInTheDocument();
    const pad = screen.getByRole('button', { name: 'Mon' }).parentElement as HTMLElement;
    expect(
      within(pad)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

    // Same day, same closing line. Only the buttons moved.
    for (const value of ['Sat', 14, 6, 12, 5, 'Fri'] as const) {
      await answer(value);
      next();
    }
    expect(screen.getByText('20 March 1987 was a Friday.')).toBeInTheDocument();
  });

  it('puts Sunday first when that is what is set', async () => {
    await seed('sunday');
    mount();
    await open();

    for (const value of [3, 0, 3, 3, 6, 6] as const) {
      await answer(value);
      next();
    }

    const pad = screen.getByRole('button', { name: 'Sun' }).parentElement as HTMLElement;
    expect(
      within(pad)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });
});
