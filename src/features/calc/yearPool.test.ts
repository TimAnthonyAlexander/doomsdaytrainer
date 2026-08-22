import { describe, expect, it } from 'vitest';
import { drawYear } from './yearPool';

/** Always the first free year, so the sequence is exactly predictable. */
const first = () => 0;

describe('drawYear', () => {
  it('never asks the same year twice while an unused one is left', () => {
    const pool = [3, 7, 11];
    let used: number[] = [];
    const drawn: number[] = [];
    for (let i = 0; i < pool.length; i += 1) {
      const draw = drawYear(used, first, pool);
      drawn.push(draw.yy);
      used = draw.used;
    }
    expect([...drawn].sort((a, b) => a - b)).toEqual(pool);
  });

  it('starts the pool over once every year has been asked', () => {
    const pool = [3, 7];
    const draw = drawYear(pool, first, pool);
    expect(pool).toContain(draw.yy);
    expect(draw.used).toEqual([draw.yy]);
  });

  it('stays inside the pool for any value the generator returns', () => {
    const pool = [3, 7, 11];
    for (const value of [0, 0.5, 0.999999, 1, -1]) {
      expect(pool).toContain(drawYear([], () => value, pool).yy);
    }
  });

  it('draws from all 100 years by default', () => {
    const draw = drawYear([], () => 0.735);
    expect(draw.yy).toBe(73);
    expect(draw.used).toEqual([73]);
  });

  it('refuses an empty pool rather than returning nothing', () => {
    expect(() => drawYear([], first, [])).toThrow(RangeError);
  });
});
