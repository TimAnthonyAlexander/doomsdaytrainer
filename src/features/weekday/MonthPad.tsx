import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useAnswerTimer } from '@/components/answer/useAnswerTimer';
import { Numeral } from '@/components/ui/Numeral';
import { palette } from '@/theme/palette';
import { monthPadDays } from './weekdayPad';

interface MonthPadFeedback {
  chosen: number;
  /** The date the table teaches. */
  canonical: number;
  /** Every date that lands on the doomsday, the taught one included. */
  accepted: readonly number[];
  /**
   * Draw the other doomsday dates as well. Only while the screen is holding —
   * a correct answer on the taught date auto-advances in a quarter of a second,
   * and three extra rings flashing past it teach nothing the user just proved.
   */
  reveal: boolean;
}

interface MonthPadProps {
  /** 1-based. */
  month: number;
  leapYear: boolean;
  onAnswer: (value: number, latencyMs: number) => void;
  promptKey: string | number;
  feedback?: MonthPadFeedback | null;
  disabled?: boolean;
}

type Tone = 'idle' | 'pressed' | 'right' | 'wrong' | 'answer' | 'alsoRight';

/** Same rule as AnswerPad: neutral until answered, grading colours only then. */
const TONE_SX: Record<Tone, Record<string, string>> = {
  idle: { backgroundColor: palette.paper, color: palette.ink, boxShadow: `inset 0 0 0 1px ${palette.rule}` },
  pressed: {
    backgroundColor: palette.paper,
    color: palette.ink,
    boxShadow: `inset 0 0 0 1px ${palette.ruleStrong}`,
  },
  right: {
    backgroundColor: palette.gradeFast,
    color: palette.inkInverse,
    boxShadow: `inset 0 0 0 1px ${palette.gradeFast}`,
  },
  wrong: {
    backgroundColor: palette.gradeWrong,
    color: palette.inkInverse,
    boxShadow: `inset 0 0 0 1px ${palette.gradeWrong}`,
  },
  answer: {
    backgroundColor: palette.paper,
    color: palette.ink,
    boxShadow: `inset 0 0 0 2px ${palette.gradeFast}`,
  },
  // The other dates that fall on the doomsday. Drawn, but drawn quieter than
  // the taught one: they are true, and one of them is the thing to remember.
  alsoRight: {
    backgroundColor: palette.paper,
    color: palette.ink,
    boxShadow: `inset 0 0 0 1px ${palette.gradeFast}`,
  },
};

function toneFor(value: number, feedback: MonthPadFeedback | null, pressed: number | null): Tone {
  if (!feedback) return pressed === value ? 'pressed' : 'idle';
  if (feedback.chosen === value) return feedback.accepted.includes(value) ? 'right' : 'wrong';
  if (!feedback.reveal) return 'idle';
  if (feedback.canonical === value) return 'answer';
  return feedback.accepted.includes(value) ? 'alsoRight' : 'idle';
}

/**
 * The month-doomsday pad: every day the month has, seven to a row.
 *
 * Seven columns is the one decision here. Dates a whole week apart land in the
 * same column, so after an answer the dates that share the doomsday's weekday
 * read as a vertical line rather than as four unrelated highlights — which is
 * the fact the month has more than one doomsday *because of*.
 *
 * `AnswerPad` cannot do this: seven fixed buttons is the contract that trains
 * position memory on the codes 0 to 6, and a month has 28 to 31 answers.
 */
export function MonthPad({
  month,
  leapYear,
  onAnswer,
  promptKey,
  feedback = null,
  disabled = false,
}: MonthPadProps) {
  const [pressed, setPressed] = useState<number | null>(null);
  const answered = useRef(false);
  const timer = useAnswerTimer(promptKey);

  useLayoutEffect(() => {
    answered.current = false;
    setPressed(null);
  }, [promptKey]);

  const select = useCallback(
    (value: number) => {
      if (disabled || answered.current) return;
      // See AnswerPad: a tap before the prompt has painted is the previous
      // answer's second tap, not this one's, and would record 0ms.
      if (!timer.running()) return;
      answered.current = true;
      setPressed(value);
      onAnswer(value, timer.elapsedMs());
    },
    [disabled, onAnswer, timer],
  );

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gap: { xs: '5px', sm: '8px' },
      }}
    >
      {monthPadDays(month, leapYear).map((value) => {
        const tone = toneFor(value, feedback, pressed);
        return (
          <ButtonBase
            key={value}
            disableRipple
            disabled={disabled}
            aria-label={`Day ${value}`}
            onClick={() => select(value)}
            sx={{
              minHeight: { xs: 44, sm: 52 },
              borderRadius: 1.25,
              transition:
                'background-color 140ms ease-out, color 140ms ease-out, box-shadow 140ms ease-out',
              ...TONE_SX[tone],
              '&.Mui-disabled': { opacity: 1 },
              '&:focus-visible': { outline: `2px solid ${palette.brand}`, outlineOffset: 2 },
              ...(tone === 'idle'
                ? { '@media (hover: hover)': { '&:hover': { boxShadow: `inset 0 0 0 1px ${palette.ruleStrong}` } } }
                : null),
            }}
          >
            <Numeral size={17} weight={600} lineHeight={1}>
              {value}
            </Numeral>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
