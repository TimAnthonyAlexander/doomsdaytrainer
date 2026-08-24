import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { AnswerPad, type AnswerOption } from '@/components/answer/AnswerPad';
import { Numeral } from '@/components/ui/Numeral';
import {
  anchorMonthLabel,
  describeAnchor,
  describeTarget,
  ordinalSuffix,
  type DayStepWorking,
} from '@/domain/dayStep';
import { weekdayName } from '@/domain/weekday';
import { useAppState } from '@/state/useAppState';
import { palette } from '@/theme/palette';
import { DayStepTotalsView } from './DayStepTotalsView';
import { WorkingLines } from './WorkingLines';
import { sessionLine } from './dayStepStats';
import { useDayStepSession } from './useDayStepSession';
import { weekdayOptions } from './weekdayPad';

interface DayStepViewProps {
  onBack: () => void;
}

function BackRow({ onBack }: DayStepViewProps) {
  return (
    <ButtonBase
      onClick={onBack}
      sx={{
        alignSelf: 'flex-start',
        minHeight: 48,
        pr: 1.25,
        gap: 0.5,
        borderRadius: 1,
        color: 'text.secondary',
        '&:hover': { color: 'primary.main' },
      }}
    >
      <ChevronLeft size={18} strokeWidth={1.75} aria-hidden />
      <Typography component="span" variant="body2">
        Doomsdays
      </Typography>
    </ButtonBase>
  );
}

/**
 * A day of the month: the digits in the mono face, the ordinal suffix in the
 * text face. The size is inherited from whatever it sits in, so the prompt and
 * the line above it keep their own scales.
 */
function Day({ value }: { value: number }) {
  return (
    <>
      <Numeral size="inherit" weight={600} lineHeight={1.1}>
        {value}
      </Numeral>
      {ordinalSuffix(value)}
    </>
  );
}

/**
 * The four labelled lines behind the answer.
 *
 * A wrong tap here has only two places to have gone wrong, the subtraction or
 * the reduction, so this is shorter than the full-date working. It is still
 * every number with the label that names it: bare arithmetic teaches nothing
 * about where the terms came from.
 */
function Working({ working }: { working: DayStepWorking }) {
  return <WorkingLines lines={working.lines} />;
}

/**
 * The last step of the method, timed on its own: a month, the weekday its
 * doomsday falls on, and one other day to reach.
 *
 * The doomsday's weekday is handed over rather than recalled, so nothing on
 * this screen is a review of anything and nothing is scheduled. What it
 * measures is the count, and only the count.
 */
export function DayStepView({ onBack }: DayStepViewProps) {
  const { settings, dayStepTotals } = useAppState();
  const session = useDayStepSession();
  const { phase, advance, question, working } = session;

  // Correct answers advance themselves. A wrong one never does: the working has
  // to be read, and reading it takes as long as it takes.
  useEffect(() => {
    if (phase !== 'correct') return;
    const id = setTimeout(advance, Math.max(0, settings.autoAdvanceMs));
    return () => clearTimeout(id);
  }, [phase, advance, settings.autoAdvanceMs]);

  const options = useMemo<AnswerOption[]>(
    () =>
      weekdayOptions().map((option) => ({
        value: option.value,
        label: option.short,
      })),
    [],
  );

  const line = sessionLine(session.summary);

  return (
    <>
      <BackRow onBack={onBack} />

      <Box
        sx={{
          flex: { xs: 1, md: '0 0 auto' },
          minHeight: { xs: 0, md: 180 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.5,
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          In {anchorMonthLabel(question)}, the <Day value={question.anchorDay} /> is a{' '}
          {weekdayName(question.anchorWeekday)}.
        </Typography>

        <Typography
          component="h1"
          aria-label={`${describeAnchor(question)} ${describeTarget(question)}`}
          sx={{
            m: 0,
            textAlign: 'center',
            fontSize: { xs: 34, sm: 42 },
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: '-0.01em',
            textWrap: 'balance',
          }}
        >
          What is the <Day value={question.targetDay} />?
        </Typography>

        {phase === 'wrong' ? (
          <>
            <Typography variant="h3" component="p" sx={{ color: palette.brandDeep }}>
              {weekdayName(session.correctCode)}
            </Typography>
            <Box sx={{ width: '100%', maxWidth: 360 }}>
              <Working working={working} />
            </Box>
          </>
        ) : null}
      </Box>

      {phase === 'wrong' ? (
        // Above the pad, so a fast second tap in the thumb zone lands on a dead
        // button rather than on "continue".
        <Button fullWidth variant="outlined" color="inherit" autoFocus onClick={advance} sx={{ mb: 1 }}>
          Continue
        </Button>
      ) : null}

      <AnswerPad
        options={options}
        onAnswer={session.answer}
        promptKey={session.promptKey}
        feedback={
          session.chosen === null ? null : { chosen: session.chosen, correct: session.correctCode }
        }
        disabled={phase !== 'prompt'}
        keyboard={settings.keyboardInput}
        // A hard window belongs here for the same reason it belongs in a drill:
        // nothing on this screen writes scheduling state, so running out is a
        // miss and not a corrupted item.
        windowMs={settings.answerWindowMs}
        onExpire={() => session.expire(settings.answerWindowMs ?? 0)}
      />

      {/* Named, because the two blocks under it are all-time and this one is
          not. The line keeps its place whether or not there is anything in it,
          so nothing below it moves when the first answer lands. */}
      <Numeral size={12} color={palette.inkMuted}>
        {line === '' ? 'Nothing answered in this sitting.' : `This sitting: ${line}`}
      </Numeral>

      <DayStepTotalsView lifetime={dayStepTotals} />
    </>
  );
}
