import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { codeFor } from '@/domain/yearCodes';
import { NUMERIC_SETTLE_MS } from '@/components/ui/NumericText';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { closeDb, loadAppData } from '@/storage/db';
import { itemKey } from '@/storage/defaults';
import { nextPaint } from '@/test/paint';
import { RecallPass } from './RecallPass';

async function deleteDb(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('doomsday-trainer');
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Lets the fake IndexedDB writes finish before the test moves on. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function drain(): Promise<void> {
  await act(async () => {
    await settle();
  });
}

/**
 * Every state update a tap triggers, the persisted attempt included, lands
 * inside act.
 *
 * Order matters: the transition has to settle first, because arming the pad
 * is what schedules the frame the clock starts on. See weekdayFlow.test.tsx.
 */
async function tap(label: string): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, NUMERIC_SETTLE_MS + 20));
  });
  // The pad refuses an answer until the prompt has painted, so wait for it.
  await nextPaint();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }));
    await settle();
  });
}

const wrongFor = (yy: number) => String((codeFor(yy) + 1) % 7);
const rightFor = (yy: number) => String(codeFor(yy));

async function mount(onDone = vi.fn()) {
  const view = render(
    <AppStateProvider>
      <AppStateGate>
        <RecallPass decade={4} onDone={onDone} onExit={vi.fn()} />
      </AppStateGate>
    </AppStateProvider>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: '0' })).toBeInTheDocument());
  return { ...view, onDone };
}

beforeEach(deleteDb);

describe('RecallPass', () => {
  it('keeps the year on screen after a wrong tap instead of restarting the block', async () => {
    // The old rule sent the user back to the first year of the block. That is
    // serial anticipation: the run gets rehearsed from position zero over and
    // over and the years in the middle are never retrieved cold.
    const { container } = await mount();
    expect(screen.getByTestId('recall-prompt')).toHaveTextContent('40');

    await tap(rightFor(40));
    await waitFor(() => expect(screen.getByTestId('recall-prompt')).toHaveTextContent('41'));
    await tap(rightFor(41));
    await waitFor(() => expect(screen.getByTestId('recall-prompt')).toHaveTextContent('42'));

    await tap(wrongFor(42));
    // The miss states the real answer and the year stays put.
    expect(container.textContent).toContain(`42 is ${rightFor(42)}, not ${wrongFor(42)}`);
    expect(screen.getByTestId('recall-prompt')).toHaveTextContent('42');

    // The retry has to land: the pad answers once per prompt, so a wrong tap
    // must move the prompt key or the second answer would be swallowed.
    await tap(rightFor(42));
    await waitFor(() => expect(screen.getByTestId('recall-prompt')).toHaveTextContent('43'));
    await drain();
  });

  it('records every tap as a learn attempt without scheduling the item', async () => {
    await mount();
    await tap(wrongFor(40));
    await tap(rightFor(40));
    await waitFor(() => expect(screen.getByTestId('recall-prompt')).toHaveTextContent('41'));
    await drain();

    const item = (await loadAppData()).items[itemKey(40)];
    expect(item.attemptHistory).toHaveLength(2);
    expect(item.attemptHistory.map((a) => a.source)).toEqual(['learn', 'learn']);
    expect(item.attemptHistory.map((a) => a.correct)).toEqual([false, true]);
    expect(item.introduced).toBe(false);
    expect(item.interval).toBe(0);
    expect(item.repetitions).toBe(0);
    expect(item.lapses).toBe(0);
  });

  // The domain test in recall.test.ts walks whole blocks and asserts the
  // ordering, the streaks and the termination. What is worth paying 500ms a tap
  // for here is only the wiring: that the screen really does leave ascending
  // order behind when the ordered pass ends.
  it('leaves ascending order once every year has been produced once', { timeout: 20000 }, async () => {
    await mount();

    for (let yy = 40; yy <= 49; yy++) {
      expect(screen.getByTestId('recall-prompt')).toHaveTextContent(String(yy));
      await tap(rightFor(yy));
      if (yy < 49) {
        await waitFor(() =>
          expect(screen.getByTestId('recall-prompt')).toHaveTextContent(String(yy + 1)),
        );
      }
    }

    // Battig, Brown & Nelson (1963): first correct per item is where constant
    // order stops paying. The pass may legitimately open the mixed phase on any
    // year, 40 included, so what is asserted is the ordering, not the entry.
    await waitFor(() => expect(screen.getByText(/mixed up now/i)).toBeInTheDocument(), {
      timeout: 5000,
    });

    // Read after the numeric transition settles — mid-flap the cell briefly
    // carries both the outgoing and incoming glyph.
    const promptText = () => screen.getByTestId('recall-prompt').textContent ?? '';
    await waitFor(() => expect(promptText()).toMatch(/^\d{2}$/));
    const first = Number(promptText());
    const firstText = promptText();

    await tap(rightFor(first));
    await waitFor(
      () => {
        expect(promptText()).toMatch(/^\d{2}$/);
        expect(promptText()).not.toBe(firstText);
      },
      { timeout: 5000 },
    );
    expect(Math.abs(Number(promptText()) - first)).not.toBe(1);
    await drain();
  });

});
