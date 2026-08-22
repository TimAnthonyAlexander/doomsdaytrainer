import { describe, expect, it } from 'vitest';
import { createItem, introduce } from '@/domain/scheduler';
import { SCOPES } from '@/domain/scope';
import type { ItemState } from '@/domain/types';
import { DEFAULT_MODE, reviseStatus, reviseStatuses } from './revisePlan';

const FULL = SCOPES[0];
const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

function due(yy: number, dueAt: number): ItemState {
  return { ...introduce(createItem(yy), NOW), dueAt };
}

describe('reviseStatus', () => {
  it('counts what is due and labels the number', () => {
    const status = reviseStatus([due(40, NOW - 1000), due(41, NOW - 500)], FULL, NOW);
    expect(status.detail).toBe('2 codes due now, oldest first.');
    expect(status.canRun).toBe(true);
  });

  it('says one code rather than 1 codes', () => {
    expect(reviseStatus([due(40, NOW - 1000)], FULL, NOW).detail).toBe(
      '1 code due now, oldest first.',
    );
  });

  it('names when the next code returns once the queue is empty', () => {
    const status = reviseStatus([due(40, NOW + 3 * HOUR)], FULL, NOW);
    expect(status.detail).toBe('Nothing due now. Next code due in 3 hours.');
  });

  it('says nothing more when there is nothing scheduled at all', () => {
    expect(reviseStatus([createItem(40)], FULL, NOW).detail).toBe('Nothing due now.');
  });

  it('stays runnable on an empty queue, so the screen can state what is scheduled', () => {
    expect(reviseStatus([due(40, NOW + HOUR)], FULL, NOW).canRun).toBe(true);
  });

  it('ignores items outside the scope, the way the queue does', () => {
    const modern = SCOPES.find((scope) => scope.id === 'modern')!;
    expect(reviseStatus([due(40, NOW - 1000)], modern, NOW).detail).toBe('Nothing due now.');
  });
});

describe('reviseStatuses', () => {
  it('opens on Revise and keeps the three drills in their order', () => {
    const modes = reviseStatuses([due(40, NOW - 1000)], FULL, NOW).map((status) => status.mode);
    expect(modes).toEqual(['revise', 'sprint', 'gauntlet', 'decade']);
    expect(modes[0]).toBe(DEFAULT_MODE);
  });
});
