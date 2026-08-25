import Box from '@mui/material/Box';
import { keyframes } from '@emotion/react';
import { useEffect, useState } from 'react';
import { Numeral, type NumeralWeight } from './Numeral';
import { fontFamily } from '@/theme/tokens';
import { dur, ease, useReducedMotion } from '@/theme/motion';

/**
 * The full transition, matching `--dur-numeric`. JS timers cannot read a CSS
 * custom property, so this is duplicated rather than resolved, and a test pins
 * the two together.
 */
export const NUMERIC_MS = 280;

/**
 * When the incoming glyph is readable, matching `--dur-numeric-settle`.
 *
 * Not the same number as `NUMERIC_MS`, and the difference is the point. The
 * easing is weighted hard toward deceleration, so by halfway the entering
 * glyph has covered most of its travel and reached full opacity; what is left
 * is the outgoing glyph clearing the cell, which changes nothing about what
 * the prompt says. Arming waits for legibility, not for the motion to stop.
 */
export const NUMERIC_SETTLE_MS = 140;

/** Which way the content travels. `up` is the increasing case. */
export type NumericDirection = 'up' | 'down';

/*
 * Four static keyframe sets rather than two parameterised by a custom
 * property. A `var()` inside a keyframe resolves against the element, which
 * works, but it makes the animation's start and end depend on a value that is
 * itself changing on the render that starts the animation — and that is a
 * class of bug worth not having for the sake of two constants.
 *
 * Opacity finishes ahead of the travel in both directions. The entering glyph
 * is fully opaque by the midpoint so the prompt is readable while the motion
 * finishes, and the leaving one is gone by 60% so the two are never both solid
 * enough to be read as one overlapping mess.
 */
const enterUp = keyframes({
  from: { transform: 'translateY(100%)', opacity: 0 },
  '50%': { opacity: 1 },
  to: { transform: 'translateY(0)', opacity: 1 },
});

const enterDown = keyframes({
  from: { transform: 'translateY(-100%)', opacity: 0 },
  '50%': { opacity: 1 },
  to: { transform: 'translateY(0)', opacity: 1 },
});

const exitUp = keyframes({
  from: { transform: 'translateY(0)', opacity: 1 },
  '60%': { opacity: 0 },
  to: { transform: 'translateY(-100%)', opacity: 0 },
});

const exitDown = keyframes({
  from: { transform: 'translateY(0)', opacity: 1 },
  '60%': { opacity: 0 },
  to: { transform: 'translateY(100%)', opacity: 0 },
});

/**
 * The mask, applied only while a cell is moving.
 *
 * `clip-path` rather than `overflow: hidden`, and the difference is the whole
 * reason this prompt lines up. An inline-block whose `overflow` is anything but
 * `visible` takes its baseline from its bottom margin edge instead of from the
 * text inside it (CSS 2.1 §10.8.1), so clipping that way would drop a cell off
 * the line its neighbours sit on. `clip-path` affects painting and nothing
 * else, so the cell keeps a real baseline while it clips.
 *
 * The vertical inset is slightly negative so an ascender or a descender is not
 * shaved during the move; the horizontal edges stay flush, because sideways is
 * not where anything travels.
 */
const MOVING_CLIP = 'inset(-0.12em 0)';

/**
 * The cell, in both states, and it is deliberately almost nothing.
 *
 * No height, no centring, and `vertical-align: baseline` rather than `middle`.
 * A prompt like "8 February 1927" mixes the two faces — the digits are Plex
 * Mono through `Numeral`, the month is Plex Sans — and those two put their
 * baseline at different offsets inside a `line-height: 1` box. Aligning the
 * cells by their centres therefore aligned the boxes and left the text sitting
 * at two different heights, with the month visibly low.
 *
 * Before any of this the day, month and year were plain inline content in one
 * heading, sharing a single line box and so a single baseline for free. This
 * gives that back: an inline-block with visible overflow takes its baseline
 * from the text inside it, so the cells line up on the text rather than on
 * their own edges.
 */
const CELL_SX = {
  position: 'relative',
  display: 'inline-block',
  verticalAlign: 'baseline',
  fontVariantNumeric: 'tabular-nums',
} as const;

/** Numeric where it can be, so 89 -> 90 travels the same way 9 -> 10 does. */
function directionBetween(from: string, to: string): NumericDirection {
  const a = Number(from);
  const b = Number(to);
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return b > a ? 'up' : 'down';
  return 'up';
}

function Glyph({
  children,
  mono,
  size,
  weight,
  color,
}: {
  children: string;
  mono: boolean;
  size?: number | string;
  weight: NumeralWeight;
  color: string;
}) {
  if (mono) {
    return (
      <Numeral size={size} weight={weight} color={color} lineHeight={1}>
        {children}
      </Numeral>
    );
  }
  return (
    <Box
      component="span"
      sx={{
        fontFamily: fontFamily.sans,
        fontSize: size,
        fontWeight: weight === 400 ? 400 : 500,
        lineHeight: 1,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
}

export interface NumericValueProps {
  /** What the cell shows. Any length — a digit, a word, a whole prompt. */
  value: string;
  /** CSS font-size, passed straight through. A responsive value is fine: the
   * cell no longer derives a pixel height from this, so nothing here needs a
   * bare number any more. Several call sites still resolve a `{ xs, sm }` pair
   * with `useMediaQuery` because an earlier version did; that is now redundant
   * rather than wrong. */
  size?: number | string;
  weight?: NumeralWeight;
  /** Routes the glyph through `Numeral` (IBM Plex Mono, tabular) rather than
   * the sans face. Digits want this; a word cell does not. */
  mono?: boolean;
  color?: string;
  /** Travel direction. `NumericText` decides this once for a whole string and
   * hands the same answer to every cell, so a four-digit year moves as one
   * number rather than as four independent ones. */
  direction?: NumericDirection;
}

/**
 * One cell of value, transitioning the way iOS moves a changed number.
 *
 * The old glyph leaves vertically while fading out, the new one arrives from
 * the opposite side while fading in, and the cell clips both at its own
 * bounds. Both are on screen at once, at partial opacity, for the middle of
 * the transition. There is no rotation, no hinge and no seam: it is one
 * single-stage move, which is why it needs no halves and no second curve.
 *
 * The new glyph is the one in normal flow, so the cell is always the width of
 * what it is becoming rather than what it is leaving — a cell that sized to
 * the outgoing value would step to its new width at the end of the motion,
 * which is the one moment nothing should move.
 *
 * Only ever animates on a real change. On mount, and whenever the value it is
 * handed matches what it already shows, this renders a single glyph and
 * nothing else, so an unchanged character in a changing string never
 * re-triggers.
 */
export function NumericValue({
  value,
  size,
  weight = 500,
  mono = false,
  color = 'inherit',
  direction,
}: NumericValueProps) {
  const reduced = useReducedMotion();

  // Compared during render and adjusted during render, which is the pattern
  // React's own docs give for state derived from a prop. An effect would land
  // `oldValue` one frame after the new value first painted, and that frame is
  // the one the whole transition starts on.
  const [prevValue, setPrevValue] = useState(value);
  const [oldValue, setOldValue] = useState<string | null>(null);
  if (value !== prevValue) {
    setOldValue(prevValue);
    setPrevValue(value);
  }

  const settled = useNumericSettled(value, NUMERIC_MS);
  const animating = !reduced && !settled && oldValue !== null && oldValue !== value;

  const travel = direction ?? directionBetween(oldValue ?? value, value);

  if (reduced || !animating) {
    return (
      <Box component="span" aria-hidden sx={CELL_SX}>
        <Glyph mono={mono} size={size} weight={weight} color={color}>
          {value}
        </Glyph>
      </Box>
    );
  }

  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        ...CELL_SX,
        // The mask, so both glyphs are cut off at the cell rather than sliding
        // over whatever sits above and below the prompt. `clip-path` and not
        // `overflow: hidden`: see MOVING_CLIP.
        clipPath: MOVING_CLIP,
      }}
    >
      {/* The incoming value, in normal flow, so it is what sizes the cell and
          what the cell takes its baseline from. */}
      <Box
        component="span"
        sx={{
          display: 'inline-block',
          animation: `${travel === 'up' ? enterUp : enterDown} ${dur.numeric} ${ease.numeric} forwards`,
        }}
      >
        <Glyph mono={mono} size={size} weight={weight} color={color}>
          {value}
        </Glyph>
      </Box>
      {/* The outgoing value, taken out of flow so it cannot hold the cell at
          its old width on the way out. Pinned to the same origin the in-flow
          glyph starts from rather than stretched and centred: the cell has no
          height of its own any more, so centring inside it would put the two
          glyphs on different lines for the length of the move. */}
      <Box
        component="span"
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'inline-block',
          whiteSpace: 'nowrap',
          animation: `${travel === 'up' ? exitUp : exitDown} ${dur.numeric} ${ease.numeric} forwards`,
        }}
      >
        <Glyph mono={mono} size={size} weight={weight} color={color}>
          {oldValue as string}
        </Glyph>
      </Box>
    </Box>
  );
}

export interface NumericTextProps {
  text: string;
  size?: number | string;
  weight?: NumeralWeight;
  mono?: boolean;
  color?: string;
}

/**
 * A string as a row of cells, one per character, plus a plain gap for each
 * space rather than an empty cell.
 *
 * Each cell is keyed by position, so React keeps the same `NumericValue`
 * instance — and with it that cell's memory of what it last showed — across a
 * re-render. That is what makes "only the characters that changed animate"
 * true without this component diffing anything: 1987 to 1988 moves one cell,
 * because only one cell's `value` prop changed.
 *
 * Direction is decided here rather than per cell, from the whole string read
 * as a number. Per cell it would be incoherent: 1987 to 2010 would send the
 * thousands and the tens up while the hundreds and units went down, and the
 * year would appear to come apart rather than to count on.
 */
export function NumericText({ text, size, weight, mono, color }: NumericTextProps) {
  const [prevText, setPrevText] = useState(text);
  const [direction, setDirection] = useState<NumericDirection>('up');
  if (text !== prevText) {
    setDirection(directionBetween(prevText, text));
    setPrevText(text);
  }

  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
      {Array.from(text).map((char, index) =>
        char === ' ' ? (
          // A real space, not an empty box: the raw text has to keep the word
          // boundary that a caller's aria-label, or a test reading rendered
          // text, depends on.
          <Box key={index} component="span" sx={{ display: 'inline-block', width: '0.4em' }}>
            {' '}
          </Box>
        ) : (
          <NumericValue
            key={index}
            value={char}
            size={size}
            weight={weight}
            mono={mono}
            color={color}
            direction={direction}
          />
        ),
      )}
    </Box>
  );
}

/**
 * Whether the thing keyed by `key` has settled, `afterMs` after `key` last
 * changed. `true` on mount, and always `true` under reduced motion.
 *
 * Callers arming an answer pad should take the default, which is
 * `NUMERIC_SETTLE_MS` rather than the full `NUMERIC_MS`. `useAnswerTimer`
 * starts the latency clock a frame after paint, and a prompt in transition is
 * painted before it is readable — but only until the incoming glyph is solid
 * and roughly in place, which the easing puts at about the halfway mark. The
 * outgoing glyph finishing its exit changes nothing about what the prompt
 * says, so charging the user for it would be inventing latency.
 */
export function useNumericSettled(key: string | number, afterMs = NUMERIC_SETTLE_MS): boolean {
  const reduced = useReducedMotion();
  const [prevKey, setPrevKey] = useState(key);
  const [settled, setSettled] = useState(true);

  if (key !== prevKey) {
    setPrevKey(key);
    setSettled(false);
  }

  useEffect(() => {
    if (reduced || settled) return;
    const id = setTimeout(() => setSettled(true), afterMs);
    return () => clearTimeout(id);
  }, [key, settled, reduced, afterMs]);

  return reduced || settled;
}
