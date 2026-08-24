import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { AnswerPad, type AnswerOption } from '@/components/answer/AnswerPad';
import { Numeral } from '@/components/ui/Numeral';
import { SplitFlapText, useFlipSettled } from '@/components/ui/SplitFlap';
import { CYCLE, cyclesRemoved, sevenStep, type CalcStep } from '@/domain/calc';
import type { CalcAttempt, YearKey } from '@/domain/types';
import { formatYear } from '@/domain/yearCodes';
import { useAppState } from '@/state/useAppState';
import { dur, transition, useReducedMotion } from '@/theme/motion';
import { space } from '@/theme/tokens';
import { NumberInput } from './NumberInput';
import { answerLabel, answerMax, usesPad } from './stepView';
import { answerRun, currentItem, skipCurrent, startRun, type RunState } from './runs';

/** How long a right answer stays on screen before the next step. */
const HOLD_MS = 400;

/** Codes go to the shared seven-button pad. Mirrors `AnswerField`'s own
 * constant — the runner renders the pad itself here rather than through
 * `AnswerField` so it can arm it, which `AnswerField` has no way to take. */
const CODE_OPTIONS: AnswerOption[] = Array.from({ length: 7 }, (_unused, value) => ({
  value,
  label: String(value),
}));

/**
 * How much a reduction step's confirmed answer already had taken off it, or
 * null when nothing did — a year already under 28, or a sum already under 7.
 *
 * Read from the domain rather than the display string. `reduce` always takes
 * whole 28s off `yy` itself, so the amount is `cyclesRemoved(yy) * CYCLE`
 * regardless of which step is on screen. `mod` always follows `sum` in both
 * derivations — `stepsFor`, `reducedStepsFor` and `stepsFromAnswers` all keep
 * that order — so the sum it reduced is simply the previous step's own
 * answer, carried answers and all: a mistake earlier in the chain changes
 * what came off exactly as it changes everything else about the step.
 */
function reductionAmount(step: CalcStep, yy: YearKey, items: readonly CalcStep[], index: number): number | null {
  if (step.id === 'reduce') {
    const removed = cyclesRemoved(yy) * CYCLE;
    return removed > 0 ? removed : null;
  }
  if (step.id === 'mod') {
    const sumAnswer = items[index - 1]?.answer;
    if (sumAnswer === undefined) return null;
    const { multiple } = sevenStep(sumAnswer);
    return multiple > 0 ? multiple : null;
  }
  return null;
}

/**
 * "−28", "−7" — the quantity a reduction step's answer just had taken off it.
 *
 * Muted and self-explaining rather than a new number to read: `reduceStep`
 * and `modStep` already name what came off in their question and working, but
 * neither is on screen during a *correct* answer's hold, which otherwise shows
 * a bare result. Fades and lifts out of the way over `dur.ui`, well inside the
 * hold, so it is never still sitting there when the next question replaces it
 * — an explanation of the answer that just landed, not a second thing to read
 * before moving on.
 */
function CameOffChip({ amount }: { amount: number }) {
  const reducedMotion = useReducedMotion();
  const [settled, setSettled] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;
    const raf = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  return (
    <Numeral
      size={13}
      color="var(--text-muted)"
      sx={{
        opacity: reducedMotion ? 1 : settled ? 0 : 1,
        transform: reducedMotion ? 'none' : settled ? 'translateY(-10px)' : 'translateY(0)',
        transition: reducedMotion ? 'none' : transition(['opacity', 'transform'], dur.ui),
      }}
    >
      {`−${amount}`}
    </Numeral>
  );
}

export interface StepRunResult {
  run: RunState<CalcStep>;
  /** What the user answered at each step, in order. */
  answers: number[];
}

interface StepRunnerProps {
  yy: YearKey;
  steps: CalcStep[];
  /** True when the reduce-first path is in use. Stored with every attempt. */
  reduced: boolean;
  keyboard: boolean;
  /**
   * True to keep a wrong answer on screen until the right one arrives. Practice
   * holds; verify does not, because a verify whose working can never be wrong
   * has nothing left to compare.
   */
  holdOnWrong: boolean;
  /**
   * Rebuilds the remaining steps from the answers given so far, so a mistake
   * carries forward the way it would on paper instead of being quietly
   * corrected by the next question. Verify passes this; the lessons do not,
   * because there the point is the step in isolation, not the chain.
   */
  carry?: (answers: number[]) => CalcStep[];
  onDone: (result: StepRunResult) => void;
}

/**
 * One year worked through, one step at a time, each step timed on its own.
 *
 * The per-step timing is the reason this mode exists. "Six seconds for a code"
 * says nothing a user can act on; "four of those six went on taking the sevens
 * off" says exactly what to practise. Only the first answer at a step is timed
 * and recorded — a retry is made against a screen that is already showing the
 * working, and counting it would flatter the number.
 */
export function StepRunner({ yy, steps, reduced, keyboard, holdOnWrong, carry, onDone }: StepRunnerProps) {
  const { recordCalcAttempt } = useAppState();
  const [run, setRun] = useState(() => startRun(steps));
  const [answers, setAnswers] = useState<number[]>([]);
  const [held, setHeld] = useState<number | null>(null);
  /** A wrong answer in a run that does not hold: read the working, then go on. */
  const [passed, setPassed] = useState<{ value: number; next: RunState<CalcStep> } | null>(null);
  const timer = useRef<number | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const step = currentItem(run);

  // The year above is what flaps (see the JSX below); this is the same
  // settling clock `AnswerPad`'s own `armed` prop is built on, so the pad
  // never starts timing an answer against a year that has not finished
  // landing. `yy` is fixed for the life of this component — both callers
  // remount it with `key={yy}` — so in practice this is only ever exercised
  // by a future caller that reuses the instance across years.
  const yearSettled = useFlipSettled(yy);

  const finish = (next: RunState<CalcStep>, given: number[]) => {
    if (next.done) {
      onDoneRef.current({ run: next, answers: given });
      return;
    }
    // Re-ask the rest of the derivation using what the user actually said.
    // Steps already answered keep their original wording so the screen does not
    // rewrite history behind them.
    if (carry) {
      const rebuilt = carry(given);
      setRun({ ...next, items: next.items.map((item, i) => (i < next.index ? item : rebuilt[i] ?? item)) });
      return;
    }
    setRun(next);
  };

  const handleAnswer = (value: number, latencyMs: number) => {
    if (step === null || held !== null || passed !== null) return;
    const firstAttempt = run.timings[run.index] === null;
    const result = answerRun(run, value, latencyMs);

    if (firstAttempt) {
      const attempt: CalcAttempt = {
        timestamp: Date.now(),
        yy,
        step: step.id,
        answered: value,
        correct: result.correct,
        latencyMs: Math.round(latencyMs),
        reduced,
      };
      void recordCalcAttempt(attempt);
      setAnswers((given) => [...given, value]);
    }

    if (result.correct) {
      setHeld(value);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setHeld(null);
        finish(result.state, firstAttempt ? [...answers, value] : answers);
      }, HOLD_MS);
      return;
    }

    if (holdOnWrong) {
      setRun(result.state);
      return;
    }

    setPassed({ value, next: skipCurrent(result.state) });
  };

  if (step === null) return null;

  const wrong = run.lastWrong ?? passed?.value ?? null;
  // Only ever computed for the hold a correct answer earns, on the two steps
  // that actually removed something.
  const cameOff = held === null ? null : reductionAmount(step, yy, run.items, run.index);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${space[4]}px` }}>
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          Year
        </Typography>
        <Box aria-label={formatYear(yy)} sx={{ display: 'inline-block' }}>
          <SplitFlapText text={formatYear(yy)} size={64} weight={500} mono />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: `${space[3]}px` }}>
        <Typography variant="body1">{step.question}</Typography>
        <Typography
          variant="body2"
          data-testid="calc-progress"
          sx={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
        >
          <Numeral color="inherit" weight={500}>
            {run.index + 1}
          </Numeral>
          {' of '}
          <Numeral color="inherit">{steps.length}</Numeral>
        </Typography>
      </Box>

      {/* Fixed floor, so the input does not move when the working appears. */}
      <Box sx={{ minHeight: 96 }}>
        {held !== null ? (
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Box>
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                {answerLabel(step.id)}
              </Typography>
              <Numeral size={34} weight={500}>
                {held}
              </Numeral>
            </Box>
            {cameOff === null ? null : <CameOffChip amount={cameOff} />}
          </Box>
        ) : wrong !== null ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${space[2]}px` }}>
            <Typography variant="body2" sx={{ color: 'var(--grade-wrong)' }}>
              <Numeral color="inherit">{wrong}</Numeral>
              {' is not it.'}
            </Typography>
            <Typography variant="body1">{step.working}</Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
              {step.why}
            </Typography>
          </Box>
        ) : null}
      </Box>

      {passed !== null ? (
        <Button
          fullWidth
          variant="outlined"
          color="inherit"
          onClick={() => {
            const next = passed.next;
            setPassed(null);
            finish(next, answers);
          }}
        >
          Next step
        </Button>
      ) : usesPad(step) ? (
        <AnswerPad
          options={CODE_OPTIONS}
          onAnswer={handleAnswer}
          // Callers fold their wrong-answer count into `promptKey`. Without
          // that the pad would refuse the retry, since a wrong answer leaves
          // the same question on screen and the pad answers each key once.
          promptKey={`${yy}-${run.index}-${step.id}-${run.wrongTotal}`}
          feedback={run.lastWrong === null ? null : { chosen: run.lastWrong, correct: step.answer }}
          disabled={held !== null}
          keyboard={keyboard}
          armed={yearSettled}
        />
      ) : (
        <NumberInput
          label={answerLabel(step.id)}
          promptKey={`${yy}-${run.index}-${step.id}-${run.wrongTotal}`}
          max={answerMax(step.id)}
          onAnswer={handleAnswer}
          disabled={held !== null}
          wrong={run.lastWrong !== null}
        />
      )}
    </Box>
  );
}
