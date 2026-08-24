import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useMemo, useState, type ReactNode } from 'react';
import { AnswerPad, type AnswerOption } from '@/components/answer/AnswerPad';
import { Numeral } from '@/components/ui/Numeral';
import {
  GUIDED_STEP_COUNT,
  goalOf,
  guidedClosingLine,
  guidedWalk,
} from '@/domain/guidedDate';
import type { CalendarDate } from '@/domain/types';
import { NumberInput } from '@/features/calc/NumberInput';
import { weekdayOptions } from '@/features/weekday/weekdayPad';
import { radius, space, stroke } from '@/theme/tokens';
import { ChoicePad } from './ChoicePad';
import { DatePick } from './DatePick';
import { GoalLedger } from './GoalLedger';
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
  onDate: (date: CalendarDate) => void;
  keyboard?: boolean;
  /**
   * The screen's own heading and blurb. Shown while the walk has not started
   * and dropped the moment it has: once the user is answering, a title and a
   * paragraph explaining the screen are two more things competing with the one
   * thing they are supposed to be looking at.
   */
  intro?: ReactNode;
}

/** How far along, as a rule rather than a sentence. */
function ProgressRule({ done }: { done: number }) {
  return (
    <Box
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={GUIDED_STEP_COUNT}
      aria-valuenow={done}
      aria-label="Steps done"
      sx={{ height: 3, borderRadius: 2, bgcolor: 'var(--surface-2)', overflow: 'hidden' }}
    >
      <Box
        sx={{
          width: `${(done / GUIDED_STEP_COUNT) * 100}%`,
          height: '100%',
          bgcolor: 'var(--brand)',
          transition: 'width 160ms ease-out',
        }}
      />
    </Box>
  );
}

/**
 * One date taken all the way to its weekday, twelve steps, the user answering
 * every one.
 *
 * It is a demonstration rather than practice, so no question on it can be got
 * wrong through not having followed an explanation: every one is arithmetic on
 * numbers already on the screen, or which weekday a number names. The app hands
 * over every lookup. See `guidedDate.ts`, which is where that rule is enforced.
 *
 * The screen holds five things at once and no more: the date, how far along it
 * is, what is being built, the row being answered, and the input. An earlier
 * version had fourteen — a reference table, three equations, the givens, a why,
 * a note, the question, the answer label, the working and a result line — and
 * the person it was built for could not tell which of them he was answering.
 * Anything that would be a sixth thing has to displace one of the five.
 *
 * Nothing here is timed and nothing here is written. `AnswerPad` measures a
 * latency because that is what it does, and this screen throws it away.
 *
 * A wrong answer never advances. The working appears, which contains the value
 * that was wanted, and the way on is answering with it. That is also why there
 * is no skip: whatever the user does not know, the screen ends up showing them.
 */
export function GuidedWalkView({
  date,
  onDate,
  keyboard = true,
  intro,
}: GuidedWalkViewProps) {
  const walk = useMemo(() => guidedWalk(date), [date]);
  const dateId = toDateInput(date);

  const [seen, setSeen] = useState(dateId);
  const [progress, setProgress] = useState<Progress>(START);
  const [picking, setPicking] = useState(false);

  // A new date is a new walk. Adjusting during render rather than in an effect
  // keeps the first paint correct: an effect would show the last step of the old
  // date for one frame.
  if (seen !== dateId) {
    setSeen(dateId);
    setProgress(START);
    setPicking(false);
  }

  const weekdayPad = useMemo<AnswerOption[]>(
    () =>
      weekdayOptions().map((option) => ({ value: option.value, label: option.short })),
    [],
  );

  const finished = progress.index >= GUIDED_STEP_COUNT;
  const started = progress.index > 0 || progress.chosen !== null;
  const step = finished ? null : walk.steps[progress.index];
  const solved = step !== null && (step.noop || progress.chosen === step.answer);
  const wrong = step !== null && progress.chosen !== null && progress.chosen !== step.answer;

  const answer = (value: number) => {
    if (solved) return;
    setProgress((current) => ({
      index: current.index,
      attempts: current.attempts + (value === step?.answer ? 0 : 1),
      chosen: value,
    }));
  };

  const next = () =>
    setProgress((current) => ({ index: current.index + 1, attempts: 0, chosen: null }));

  const header =
    started && !picking ? (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: `${space[3]}px`,
        }}
      >
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          {walk.dateLabel}
        </Typography>
        <Button
          variant="text"
          color="inherit"
          onClick={() => setPicking(true)}
          sx={{ minHeight: 40, color: 'var(--text-secondary)' }}
        >
          Change date
        </Button>
      </Box>
    ) : (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${space[3]}px` }}>
        {started ? null : intro}
        <DatePick date={date} onDate={onDate} />
      </Box>
    );

  if (finished) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${space[4]}px` }}>
        {header}
        <ProgressRule done={GUIDED_STEP_COUNT} />
        <Typography variant="h1" component="p">
          {guidedClosingLine(walk, Date.now())}
        </Typography>
        <Typography variant="body1" sx={{ color: 'var(--text-secondary)' }}>
          The anchor and the doomsday dates came off a table. Every other number on the way here you
          worked out.
        </Typography>
      </Box>
    );
  }

  const current = step as NonNullable<typeof step>;
  const promptKey = `${dateId}-${current.id}-${progress.attempts}`;
  const last = progress.index === GUIDED_STEP_COUNT - 1;

  return (
    <Box
      data-testid="concept-step"
      sx={{ display: 'flex', flexDirection: 'column', gap: `${space[4]}px` }}
    >
      {header}
      <ProgressRule done={progress.index} />

      <GoalLedger
        walk={walk}
        stepsDone={progress.index}
        goal={goalOf(walk, current.goal)}
        answered={solved}
      />

      <Box aria-live="polite" sx={{ minHeight: 24 }}>
        {wrong ? (
          <Box
            sx={{
              px: `${space[3]}px`,
              py: `${space[2]}px`,
              borderRadius: `${radius.md}px`,
              border: stroke.hairline,
              borderColor: 'var(--grade-wrong)',
            }}
          >
            <Typography variant="body2" sx={{ color: 'var(--grade-wrong)' }}>
              <Numeral color="inherit">{progress.chosen}</Numeral>
              {' is not it.'}
            </Typography>
            <Typography variant="body1">{current.working}</Typography>
          </Box>
        ) : current.why === '' ? null : (
          // Kept up after a correct answer rather than swapped out. It explains
          // the operation, not the outcome, and a line that vanishes on the tap
          // moves everything under it at the moment the eye is on the pad.
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
            {current.why}
          </Typography>
        )}
      </Box>

      {current.noop || solved ? (
        <Button variant="contained" onClick={next} sx={{ alignSelf: 'flex-start', minHeight: 48 }}>
          {last ? 'Finish' : 'Next'}
        </Button>
      ) : current.input === 'count' ? (
        <NumberInput
          label={current.answerLabel}
          labelHidden
          promptKey={promptKey}
          max={current.max}
          onAnswer={answer}
          wrong={wrong}
        />
      ) : current.input === 'choice' ? (
        <ChoicePad
          options={current.choices}
          onAnswer={answer}
          promptKey={promptKey}
          feedback={
            progress.chosen === null ? null : { chosen: progress.chosen, correct: current.answer }
          }
        />
      ) : (
        <AnswerPad
          options={current.input === 'weekday' ? weekdayPad : CODE_OPTIONS}
          onAnswer={answer}
          promptKey={promptKey}
          feedback={
            progress.chosen === null ? null : { chosen: progress.chosen, correct: current.answer }
          }
          keyboard={keyboard}
        />
      )}
    </Box>
  );
}
