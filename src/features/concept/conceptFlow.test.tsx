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
  // The explainer is in front of the walk on every mount, and its button is
  // the way through to picking a date.
  fireEvent.click(await screen.findByRole('button', { name: 'Try one yourself' }));
  const input = await screen.findByLabelText('Date');
  fireEvent.change(input, { target: { value: date } });
  await screen.findByTestId('concept-ledger');
  expect(stepsDone()).toBe(0);
}

/** How far along, off the progress rule. */
function stepsDone(): number {
  return Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'));
}

/** What is being built right now. */
function goalTitle(): string {
  return screen.getByRole('heading', { level: 2 }).textContent ?? '';
}

/** The sum in the highlighted row: the thing the user is actually answering. */
function expression(): string {
  return screen.getByTestId('concept-expression').textContent ?? '';
}

/** The row with this label, whatever state it is in. */
function row(label: string): HTMLElement {
  return screen.getByTestId(`row:${label}`);
}

/** "filled", "active" or "pending", or null when the row is not on screen. */
function rowState(label: string): string | null {
  return screen.queryByTestId(`row:${label}`)?.getAttribute('data-state') ?? null;
}

/** What a settled row is showing, with its label taken off the front. */
function rowValue(label: string): string {
  return (row(label).textContent ?? '').slice(label.length);
}

/** The goals already behind the user, each collapsed to one line. */
function known(): string[] {
  const box = screen.queryByTestId('concept-known');
  if (!box) return [];
  return [...box.children].map((child) => child.textContent ?? '');
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
  fireEvent.click(screen.getByRole('button', { name: /^(Next|Finish)$/ }));
}

function hasNext(): boolean {
  return screen.queryByRole('button', { name: /^(Next|Finish)$/ }) !== null;
}

/** Walks all twelve steps, answering each correctly. */
async function walk(): Promise<void> {
  for (const value of ANSWERS) {
    await answer(value);
    next();
  }
}

beforeEach(deleteDb);

describe('the explainer in front of the walk', () => {
  it('comes first, on its own fixed date, with the walk behind it', async () => {
    await seed();
    mount();

    expect(await screen.findByRole('heading', { name: 'How it works' })).toBeInTheDocument();

    // It opens on the shape of the method rather than on a fact about it. This
    // is the thing worth carrying away, so it is pinned rather than left to
    // survive the next edit by luck.
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(
      expect.arrayContaining([
        '1Work out that weekday for the year.',
        '2Take the doomsday nearest your date.',
        '3Count the days between and take the sevens off.',
      ]),
    );
    // Its date is 20 March 2026 and is not the one the walk will use, which is
    // drawn at random. Nothing here is answerable.
    expect(screen.getByText('20 March 2026 is a Friday.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument();
    expect(screen.queryByTestId('concept-ledger')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try one yourself' }));
    expect(screen.queryByRole('heading', { name: 'How it works' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
  });

  it('shows the doomsday dates grouped the way they are remembered', async () => {
    await seed();
    mount();
    await screen.findByRole('heading', { name: 'How it works' });

    expect(screen.getByText('The date is the month')).toBeInTheDocument();
    expect(screen.getByText('9-5 at 7-Eleven')).toBeInTheDocument();
    // The mnemonic is cashed out rather than left as a phrase.
    expect(screen.getByText(/the 5th of the 9th and the 9th of the 5th/)).toBeInTheDocument();
    expect(screen.getByText('Pi day')).toBeInTheDocument();
    expect(screen.getByText(/last day of the month/)).toBeInTheDocument();
    // The two that move, printed as both dates rather than only the common one.
    expect(screen.getByText('3/4')).toBeInTheDocument();
    expect(screen.getByText('28/29')).toBeInTheDocument();
  });

  it('writes nothing', async () => {
    await seed();
    const before = JSON.stringify(await loadAppData());

    mount();
    await screen.findByRole('heading', { name: 'How it works' });
    fireEvent.click(screen.getByRole('button', { name: 'Try one yourself' }));

    expect(JSON.stringify(await loadAppData())).toBe(before);
  });
});

describe('the concept walkthrough', () => {
  it('takes one date to its weekday in twelve steps, all of them answered', async () => {
    await seed();
    mount();
    await open();

    const titles: string[] = [];
    for (const value of ANSWERS) {
      titles.push(goalTitle());
      await answer(value);
      next();
    }

    // Twelve steps, but four things being built. The screen names the thing,
    // not the operation: "Take the sevens off" three times over said what the
    // hand was doing and never what any of it was for.
    expect(titles).toEqual([
      'The year code for 87',
      'The year code for 87',
      'The year code for 87',
      'The year code for 87',
      'The doomsday of 1987',
      'The doomsday of 1987',
      'The doomsday of 1987',
      'From a doomsday to the 20th',
      'From a doomsday to the 20th',
      'The weekday',
      'The weekday',
      'The weekday',
    ]);

    expect(screen.getByText('20 March 1987 was a Friday.')).toBeInTheDocument();
  });

  it('asks nothing but sums on numbers it has already printed', async () => {
    await seed();
    mount();
    await open();

    const asked: string[] = [];
    for (const value of ANSWERS) {
      asked.push(expression());
      await answer(value);
      next();
    }

    expect(asked).toEqual([
      '87 − 84',
      '3 ÷ 4',
      '3 + 0',
      '3 mod 7',
      '3 + 3',
      '6 mod 7',
      '6 as a weekday',
      'closest at or under 20',
      '20 − 14',
      '6 + 6',
      '12 mod 7',
      '5 as a weekday',
    ]);
  });

  it('shows one goal at a time and collapses the ones behind it', async () => {
    await seed();
    mount();
    await open();

    // The first goal's four rows are up from the start, so the shape of what is
    // coming is visible, but only the live one carries a sum.
    expect(rowState('Year, 28s off')).toBe('active');
    expect(rowState('Leap days')).toBe('pending');
    expect(rowState('Year code')).toBe('pending');
    // Nothing from the goals after it is on screen at all.
    expect(rowState('Doomsday number')).toBeNull();
    expect(rowState('Days on')).toBeNull();
    expect(known()).toEqual([]);

    await answer(3);
    next();
    expect(rowState('Year, 28s off')).toBe('filled');
    expect(rowValue('Year, 28s off')).toBe('3');
    expect(rowState('Leap days')).toBe('active');

    for (const value of [0, 3, 3]) {
      await answer(value);
      next();
    }

    // The first goal is done, so it is one line now and the second is up.
    expect(known()).toEqual(['Year code 3']);
    expect(rowState('Year, 28s off')).toBeNull();
    expect(goalTitle()).toBe('The doomsday of 1987');
    expect(rowValue('Anchor for the 1900s')).toBe('3');

    for (const value of [6, 6, 'Sat'] as const) {
      await answer(value);
      next();
    }
    expect(known()).toEqual(['Year code 3', 'Doomsday 6, Saturday']);
  });

  it('never hands over the year code, and never asks for a lookup', async () => {
    await seed();
    mount();
    await open();

    // The anchor and the doomsday dates are stated. Asking which anchor applies
    // is a comprehension question, and this screen may not contain one.
    for (const value of [3, 0, 3]) {
      expect(rowState('Year code')).not.toBe('filled');
      await answer(value);
      next();
    }
    expect(rowState('Year code')).toBe('active');
    await answer(3);
    expect(rowValue('Year code')).toContain('3');
  });

  it('says what mod 7 means, every time it asks for it', async () => {
    await seed();
    mount();
    await open();

    const wanted = 'mod 7 means take 7 away until less than 7 is left.';
    for (const [index, value] of ANSWERS.entries()) {
      const sevens = [3, 5, 10].includes(index);
      expect(screen.queryByText(wanted) !== null, `step ${index + 1}`).toBe(sevens);
      await answer(value);
      next();
    }
  });

  it('drops the title and the date control once the walk is under way', async () => {
    await seed();
    mount();
    await open();

    expect(screen.getByRole('heading', { name: 'Concept' })).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();

    await answer(3);
    next();

    // Both gone, replaced by one quiet line naming the date.
    expect(screen.queryByRole('heading', { name: 'Concept' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument();
    expect(screen.getByText('20 March 1987')).toBeInTheDocument();

    // And it comes back on request, without having to leave the screen.
    fireEvent.click(screen.getByRole('button', { name: 'Change date' }));
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
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
    expect(expression()).toBe('6 as a weekday');
    await answer('Sun');
    expect(screen.getByText('6 is Saturday.')).toBeInTheDocument();
    expect(hasNext()).toBe(false);
    await answer('Sat');
    next();

    // The doomsday-date buttons.
    expect(goalTitle()).toBe('From a doomsday to the 20th');
    await answer(7);
    expect(
      screen.getByText('The 14th is the closest one at or before the 20th.'),
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
    expect(rowState('Leap days')).toBe('active');

    fireEvent.click(screen.getByRole('button', { name: 'Change date' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2001-09-11' } });
    expect(stepsDone()).toBe(0);
    expect(goalTitle()).toBe('The year code for 01');
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
    expect(stepsDone()).toBe(0);
    expect(goalTitle()).toBe('The year code for 87');

    // Leaving the field puts back the date the walk is actually standing on,
    // rather than the last thing typed at it.
    fireEvent.blur(screen.getByLabelText('Date'));
    expect(screen.getByLabelText('Date')).toHaveValue(EXAMPLE);
  });

  it('lets a year be typed a digit at a time', async () => {
    await seed();
    mount();
    await open();

    // A date input reports every keystroke, so 2012 arrives as 0002, then 0020,
    // then 0201, then 2012. The field used to be bound straight to the walk's
    // date, which resolved each of those to 1800-01-01 and wrote it back before
    // the next digit could be pressed: the year could not be typed at all.
    const field = screen.getByLabelText('Date');
    for (const value of ['0002-06-09', '0020-06-09', '0201-06-09']) {
      fireEvent.change(field, { target: { value } });
      expect(field, value).toHaveValue(value);
      // And none of them reaches the walk.
      expect(goalTitle()).toBe('The year code for 87');
    }

    fireEvent.change(field, { target: { value: '2012-06-09' } });
    expect(field).toHaveValue('2012-06-09');
    expect(goalTitle()).toBe('The year code for 12');
  });
});

describe('the step a date makes trivial', () => {
  it('states the 28s and moves past them rather than asking', async () => {
    await seed();
    mount();
    // 2012: the year is 12, which is already under 28.
    await open('2012-06-09');

    expect(expression()).toBe('12 is under 28');
    expect(screen.getByText(/nothing comes off/)).toBeInTheDocument();
    // Nothing to answer, so there is nothing to answer with.
    expect(field()).toBeUndefined();
    expect(screen.queryByRole('button', { name: '0' })).not.toBeInTheDocument();

    next();
    expect(rowState('Leap days')).toBe('active');
  });

  it('still counts the step, so the walk is twelve either way', async () => {
    await seed();
    mount();
    await open('2012-06-09');

    expect(stepsDone()).toBe(0);
    next();
    expect(stepsDone()).toBe(1);
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

    expect(goalTitle()).toBe('From a doomsday to the 3rd');
    expect(rowValue('A week on from it')).toBe('10');
    expect(screen.getByText(/A week on is the same weekday/)).toBeInTheDocument();

    await answer(7);
    next();
    expect(expression()).toBe('10 − 7');

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
      steps.push(screen.getByTestId('concept-ledger').textContent ?? '');
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

    expect(expression()).toBe('6 as a weekday');
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
