import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Attempt } from '@/domain/types';
import { closeDb, loadAppData, saveAppData } from '@/storage/db';
import { defaultAppData, itemKey } from '@/storage/defaults';
import { serialiseExport } from '@/storage/exportImport';
import { AppStateProvider } from './AppStateProvider';
import { useAppState } from './useAppState';

const wrapper = ({ children }: { children: ReactNode }) => <AppStateProvider>{children}</AppStateProvider>;

async function deleteDb(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('doomsday-trainer');
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function mount() {
  const view = renderHook(() => useAppState(), { wrapper });
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  return view;
}

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    timestamp: Date.now(),
    correct: true,
    latencyMs: 700,
    answered: 0,
    hintUsed: false,
    source: 'review',
    ...overrides,
  };
}

beforeEach(deleteDb);

describe('AppStateProvider', () => {
  it('throws when used outside the provider', () => {
    expect(() => renderHook(() => useAppState())).toThrow(/AppStateProvider/);
  });

  it('loads 100 items on first run', async () => {
    const { result } = await mount();
    expect(Object.keys(result.current.items)).toHaveLength(100);
    expect(result.current.itemList).toHaveLength(100);
    expect(result.current.itemList[0].yy).toBe(0);
    expect(result.current.itemList[99].yy).toBe(99);
    expect(result.current.error).toBeNull();
  });

  it('persists settings across a reload', async () => {
    const first = await mount();
    await act(async () => {
      await first.result.current.updateSettings({ newItemsPerDay: 10, indexConvention: 'monday' });
    });
    expect(first.result.current.settings.newItemsPerDay).toBe(10);

    first.unmount();
    await closeDb();

    const second = await mount();
    expect(second.result.current.settings.newItemsPerDay).toBe(10);
    expect(second.result.current.settings.indexConvention).toBe('monday');
  });

  it('advances the schedule on a review and persists it', async () => {
    const { result, unmount } = await mount();
    await act(async () => {
      await result.current.introduceItems([73]);
    });

    const before = result.current.items[itemKey(73)];
    let grade = 0;
    await act(async () => {
      const graded = await result.current.recordReview(73, attempt({ latencyMs: 500, correct: true }));
      grade = graded.grade;
    });

    const after = result.current.items[itemKey(73)];
    expect(grade).toBe(5);
    expect(after.repetitions).toBe(before.repetitions + 1);
    expect(after.dueAt).toBeGreaterThan(before.dueAt);
    expect(after.attemptHistory).toHaveLength(1);

    unmount();
    await closeDb();
    const reloaded = await loadAppData();
    expect(reloaded.items[itemKey(73)].repetitions).toBe(after.repetitions);
    expect(reloaded.items[itemKey(73)].dueAt).toBe(after.dueAt);
  });

  it('records a drill attempt without touching scheduling', async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.introduceItems([12]);
      await result.current.recordReview(12, attempt({ latencyMs: 400 }));
    });

    const before = result.current.items[itemKey(12)];
    await act(async () => {
      await result.current.recordDrillAttempt(12, attempt({ source: 'sprint', correct: false, latencyMs: 3000 }));
    });

    const after = result.current.items[itemKey(12)];
    expect(after.interval).toBe(before.interval);
    expect(after.easeFactor).toBe(before.easeFactor);
    expect(after.dueAt).toBe(before.dueAt);
    expect(after.repetitions).toBe(before.repetitions);
    expect(after.lapses).toBe(before.lapses);
    expect(after.attemptHistory).toHaveLength(before.attemptHistory.length + 1);
  });

  it('does not lose writes when attempts land at the same moment', async () => {
    const { result } = await mount();
    await act(async () => {
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          result.current.recordDrillAttempt(44, attempt({ source: 'gauntlet', latencyMs: i })),
        ),
      );
    });
    expect(result.current.items[itemKey(44)].attemptHistory).toHaveLength(20);
  });

  it('caps attempt history at 200', async () => {
    const seeded = defaultAppData(1000);
    seeded.items[itemKey(5)] = {
      ...seeded.items[itemKey(5)],
      attemptHistory: Array.from({ length: 205 }, (_, i) => attempt({ timestamp: i, source: 'sprint' })),
    };
    await saveAppData(seeded);
    await closeDb();

    const { result } = await mount();
    await act(async () => {
      await result.current.recordDrillAttempt(5, attempt({ timestamp: 999_999, source: 'sprint' }));
    });

    const history = result.current.items[itemKey(5)].attemptHistory;
    expect(history).toHaveLength(200);
    expect(history[history.length - 1].timestamp).toBe(999_999);
    expect(history[0].timestamp).toBe(6);
  });

  it('records drills and session days', async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.recordDrill({
        mode: 'sprint',
        decade: null,
        score: 31,
        correct: 31,
        total: 34,
        medianLatencyMs: 880,
      });
      await result.current.noteSessionActivity('review', 12);
      await result.current.noteSessionActivity('new', 10);
      await result.current.noteSessionActivity('review', 3);
    });

    expect(result.current.data.drills).toHaveLength(1);
    expect(result.current.data.drills[0].id).toBeTruthy();
    expect(result.current.data.drills[0].timestamp).toBeGreaterThan(0);

    const days = Object.values(result.current.data.days);
    expect(days).toHaveLength(1);
    expect(days[0].reviewsCompleted).toBe(15);
    expect(days[0].newItemsIntroduced).toBe(10);
  });

  it('imports a valid export', async () => {
    const incoming = defaultAppData(1000);
    incoming.settings = { ...incoming.settings, newItemsPerDay: 7, onboardingComplete: true };
    incoming.items[itemKey(88)] = { ...incoming.items[itemKey(88)], interval: 21, repetitions: 5 };
    const json = serialiseExport(incoming);

    const { result } = await mount();
    await act(async () => {
      await result.current.importData(json);
    });

    expect(result.current.settings.newItemsPerDay).toBe(7);
    expect(result.current.settings.onboardingComplete).toBe(true);
    expect(result.current.items[itemKey(88)].interval).toBe(21);
    expect(Object.keys(result.current.items)).toHaveLength(100);
  });

  it('leaves existing data untouched when an import is garbage', async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.updateSettings({ newItemsPerDay: 33 });
    });

    await act(async () => {
      await expect(result.current.importData('{ not json')).rejects.toThrow(/not valid JSON/i);
    });

    expect(result.current.settings.newItemsPerDay).toBe(33);
    const stored = await loadAppData();
    expect(stored.settings.newItemsPerDay).toBe(33);
  });

  it('resets to defaults', async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.updateSettings({ onboardingComplete: true, newItemsPerDay: 2 });
      await result.current.introduceItems([1, 2, 3]);
    });

    await act(async () => {
      await result.current.reset();
    });

    expect(result.current.settings.onboardingComplete).toBe(false);
    expect(result.current.settings.newItemsPerDay).toBe(20);
    expect(result.current.items[itemKey(1)].introduced).toBe(false);
    expect(Object.keys(result.current.items)).toHaveLength(100);
  });
});
