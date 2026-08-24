import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Numeral } from '@/components/ui/Numeral';
import type { Code } from '@/domain/types';
import type { YearPartVerdict } from '@/domain/methodParts';
import { palette } from '@/theme/palette';

interface YearPartRevealProps {
  centuryAnchor: Code;
  yearCode: Code;
  verdict: YearPartVerdict;
}

/**
 * One of the two figures, with the label that names it.
 *
 * The colour sits on this wrapper rather than on the numeral, and the numeral
 * inherits it. That keeps the label out of the grading hue — it is a name, not
 * feedback — and it puts the colour on one element per figure instead of two.
 */
function Figure({
  value,
  label,
  colour,
  testId,
}: {
  value: Code;
  label: string;
  colour: string;
  testId: string;
}) {
  return (
    <Box data-testid={testId} sx={{ display: 'grid', justifyItems: 'center', rowGap: 0.25, color: colour }}>
      <Numeral size={52} weight={600}>
        {value}
      </Numeral>
      {/* Invariant 7: two numerals with nothing naming them cannot teach a
          pairing, and these two are the pairing. */}
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

/**
 * The two numbers the year half is made of, shown after every answer.
 *
 * Deliberately not the labelled working the other surfaces use. That is a
 * definition list of terms and derivations, built to be read after a mistake to
 * find out which step failed. This is two figures and an operator, built to be
 * glanced at: the year half has exactly two inputs and one operation, and the
 * pair sitting side by side is the whole of it. Sharing a component between the
 * two would have meant one of them compromising, and the one that would have
 * compromised is this one.
 *
 * It appears on a correct answer too, not only a wrong one. The pair is what
 * the answer was made of either way, and seeing the two that produced a right
 * answer is how the pairing gets rehearsed rather than only the total. On a
 * correct answer it lasts as long as the auto-advance delay in Settings, which
 * is 250ms by default and is the same window the pad's green flash gets.
 *
 * The colours are the grading hues, which is allowed here and nowhere near a
 * card or a header: this is feedback, the same register as the pad's own flash.
 * They are never the only thing saying what happened — the pad flashes green or
 * red under this, a wrong answer holds the screen and draws a Continue button,
 * and the one verdict a colour could not carry on its own gets a sentence.
 */
export function YearPartReveal({ centuryAnchor, yearCode, verdict }: YearPartRevealProps) {
  const anchorColour = verdict === 'correct' ? palette.gradeFast : palette.gradeWrong;
  const codeColour =
    verdict === 'correct'
      ? palette.gradeFast
      : verdict === 'century-forgotten'
        ? palette.gradeMedium
        : palette.gradeWrong;

  return (
    <Box sx={{ display: 'grid', justifyItems: 'center', rowGap: 1 }}>
      {/* Baseline, so the operator sits on the figures' feet rather than
          floating in the middle of their height. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'center',
          columnGap: { xs: 2, sm: 3 },
        }}
      >
        <Figure
          testId="year-part-anchor"
          value={centuryAnchor}
          label="Century anchor"
          colour={anchorColour}
        />
        {/* The operator earns its place: the named mistake below is forgetting
            to perform it, so the pair has to read as a sum and not as two facts
            standing next to each other. */}
        <Numeral size={26} color={palette.inkFaint}>
          +
        </Numeral>
        <Figure testId="year-part-code" value={yearCode} label="Year code" colour={codeColour} />
      </Box>

      {verdict === 'century-forgotten' ? (
        <Typography
          variant="body2"
          sx={{ textAlign: 'center', maxWidth: 320, color: palette.gradeMedium }}
        >
          That is the year code on its own. The century anchor still has to be added.
        </Typography>
      ) : null}
    </Box>
  );
}
