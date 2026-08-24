import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAnswerTimer } from '@/components/answer/useAnswerTimer';
import { Numeral } from '@/components/ui/Numeral';
import { dur, FEEDBACK_TRANSITION, stagger, transition, useReducedMotion } from '@/theme/motion';
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
  /**
   * Whether the prompt this pad answers is readable yet. Defaults to true.
   *
   * Only a caller that animates its prompt into place has any reason to pass
   * this. It holds the latency clock at zero until the prompt has settled, and
   * the pad refuses taps for the same window, so an answer is never timed
   * against a prompt that was still resolving. See `useAnswerTimer`.
   */
  armed?: boolean;
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

/** Which of the pad's seven columns a date sits in. Day is 1-based. */
function columnOf(day: number): number {
  return (day - 1) % 7;
}

/**
 * The vertical line a shared column draws behind the pad, growing from the
 * top over the reveal.
 *
 * A plain sibling of the day cells rather than something a cell paints itself:
 * it spans every row in its column via `gridRow: '1 / -1'`, which no single
 * cell's box can do without changing that cell's own size. Absolutely
 * positioned so it takes no space in the grid's own sizing and moves no cell's
 * hit target, and negative `zIndex` so it paints behind the (unpositioned,
 * in-flow) day buttons rather than over their faces — only the row gaps show
 * it, which is what reads as a line connecting the rings rather than a bar
 * drawn across them.
 *
 * Mounted only while the reveal is showing (see `MonthPad`), so its own mount
 * is the trigger: the first frame commits at `scaleY(0)`, then this flips a
 * frame later, which is what a CSS transition needs to have something to
 * animate from.
 */
function ColumnRule({ column, reducedMotion }: { column: number; reducedMotion: boolean }) {
  const [grown, setGrown] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setGrown(true);
      return;
    }
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        inset: 0,
        gridColumn: `${column + 1} / ${column + 2}`,
        gridRow: '1 / -1',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      <Box
        sx={{
          width: '2px',
          height: '100%',
          backgroundColor: palette.gradeFast,
          transformOrigin: 'top',
          transform: grown ? 'scaleY(1)' : 'scaleY(0)',
          transition: reducedMotion ? 'none' : transition(['transform'], dur.ui),
        }}
      />
    </Box>
  );
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
  armed = true,
}: MonthPadProps) {
  const [pressed, setPressed] = useState<number | null>(null);
  const answered = useRef(false);
  const timer = useAnswerTimer(promptKey, armed);
  const reducedMotion = useReducedMotion();

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

  // The dates that draw the quieter ring, ascending, so the reveal can stagger
  // down the column in the order the eye reads it. Excludes the taught date
  // (which gets `answer`, not `alsoRight`) and the tapped one (which is `wrong`
  // on this path — `reveal` only ever shows alongside a held wrong answer).
  const alsoRightDates = useMemo(() => {
    if (!feedback || !feedback.reveal) return [];
    return feedback.accepted
      .filter((date) => date !== feedback.canonical && date !== feedback.chosen)
      .slice()
      .sort((a, b) => a - b);
  }, [feedback]);

  // The rule draws only when every accepted date genuinely shares the taught
  // date's column. `doomsdayDates` always produces dates exactly seven apart,
  // so this holds by construction — but this pad takes `accepted` as a prop
  // rather than computing it, so the check is real rather than assumed. Drawing
  // a line through dates that are not actually a week apart would be worse than
  // drawing no line.
  const ruleColumn = useMemo(() => {
    if (!feedback || !feedback.reveal) return null;
    const column = columnOf(feedback.canonical);
    return feedback.accepted.every((date) => columnOf(date) === column) ? column : null;
  }, [feedback]);

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gap: { xs: '5px', sm: '8px' },
      }}
    >
      {ruleColumn === null ? null : <ColumnRule column={ruleColumn} reducedMotion={reducedMotion} />}

      {monthPadDays(month, leapYear).map((value) => {
        const tone = toneFor(value, feedback, pressed);
        const staggered = tone === 'alsoRight' && !reducedMotion;
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
              // Shared with `AnswerPad` rather than written out again: the two
              // pads had drifted onto the same hand-written 140ms, which is not
              // a token, and fixing one of them would have left the other. The
              // `alsoRight` ring is the one exception, and it stays feedback —
              // it only ever shows alongside a held wrong answer, so drawing it
              // over `dur.flash` costs nobody an answer window.
              transition: staggered
                ? transition(['background-color', 'color', 'box-shadow'], dur.flash)
                : FEEDBACK_TRANSITION,
              transitionDelay: staggered ? stagger(alsoRightDates.indexOf(value), 40) : undefined,
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
