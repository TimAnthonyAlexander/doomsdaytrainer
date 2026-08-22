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
  /**
   * Optional answer window, in millis, measured from the same paint the latency
   * clock starts at. Null or undefined means no window, which is the default.
   *
   * The pad never scores an expiry. It calls `onExpire` and stops accepting
   * taps for this prompt; what running out means is the caller's decision,
   * because it differs by surface. A window that turned into a tap would be
   * recording a forced guess, and a forced guess on seven buttons is wrong
   * 85.7% of the time — Siegler's learning rule strengthens whichever answer
   * was produced, so that guess would make the item harder next time.
   */
  windowMs?: number | null;
  onExpire?: () => void;
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

/**
 * STYLEGUIDE.md §8. The keys are neutral until an answer lands, and only then
 * do they take a grading colour: the flash has to be the one moment those hues
 * appear, or it stops reading before the user has consciously looked. That also
 * rules the brand out here — 0 to 6 carry no meaning worth colouring, and a
 * tinted key would be competing with the flash at the exact instant it fires.
 */
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
  // The reveal: the right answer outlined rather than filled, so it reads as
  // "this was it" next to the filled key the user actually tapped.
  answer: {
    backgroundColor: palette.paper,
    color: palette.ink,
    boxShadow: `inset 0 0 0 2px ${palette.gradeFast}`,
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
  windowMs = null,
  onExpire,
}: AnswerPadProps) {
  if (import.meta.env.DEV && options.length !== 7) {
    throw new Error(`AnswerPad needs exactly 7 options, got ${options.length}.`);
  }

  const [pressed, setPressed] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const answered = useRef(false);
  const timer = useAnswerTimer(promptKey);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useLayoutEffect(() => {
    answered.current = false;
    setPressed(null);
    setExpired(false);
  }, [promptKey]);

  // The window runs from the same paint the latency clock starts at, so it
  // measures the time the user actually had the prompt in front of them.
  useEffect(() => {
    if (windowMs === null || windowMs <= 0 || disabled || feedback) return;
    let id: ReturnType<typeof setTimeout> | null = null;
    const poll = window.setInterval(() => {
      if (!timer.running()) return;
      window.clearInterval(poll);
      id = setTimeout(() => {
        if (answered.current) return;
        answered.current = true;
        setExpired(true);
        onExpireRef.current?.();
      }, windowMs);
    }, 16);
    return () => {
      window.clearInterval(poll);
      if (id !== null) clearTimeout(id);
    };
  }, [promptKey, windowMs, disabled, feedback, timer]);

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
    : expired
      ? 'Time.'
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
                // The focus ring is the one brand mark allowed here: it marks
                // where the keyboard is, not what the answer was.
                '&:focus-visible': { outline: `2px solid ${palette.brand}`, outlineOffset: 2 },
                // Hover firms the border rather than filling the key, so a
                // pointer resting on a key cannot be mistaken for feedback.
                ...(tone === 'idle'
                  ? {
                      '@media (hover: hover)': {
                        '&:hover': { boxShadow: `inset 0 0 0 1px ${palette.ruleStrong}` },
                      },
                    }
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
