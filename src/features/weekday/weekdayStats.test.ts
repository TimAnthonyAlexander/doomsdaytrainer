import { describe, expect, it } from 'vitest';
import type { WeekdayAttempt, WeekdayMode } from '@/domain/types';
import { buildWeekdayTotals, emptyWeekdayTotals } from '@/domain/weekdayLifetime';
import {
  formatAccuracy,
  lifetimeRows,
  overallTally,
  runLine,
  sessionRows,
  tallyByCentury,
  tallyByMode,
  tallyByMonth,
} from './weekdayStats';

interface Seed {
  fullYear?: number;
  month?: number;
  mode?: WeekdayMode;
  correct?: boolean;
  latencyMs?: number;
}

function attempt(seed: Seed = {}): WeekdayAttempt {
  return {
    timestamp: 1000,
    fullYear: seed.fullYear ?? 1987,
    month: seed.month ?? 3,
    day: 14,
    mode: seed.mode ?? 'unassisted',
    correct: seed.correct ?? true,
    latencyMs: seed.latencyMs ?? 4000,
    answered: 6,
  };
}

describe('overallTally', () => {
  it('reports null rather than zero for an empty log', () => {
    expect(overallTally([])).toEqual({ attempts: 0, correct: 0, accuracy: null, medianMs: null });
  });

  it('counts attempts, correctness and the median latency', () => {
    const result = overallTally([
      attempt({ correct: true, latencyMs: 1000 }),
      attempt({ correct: false, latencyMs: 3000 }),
      attempt({ correct: true, latencyMs: 9000 }),
    ]);
    expect(result.attempts).toBe(3);
    expect(result.correct).toBe(2);
    expect(result.accuracy).toBeCloseTo(2 / 3, 6);
    expect(result.medianMs).toBe(3000);
  });
});

describe('tallyByMode', () => {
  it('always returns both modes, assisted first', () => {
    const result = tallyByMode([]);
    expect(result.map((r) => r.mode)).toEqual(['assisted', 'unassisted']);
    expect(result.map((r) => r.label)).toEqual(['Assisted', 'Unassisted']);
    expect(result[0].accuracy).toBeNull();
  });

  it('keeps the two modes apart', () => {
    const result = tallyByMode([
      attempt({ mode: 'assisted', correct: true, latencyMs: 2000 }),
      attempt({ mode: 'assisted', correct: true, latencyMs: 4000 }),
      attempt({ mode: 'unassisted', correct: false, latencyMs: 12000 }),
    ]);
    expect(result[0]).toMatchObject({ attempts: 2, correct: 2, accuracy: 1, medianMs: 3000 });
    expect(result[1]).toMatchObject({ attempts: 1, correct: 0, accuracy: 0, medianMs: 12000 });
  });
});

describe('tallyByMonth', () => {
  it('always returns twelve entries, January first', () => {
    const result = tallyByMonth([]);
    expect(result).toHaveLength(12);
    expect(result[0]).toMatchObject({ month: 1, label: 'January', medianMs: null });
    expect(result[11]).toMatchObject({ month: 12, label: 'December' });
  });

  it('files each attempt under its own month', () => {
    const result = tallyByMonth([
      attempt({ month: 3, latencyMs: 2000, correct: true }),
      attempt({ month: 3, latencyMs: 6000, correct: false }),
      attempt({ month: 9, latencyMs: 1000, correct: true }),
    ]);
    expect(result[2]).toMatchObject({ month: 3, attempts: 2, correct: 1, accuracy: 0.5, medianMs: 4000 });
    expect(result[8]).toMatchObject({ month: 9, attempts: 1, medianMs: 1000 });
    expect(result[0].attempts).toBe(0);
  });
});

describe('tallyByCentury', () => {
  it('always returns the four supported centuries', () => {
    expect(tallyByCentury([]).map((c) => c.label)).toEqual(['1800s', '1900s', '2000s', '2100s']);
  });

  it('files each attempt under the century of its year', () => {
    const result = tallyByCentury([
      attempt({ fullYear: 1812 }),
      attempt({ fullYear: 1987 }),
      attempt({ fullYear: 1900 }),
      attempt({ fullYear: 2026 }),
      attempt({ fullYear: 2199 }),
    ]);
    expect(result[0].attempts).toBe(1);
    expect(result[1].attempts).toBe(2);
    expect(result[2].attempts).toBe(1);
    expect(result[3].attempts).toBe(1);
  });
});

describe('sessionRows', () => {
  it('returns assisted, unassisted and the two together, in that order', () => {
    const rows = sessionRows([]);
    expect(rows.map((row) => row.label)).toEqual(['Assisted', 'Unassisted', 'Total']);
    expect(rows.every((row) => row.answered === 0 && row.medianMs === null)).toBe(true);
  });

  it('splits by mode and sums the total', () => {
    const rows = sessionRows([
      { mode: 'assisted', correct: true, latencyMs: 800 },
      { mode: 'assisted', correct: false, latencyMs: 1200 },
      { mode: 'unassisted', correct: true, latencyMs: 6000 },
    ]);
    expect(rows[0]).toMatchObject({ answered: 2, correct: 1, wrong: 1, medianMs: 1000 });
    expect(rows[1]).toMatchObject({ answered: 1, correct: 1, wrong: 0, medianMs: 6000 });
    expect(rows[2]).toMatchObject({ answered: 3, correct: 2, wrong: 1, medianMs: 1200 });
  });
});

describe('lifetimeRows', () => {
  it('reads the same three rows out of the persisted histogram', () => {
    const totals = buildWeekdayTotals([
      attempt({ mode: 'assisted', correct: true, latencyMs: 800 }),
      attempt({ mode: 'assisted', correct: false, latencyMs: 900 }),
      attempt({ mode: 'unassisted', correct: true, latencyMs: 9000 }),
    ]);
    const rows = lifetimeRows(totals);
    expect(rows.map((row) => row.label)).toEqual(['Assisted', 'Unassisted', 'Total']);
    expect(rows[0]).toMatchObject({ answered: 2, correct: 1, wrong: 1 });
    expect(rows[1]).toMatchObject({ answered: 1, correct: 1, wrong: 0 });
    expect(rows[2]).toMatchObject({ answered: 3, correct: 2, wrong: 1 });
    // Assisted is sub-second, unassisted is not. The rows must not blur that.
    expect(rows[0].medianMs as number).toBeLessThan(1000);
    expect(rows[1].medianMs as number).toBeGreaterThan(8000);
  });

  it('shows nothing rather than zero before anything is answered', () => {
    for (const row of lifetimeRows(emptyWeekdayTotals())) {
      expect(row.answered).toBe(0);
      expect(row.medianMs).toBeNull();
    }
  });
});

describe('formatting', () => {
  it('shows a dash when there is nothing to be accurate about', () => {
    expect(formatAccuracy(null)).toBe('—');
    expect(formatAccuracy(1)).toBe('100%');
    expect(formatAccuracy(0.945)).toBe('95%');
    expect(formatAccuracy(0)).toBe('0%');
  });

  it('states a run in plain numbers', () => {
    expect(runLine(24, 21)).toBe('24 dates, 3 wrong');
    expect(runLine(1, 1)).toBe('1 date, 0 wrong');
  });
});
