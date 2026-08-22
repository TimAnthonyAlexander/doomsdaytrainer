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
  it('keeps the same year after a wrong tap and accepts the retry', async () => {
    const { container } = await mount();
    expect(screen.getByTestId('recall-prompt')).toHaveTextContent('40');

    await tap(wrongFor(40));
    expect(container.textContent).toContain(`Not ${wrongFor(40)}. Try again.`);
    expect(screen.getByTestId('recall-prompt')).toHaveTextContent('40');

    // The retry has to land: the pad answers once per prompt, so a wrong tap
    // must move the prompt key or the second answer would be swallowed.
    await tap(rightFor(40));
    await waitFor(() => expect(screen.getByTestId('recall-prompt')).toHaveTextContent('41'));
    expect(container.textContent).not.toContain('Try again.');
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

  it('finishes the pass with the wrong taps counted', async () => {
    const { onDone } = await mount();
    for (let yy = 40; yy <= 49; yy++) {
      if (yy === 42) await tap(wrongFor(42));
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
