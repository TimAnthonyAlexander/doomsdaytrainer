import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo } from 'react';
import { AnswerPad, type AnswerOption } from '@/components/answer/AnswerPad';
import { Numeral } from '@/components/ui/Numeral';
import { Screen } from '@/components/ui/Screen';
import {
  datePartPrompt,
  methodPartQuestion,
  type MethodPart,
} from '@/domain/methodParts';
import { weekdayName } from '@/domain/weekday';
import type { WeekdayRangeId } from '@/domain/types';
import { useAppState } from '@/state/useAppState';
import { palette } from '@/theme/palette';
import { summarise } from '@/features/review/summary';
import { WorkingLines } from './WorkingLines';
import { partLifetimeLine, partSessionLine } from './partStats';
import { useMethodPartSession } from './useMethodPartSession';

/**
 * Plain digits, not weekday names.
 *
 * Both halves produce a number rather than a day. The date half's answer is a
 * count of days and was never a weekday at all; the year half's answer *is* a
 * weekday index, but it is Sunday-indexed like every other number in the app
 * (invariant 8), and the Tables drill asks for the century anchors as bare
 * digits for exactly the same reason. The name is on the worked answer instead,
 * where it can be read as a check rather than tapped as a choice.
 */
const DIGIT_OPTIONS: AnswerOption[] = Array.from({ length: 7 }, (_unused, value) => ({
  value,
  label: String(value),
}));

interface MethodPartTrainerProps {
  part: MethodPart;
  rangeId: WeekdayRangeId;
  /** The controls above the prompt. The screen owns them; this draws them. */
  header: React.ReactNode;
}

/**
 * One half of the method, on its own, timed.
 *
 * The full-date trainer cannot say where six seconds went: a date is two
 * lookups and two sums, and one tap at the end of it says only that the whole
 * thing was slow. These two split it down the middle — the year half is
 * `(century anchor + year code) mod 7`, the date half is
 * `(day - month doomsday) mod 7` — and each is timed alone, which is the same
 * argument the day-step trainer already makes for the final count.
 *
 * Nothing here schedules anything, and the screen says so nowhere because
 * nothing on it implies otherwise: there is no due count, no interval and no
 * best to beat, only the two lines of totals under the pad.
 */
export function MethodPartTrainer({ part, rangeId, header }: MethodPartTrainerProps) {
  const { settings, partTotals } = useAppState();
  const session = useMethodPartSession(part, rangeId);
  const { phase, advance, prompt } = session;

  // Correct answers advance themselves. Errors never do: the working has to be
  // read, and reading it takes as long as it takes.
  useEffect(() => {
    if (phase !== 'correct') return;
    const id = setTimeout(advance, Math.max(0, settings.autoAdvanceMs));
    return () => clearTimeout(id);
  }, [phase, advance, settings.autoAdvanceMs]);

  const summary = useMemo(() => summarise(session.results), [session.results]);
  const sessionText = partSessionLine(summary);
  const lifetimeText = partLifetimeLine(partTotals, part);

  const promptText =
    prompt.part === 'year' ? String(prompt.question.fullYear) : datePartPrompt(prompt.question);

  return (
    <Screen gap={2} sx={{ flex: 1 }}>
      {header}

      <Box
        sx={{
          // On a phone the pad belongs in the thumb zone, so the prompt takes
          // the space above it. On a desktop the two read better centred.
          flex: { xs: 1, md: '0 0 auto' },
          minHeight: { xs: 0, md: 200 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.5,
        }}
      >
        {/* The question, in words, above the thing being asked about. Without
            it the screen is a year over seven digits and nothing on it says
            which number it wants. */}
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          {methodPartQuestion(part)}
        </Typography>

        <Typography
          component="h1"
          sx={{
            m: 0,
            textAlign: 'center',
            fontSize: { xs: 40, sm: 48 },
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: '-0.01em',
            textWrap: 'balance',
          }}
        >
          {promptText}
        </Typography>

        {phase === 'wrong' ? (
          <>
            <Typography variant="h3" component="p" sx={{ color: palette.brandDeep }}>
              {/* The year half's answer is a weekday, so its name is worth
                  stating: a reader who knows 1973's doomsday was a Wednesday
                  can check the 3 against something they already hold. The date
                  half's answer is a count of days and has no name. */}
              {prompt.part === 'year'
                ? `${session.correctCode}  ${weekdayName(session.correctCode)}`
                : String(session.correctCode)}
            </Typography>
            <Box sx={{ width: '100%', maxWidth: 360 }}>
              <WorkingLines lines={session.lines} />
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
        options={DIGIT_OPTIONS}
        onAnswer={session.answer}
        promptKey={session.promptKey}
        feedback={
          session.chosen === null ? null : { chosen: session.chosen, correct: session.correctCode }
        }
        disabled={phase !== 'prompt'}
        keyboard={settings.keyboardInput}
      />

      {/* Both lines keep their place whether or not there is anything in them,
          so nothing below moves when the first answer lands. Named, because one
          of them is this sitting and the other is every sitting. */}
      <Box sx={{ display: 'grid', gap: 0.25 }}>
        <Numeral size={12} color={palette.inkMuted}>
          {sessionText === '' ? 'Nothing answered in this sitting.' : `This sitting: ${sessionText}`}
        </Numeral>
        <Numeral size={12} color={palette.inkFaint}>
          {lifetimeText === null ? 'No all-time figures yet.' : `All time: ${lifetimeText}`}
        </Numeral>
      </Box>
    </Screen>
  );
}
