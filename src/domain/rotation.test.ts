import { describe, expect, it } from 'vitest';
import { LOOKBACK, isCousin, nextUnburied, orderVaried, penaltyFor } from './rotation';
import { allYears, decadeOf } from './yearCodes';

const SEEDS = [0, 1, 2, 7, 13, 20_240, 999_999];

describe('isCousin', () => {
  it('is true within a decade and across an adjacent pair', () => {
    expect(isCousin(60, 69)).toBe(true);
    expect(isCousin(63, 63)).toBe(true);
    expect(isCousin(39, 40)).toBe(true); // adjacent across the decade edge
    expect(isCousin(9, 10)).toBe(true);
  });

  it('is false for years that share neither', () => {
    expect(isCousin(12, 47)).toBe(false);
    expect(isCousin(9, 11)).toBe(false);
  });
});

describe('penaltyFor', () => {
  it('blocks the immediate neighbour and the immediate decade outright', () => {
    expect(penaltyFor(64, [63])).toBeGreaterThanOrEqual(100);
    expect(penaltyFor(68, [63])).toBeGreaterThanOrEqual(100);
  });

  it('charges less for a collision further back than for the last prompt', () => {
    expect(penaltyFor(64, [12, 63])).toBeLessThan(penaltyFor(64, [63, 12]));
  });

  it('is zero for a year unrelated to anything recent', () => {
    expect(penaltyFor(47, [12, 63, 80])).toBe(0);
  });
});

describe('orderVaried', () => {
  it('returns every input exactly once', () => {
    for (const seed of SEEDS) {
      const order = orderVaried(allYears(), seed);
      expect([...order].sort((a, b) => a - b)).toEqual(allYears());
    }
  });

  it('never steps to an adjacent year', () => {
    for (const seed of SEEDS) {
      const order = orderVaried(allYears(), seed);
      for (let i = 1; i < order.length; i += 1) {
        expect(Math.abs(order[i] - order[i - 1])).not.toBe(1);
      }
    }
  });

  it('never puts two years of one decade back to back', () => {
    for (const seed of SEEDS) {
      const order = orderVaried(allYears(), seed);
      for (let i = 1; i < order.length; i += 1) {
        expect(decadeOf(order[i])).not.toBe(decadeOf(order[i - 1]));
      }
    }
  });

  it('is deterministic for a given pool and seed', () => {
    expect(orderVaried(allYears(), 42)).toEqual(orderVaried(allYears(), 42));
  });

  it('gives different seeds different orders', () => {
    const orders = SEEDS.map((seed) => orderVaried(allYears(), seed).join(','));
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it('is not a rotation of one fixed order', () => {
    // A coprime-stride walk would satisfy every constraint above and still make
    // "what follows 37" a fixed fact worth memorising, which would be the same
    // defect in a new shape. Successors have to actually differ by seed.
    const a = orderVaried(allYears(), 3);
    const b = orderVaried(allYears(), 11);
    const successor = (order: number[], yy: number) => order[order.indexOf(yy) + 1];
    const differing = allYears()
      .slice(0, 90)
      .filter((yy) => successor(a, yy) !== successor(b, yy));
    expect(differing.length).toBeGreaterThan(40);
  });

  it('handles a single decade, where the decade rule cannot be honoured', () => {
    const decade = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69];
    const order = orderVaried(decade, 5);
    expect([...order].sort((a, b) => a - b)).toEqual(decade);
    // The decade constraint is unsatisfiable here, but adjacency is not.
    for (let i = 1; i < order.length; i += 1) {
      expect(Math.abs(order[i] - order[i - 1])).not.toBe(1);
    }
  });

  it('degrades rather than looping on pools too small to constrain', () => {
    expect(orderVaried([], 1)).toEqual([]);
    expect(orderVaried([5], 1)).toEqual([5]);
    expect(orderVaried([5, 6], 1)).toEqual([5, 6]);
    expect([...orderVaried([5, 6, 7], 1)].sort((a, b) => a - b)).toEqual([5, 6, 7]);
  });

  it('does not mutate the pool it is given', () => {
    const pool = [9, 3, 71, 40];
    const snapshot = [...pool];
    orderVaried(pool, 2);
    expect(pool).toEqual(snapshot);
  });
});

describe('nextUnburied', () => {
  it('takes the head when nothing has been asked yet', () => {
    expect(nextUnburied([73, 12, 40], [])).toBe(73);
  });

  it('skips the rest of the decade just asked', () => {
    expect(nextUnburied([65, 68, 12], [63])).toBe(12);
  });

  it('skips an adjacent year from another decade', () => {
    expect(nextUnburied([40, 71], [39])).toBe(71);
  });

  it('only looks back as far as the window', () => {
    const recent = [63, 10, 20, 30];
    expect(recent.length).toBeGreaterThan(LOOKBACK);
    // 63 has fallen out of the window, so the sixties are askable again.
    expect(nextUnburied([65], recent)).toBe(65);
  });

  it('falls back to the head rather than refusing to ask anything', () => {
    // A narrow scope makes this routine: burying is a preference, never a
    // reason to end a session early.
    expect(nextUnburied([65, 66], [63])).toBe(65);
  });

  it('is null only for an empty queue', () => {
    expect(nextUnburied([], [63])).toBeNull();
  });
});
