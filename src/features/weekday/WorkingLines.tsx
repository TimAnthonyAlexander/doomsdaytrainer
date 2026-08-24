import Box from '@mui/material/Box';
import { Numeral } from '@/components/ui/Numeral';
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
 */
export function WorkingLines({ lines }: WorkingLinesProps) {
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
        return (
          <Box key={line.label} sx={{ display: 'contents' }}>
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
