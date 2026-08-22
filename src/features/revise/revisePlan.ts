import { dueItems, soonestDueAt } from '@/domain/scheduler';
import type { DrillMode, ItemState, Scope } from '@/domain/types';
import { modeStatuses } from '@/features/drills/drillPlan';
import { nextDueLabel } from '@/features/review/summary';

/**
 * The four things the Revise screen can start.
 *
 * Revise is the due queue and the only one that schedules. The other three are
 * the drills, unchanged: they record what you answer and leave `interval`,
 * `easeFactor`, `dueAt`, `repetitions` and `lapses` exactly where they were.
 */
export type ReviseMode = 'revise' | DrillMode;

/** Widened `ModeStatus`: same shape, one more mode in it. */
export interface ReviseStatus {
  mode: ReviseMode;
  label: string;
  /** One line of what the mode does. Always present. */
  detail: string;
  canRun: boolean;
  /** One line, set only when `canRun` is false. */
  reason: string | null;
}

/** What the screen opens on. The queue is the point of the app. */
export const DEFAULT_MODE: ReviseMode = 'revise';

/**
 * The Revise row.
 *
 * It stays runnable with an empty queue on purpose. Starting it then states
 * what is scheduled and when, which is a useful answer rather than a dead end,
 * and it is the behaviour the review screen has always had on an empty queue.
 */
export function reviseStatus(items: ItemState[], scope: Scope, now: number): ReviseStatus {
  const due = dueItems(items, scope, now).length;
  if (due > 0) {
    return {
      mode: 'revise',
      label: 'Revise',
      detail: `${due} ${due === 1 ? 'code' : 'codes'} due now, oldest first.`,
      canRun: true,
      reason: null,
    };
  }

  const next = nextDueLabel(soonestDueAt(items, scope, now), now);
  return {
    mode: 'revise',
    label: 'Revise',
    detail: next === null ? 'Nothing due now.' : `Nothing due now. Next code due ${next}.`,
    canRun: true,
    reason: null,
  };
}

/** Revise first, then the three drills in the order they have always been in. */
export function reviseStatuses(items: ItemState[], scope: Scope, now: number): ReviseStatus[] {
  return [reviseStatus(items, scope, now), ...modeStatuses(items, scope)];
}
