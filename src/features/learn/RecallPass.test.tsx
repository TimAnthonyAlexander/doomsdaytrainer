import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { codeFor } from '@/domain/yearCodes';
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

/** Every state update a tap triggers, the persisted attempt included, lands inside act. */
async function tap(label: string): Promise<void> {
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
  it('sends the user back to the first year of the block after a wrong tap', async () => {
    const { container } = await mount();
    expect(screen.getByTestId('recall-prompt')).toHaveTextContent('40');

    // Get two right, then miss the third.
    await tap(rightFor(40));
    await waitFor(() => expect(screen.getByTestId('recall-prompt')).toHaveTextContent('41'));
    await tap(rightFor(41));
    await waitFor(() => expect(screen.getByTestId('recall-prompt')).toHaveTextContent('42'));

    await tap(wrongFor(42));
    // The miss states the real answer, then the block restarts.
    expect(container.textContent).toContain(`42 is ${rightFor(42)}, not ${wrongFor(42)}`);
    expect(screen.getByTestId('recall-prompt')).toHaveTextContent('40');

    // The retry has to land: the pad answers once per prompt, so a wrong tap
    // must move the prompt key or the second answer would be swallowed.
    await tap(rightFor(40));
    await waitFor(() => expect(screen.getByTestId('recall-prompt')).toHaveTextContent('41'));
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

  // Twelve real holds at 500ms each: learn mode shows the code you tapped long
  // enough to read it, so this walk genuinely takes longer than the default.
  it('only finishes on ten right in a row, and still reports the wrong taps', { timeout: 20000 }, async () => {
    const { onDone } = await mount();

    // Two right, one wrong: back to 40 with nothing completed.
    await tap(rightFor(40));
    await waitFor(() => expect(screen.getByTestId('recall-prompt')).toHaveTextContent('41'));
    await tap(wrongFor(41));
    expect(screen.getByTestId('recall-prompt')).toHaveTextContent('40');
    expect(onDone).not.toHaveBeenCalled();

    // Now a clean run of all ten.
    for (let yy = 40; yy <= 49; yy++) {
      await tap(rightFor(yy));
      if (yy < 49) {
        await waitFor(() =>
          expect(screen.getByTestId('recall-prompt')).toHaveTextContent(String(yy + 1)),
        );
      }
    }
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(1));
    await drain();
  });
});
