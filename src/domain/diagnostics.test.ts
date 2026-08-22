import { describe, expect, it } from 'vitest';
import type { Attempt, ItemState } from './types';
import {
  adjacencyEffect,
  decadePositionSlope,
  derivationSlope,
  latencyCv,
  routeReport,
  scoredAttempts,
} from './diagnostics';
import { createItem, introduce } from './scheduler';

const NOW = new Date(2026, 4, 20, 10, 0, 0).getTime();

function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    timestamp: NOW,
    correct: true,
    latencyMs: 900,
    answered: 0,
    hintUsed: false,
    source: 'review',
    ...over,
  };
}

/** An item whose scored attempts all landed at `latencyMs`. */
function item(yy: number, latencyMs: number, count = 3): ItemState {
  return {
    ...introduce(createItem(yy), NOW),
    attemptHistory: Array.from({ length: count }, (_unused, i) =>
      attempt({ latencyMs, timestamp: NOW + i * 3_600_000 }),
    ),
  };
}

describe('scoredAttempts', () => {
  it('keeps only correct, unhinted review answers', () => {
    const mixed: ItemState = {
      ...introduce(createItem(10), NOW),
      attemptHistory: [
        attempt(),
        attempt({ correct: false }),
        attempt({ hintUsed: true }),
        attempt({ source: 'sprint' }),
      ],
    };
    expect(scoredAttempts(mixed)).toHaveLength(1);
  });
});

describe('decadePositionSlope', () => {
  it('finds nothing when latency is flat across the decade', () => {
    const items = Array.from({ length: 30 }, (_unused, i) => item(i, 900));
    const slope = decadePositionSlope(items);
    expect(slope.msPerUnit).toBeCloseTo(0, 6);
  });

  it('measures the cost per step when the user counts up from the decade start', () => {
    // 200ms per position, which is squarely inside the 170-310ms per item that
    // Klahr et al. measured for covert recitation.
    const items = Array.from({ length: 30 }, (_unused, i) => item(i, 500 + (i % 10) * 200));
    const slope = decadePositionSlope(items);
    expect(slope.msPerUnit).toBeCloseTo(200, 0);
    expect(slope.r ?? 0).toBeGreaterThan(0.9);
  });

  it('refuses to report a slope from too few items', () => {
    const slope = decadePositionSlope([item(3, 900), item(7, 1500)]);
    expect(slope.msPerUnit).toBeNull();
    expect(slope.items).toBe(2);
  });

  it('ignores items without enough attempts to have a median', () => {
    const items = Array.from({ length: 30 }, (_unused, i) => item(i, 900, 1));
    expect(decadePositionSlope(items).msPerUnit).toBeNull();
  });
});

describe('derivationSlope', () => {
  it('is flat for a user whose latency does not track the arithmetic', () => {
    const items = Array.from({ length: 40 }, (_unused, i) => item(i * 2, 800));
    expect(derivationSlope(items).msPerUnit).toBeCloseTo(0, 6);
  });

  it('catches a user who is fast but still calculating', () => {
    // Every answer is under a second, so latency alone reads as fluent. The
    // cost still tracks the size of the sum, which recall has no reason to do.
    const items = Array.from({ length: 40 }, (_unused, i) => {
      const yy = i * 2;
      return item(yy, 400 + Math.floor(yy + Math.floor(yy / 4)) * 3);
    });
    const slope = derivationSlope(items);
    expect(slope.msPerUnit).toBeCloseTo(3, 1);
    expect(slope.r ?? 0).toBeGreaterThan(0.95);
    // And the point: every one of those medians is fast.
    expect(Math.max(...items.map((i) => i.attemptHistory[0].latencyMs))).toBeLessThan(1000);
  });
});

describe('adjacencyEffect', () => {
  // Alternates a neighbour step with a jump, so both groups clear the sample
  // floor: nine cousin pairs and nine unrelated ones.
  const ORDER = [
    3, 4, 40, 12, 13, 71, 80, 81, 22, 55, 56, 33, 60, 61, 90, 44, 45, 10, 70, 71, 26, 27, 50,
  ];

  /** Prompts in the given order, one every two seconds, at `latencyFor` each. */
  function session(order: number[], latencyFor: (yy: number, previous: number | null) => number) {
    const byYear = new Map<number, Attempt[]>();
    order.forEach((yy, i) => {
      const previous = i === 0 ? null : order[i - 1];
      const list = byYear.get(yy) ?? [];
      list.push(attempt({ timestamp: NOW + i * 2000, latencyMs: latencyFor(yy, previous) }));
      byYear.set(yy, list);
    });
    return [...byYear.entries()].map(([yy, attemptHistory]) => ({
      ...introduce(createItem(yy), NOW),
      attemptHistory,
    }));
  }

  it('finds no effect when neighbours buy the user nothing', () => {
    const items = session(ORDER, () => 900);
    const effect = adjacencyEffect(items);
    expect(effect.differenceMs).toBe(0);
  });

  it('measures how much faster an answer is after a neighbour', () => {
    const items = session(ORDER, (yy, previous) => {
      if (previous === null) return 1200;
      const cousin = Math.abs(yy - previous) === 1 || Math.floor(yy / 10) === Math.floor(previous / 10);
      return cousin ? 400 : 1200;
    });
    const effect = adjacencyEffect(items);
    expect(effect.afterCousinMs).toBe(400);
    expect(effect.afterOtherMs).toBe(1200);
    expect(effect.differenceMs).toBe(800);
  });

  it('will not compare across a gap long enough to be a different sitting', () => {
    const items = [
      { ...introduce(createItem(60), NOW), attemptHistory: [attempt({ timestamp: NOW })] },
      {
        ...introduce(createItem(61), NOW),
        attemptHistory: [attempt({ timestamp: NOW + 3_600_000 })],
      },
    ];
    expect(adjacencyEffect(items).afterCousinCount).toBe(0);
  });

  it('reports nothing rather than a number built on a handful of samples', () => {
    const items = session([3, 4, 40], () => 900);
    const effect = adjacencyEffect(items);
    expect(effect.differenceMs).toBeNull();
  });
});

describe('latencyCv', () => {
  it('is zero when every answer took the same time', () => {
    expect(latencyCv(item(42, 900, 10))).toBe(0);
  });

  it('needs enough attempts to mean anything', () => {
    expect(latencyCv(item(42, 900, 3))).toBeNull();
  });

  it('rises with the spread', () => {
    const spread: ItemState = {
      ...introduce(createItem(42), NOW),
      attemptHistory: [200, 1800, 400, 1600, 300, 1700, 500, 1500, 900, 1000].map((ms, i) =>
        attempt({ latencyMs: ms, timestamp: NOW + i * 3_600_000 }),
      ),
    };
    expect(latencyCv(spread) ?? 0).toBeGreaterThan(0.4);
  });
});

describe('routeReport', () => {
  it('says it has nothing rather than drawing a conclusion from an empty store', () => {
    const fresh = Array.from({ length: 100 }, (_unused, yy) => createItem(yy));
    expect(routeReport(fresh).hasData).toBe(false);
  });

  it('has data once there are enough scored attempts to regress', () => {
    const items = Array.from({ length: 30 }, (_unused, i) => item(i, 500 + (i % 10) * 200));
    expect(routeReport(items).hasData).toBe(true);
  });
});
