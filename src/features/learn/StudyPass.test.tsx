import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { codeFor } from '@/domain/yearCodes';
import { NUMERIC_SETTLE_MS } from '@/components/ui/NumericText';
import { resetSpeech } from '@/features/audio/speech';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { closeDb, loadAppData } from '@/storage/db';
import { itemKey } from '@/storage/defaults';
import { nextPaint } from '@/test/paint';
import { StudyPass } from './StudyPass';

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

async function drain(): Promise<void> {
  await act(async () => {
    await settle();
  });
}

/**
 * Order matters: the transition has to settle first, because arming the pad
 * is what schedules the frame the clock starts on. See weekdayFlow.test.tsx.
 */
async function tap(label: string): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, NUMERIC_SETTLE_MS + 20));
  });
  await nextPaint();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }));
    await settle();
  });
}

/**
 * A tap, plus the auto-advance the pass holds the answer on screen for.
 *
 * Without the wait the pad is still disabled showing the feedback and the next
 * click lands on a dead button, which reads as a passing test that walked
 * nowhere.
 */
async function step(label: string, done?: ReturnType<typeof vi.fn>): Promise<void> {
  await tap(label);
  await waitFor(
    () => {
      // The last trial of a batch never re-enables the pad: it calls onDone and
      // the parent takes the screen away.
      if (done && done.mock.calls.length > 0) return;
      expect(screen.getByRole('button', { name: '0' })).not.toBeDisabled();
    },
    { timeout: 5000 },
  );
}

const wrongFor = (yy: number) => String((codeFor(yy) + 1) % 7);
const rightFor = (yy: number) => String(codeFor(yy));

/** The real batch for 40-49: every third year, so nothing adjacent. */
const BATCH = [40, 43, 46, 49];

async function mount(onDone = vi.fn()) {
  const view = render(
    <AppStateProvider>
      <AppStateGate>
        <StudyPass
          decade={4}
          years={BATCH}
          stepLabel="Batch 1 of 3"
          onDone={onDone}
          onExit={vi.fn()}
        />
      </AppStateGate>
    </AppStateProvider>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: '0' })).toBeInTheDocument());
  return { ...view, onDone };
}

const year = () => screen.getByTestId('study-year').textContent;
const code = () => screen.getByTestId('study-code').textContent;

beforeEach(deleteDb);
afterEach(resetSpeech);

describe('StudyPass', () => {
  it('shows the pair, then asks for the same pair with the code gone', async () => {
    await mount();
    expect(year()).toBe('40');
    expect(code()).toBe(String(codeFor(40)));

    await tap(rightFor(40));
    // Same year, code taken away. This is the pair's first retrieval and it
    // comes after the reveal, never before it.
    await waitFor(() => expect(code()).toBe(''));
    expect(year()).toBe('40');

    await tap(rightFor(40));
    await waitFor(() => expect(year()).toBe('43'));
    expect(code()).toBe(String(codeFor(43)));
    await drain();
  });

  it('never has a neighbouring year on screen', { timeout: 20000 }, async () => {
    const onDone = vi.fn();
    await mount(onDone);
    const seen: number[] = [];
    for (let i = 0; i < BATCH.length * 2; i += 1) {
      // One year on screen at a time: the year element holds two digits and
      // nothing else, so there is no neighbour to step from. Read after the
      // numeric transition settles — mid-flap the cell briefly carries both
      // the outgoing and incoming glyph.
      await waitFor(() => expect(year()).toMatch(/^\d{2}$/));
      const current = Number(year());
      seen.push(current);
      await step(rightFor(current), onDone);
    }
    expect(onDone).toHaveBeenCalled();
    expect(seen).toEqual([40, 40, 43, 43, 46, 46, 49, 49]);
    for (let i = 1; i < seen.length; i += 1) {
      expect(Math.abs(seen[i] - seen[i - 1])).not.toBe(1);
    }
    await drain();
  });

  it('does not advance on a wrong tap and names both codes', async () => {
    const { container } = await mount();
    await tap(rightFor(40));
    await waitFor(() => expect(code()).toBe(''));

    await tap(wrongFor(40));
    expect(container.textContent).toContain(`40 is ${rightFor(40)}, not ${wrongFor(40)}`);
    expect(year()).toBe('40');

    await tap(rightFor(40));
    await waitFor(() => expect(year()).toBe('43'));
    await drain();
  });

  it('records the ask as a learn attempt and the reveal as nothing at all', async () => {
    await mount();
    // The show trial: the code is on the screen, so tapping it is not a
    // retrieval and must not enter the item's history as a correct answer.
    await tap(rightFor(40));
    await waitFor(() => expect(code()).toBe(''));
    await drain();
    expect((await loadAppData()).items[itemKey(40)].attemptHistory).toHaveLength(0);

    await tap(rightFor(40));
    await waitFor(() => expect(year()).toBe('43'));
    await drain();

    const item = (await loadAppData()).items[itemKey(40)];
    expect(item.attemptHistory).toHaveLength(1);
    expect(item.attemptHistory[0].source).toBe('learn');
    expect(item.attemptHistory[0].correct).toBe(true);
    // Learn never schedules.
    expect(item.interval).toBe(0);
    expect(item.repetitions).toBe(0);
    expect(item.introduced).toBe(false);
  });

  it('finishes the batch and hands back the wrong taps', { timeout: 20000 }, async () => {
    const onDone = vi.fn();
    await mount(onDone);
    await tap(wrongFor(40));
    for (const yy of BATCH) {
      await step(rightFor(yy), onDone);
      await step(rightFor(yy), onDone);
    }
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(1));
    await drain();
  });

  it('carries on exactly the same when audio is missing or fails', { timeout: 20000 }, async () => {
    // Spoken prompts are on by default. A clip that 404s, a codec the browser
    // refuses, an autoplay policy that blocks the first play: all of them are
    // silence, and none of them may touch the answer or what is recorded.
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValue(new Error('NotAllowedError'));

    await mount();
    expect(year()).toBe('40');
    await tap(rightFor(40));
    await waitFor(() => expect(code()).toBe(''), { timeout: 5000 });
    await tap(rightFor(40));
    await waitFor(() => expect(year()).toBe('43'), { timeout: 5000 });
    await drain();

    expect(play).toHaveBeenCalled();
    const item = (await loadAppData()).items[itemKey(40)];
    expect(item.attemptHistory).toHaveLength(1);
    expect(item.attemptHistory[0].correct).toBe(true);
    play.mockRestore();
  });
});
