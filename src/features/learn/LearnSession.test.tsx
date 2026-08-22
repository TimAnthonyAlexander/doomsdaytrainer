import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { codeFor } from '@/domain/yearCodes';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { closeDb, loadAppData } from '@/storage/db';
import { itemKey } from '@/storage/defaults';
import { nextPaint } from '@/test/paint';
import { LearnSession } from './LearnSession';
import { dailyAllowance, decadeYears } from './blocks';

async function deleteDb(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('doomsday-trainer');
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Whichever pass is on screen puts its year in one of these. */
function promptYear(): number | null {
  const el = screen.queryByTestId('study-year') ?? screen.queryByTestId('recall-prompt');
  if (el === null) return null;
  const text = el.textContent?.trim() ?? '';
  return text === '' ? null : Number(text);
}

function pad(): HTMLElement | null {
  return screen.queryByRole('button', { name: '0' });
}

/** Enough of the screen to say which phase a failure happened on. */
function headline(): string {
  return (document.body.textContent ?? '').slice(0, 160);
}

/**
 * Waits for the auto-advance to hand over the next prompt.
 *
 * The pad is disabled while the feedback flash is up, so "enabled again" is the
 * signal that the pass has moved on. A phase with no pad at all — the structure
 * lesson, the block summary — is also a move, so a missing pad counts.
 *
 * A pad that never comes back is precisely the defect this file is about, so
 * the wait fails against what is on screen rather than timing out silently.
 */
async function advanced(): Promise<void> {
  await waitFor(
    () => {
      const keys = pad();
      if (keys === null) return;
      expect(keys, `the pad stayed dead: ${headline()}`).not.toBeDisabled();
    },
    { timeout: 3000 },
  );
}

async function tapCode(yy: number): Promise<void> {
  await nextPaint();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: String(codeFor(yy)) }));
    await settle();
  });
  await advanced();
}

function mount(decade: number) {
  const onExit = vi.fn();
  render(
    <MemoryRouter>
      <AppStateProvider>
        <AppStateGate>
          <LearnSession
            decade={decade}
            blocks={[]}
            allowance={dailyAllowance(20, 0)}
            onStart={vi.fn()}
            onExit={onExit}
          />
        </AppStateGate>
      </AppStateProvider>
    </MemoryRouter>,
  );
  return { onExit };
}

/**
 * Answers every prompt correctly until the endless pass is reached, and returns
 * how many taps that took.
 *
 * It never assumes which phase it is in. Every phase that asks for a code shows
 * a year and seven buttons, the structure lesson shows a Continue button, and
 * the endless pass names itself in the header. A phase that shows none of those
 * is a stuck screen, which is what this walker exists to catch.
 */
async function walkToEndless(limit = 120): Promise<number> {
  for (let taps = 0; taps < limit; taps += 1) {
    if (screen.queryByText('Keep going') !== null) return taps;

    const proceed = screen.queryByRole('button', { name: 'Continue' });
    if (proceed !== null) {
      await act(async () => {
        fireEvent.click(proceed);
        await settle();
      });
      continue;
    }

    const yy = promptYear();
    if (yy === null) throw new Error(`no year to answer, and no way forward: ${headline()}`);
    await tapCode(yy);
  }
  throw new Error(`still not at the endless pass after ${limit} taps`);
}

beforeEach(deleteDb);

describe('one learn block, start to finish', () => {
  // The whole block is 60 correct taps: 20 teaching, 20 recalling the three
  // batches, 20 over the mixed ten. Slow, and worth it — the two defects it
  // catches both live in the joins between phases, which no unit test can see.
  it(
    'reaches the endless pass and writes the ten',
    { timeout: 180_000 },
    async () => {
      mount(0);
      await waitFor(() => expect(pad()).toBeInTheDocument());

      const taps = await walkToEndless();
      expect(taps).toBeGreaterThan(50);

      // The endless pass is asking, not sitting on the last flash of the pass
      // before it. This is the regression: the mixed pass and the batch recall
      // are the same component, so without a key React kept the finished
      // batch's state and the screen went blank behind a green pad.
      expect(promptYear()).not.toBeNull();
      expect(pad()).not.toBeDisabled();

      // And it really answers.
      const first = promptYear();
      expect(first).not.toBeNull();
      await tapCode(first as number);
      await waitFor(() => expect(screen.getByText(/answered/)).toBeInTheDocument());

      // The block is written before the endless pass starts, so a user who
      // leaves it still has the decade.
      const data = await loadAppData();
      for (const yy of decadeYears(0)) {
        expect(data.items[itemKey(yy)].introduced, `year ${yy}`).toBe(true);
      }
      expect(data.days[Object.keys(data.days)[0]].newItemsIntroduced).toBe(10);
    },
  );
});
