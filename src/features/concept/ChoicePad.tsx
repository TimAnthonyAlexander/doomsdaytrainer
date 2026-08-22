import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useAnswerTimer } from '@/components/answer/useAnswerTimer';
import { Numeral } from '@/components/ui/Numeral';
import { palette } from '@/theme/palette';

interface ChoicePadProps {
  /** Four or five dates, ascending. Every one of them is on screen already. */
  options: readonly number[];
  onAnswer: (value: number) => void;
  promptKey: string | number;
  feedback?: { chosen: number; correct: number } | null;
}

type Tone = 'idle' | 'pressed' | 'right' | 'wrong' | 'answer';

/** Same rule as AnswerPad: neutral until answered, grading colours only then. */
const TONE_SX: Record<Tone, Record<string, string>> = {
  idle: {
    backgroundColor: palette.paper,
    color: palette.ink,
    boxShadow: `inset 0 0 0 1px ${palette.rule}`,
  },
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

function toneFor(value: number, feedback: ChoicePadProps['feedback'], pressed: number | null): Tone {
  if (feedback) {
    if (feedback.chosen === value) return feedback.chosen === feedback.correct ? 'right' : 'wrong';
    if (feedback.chosen !== feedback.correct && feedback.correct === value) return 'answer';
    return 'idle';
  }
  return pressed === value ? 'pressed' : 'idle';
}

/**
 * The doomsday dates of one month, one button each.
 *
 * Not the seven-button pad and not the twelve-button month pad: the answer set
 * here is whatever this month's doomsday dates happen to be, four of them or
 * five. Every option is printed above the pad before it is tapped, so this is a
 * forced choice over numbers the user can see rather than a multiple-choice
 * question with invented distractors.
 *
 * Nothing on this screen is timed. The paint guard is still here for the reason
 * `AnswerPad` has it: a tap landing in the frame between two prompts belongs to
 * the previous question, not this one.
 */
export function ChoicePad({ options, onAnswer, promptKey, feedback = null }: ChoicePadProps) {
  const [pressed, setPressed] = useState<number | null>(null);
  const answered = useRef(false);
  const timer = useAnswerTimer(promptKey);

  useLayoutEffect(() => {
    answered.current = false;
    setPressed(null);
  }, [promptKey]);

  const select = useCallback(
    (value: number) => {
      if (answered.current) return;
      if (!timer.running()) return;
      answered.current = true;
      setPressed(value);
      onAnswer(value);
    },
    [onAnswer, timer],
  );

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        gap: { xs: '8px', sm: '12px' },
      }}
    >
      {options.map((value) => {
        const tone = toneFor(value, feedback, pressed);
        return (
          <ButtonBase
            key={value}
            disableRipple
            aria-label={`Day ${value}`}
            onClick={() => select(value)}
            sx={{
              minHeight: { xs: 56, sm: 60 },
              borderRadius: 1.5,
              transition:
                'background-color 140ms ease-out, color 140ms ease-out, box-shadow 140ms ease-out',
              ...TONE_SX[tone],
              '&:focus-visible': { outline: `2px solid ${palette.brand}`, outlineOffset: 2 },
              ...(tone === 'idle'
                ? {
                    '@media (hover: hover)': {
                      '&:hover': { boxShadow: `inset 0 0 0 1px ${palette.ruleStrong}` },
                    },
                  }
                : null),
            }}
          >
            <Numeral size={22} weight={500} lineHeight={1}>
              {value}
            </Numeral>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
