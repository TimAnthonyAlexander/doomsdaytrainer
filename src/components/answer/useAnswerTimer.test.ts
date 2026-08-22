import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnswerTimer } from './useAnswerTimer';

function paint(): void {
  act(() => {
    vi.advanceTimersByTime(32);
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
      'Date',
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAnswerTimer', () => {
  it('does not run until the prompt has been painted', () => {
    const { result } = renderHook(() => useAnswerTimer('a'));
    expect(result.current.running()).toBe(false);
    expect(result.current.elapsedMs()).toBe(0);

    paint();
    expect(result.current.running()).toBe(true);
  });

  it('measures from the paint, not from the commit', () => {
    const committedAt = performance.now();
    const { result } = renderHook(() => useAnswerTimer('a'));

    paint();
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // The frame between React committing and the browser painting is real time
    // the user could not have answered in. It must not be charged to them.
    const sinceCommit = performance.now() - committedAt;
    const elapsed = result.current.elapsedMs();
    expect(elapsed).toBeGreaterThanOrEqual(500);
    expect(elapsed).toBeLessThan(sinceCommit);
  });

  it('restarts on a new promptKey', () => {
    const { result, rerender } = renderHook(({ key }: { key: string }) => useAnswerTimer(key), {
      initialProps: { key: 'a' },
    });
    paint();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.elapsedMs()).toBeGreaterThanOrEqual(3000);

    rerender({ key: 'b' });
    expect(result.current.running()).toBe(false);
    expect(result.current.elapsedMs()).toBe(0);

    paint();
    act(() => {
      vi.advanceTimersByTime(120);
    });
    const elapsed = result.current.elapsedMs();
    expect(elapsed).toBeGreaterThanOrEqual(120);
    expect(elapsed).toBeLessThan(180);
  });

  it('keeps running while promptKey is unchanged', () => {
    const { result, rerender } = renderHook(({ key }: { key: string }) => useAnswerTimer(key), {
      initialProps: { key: 'a' },
    });
    paint();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    rerender({ key: 'a' });
    expect(result.current.elapsedMs()).toBeGreaterThanOrEqual(400);
  });

  it('drops a pending start when the prompt changes before it fires', () => {
    const { result, rerender } = renderHook(({ key }: { key: string }) => useAnswerTimer(key), {
      initialProps: { key: 'a' },
    });
    rerender({ key: 'b' });
    expect(result.current.running()).toBe(false);

    paint();
    act(() => {
      vi.advanceTimersByTime(50);
    });
    const elapsed = result.current.elapsedMs();
    expect(elapsed).toBeGreaterThanOrEqual(50);
    expect(elapsed).toBeLessThan(90);
  });
});
