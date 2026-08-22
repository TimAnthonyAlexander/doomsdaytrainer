import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useMemo, useState, type ReactNode } from 'react';
import { AnswerPad, type AnswerOption } from '@/components/answer/AnswerPad';
import { Numeral } from '@/components/ui/Numeral';
import {
  GUIDED_STEP_COUNT,
  guidedClosingLine,
  guidedWalk,
  type GuidedStep,
} from '@/domain/guidedDate';
import type { CalendarDate, Code, IndexConvention } from '@/domain/types';
import { trueWeekdayName } from '@/domain/weekday';
import { LabelledValues } from '@/features/calc/LabelledValues';
import { MonthPad } from '@/features/weekday/MonthPad';
import { NumberInput } from '@/features/calc/NumberInput';
import { weekdayOptions } from '@/features/weekday/weekdayPad';
import { space } from '@/theme/tokens';
import { CenturyAnchorTable, MonthDoomsdayTable } from './ConceptTables';
import { toDateInput } from './conceptDate';

const CODE_OPTIONS: AnswerOption[] = Array.from({ length: 7 }, (_unused, value) => ({
  value,
  label: String(value),
}));

interface Progress {
  /** 0-based. Equal to `GUIDED_STEP_COUNT` once the walk is finished. */
  index: number;
  /** Wrong answers at the current step. Folded into the pad's prompt key. */
  attempts: number;
  /** The last value answered at this step, or null before the first answer. */
  chosen: number | null;
}

const START: Progress = { index: 0, attempts: 0, chosen: null };

export interface GuidedWalkViewProps {
  date: CalendarDate;
  /**
   * Which day the seven weekday buttons start on. A prop rather than a read of
   * `useAppState`, because onboarding mounts this before the choice has been
   * committed and committed settings would show the wrong pad there.
   */
  convention: IndexConvention;
  keyboard?: boolean;
  /** Drawn under the closing line once the walk is finished. */
  footer?: ReactNode;
}

/**
 * The answer, once it is right, in the face it belongs in: mono for a number,
 * because every numeral in the app is mono and tabular, and the text face for
 * the one step whose answer is a word.
 */
function SolvedValue({ step }: { step: GuidedStep }) {
  if (step.input === 'weekday') {
    return (
      <Typography variant="h1" component="p">
        {trueWeekdayName(step.answer as Code)}
      </Typography>
    );
  }
  return (
    <Numeral size={34} weight={500}>
      {step.answer}
    </Numeral>
  );
}

/**
 * One date taken all the way to its weekday, nine steps, the user answering
 * every one.
 *
 * Nothing here is timed and nothing here is written. It is a demonstration, so
 * there is no latency to grade, no attempt to record and no item to schedule —
 * `AnswerPad` measures a latency because that is what it does, and this screen
 * throws it away.
 *
 * A wrong answer never advances. The working appears, which contains the value
 * that was wanted, and the way on is answering with it. That is also why there
 * is no skip: whatever the user does not know, the screen ends up showing them,
 * and they can finish by answering with what is in front of them.
 */
export function GuidedWalkView({ date, convention, keyboard = true, footer }: GuidedWalkViewProps) {
  const walk = useMemo(() => guidedWalk(date), [date]);
  const dateId = toDateInput(date);

  const [seen, setSeen] = useState(dateId);
  const [progress, setProgress] = useState<Progress>(START);

  // A new date is a new walk. Adjusting during render rather than in an effect
  // keeps the first paint correct: an effect would show step 9 of the old date
  // for one frame.
  if (seen !== dateId) {
    setSeen(dateId);
    setProgress(START);
  }

  const weekdayPad = useMemo<AnswerOption[]>(
    () =>
      weekdayOptions(convention).map((option) => ({ value: option.value, label: option.short })),
    [convention],
  );

  if (progress.index >= GUIDED_STEP_COUNT) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${space[4]}px` }}>
        <Typography variant="h1" component="p">
          {guidedClosingLine(walk, Date.now())}
        </Typography>
        <Typography variant="body1" sx={{ color: 'var(--text-secondary)' }}>
          The century anchor and the month doomsday came off a table. Every other number on the way
          here you worked out.
        </Typography>
        {footer}
      </Box>
    );
  }

  const step = walk.steps[progress.index];
  const solved = progress.chosen !== null && progress.chosen === step.answer;
  const wrong = progress.chosen !== null && progress.chosen !== step.answer;
  const promptKey = `${dateId}-${step.id}-${progress.attempts}`;

  const answer = (value: number) => {
    if (solved) return;
    setProgress((current) => ({
      index: current.index,
      attempts: current.attempts + (value === step.answer ? 0 : 1),
      chosen: value,
    }));
  };

  const next = () => setProgress((current) => ({ index: current.index + 1, attempts: 0, chosen: null }));
  const last = progress.index === GUIDED_STEP_COUNT - 1;

  return (
    <Box
      data-testid="concept-step"
      sx={{ display: 'flex', flexDirection: 'column', gap: `${space[4]}px` }}
    >
      <Box>
        <Typography
          variant="body2"
          data-testid="concept-progress"
          sx={{ color: 'var(--text-secondary)' }}
        >
          {'Step '}
          <Numeral color="inherit" weight={500}>
            {step.position}
          </Numeral>
          {' of '}
          <Numeral color="inherit">{GUIDED_STEP_COUNT}</Numeral>
        </Typography>
        <Typography variant="h2" component="h2">
          {step.title}
        </Typography>
      </Box>

      {step.table === 'century' ? <CenturyAnchorTable /> : null}
      {step.table === 'month' ? <MonthDoomsdayTable /> : null}

      <LabelledValues lines={step.givens} />

      {step.note ? (
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          {step.note}
        </Typography>
      ) : null}

      <Typography variant="body1">{step.question}</Typography>
      <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
        {step.why}
      </Typography>

      <Box aria-live="polite">
        {solved ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${space[2]}px` }}>
            <Box>
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                {step.answerLabel}
              </Typography>
              <SolvedValue step={step} />
            </Box>
            <Typography variant="body1">{step.working}</Typography>
            {step.result ? <Typography variant="body1">{step.result}</Typography> : null}
          </Box>
        ) : wrong ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${space[2]}px` }}>
            <Typography variant="body2" sx={{ color: 'var(--grade-wrong)' }}>
              <Numeral color="inherit">{progress.chosen}</Numeral>
              {' is not it.'}
            </Typography>
            <Typography variant="body1">{step.working}</Typography>
          </Box>
        ) : null}
      </Box>

      {step.noop || solved ? (
        <Button variant="contained" onClick={next} sx={{ alignSelf: 'flex-start', minHeight: 48 }}>
          {last ? 'Finish' : 'Next step'}
        </Button>
      ) : step.input === 'count' ? (
        <NumberInput
          label={step.answerLabel}
          promptKey={promptKey}
          max={step.max}
          onAnswer={answer}
          wrong={wrong}
        />
      ) : step.input === 'monthDate' ? (
        <MonthPad
          onAnswer={answer}
          promptKey={promptKey}
          feedback={progress.chosen === null ? null : { chosen: progress.chosen, correct: step.answer }}
        />
      ) : (
        <AnswerPad
          options={step.input === 'weekday' ? weekdayPad : CODE_OPTIONS}
          onAnswer={answer}
          promptKey={promptKey}
          feedback={progress.chosen === null ? null : { chosen: progress.chosen, correct: step.answer }}
          keyboard={keyboard}
        />
      )}
    </Box>
  );
}
