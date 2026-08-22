import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Numeral } from '@/components/ui/Numeral';
import { formatMs } from '@/domain/time';
import { formatScore } from './drillHistory';
import type { DrillOutcome } from './useDrillRun';

interface DrillResultViewProps {
  outcome: DrillOutcome;
  saveError: string | null;
  onAgain: () => void;
  onDone: () => void;
}

/**
 * What happened, stated once. The personal best is a sentence, not an award:
 * there is nothing to celebrate about a number that will be beaten next week.
 */
function bestLine(outcome: DrillOutcome): string {
  const { mode, previousBest, improved } = outcome;
  if (previousBest === null) return 'No earlier run at this length to compare.';
  if (improved) return `Your best. Previous was ${formatScore(mode, previousBest)}.`;
  return `Best was ${formatScore(mode, previousBest)}.`;
}

export function DrillResultView({ outcome, saveError, onAgain, onDone }: DrillResultViewProps) {
  const asked =
    outcome.mode === 'sprint'
      ? `${outcome.total} asked, ${outcome.correct} correct.`
      : `${outcome.total} codes, ${outcome.correct} correct.`;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h1" component="h1">
          {outcome.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          {outcome.coverage}
        </Typography>
      </Box>

      <Box>
        <Numeral size={56} weight={600} lineHeight={1}>
          {formatScore(outcome.mode, outcome.score)}
        </Numeral>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {outcome.mode === 'sprint' ? 'correct in 60 seconds' : 'elapsed'}
        </Typography>
      </Box>

      <Box>
        <Typography variant="body1">{asked}</Typography>
        <Typography variant="body1">{`Median ${formatMs(outcome.medianLatencyMs)} per answer.`}</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
          {bestLine(outcome)}
        </Typography>
        {saveError ? (
          <Typography variant="body2" color="error.main" sx={{ mt: 1 }}>
            {saveError}
          </Typography>
        ) : null}
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <Button variant="contained" onClick={onAgain}>
          Run again
        </Button>
        <Button variant="outlined" color="inherit" onClick={onDone}>
          Done
        </Button>
      </Box>
    </Box>
  );
}
