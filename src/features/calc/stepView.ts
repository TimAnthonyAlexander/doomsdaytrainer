/**
 * How a `CalcStep` from the domain is put on screen: which steps the reduce
 * toggle asks for, which input can take the answer, and what each step is
 * called in a list of timings.
 */

import {
  CYCLE,
  MAX_RAW_SUM,
  leapDays,
  reducedStepsFor,
  stepsFor,
  stepsFromAnswers,
  type CalcStep,
  type CarriedAnswers,
} from '@/domain/calc';
import type { CalcStepId, YearKey } from '@/domain/types';

/**
 * The steps the practice screen asks for. The toggle is the whole difference:
 * reduce-first adds one question at the front and shrinks every number after it.
 */
export function stepsForMode(yy: YearKey, reduceFirst: boolean): CalcStep[] {
  return reduceFirst ? reducedStepsFor(yy) : stepsFor(yy);
}

/**
 * The same derivation rebuilt from the answers already given, in the order the
 * steps are asked. Used by verify, where a wrong intermediate value has to be
 * carried rather than silently replaced by the right one.
 */
export function carryFor(yy: YearKey, given: number[], reduceFirst: boolean): CalcStep[] {
  const ids = reduceFirst ? ['reduce', 'leap', 'sum'] : ['leap', 'sum'];
  const answers: CarriedAnswers = {};
  ids.forEach((id, index) => {
    if (index < given.length) answers[id as keyof CarriedAnswers] = given[index];
  });
  return stepsFromAnswers(yy, answers, reduceFirst);
}

/**
 * The two steps whose answer is a code, 0-6, and so the two the seven-button
 * pad can take. The others answer with a leap-day count (to 24), a sum (to 123)
 * or a reduced year (to 27), and there is no seven-option pad for those.
 */
const PAD_STEPS: readonly CalcStepId[] = ['mod', 'code'];

/**
 * True when the seven-button pad can take this step's answer.
 *
 * The id decides it, not the value: `sum` for year 04 happens to answer 5, and
 * a screen that swapped the input for that one year would move the control the
 * user's thumb is already aimed at. The value is checked as well so a step that
 * ever answered outside 0-6 could not be routed to a pad that cannot show it.
 */
export function usesPad(step: CalcStep): boolean {
  return PAD_STEPS.includes(step.id) && step.answer >= 0 && step.answer <= 6;
}

const STEP_LABELS: Record<CalcStepId, string> = {
  reduce: 'Take off 28s',
  leap: 'Leap days',
  sum: 'Add them',
  mod: 'Take off sevens',
  code: 'From memory',
};

/** The short name a step goes by in a timing row or a stat card. */
export function stepLabel(id: CalcStepId): string {
  return STEP_LABELS[id];
}

/**
 * The step named inside a sentence. "Take off sevens is your slowest step" does
 * not read as English, so the prose form is separate from the column label.
 */
const STEP_PROSE: Record<CalcStepId, string> = {
  reduce: 'taking the 28s off',
  leap: 'counting the leap days',
  sum: 'adding them together',
  mod: 'taking the sevens off',
  code: 'remembering the code',
};

export function stepProse(id: CalcStepId): string {
  return STEP_PROSE[id];
}

/** What the answer to this step is, for the label above the input. */
const ANSWER_LABELS: Record<CalcStepId, string> = {
  reduce: 'Year to work with',
  leap: 'Leap days',
  sum: 'Year plus leap days',
  mod: 'The code',
  code: 'The code',
};

export function answerLabel(id: CalcStepId): string {
  return ANSWER_LABELS[id];
}

/**
 * The largest answer a step of this kind can have, over every year — never the
 * answer to the question on screen. It sets how many digits the typed field
 * takes, and a cap fitted to the current answer would say how long that answer
 * is before the user has worked it out.
 */
const ANSWER_MAX: Record<CalcStepId, number> = {
  reduce: CYCLE - 1,
  leap: leapDays(99),
  sum: MAX_RAW_SUM,
  mod: 6,
  code: 6,
};

export function answerMax(id: CalcStepId): number {
  return ANSWER_MAX[id];
}
