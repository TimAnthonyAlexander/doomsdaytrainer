import Typography from '@mui/material/Typography';
import { Numeral } from '@/components/ui/Numeral';
import type { Code, YearKey } from '@/domain/types';
import { codeFor, formatYear } from '@/domain/yearCodes';

interface CodeCorrectionProps {
  yy: YearKey;
  /** What the user actually tapped. */
  chosen: Code;
}

/**
 * What a wrong tap on a year code says.
 *
 * Three numbers, each named by the sentence around it: the year, the code it
 * actually has, and the one that was tapped. Invariant 7 is what forces the
 * words — "40 · 5 · 3" is the same three figures and teaches none of them.
 *
 * The last clause is the rest of invariant 6 said out loud. A wrong answer
 * never advances anything in this app, and the way on is tapping the code the
 * year really has, so the last thing the hand does before the next prompt is
 * the correct pairing.
 */
export function CodeCorrection({ yy, chosen }: CodeCorrectionProps) {
  return (
    <Typography variant="body2" color="error.main">
      <Numeral color="inherit">{formatYear(yy)}</Numeral>
      {' is '}
      <Numeral color="inherit">{codeFor(yy)}</Numeral>
      {', not '}
      <Numeral color="inherit">{chosen}</Numeral>
      {'. Tap the right one to go on.'}
    </Typography>
  );
}
