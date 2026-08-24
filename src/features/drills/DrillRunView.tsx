import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { AnswerPad, type AnswerOption } from '@/components/answer/AnswerPad';
import { NumericText, useNumericSettled } from '@/components/ui/NumericText';
import { Screen } from '@/components/ui/Screen';
import type { DrillMode } from '@/domain/types';
import { formatYear } from '@/domain/yearCodes';
import { useAppState } from '@/state/useAppState';
import { DrillClock } from './DrillClock';
import { DrillResultView } from './DrillResultView';
import { COUNTDOWN_SECONDS } from './drillPlan';
import { useDrillRun } from './useDrillRun';

const OPTIONS: AnswerOption[] = Array.from({ length: 7 }, (_unused, value) => ({
  value,
  label: String(value),
}));

interface DrillRunViewProps {
  mode: DrillMode;
  decade: number | null;
  /** Back to the list, with a line saying nothing was written. */
  onDiscard: (message: string) => void;
  onDone: () => void;
  onAgain: () => void;
  /** Seconds counted in before the first prompt. Tests shorten it. */
  countdownSeconds?: number;
}

/**
 * A drill from the count-in to the result.
 *
 * The count-in exists because the first prompt's latency is recorded like every
 * other one, and a user still reading the screen would put a five-second answer
 * into their own median.
 *
 * No answer is ever marked right or wrong on screen. The gauntlet counts errors
 * without correcting them, and the other two modes behave the same way so that
 * the interaction is one tap per code in all three.
 */
export function DrillRunView({
  mode,
  decade,
  onDiscard,
  onDone,
  onAgain,
  countdownSeconds = COUNTDOWN_SECONDS,
}: DrillRunViewProps) {
  const { settings } = useAppState();
  const run = useDrillRun({ mode, decade, onDiscard, countdownSeconds });

  // See MethodPartTrainer.tsx: NumericText needs a bare pixel number, which
  // the responsive `fontSize` below cannot give it directly.
  const theme = useTheme();
  const yearSize = useMediaQuery(theme.breakpoints.up('sm')) ? 104 : 88;

  // The pad's latency clock stays at zero until the year settles into place —
  // see useAnswerTimer.ts and NumericText.tsx.
  const settled = useNumericSettled(run.promptKey);

  if (run.phase === 'finished' && run.outcome) {
    return (
      <Screen>
        <DrillResultView
          outcome={run.outcome}
          saveError={run.saveError}
          onAgain={onAgain}
          onDone={onDone}
        />
      </Screen>
    );
  }

  const counting = run.phase === 'countdown';
  const progress =
    run.plan.mode === 'sprint'
      ? `${run.answered} answered`
      : `${run.answered} / ${run.plan.total}`;

  return (
    <Screen gap={2} sx={{ flex: 1, justifyContent: { xs: 'flex-start', md: 'center' } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <DrillClock startedAt={run.startedAt} limitSeconds={run.plan.limitSeconds} />
        <Box sx={{ textAlign: 'right' }}>
          <Button color="inherit" onClick={run.abort} sx={{ color: 'text.secondary', px: 1.5 }}>
            Abort
          </Button>
          <Typography variant="caption" component="div" color="text.secondary">
            {progress}
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          flex: { xs: 1, md: '0 0 auto' },
          minHeight: { xs: 0, md: 180 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {counting ? (
          <Box sx={{ textAlign: 'center' }}>
            <Box
              aria-live="assertive"
              aria-label={`Starting in ${run.countdown}`}
              sx={{ fontSize: { xs: 88, sm: 104 }, lineHeight: 1, color: 'text.secondary' }}
            >
              <NumericText text={String(run.countdown)} size={yearSize} weight={600} mono />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {`${run.plan.title}. ${run.plan.coverage}.`}
            </Typography>
          </Box>
        ) : (
          <Box
            component="h1"
            aria-label={run.yy === null ? 'Waiting' : `Year ${formatYear(run.yy)}`}
            sx={{ m: 0, fontSize: { xs: 88, sm: 104 }, lineHeight: 1 }}
          >
            <NumericText
              text={run.yy === null ? '' : formatYear(run.yy)}
              size={yearSize}
              weight={600}
              mono
            />
          </Box>
        )}
      </Box>

      <AnswerPad
        options={OPTIONS}
        onAnswer={run.answer}
        promptKey={run.promptKey}
        disabled={run.phase !== 'running'}
        keyboard={settings.keyboardInput}
        // A drill is where a hard window belongs: nothing here writes to the
        // scheduler, so running out is a miss and not a corrupted item.
        windowMs={settings.answerWindowMs}
        onExpire={() => run.expire(settings.answerWindowMs ?? 0)}
        armed={settled}
      />
    </Screen>
  );
}
