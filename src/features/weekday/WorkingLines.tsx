import Box from '@mui/material/Box';
import { useEffect, useState } from 'react';
import { Numeral } from '@/components/ui/Numeral';
import { dur, stagger, transition, useReducedMotion } from '@/theme/motion';
import { palette } from '@/theme/palette';

/** One row: what the number is, where it came from, and what it came out at. */
export interface WorkingLine {
  label: string;
  /** Where the value came from. */
  expression: string;
  value: string;
}

interface WorkingLinesProps {
  lines: readonly WorkingLine[];
}

/**
 * The worked answer, shown after a wrong tap.
 *
 * Three columns and a definition list, because that is what this is: a term, a
 * derivation, a value. The label is not optional and there is no version of a
 * row without one — a line of arithmetic with nothing naming its terms teaches
 * nothing about where they came from, which is invariant 7 and the single most
 * common regression in this codebase.
 *
 * The last row is the answer, so it takes the brand colour and the heavier
 * weight. The brand is safe here: this is not a control the user taps during a
 * rep, and the grading colours have to stay reserved for the feedback flash.
 *
 * One copy, three callers. It was written out twice, in `WeekdayWorking` and in
 * the day-step view, and the third trainer would have made three.
 *
 * Rows fade in top to bottom rather than landing at once. The last row is the
 * answer, and it is the one row that teaches nothing on its own — arriving with
 * the rest invites reading it first. Every caller only mounts this component on
 * a wrong-hold, where the screen is already stopped waiting for a tap, so the
 * sequencing costs nobody any time. Each row still reserves its height from the
 * first frame: only `opacity` moves, so nothing below the block shifts as the
 * rows arrive.
 */
export function WorkingLines({ lines }: WorkingLinesProps) {
  const reducedMotion = useReducedMotion();
  const [revealed, setRevealed] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setRevealed(true);
      return;
    }
    const raf = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        width: '100%',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        columnGap: { xs: 1.5, sm: 2.5 },
        rowGap: 0.75,
        alignItems: 'baseline',
      }}
    >
      {lines.map((line, index) => {
        const last = index === lines.length - 1;
        const animate = !reducedMotion;
        return (
          <Box
            key={line.label}
            sx={{
              display: 'contents',
              '& > *': {
                opacity: revealed ? 1 : 0,
                transition: animate ? transition(['opacity'], dur.flash) : 'none',
                transitionDelay: animate ? stagger(index, 45) : undefined,
              },
            }}
          >
            <Box component="dt" sx={{ m: 0 }}>
              <Numeral size={12} color={palette.inkMuted}>
                {line.label}
              </Numeral>
            </Box>
            <Box component="dd" sx={{ m: 0, justifySelf: 'end' }}>
              <Numeral size={12} color={palette.inkFaint}>
                {line.expression}
              </Numeral>
            </Box>
            <Box component="dd" sx={{ m: 0, justifySelf: 'end' }}>
              <Numeral size={13} weight={last ? 600 : 400} color={last ? palette.brandDeep : palette.ink}>
                {line.value}
              </Numeral>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
