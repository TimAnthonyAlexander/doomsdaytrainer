import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Numeral } from '@/components/ui/Numeral';
import { palette } from '@/theme/palette';
import { useAnswerTimer } from './useAnswerTimer';

export interface AnswerOption {
  value: number;
  label: string;
}

export interface AnswerFeedback {
  chosen: number;
  correct: number;
}

export interface AnswerPadProps {
  /** Exactly seven. The pad's whole point is that the shape never changes. */
  options: AnswerOption[];
  onAnswer: (value: number, latencyMs: number) => void;
  /** Changing this restarts the latency clock and clears the pressed state. */
  promptKey: string | number;
  /** Set after an answer to paint the pad. Null while waiting for one. */
  feedback?: AnswerFeedback | null;
  disabled?: boolean;
  keyboard?: boolean;
  /** Keys that select option i. Default ['0'..'6']. */
  keys?: string[];
}

const DEFAULT_KEYS = ['0', '1', '2', '3', '4', '5', '6'];

/**
 * Units are mandatory here: MUI's sizing transform reads a bare `1` for width
 * or height as `100%`, which would blow the announcer up to full-page size.
 */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  border: 0,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
} as const;

type Tone = 'idle' | 'pressed' | 'right' | 'wrong' | 'answer';

function toneFor(
  value: number,
  feedback: AnswerFeedback | null | undefined,
  pressed: number | null,
): Tone {
  if (feedback) {
    if (feedback.chosen === value) return feedback.chosen === feedback.correct ? 'right' : 'wrong';
    // The correct button is marked at the same moment as the wrong one, so the
    // eye moves straight from the mistake to the answer.
    if (feedback.chosen !== feedback.correct && feedback.correct === value) return 'answer';
    return 'idle';
  }
  return pressed === value ? 'pressed' : 'idle';
}

const TONE_SX: Record<Tone, Record<string, string>> = {
  idle: { backgroundColor: palette.paper, color: palette.ink, boxShadow: `inset 0 0 0 1px ${palette.rule}` },
  pressed: {
    backgroundColor: palette.greenSoft,
    color: palette.greenDeep,
    boxShadow: `inset 0 0 0 1px ${palette.rule}`,
  },
  right: { backgroundColor: palette.green, color: palette.ground, boxShadow: `inset 0 0 0 1px ${palette.green}` },
  wrong: {
    backgroundColor: palette.terracotta,
    color: '#FFFFFF',
    boxShadow: `inset 0 0 0 1px ${palette.terracotta}`,
  },
  answer: {
    backgroundColor: palette.greenSoft,
    color: palette.greenDeep,
    boxShadow: `inset 0 0 0 2px ${palette.green}`,
  },
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * The seven-button answer pad: 3 / 3 / 1, fixed positions, one tap per answer.
 *
 * Generic over what the seven options mean. The year-code review passes digits;
 * the weekday trainer passes weekday names into the same component, which is
 * why nothing here assumes 0..6.
 */
export function AnswerPad({
  options,
  onAnswer,
  promptKey,
  feedback = null,
  disabled = false,
  keyboard = true,
  keys = DEFAULT_KEYS,
}: AnswerPadProps) {
  if (import.meta.env.DEV && options.length !== 7) {
    throw new Error(`AnswerPad needs exactly 7 options, got ${options.length}.`);
  }

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
      // The prompt has not been painted yet, so this cannot be a response to
      // it: it is the tail of the tap that answered the previous one, landing
      // in the frame between the auto-advance and the new prompt. Scoring it
      // would record 0ms and hand a double tap the top grade.
      if (!timer.running()) return;
      answered.current = true;
      setPressed(value);
      onAnswer(value, timer.elapsedMs());
    },
    [disabled, onAnswer, timer],
  );

  useEffect(() => {
    if (!keyboard || disabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;

      let index = keys.indexOf(event.key);
      if (index === -1 && event.code.startsWith('Numpad')) {
        index = keys.findIndex((key) => `Numpad${key}` === event.code);
      }
      if (index === -1 || index >= options.length) return;

      event.preventDefault();
      select(options[index].value);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keyboard, disabled, keys, options, select]);

  const announcement = feedback
    ? feedback.chosen === feedback.correct
      ? 'Correct.'
      : `Incorrect. The answer is ${options.find((o) => o.value === feedback.correct)?.label ?? feedback.correct}.`
    : '';

  return (
    <Box>
      <Box sx={VISUALLY_HIDDEN} aria-live="polite" role="status">
        {announcement}
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: { xs: '10px', sm: '12px' },
        }}
      >
        {options.map((option, index) => {
          const tone = toneFor(option.value, feedback, pressed);
          return (
            <ButtonBase
              key={option.value}
              disableRipple
              disabled={disabled}
              aria-label={option.label}
              onClick={() => select(option.value)}
              sx={{
                // The seventh sits centred on its own row. Every option keeps
                // the same coordinates for the whole life of the app.
                gridColumn: index === 6 ? '2' : undefined,
                position: 'relative',
                minHeight: { xs: 72, sm: 76 },
                borderRadius: 1.5,
                transition:
                  'background-color 140ms ease-out, color 140ms ease-out, box-shadow 140ms ease-out',
                ...TONE_SX[tone],
                '&.Mui-disabled': { opacity: 1 },
                '&:focus-visible': { outline: `2px solid ${palette.green}`, outlineOffset: 2 },
                ...(tone === 'idle'
                  ? { '@media (hover: hover)': { '&:hover': { backgroundColor: palette.greenSoft } } }
                  : null),
              }}
            >
              <Numeral size={30} weight={600} lineHeight={1}>
                {option.label}
              </Numeral>
              {/* Nothing to teach when the key is the label: for the digit pad
                  the hint would just print the number twice. */}
              {keyboard && keys[index] && keys[index] !== option.label ? (
                <Typography
                  aria-hidden
                  sx={{
                    // Only ever a hint for a physical keyboard. On a phone it
                    // would be noise beside the number it duplicates.
                    display: 'none',
                    '@media (pointer: fine)': { display: 'block' },
                    position: 'absolute',
                    top: 6,
                    right: 8,
                    fontSize: 10,
                    lineHeight: 1,
                    color: 'inherit',
                    opacity: 0.45,
                  }}
                >
                  {keys[index]}
                </Typography>
              ) : null}
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}
