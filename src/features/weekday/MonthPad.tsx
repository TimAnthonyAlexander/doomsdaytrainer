import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useAnswerTimer } from '@/components/answer/useAnswerTimer';
import { Numeral } from '@/components/ui/Numeral';
import { palette } from '@/theme/palette';
import { MONTH_PAD_VALUES } from './weekdayPad';

interface MonthPadProps {
  onAnswer: (value: number, latencyMs: number) => void;
  promptKey: string | number;
  feedback?: { chosen: number; correct: number } | null;
  disabled?: boolean;
}

type Tone = 'idle' | 'pressed' | 'right' | 'wrong' | 'answer';

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
};

function toneFor(value: number, feedback: MonthPadProps['feedback'], pressed: number | null): Tone {
  if (feedback) {
    if (feedback.chosen === value) return feedback.chosen === feedback.correct ? 'right' : 'wrong';
    if (feedback.chosen !== feedback.correct && feedback.correct === value) return 'answer';
    return 'idle';
  }
  return pressed === value ? 'pressed' : 'idle';
}

/**
 * The month-doomsday pad: twelve buttons, one per possible answer, in
 * ascending order and always in the same places.
 *
 * The twelve doomsday dates are a permutation of these twelve numbers, so this
 * is a forced choice over the real answer space rather than a multiple-choice
 * question with invented distractors. Seven buttons cannot express it, which
 * is the one reason this is not the shared `AnswerPad`.
 */
export function MonthPad({ onAnswer, promptKey, feedback = null, disabled = false }: MonthPadProps) {
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
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: { xs: '10px', sm: '12px' },
      }}
    >
      {MONTH_PAD_VALUES.map((value) => {
        const tone = toneFor(value, feedback, pressed);
        return (
          <ButtonBase
            key={value}
            disableRipple
            disabled={disabled}
            aria-label={`Day ${value}`}
            onClick={() => select(value)}
            sx={{
              minHeight: { xs: 56, sm: 60 },
              borderRadius: 1.5,
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
            <Numeral size={22} weight={600} lineHeight={1}>
              {value}
            </Numeral>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
