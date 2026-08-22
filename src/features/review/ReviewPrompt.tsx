import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { Lightbulb } from 'lucide-react';
import type { Code, YearKey } from '@/domain/types';
import { formatYear } from '@/domain/yearCodes';
import { Numeral } from '@/components/ui/Numeral';
import { palette } from '@/theme/palette';
import type { Hint } from './hints';
import type { ReviewPhase } from './useReviewSession';

interface ReviewPromptProps {
  yy: YearKey;
  phase: ReviewPhase;
  correctCode: Code;
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
  hint,
  autoHint,
  onOpenHint,
}: ReviewPromptProps) {
  // Once an answer is in, a hint has nothing left to offer.
  const showHintButton = phase === 'prompt' && hint === null && !autoHint;

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
        <Box
          component="h1"
          aria-label={`Year ${formatYear(yy)}`}
          sx={{ m: 0, fontSize: { xs: 88, sm: 104 }, lineHeight: 1 }}
        >
          <Numeral size="inherit" weight={600}>
            {formatYear(yy)}
          </Numeral>
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
        <Box sx={{ textAlign: 'center', maxWidth: 340 }}>
          <Numeral size={16} color={palette.greenDeep}>
            {hint.text}
          </Numeral>
          {hint.note ? (
            <Typography variant="caption" component="div" color="text.secondary" sx={{ mt: 0.75 }}>
              {hint.note}
            </Typography>
          ) : null}
        </Box>
      ) : null}

      {phase === 'wrong' ? (
        <Numeral size={22} weight={600} color={palette.green}>
          {`${formatYear(yy)} → ${correctCode}`}
        </Numeral>
      ) : null}
    </Box>
  );
}
