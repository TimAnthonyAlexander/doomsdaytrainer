import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Lightbulb } from 'lucide-react';
import { Fragment } from 'react';
import type { Code, YearKey } from '@/domain/types';
import { formatYear } from '@/domain/yearCodes';
import { Numeral } from '@/components/ui/Numeral';
import { NumericText } from '@/components/ui/NumericText';
import type { Hint } from './hints';
import type { ReviewPhase } from './useReviewSession';

interface ReviewPromptProps {
  yy: YearKey;
  phase: ReviewPhase;
  correctCode: Code;
  /** What the user tapped, once they have. */
  chosen: Code | null;
  hint: Hint | null;
  /** The hint appeared on its own, so the button must not offer it again. */
  autoHint: boolean;
  onOpenHint: () => void;
}

/**
 * The year, and nothing drawn around it. The hint sits beside the numeral
 * rather than inside the pad, so the thumb zone stays a single-purpose target.
 */
export function ReviewPrompt({
  yy,
  phase,
  correctCode,
  chosen,
  hint,
  autoHint,
  onOpenHint,
}: ReviewPromptProps) {
  // Once an answer is in, a hint has nothing left to offer.
  const showHintButton = phase === 'prompt' && hint === null && !autoHint;

  // See MethodPartTrainer.tsx: NumericText needs a bare pixel number, which
  // the responsive `fontSize` on the heading below cannot give it directly.
  const theme = useTheme();
  const yearSize = useMediaQuery(theme.breakpoints.up('sm')) ? 104 : 88;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <Box
        sx={{
          display: 'grid',
          // The year stays optically centred whether or not the hint button is
          // there, so it never shifts between prompts.
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <Box />
        <Box>
          <Typography
            variant="caption"
            component="div"
            color="text.secondary"
            sx={{ textAlign: 'center' }}
          >
            Year
          </Typography>
          <Box
            component="h1"
            aria-label={`Year ${formatYear(yy)}`}
            sx={{ m: 0, fontSize: { xs: 88, sm: 104 }, lineHeight: 1 }}
          >
            <NumericText text={formatYear(yy)} size={yearSize} weight={600} mono />
          </Box>
        </Box>
        <Box sx={{ justifySelf: 'start', pl: 2 }}>
          {showHintButton ? (
            <ButtonBase
              onClick={onOpenHint}
              sx={{
                minHeight: 44,
                px: 1.25,
                borderRadius: 1,
                gap: 0.75,
                color: 'text.secondary',
                '&:hover': { color: 'primary.main' },
              }}
            >
              <Lightbulb size={18} strokeWidth={1.75} aria-hidden />
              <Typography component="span" variant="body2">
                Hint
              </Typography>
            </ButtonBase>
          ) : null}
        </Box>
      </Box>

      {hint ? (
        <Box sx={{ maxWidth: 340, width: '100%' }}>
          <Typography variant="body2" sx={{ textAlign: 'center', mb: 1 }}>
            {hint.text}
          </Typography>
          {/* Every number is named. A row of bare arithmetic teaches nothing
              about which value came from where. */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              columnGap: 2,
              rowGap: 0.5,
              alignItems: 'baseline',
            }}
          >
            {hint.steps.map((step) => (
              <Fragment key={step.label}>
                <Typography variant="caption" color="text.secondary">
                  {step.label}
                </Typography>
                <Numeral size={15} weight={600}>
                  {step.value}
                </Numeral>
              </Fragment>
            ))}
          </Box>
          {hint.note ? (
            <Typography variant="caption" component="div" color="text.secondary" sx={{ mt: 1 }}>
              {hint.note}
            </Typography>
          ) : null}
        </Box>
      ) : null}

      {/* Fixed height, so the pad below never moves between prompt and answer. */}
      <Box sx={{ minHeight: 96, textAlign: 'center' }}>
        {phase === 'correct' && chosen !== null ? (
          <>
            <Typography variant="caption" component="div" color="text.secondary">
              Code
            </Typography>
            <Numeral size={40} weight={600}>
              {chosen}
            </Numeral>
          </>
        ) : null}

        {phase === 'wrong' ? (
          <>
            <Typography variant="caption" component="div" color="text.secondary">
              Code
            </Typography>
            <Numeral size={40} weight={600}>
              {correctCode}
            </Numeral>
            <Typography variant="body2" component="div" color="text.secondary" sx={{ mt: 0.5 }}>
              {chosen !== null ? (
                <>
                  {'You tapped '}
                  <Numeral color="inherit">{chosen}</Numeral>
                  {'. Tap '}
                  <Numeral color="inherit">{correctCode}</Numeral>
                  {' to go on.'}
                </>
              ) : (
                <>
                  {'Tap '}
                  <Numeral color="inherit">{correctCode}</Numeral>
                  {' to go on.'}
                </>
              )}
            </Typography>
          </>
        ) : null}
      </Box>
    </Box>
  );
}
