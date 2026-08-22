import { describe, expect, it } from 'vitest';
import type { DrillMode, DrillRecord } from '@/domain/types';
import { addDays, startOfDay } from '@/domain/time';
import {
  beatsBest,
  bestKey,
  bestScore,
  drillLatencySeries,
  formatClock,
  formatDuration,
  formatScore,
  lowerIsBetter,
  recordKey,
} from './drillHistory';

const NOW = startOfDay(Date.now()) + 12 * 3_600_000;

let counter = 0;

function record(over: Partial<DrillRecord> = {}): DrillRecord {
  counter += 1;
  return {
    id: `r${counter}`,
    mode: 'gauntlet',
    decade: null,
    timestamp: NOW,
    score: 60_000,
    correct: 95,
    total: 100,
    medianLatencyMs: 900,
    ...over,
  };
}

describe('lowerIsBetter', () => {
  it('inverts between the sprint and the timed runs', () => {
    expect(lowerIsBetter('sprint')).toBe(false);
    expect(lowerIsBetter('gauntlet')).toBe(true);
    expect(lowerIsBetter('decade')).toBe(true);
  });
});

describe('bestKey', () => {
  it('separates gauntlets by how many codes they asked', () => {
    expect(bestKey('gauntlet', null, 100)).not.toBe(bestKey('gauntlet', null, 50));
  });

  it('separates decade drills by decade', () => {
    expect(bestKey('decade', 4, 10)).not.toBe(bestKey('decade', 7, 10));
  });

  it('treats every sprint as one comparable set, since the minute is fixed', () => {
    expect(bestKey('sprint', null, 12)).toBe(bestKey('sprint', null, 40));
  });

  it('reads the key straight off a record', () => {
    expect(recordKey(record({ mode: 'decade', decade: 3, total: 10 }))).toBe(bestKey('decade', 3, 10));
  });
});

describe('bestScore', () => {
  it('takes the fastest gauntlet of the matching length', () => {
    const records = [
      record({ score: 70_000, total: 100 }),
      record({ score: 61_000, total: 100 }),
      record({ score: 20_000, total: 50 }),
    ];
    expect(bestScore(records, 'gauntlet', null, 100)).toBe(61_000);
  });

  it('never compares a 50 code gauntlet against a 100 code one', () => {
    const records = [record({ score: 20_000, total: 50 })];
    expect(bestScore(records, 'gauntlet', null, 100)).toBeNull();
    expect(bestScore(records, 'gauntlet', null, 50)).toBe(20_000);
  });

  it('takes the highest sprint, because more answers is better', () => {
    const records = [
      record({ mode: 'sprint', score: 31, total: 31 }),
      record({ mode: 'sprint', score: 44, total: 44 }),
    ];
    expect(bestScore(records, 'sprint', null, 0)).toBe(44);
  });

  it('keeps decades apart', () => {
    const records = [
      record({ mode: 'decade', decade: 4, total: 10, score: 9_000 }),
      record({ mode: 'decade', decade: 7, total: 10, score: 6_000 }),
    ];
    expect(bestScore(records, 'decade', 4, 10)).toBe(9_000);
    expect(bestScore(records, 'decade', 7, 10)).toBe(6_000);
    expect(bestScore(records, 'decade', 1, 10)).toBeNull();
  });

  it('is null on an empty log', () => {
    expect(bestScore([], 'gauntlet', null, 100)).toBeNull();
  });
});

describe('beatsBest', () => {
  it('counts a first run as a best', () => {
    expect(beatsBest('gauntlet', 90_000, null)).toBe(true);
    expect(beatsBest('sprint', 0, null)).toBe(true);
  });

  it('wants a lower time and a higher sprint score', () => {
    expect(beatsBest('gauntlet', 59_000, 60_000)).toBe(true);
    expect(beatsBest('gauntlet', 61_000, 60_000)).toBe(false);
    expect(beatsBest('sprint', 45, 44)).toBe(true);
    expect(beatsBest('sprint', 43, 44)).toBe(false);
  });

  it('does not call a tie an improvement', () => {
    expect(beatsBest('gauntlet', 60_000, 60_000)).toBe(false);
    expect(beatsBest('sprint', 44, 44)).toBe(false);
  });
});

describe('formatting', () => {
  it('shows tenths under a minute and minutes over one', () => {
    expect(formatClock(0)).toBe('0.0');
    expect(formatClock(8_400)).toBe('8.4');
    expect(formatClock(59_990)).toBe('59.9');
    expect(formatClock(60_000)).toBe('1:00.0');
    expect(formatClock(72_400)).toBe('1:12.4');
  });

  it('never renders a negative clock', () => {
    expect(formatClock(-5)).toBe('0.0');
  });

  it('adds the unit only where there is no colon to read', () => {
    expect(formatDuration(8_400)).toBe('8.4s');
    expect(formatDuration(72_400)).toBe('1:12.4');
  });

  it('scores a sprint in answers and a gauntlet on the clock', () => {
    const modes: DrillMode[] = ['sprint', 'gauntlet'];
    expect(formatScore(modes[0], 42)).toBe('42');
    expect(formatScore(modes[1], 48_200)).toBe('48.2s');
  });
});

describe('drillLatencySeries', () => {
  it('returns one point per day, ending today', () => {
    const points = drillLatencySeries([], NOW, 7);
    expect(points).toHaveLength(7);
    expect(points[6].ts).toBe(startOfDay(NOW));
    expect(points[0].ts).toBe(startOfDay(addDays(NOW, -6)));
  });

  it('leaves a day without drills empty rather than zero', () => {
    const points = drillLatencySeries([record({ timestamp: NOW, medianLatencyMs: 800 })], NOW, 3);
    expect(points[2].medianMs).toBe(800);
    expect(points[1].medianMs).toBeNull();
    expect(points[0].medianMs).toBeNull();
  });

  it('takes the median of the day, so one long run does not outweigh a short one', () => {
    const points = drillLatencySeries(
      [
        record({ timestamp: NOW, medianLatencyMs: 600 }),
        record({ timestamp: NOW, medianLatencyMs: 1_000 }),
        record({ timestamp: NOW, medianLatencyMs: 2_000 }),
      ],
      NOW,
      2,
    );
    expect(points[1].medianMs).toBe(1_000);
    expect(points[1].attempts).toBe(3);
  });

  it('ignores a record that asked nothing', () => {
    const points = drillLatencySeries([record({ timestamp: NOW, total: 0 })], NOW, 2);
    expect(points[1].medianMs).toBeNull();
  });

  it('drops anything older than the window', () => {
    const points = drillLatencySeries(
      [record({ timestamp: addDays(NOW, -40), medianLatencyMs: 500 })],
      NOW,
      30,
    );
    expect(points.every((point) => point.medianMs === null)).toBe(true);
  });
});
