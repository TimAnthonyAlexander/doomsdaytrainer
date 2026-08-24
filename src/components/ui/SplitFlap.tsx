import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { keyframes } from '@emotion/react';
import { useEffect, useState } from 'react';
import { Numeral, type NumeralWeight } from './Numeral';
import { fontFamily } from '@/theme/tokens';
import { palette } from '@/theme/palette';
import { dur, ease, useReducedMotion } from '@/theme/motion';

/** Matches `--dur-advance`. JS timers cannot read a CSS var, so this is the
 * one place the number is duplicated rather than resolved from `dur.advance`. */
export const FLIP_MS = 120;

const flipTopOut = keyframes({
  from: { transform: 'rotateX(0deg)' },
  to: { transform: 'rotateX(-90deg)' },
});

const flipBotIn = keyframes({
  from: { transform: 'rotateX(90deg)' },
  // Exactly 0deg. WebKit rasterises a 3D layer once and scales it, so a
  // residual fraction of a degree leaves the landed glyph permanently soft.
  to: { transform: 'rotateX(0deg)' },
});

/**
 * An even integer cell height, derived from the font size rather than an
 * unrounded line-height. The prompt this replaces used `lineHeight: 1.1` at
 * `fontSize: 52`, which is 57.2px — the seam between the two clipped halves
 * then falls on a half pixel in one of them, which is exactly the softness
 * this is for. `Math.ceil(x / 2) * 2` is even by construction for any input.
 */
function cellHeightPx(fontSizePx: number): number {
  return Math.ceil((fontSizePx * 1.3) / 2) * 2;
}

export interface SplitFlapProps {
  /** What the cell shows. Any length — a digit, a word, a whole prompt. */
  value: string;
  /** CSS font-size. A bare number is read as the pixel size the cell's
   * height is derived from; a string falls back to a 16px assumption for
   * that derivation, so real call sites should prefer a number. */
  size?: number | string;
  weight?: NumeralWeight;
  /** Routes the glyph through `Numeral` (IBM Plex Mono, tabular) rather than
   * the sans face. Digits want this; a word cell does not. */
  mono?: boolean;
  color?: string;
}

const halfSx: SxProps<Theme> = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/** Every layer of a cell renders as `<span>`, not MUI's default `<div>` — a
 * flap can land inside a `<p>` (the day-step body line), and a block element
 * there is invalid HTML that a browser silently closes the paragraph around. */
const HALF_COMPONENT = 'span' as const;

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

/**
 * One flip-board cell. iOS split-flap mechanics: a static top half already
 * showing the new glyph, a static bottom half still showing the old one, and
 * two half-panels that rotate through them — the old top folding away over
 * the first half of the flip, the new bottom folding in over the second.
 *
 * `value` can be one character or a whole word; the mechanic does not care.
 * `SplitFlapText` is what splits a string into one cell per character.
 *
 * Only ever animates on a real change. On mount, and whenever the new value
 * equals what was already showing, this renders a single centred glyph — no
 * clip-path, no extra layers, nothing for a screen reader or a raw-text
 * assertion to trip over. The four-layer structure exists only for the
 * `FLIP_MS` window a genuine transition is running, which is also the only
 * time this cell's rendered text is not exactly `value` once (during that
 * window the old glyph is legitimately on screen too, mid-flight) — which is
 * why the readable value belongs on the caller's `aria-label`, never on this
 * cell's own text.
 */
export function SplitFlap({ value, size, weight = 500, mono = false, color = 'inherit' }: SplitFlapProps) {
  const reduced = useReducedMotion();

  // "Did the value change" is tracked the way React's own docs describe for
  // state derived from a prop: compared during render, adjusted during
  // render. That lands `oldValue` in the same render pass that first shows
  // the new `value`, rather than one frame later via an effect — a real gap
  // here would be one frame of the flap already reading the new prompt while
  // the pad's clock (armed off this same transition) was still zeroed.
  const [prevValue, setPrevValue] = useState(value);
  const [oldValue, setOldValue] = useState<string | null>(null);
  if (value !== prevValue) {
    setOldValue(prevValue);
    setPrevValue(value);
  }

  // The same settling clock a caller uses to arm its answer pad, kept here
  // for this cell's own purpose: knowing when its transition is over so it
  // can drop back to the plain, single-glyph render.
  const settled = useFlipSettled(value);
  const animating = !reduced && !settled && oldValue !== null;

  const fontSizePx = typeof size === 'number' ? size : 16;
  const height = cellHeightPx(fontSizePx);

  if (reduced) {
    return (
      <Box
        component="span"
        aria-hidden
        sx={{ display: 'inline-block', verticalAlign: 'middle', fontVariantNumeric: 'tabular-nums' }}
      >
        <Glyph mono={mono} size={size} weight={weight} color={color}>
          {value}
        </Glyph>
      </Box>
    );
  }

  if (!animating) {
    return (
      <Box
        component="span"
        aria-hidden
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: `${height}px`,
          verticalAlign: 'middle',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <Glyph mono={mono} size={size} weight={weight} color={color}>
          {value}
        </Glyph>
      </Box>
    );
  }

  const flippingFrom = oldValue ?? value;

  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        position: 'relative',
        display: 'inline-block',
        height: `${height}px`,
        overflow: 'hidden',
        verticalAlign: 'middle',
        fontVariantNumeric: 'tabular-nums',
        perspective: `${height * 4}px`,
        transformStyle: 'preserve-3d',
      }}
    >
      {/* topStatic: in normal flow rather than absolutely positioned, so this
          is what actually gives the cell its width — it always holds the
          settled (new) value, so a flip that somehow lands with zero motion
          still lands on the right glyph rather than the one it left. */}
      <Box
        component={HALF_COMPONENT}
        sx={{
          clipPath: 'inset(0 0 50% 0)',
          boxShadow: `0 1px 0 ${palette.rule}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Glyph mono={mono} size={size} weight={weight} color={color}>
          {value}
        </Glyph>
      </Box>
      {/* botStatic */}
      <Box component={HALF_COMPONENT} sx={{ ...halfSx, clipPath: 'inset(50% 0 0 0)' }}>
        <Glyph mono={mono} size={size} weight={weight} color={color}>
          {flippingFrom}
        </Glyph>
      </Box>
      {/* flipTop: the old glyph's top half, folding away. */}
      <Box
        component={HALF_COMPONENT}
        sx={{
          ...halfSx,
          clipPath: 'inset(0 0 50% 0)',
          transformOrigin: 'bottom',
          backfaceVisibility: 'hidden',
          animation: `${flipTopOut} calc(${dur.advance} / 2) ${ease.out} forwards`,
        }}
      >
        <Glyph mono={mono} size={size} weight={weight} color={color}>
          {flippingFrom}
        </Glyph>
      </Box>
      {/* flipBot: the new glyph's bottom half, folding in over the second
          half of the duration. */}
      <Box
        component={HALF_COMPONENT}
        sx={{
          ...halfSx,
          clipPath: 'inset(50% 0 0 0)',
          transformOrigin: 'top',
          backfaceVisibility: 'hidden',
          animation: `${flipBotIn} calc(${dur.advance} / 2) ${ease.out} calc(${dur.advance} / 2) forwards`,
        }}
      >
        <Glyph mono={mono} size={size} weight={weight} color={color}>
          {value}
        </Glyph>
      </Box>
    </Box>
  );
}

export interface SplitFlapTextProps {
  text: string;
  size?: number | string;
  weight?: NumeralWeight;
  mono?: boolean;
  color?: string;
}

/**
 * A string as a row of flap cells, one per character, plus a plain gap for
 * each space rather than an empty cell.
 *
 * There is no diffing here at all: each cell is keyed by its position, so
 * React keeps the same `SplitFlap` instance — and therefore its own "what did
 * I show last" memory — across a re-render at that position, and each cell
 * decides for itself whether its own character changed. That is what makes
 * "only the changed characters animate" true without this component having to
 * compare old and new strings itself: 1987 -> 1988 flips one flap because
 * only the last cell's `value` prop actually changed.
 */
export function SplitFlapText({ text, size, weight, mono, color }: SplitFlapTextProps) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
      {Array.from(text).map((char, index) =>
        char === ' ' ? (
          // A real space character, not an empty box: raw textContent has to
          // keep the word boundary a caller's aria-label (or a test reading
          // the rendered text directly) relies on.
          <Box key={index} component="span" sx={{ display: 'inline-block', width: '0.4em' }}>
            {' '}
          </Box>
        ) : (
          <SplitFlap key={index} value={char} size={size} weight={weight} mono={mono} color={color} />
        ),
      )}
    </Box>
  );
}

/**
 * Whether the thing keyed by `key` has finished transitioning, `FLIP_MS`
 * after `key` last changed. `true` on mount, and always `true` under reduced
 * motion.
 *
 * This is the same clock `SplitFlap` uses internally to know when to drop
 * back to a plain glyph, exported so a caller can gate its answer pad's
 * `armed` prop on the same window: `useAnswerTimer` starts the latency clock
 * one frame after paint, which is too early for a prompt that is painted but
 * not yet readable — see the docblock on `useAnswerTimer` for why that
 * matters.
 */
export function useFlipSettled(key: string | number): boolean {
  const reduced = useReducedMotion();
  const [prevKey, setPrevKey] = useState(key);
  const [settled, setSettled] = useState(true);

  if (key !== prevKey) {
    setPrevKey(key);
    setSettled(false);
  }

  useEffect(() => {
    if (reduced || settled) return;
    const id = setTimeout(() => setSettled(true), FLIP_MS);
    return () => clearTimeout(id);
  }, [key, settled, reduced]);

  return reduced || settled;
}
