import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyReview, createItem, introduce } from '@/domain/scheduler';
import { addDays } from '@/domain/time';
import type { AppData, Attempt, DrillRecord, ItemState } from '@/domain/types';
import { codeFor } from '@/domain/yearCodes';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { closeDb, loadAppData, saveAppData } from '@/storage/db';
import { DEFAULT_SETTINGS, defaultAppData, itemKey } from '@/storage/defaults';
import { NUMERIC_SETTLE_MS } from '@/components/ui/NumericText';
import { nextPaint } from '@/test/paint';
import { theme } from '@/theme/theme';
import { DrillRunView } from './DrillRunView';

/**
 * The drill run against the real store.
 *
 * The load-bearing test here is the scheduling one: a drill writes attempt
 * history and a drill record, and touches nothing else. Everything about the
 * feature is arranged around that, so it is checked field by field rather than
 * by spying on a call.
 */

const NOW = Date.now();
const DECADE = 4;
const YEARS = Array.from({ length: 10 }, (_unused, i) => DECADE * 10 + i);

/** Deliberately odd values, so an accidental reschedule cannot look like a match. */
function seededItem(yy: number): ItemState {
  return {
    ...introduce(createItem(yy), NOW - 86_400_000),
    easeFactor: 2.31,
    interval: 12,
    dueAt: addDays(NOW, 3),
    repetitions: 4,
    lapses: 2,
    consecutiveFailures: 1,
    leech: false,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <AppStateProvider>
        <AppStateGate>{children}</AppStateGate>
      </AppStateProvider>
    </ThemeProvider>
  );
}

async function deleteDb(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('doomsday-trainer');
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function seed(drills: DrillRecord[] = []): Promise<void> {
  const base = defaultAppData(NOW);
  const items = { ...base.items };
  for (const yy of YEARS) items[itemKey(yy)] = seededItem(yy);
  await saveAppData({ ...base, items, drills });
  await closeDb();
}

const discard = vi.fn();
const done = vi.fn();
const again = vi.fn();

/** Renders the run and waits for the store to load and the first prompt to land. */
async function mountDecadeRun(): Promise<void> {
  render(
    <DrillRunView
      mode="decade"
      decade={DECADE}
      countdownSeconds={0}
      onDiscard={discard}
      onDone={done}
      onAgain={again}
    />,
    { wrapper },
  );
  await screen.findByRole('heading', { level: 1 });
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/**
 * Answers the prompt on screen, after the frame that starts its latency
 * clock.
 *
 * Order matters: the transition has to settle first, because arming the pad
 * is what schedules the frame the clock starts on. See weekdayFlow.test.tsx.
 */
async function answerPrompt(user: UserEvent, code: number): Promise<void> {
  await wait(NUMERIC_SETTLE_MS + 20);
  await nextPaint();
  await user.click(screen.getByRole('button', { name: String(code) }));
}

/** The year currently on the prompt, read the way the user reads it. */
function promptYear(): number {
  const heading = screen.getByRole('heading', { level: 1 });
  const label = heading.getAttribute('aria-label') ?? '';
  const match = /^Year (\d{2})$/.exec(label);
  if (!match) throw new Error(`No year on the prompt, got "${label}"`);
  return Number(match[1]);
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  discard.mockReset();
  done.mockReset();
  again.mockReset();
  await deleteDb();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('a finished drill', () => {
  beforeEach(async () => {
    await seed();
  });

  it('records one drill and one attempt per code, and reschedules nothing', async () => {
    const user = userEvent.setup();
    await mountDecadeRun();

    const asked: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const yy = promptYear();
      asked.push(yy);
      // The first answer is deliberately wrong: a gauntlet counts errors and
      // moves on, and the run must still leave the item's schedule alone.
      const answer = i === 0 ? (codeFor(yy) + 1) % 7 : codeFor(yy);
      await answerPrompt(user, answer);
    }

    await waitFor(async () => {
      const snapshot = await loadAppData();
      expect(snapshot.drills).toHaveLength(1);
      expect(snapshot.items[itemKey(YEARS[9])].attemptHistory).toHaveLength(1);
    });
    const stored: AppData = await loadAppData();

    expect([...asked].sort((a, b) => a - b)).toEqual(YEARS);

    const [record] = stored.drills;
    expect(record.mode).toBe('decade');
    expect(record.decade).toBe(DECADE);
    expect(record.total).toBe(10);
    expect(record.correct).toBe(9);
    expect(record.score).toBeGreaterThan(0);
    expect(record.medianLatencyMs).toBeGreaterThanOrEqual(0);

    const reference = seededItem(YEARS[0]);
    for (const yy of YEARS) {
      const item = stored.items[itemKey(yy)];
      expect(item.attemptHistory).toHaveLength(1);
      expect(item.attemptHistory[0].source).toBe('decade');
      // The whole invariant, field by field.
      expect(item.interval).toBe(reference.interval);
      expect(item.easeFactor).toBe(reference.easeFactor);
      expect(item.dueAt).toBe(reference.dueAt);
      expect(item.repetitions).toBe(reference.repetitions);
      expect(item.lapses).toBe(reference.lapses);
      expect(item.consecutiveFailures).toBe(reference.consecutiveFailures);
      expect(item.leech).toBe(false);
    }
  });

  it('shows what happened and says there was no earlier run to compare', async () => {
    const user = userEvent.setup();
    await mountDecadeRun();

    for (let i = 0; i < 10; i += 1) {
      await answerPrompt(user, codeFor(promptYear()));
    }

    expect(await screen.findByRole('heading', { name: 'Decade 40–49' })).toBeInTheDocument();
    expect(screen.getByText('10 codes, 10 correct.')).toBeInTheDocument();
    expect(screen.getByText('No earlier run at this length to compare.')).toBeInTheDocument();

    await waitFor(async () => expect((await loadAppData()).drills).toHaveLength(1));
  });
});

describe('the count-in', () => {
  beforeEach(async () => {
    await seed();
  });

  it('is not charged to the first answer', async () => {
    const user = userEvent.setup();
    const countdownSeconds = 1;
    render(
      <DrillRunView
        mode="decade"
        decade={DECADE}
        countdownSeconds={countdownSeconds}
        onDiscard={discard}
        onDone={done}
        onAgain={again}
      />,
      { wrapper },
    );

    // Sit through the count-in, then answer straight away. The pad is mounted
    // the whole time, so a clock started at the count-in's paint would charge
    // this answer the entire second.
    await screen.findByLabelText(`Starting in ${countdownSeconds}`);
    await screen.findByRole('heading', { level: 1 }, { timeout: 4000 });
    for (let i = 0; i < 10; i += 1) {
      await answerPrompt(user, codeFor(promptYear()));
    }

    await waitFor(async () => expect((await loadAppData()).drills).toHaveLength(1));
    const stored = await loadAppData();
    // The order is shuffled, so which year was asked first is unknown. None of
    // the ten may carry the count-in.
    const latencies = YEARS.map((yy) => stored.items[itemKey(yy)].attemptHistory[0].latencyMs);
    expect(latencies).toHaveLength(10);
    expect(Math.max(...latencies)).toBeLessThan(countdownSeconds * 1000);
  });
});

describe('a drill measured against an earlier one', () => {
  function priorRecord(score: number): DrillRecord {
    return {
      id: 'prior',
      mode: 'decade',
      decade: DECADE,
      timestamp: NOW - 3_600_000,
      score,
      correct: 10,
      total: 10,
      medianLatencyMs: 900,
    };
  }

  async function runTen() {
    const user = userEvent.setup();
    await mountDecadeRun();
    for (let i = 0; i < 10; i += 1) {
      await answerPrompt(user, codeFor(promptYear()));
    }
  }

  it('states the standing best when the run did not beat it', async () => {
    await seed([priorRecord(5)]);
    await runTen();
    expect(await screen.findByText(/^Best was /)).toBeInTheDocument();
    await waitFor(async () => expect((await loadAppData()).drills).toHaveLength(2));
  });

  it('says plainly that the run is the new best, without ceremony', async () => {
    await seed([priorRecord(9_999_999)]);
    await runTen();
    const line = await screen.findByText(/^Your best\./);
    expect(line).toBeInTheDocument();
    expect(screen.queryByText(/record/i)).not.toBeInTheDocument();
    await waitFor(async () => expect((await loadAppData()).drills).toHaveLength(2));
  });
});

describe('an aborted drill', () => {
  beforeEach(async () => {
    await seed();
  });

  it('writes nothing at all: no record, no attempts, no reschedule', async () => {
    const user = userEvent.setup();
    await mountDecadeRun();

    for (let i = 0; i < 3; i += 1) {
      await answerPrompt(user, codeFor(promptYear()));
    }
    await user.click(screen.getByRole('button', { name: 'Abort' }));

    expect(discard).toHaveBeenCalledWith('Run aborted. Nothing was saved.');

    const stored = await loadAppData();
    expect(stored.drills).toEqual([]);
    const reference = seededItem(YEARS[0]);
    for (const yy of YEARS) {
      const item = stored.items[itemKey(yy)];
      expect(item.attemptHistory).toEqual([]);
      expect(item.interval).toBe(reference.interval);
      expect(item.easeFactor).toBe(reference.easeFactor);
      expect(item.dueAt).toBe(reference.dueAt);
      expect(item.repetitions).toBe(reference.repetitions);
      expect(item.lapses).toBe(reference.lapses);
    }
  });
});

describe('the scheduler guard the drills rely on', () => {
  it('refuses to schedule an attempt from any drill source', () => {
    const item = introduce(createItem(73), NOW);
    for (const source of ['sprint', 'gauntlet', 'decade'] as const) {
      const attempt: Attempt = {
        timestamp: NOW,
        correct: true,
        latencyMs: 700,
        answered: codeFor(73),
        hintUsed: false,
        source,
      };
      expect(() => applyReview(item, attempt, DEFAULT_SETTINGS, NOW)).toThrow(source);
    }
  });
});
