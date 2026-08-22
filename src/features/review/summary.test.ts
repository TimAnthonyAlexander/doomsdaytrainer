import { describe, expect, it } from 'vitest';
import { nextDueLabel, summarise } from './summary';

describe('summarise', () => {
  it('counts and takes the median latency', () => {
    expect(
      summarise([
        { correct: true, latencyMs: 900 },
        { correct: false, latencyMs: 4000 },
        { correct: true, latencyMs: 1400 },
      ]),
    ).toEqual({ total: 3, wrong: 1, medianLatencyMs: 1400 });
  });

  it('reports zeroes for a session with nothing in it', () => {
    expect(summarise([])).toEqual({ total: 0, wrong: 0, medianLatencyMs: 0 });
  });
});

describe('nextDueLabel', () => {
  const now = new Date('2026-03-10T09:00:00').getTime();

  it('has nothing to say when nothing is scheduled', () => {
    expect(nextDueLabel(null, now)).toBeNull();
  });

  it('reads the gap at the right resolution', () => {
    expect(nextDueLabel(now - 1000, now)).toBe('now');
    expect(nextDueLabel(now, now)).toBe('now');
    expect(nextDueLabel(now + 20_000, now)).toBe('in under a minute');
    expect(nextDueLabel(now + 61_000, now)).toBe('in a minute');
    expect(nextDueLabel(now + 25 * 60_000, now)).toBe('in 25 minutes');
    expect(nextDueLabel(now + 61 * 60_000, now)).toBe('in an hour');
    expect(nextDueLabel(now + 4 * 3_600_000, now)).toBe('in 4 hours');
    expect(nextDueLabel(now + 23 * 3_600_000, now)).toBe('in 23 hours');
    expect(nextDueLabel(now + 23.9 * 3_600_000, now)).toBe('tomorrow');
    expect(nextDueLabel(now + 26 * 3_600_000, now)).toBe('tomorrow');
    expect(nextDueLabel(now + 3 * 86_400_000, now)).toBe('in 3 days');
  });
});
