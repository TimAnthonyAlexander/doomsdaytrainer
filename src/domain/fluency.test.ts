import { describe, expect, it } from 'vitest';
import type { Attempt, Settings } from './types';
import {
  FLUENT_RUN,
  LAPSE_RUN,
  applyFluency,
  buildFluency,
  countsTowardFluency,
  emptyFluency,
  qualifies,
} from './fluency';
import { addDays } from './time';

const settings: Settings = {
  scopeId: 'full',
  customScope: { from: 0, to: 99 },
  newItemsPerDay: 20,
  fastThresholdMs: 2000,
  mediumThresholdMs: 5000,
  hintType: 'arithmetic',
  answerWindowMs: null,
  autoAdvanceMs: 250,
  keyboardInput: false,
  spokenPrompts: false,
  spokenReviewPrompts: false,
  reminderEnabled: false,
  reminderTime: '19:00',
  eveningReminderEnabled: false,
  structureLessonSeen: true,
  onboardingComplete: true,
};

const DAY_ONE = new Date(2026, 4, 20, 10, 0, 0).getTime();

function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    timestamp: DAY_ONE,
    correct: true,
    latencyMs: 700,
    answered: 0,
    hintUsed: false,
    source: 'review',
    ...over,
  };
}

/** Answers on `days` consecutive days, folded in order. */
function over(days: number[], over_: Partial<Attempt> = {}) {
  let state = emptyFluency();
  for (const day of days) {
    state = applyFluency(state, attempt({ timestamp: addDays(DAY_ONE, day), ...over_ }), settings);
  }
  return state;
}

describe('qualifies', () => {
  it('needs correct, unhinted and under the fast threshold', () => {
    expect(qualifies(attempt({ latencyMs: 1999 }), settings)).toBe(true);
    expect(qualifies(attempt({ latencyMs: 2000 }), settings)).toBe(false);
    expect(qualifies(attempt({ hintUsed: true }), settings)).toBe(false);
    expect(qualifies(attempt({ correct: false, latencyMs: 100 }), settings)).toBe(false);
  });

  it('reads the threshold from settings rather than a constant', () => {
    const strict = { ...settings, fastThresholdMs: 600 };
    expect(qualifies(attempt({ latencyMs: 700 }), settings)).toBe(true);
    expect(qualifies(attempt({ latencyMs: 700 }), strict)).toBe(false);
  });
});

describe('applyFluency', () => {
  it('needs two qualifying answers to become fluent', () => {
    expect(FLUENT_RUN).toBe(2);
    expect(over([0]).fluent).toBe(false);
    expect(over([0, 1]).fluent).toBe(true);
  });

  it('will not let one sitting make an item fluent', () => {
    // Two fast taps ten seconds apart are one event, not two. The run only
    // advances on a day that has not already contributed.
    let state = applyFluency(emptyFluency(), attempt(), settings);
    state = applyFluency(state, attempt({ timestamp: DAY_ONE + 10_000 }), settings);
    expect(state.consecutiveFast).toBe(1);
    expect(state.fluent).toBe(false);

    state = applyFluency(state, attempt({ timestamp: addDays(DAY_ONE, 1) }), settings);
    expect(state.fluent).toBe(true);
  });

  it('records when fluency was first reached and does not move it after', () => {
    const reached = over([0, 1]);
    expect(reached.fluentAt).not.toBeNull();
    const later = applyFluency(
      reached,
      attempt({ timestamp: addDays(DAY_ONE, 9) }),
      settings,
    );
    expect(later.fluentAt).toBe(reached.fluentAt);
  });

  it('a wrong answer clears the run and takes fluency away at once', () => {
    const fluent = over([0, 1]);
    const wrong = applyFluency(fluent, attempt({ correct: false }), settings);
    expect(wrong.consecutiveFast).toBe(0);
    expect(wrong.fluent).toBe(false);
    expect(wrong.fluentAt).toBeNull();
  });

  it('keeps fluency through one slow answer and drops it on the second', () => {
    expect(LAPSE_RUN).toBe(2);
    const fluent = over([0, 1]);
    const once = applyFluency(fluent, attempt({ latencyMs: 4000 }), settings);
    expect(once.fluent).toBe(true);
    expect(once.consecutiveFast).toBe(0);

    const twice = applyFluency(once, attempt({ latencyMs: 4000 }), settings);
    expect(twice.fluent).toBe(false);
    expect(twice.fluentAt).toBeNull();
  });

  it('treats a hinted answer as not qualifying however fast it was', () => {
    const state = over([0, 1], { hintUsed: true, latencyMs: 50 });
    expect(state.fluent).toBe(false);
    expect(state.consecutiveSlow).toBe(2);
  });

  it('a fast answer resets the slow run before it can cost fluency', () => {
    const fluent = over([0, 1]);
    let state = applyFluency(fluent, attempt({ latencyMs: 4000 }), settings);
    state = applyFluency(state, attempt({ timestamp: addDays(DAY_ONE, 3) }), settings);
    state = applyFluency(state, attempt({ timestamp: addDays(DAY_ONE, 4), latencyMs: 4000 }), settings);
    expect(state.fluent).toBe(true);
  });

  it('never mutates the state it is given', () => {
    const state = emptyFluency();
    Object.freeze(state);
    expect(() => applyFluency(state, attempt(), settings)).not.toThrow();
    expect(state.consecutiveFast).toBe(0);
  });
});

describe('countsTowardFluency', () => {
  it('takes the surfaces that schedule and refuses the ones that do not', () => {
    expect(countsTowardFluency('review')).toBe(true);
    expect(countsTowardFluency('trouble')).toBe(true);
    expect(countsTowardFluency('month')).toBe(true);
    expect(countsTowardFluency('century')).toBe(true);
    // A sixty-second sprint is not evidence of durable recall, and learn-mode
    // taps happen with the answer on screen a moment earlier.
    expect(countsTowardFluency('sprint')).toBe(false);
    expect(countsTowardFluency('gauntlet')).toBe(false);
    expect(countsTowardFluency('decade')).toBe(false);
    expect(countsTowardFluency('learn')).toBe(false);
  });
});

describe('buildFluency', () => {
  it('replays a history into the state those answers earned', () => {
    const history = [
      attempt({ timestamp: DAY_ONE }),
      attempt({ timestamp: addDays(DAY_ONE, 1) }),
    ];
    expect(buildFluency(history, settings)).toEqual(over([0, 1]));
  });

  it('ignores drill and learn attempts mixed into the same log', () => {
    const history = [
      attempt({ timestamp: DAY_ONE }),
      attempt({ timestamp: DAY_ONE, source: 'sprint', correct: false }),
      attempt({ timestamp: addDays(DAY_ONE, 1), source: 'learn', latencyMs: 9000 }),
      attempt({ timestamp: addDays(DAY_ONE, 1) }),
    ];
    expect(buildFluency(history, settings).fluent).toBe(true);
  });

  it('starts empty for an item with no history at all', () => {
    expect(buildFluency([], settings)).toEqual(emptyFluency());
  });
});
