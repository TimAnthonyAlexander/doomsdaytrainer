import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { CircleSlash } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AnswerPad, type AnswerOption } from '@/components/answer/AnswerPad';
import { EmptyState } from '@/components/ui/EmptyState';
import { Numeral } from '@/components/ui/Numeral';
import { PageTitle } from '@/components/ui/PageTitle';
import { Screen } from '@/components/ui/Screen';
import { formatMs } from '@/domain/time';
import { ReviewPrompt } from '@/features/review/ReviewPrompt';
import { summarise } from '@/features/review/summary';
import { RECOVERY_INTERVAL_DAYS } from '@/features/trouble/troublePool';
import { useTroubleSession } from '@/features/trouble/useTroubleSession';
import { useAppState } from '@/state/useAppState';
import { palette } from '@/theme/palette';

const OPTIONS: AnswerOption[] = Array.from({ length: 7 }, (_unused, value) => ({
  value,
  label: String(value),
}));

const RECOVERY_LINE = `A code leaves this list once its interval reaches ${RECOVERY_INTERVAL_DAYS} days. Its lapse count stays on record.`;

/**
 * The leech drill. Items that have lapsed six times, worst first, each shown
 * with its block already on screen. Answers here reschedule, capped at grade 3.
 */
export function TroubleScreen() {
  const { settings } = useAppState();
  const session = useTroubleSession();
  const { phase, advance } = session;

  useEffect(() => {
    if (phase !== 'correct') return;
    const id = setTimeout(advance, Math.max(0, settings.autoAdvanceMs));
    return () => clearTimeout(id);
  }, [phase, advance, settings.autoAdvanceMs]);

  const summary = useMemo(() => summarise(session.results), [session.results]);

  if (session.item === null) {
    if (summary.total > 0) {
      return (
        <Screen>
          <Typography variant="h1" component="h1">
            <Numeral size="inherit" weight={600}>
              {summary.total}
            </Numeral>
            {' answered, '}
            <Numeral size="inherit" weight={600}>
              {summary.wrong}
            </Numeral>
            {' wrong, median '}
            <Numeral size="inherit" weight={600}>
              {formatMs(summary.medianLatencyMs)}
            </Numeral>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {RECOVERY_LINE}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            <Button component={RouterLink} to="/" variant="contained">
              Go to Revise
            </Button>
          </Box>
        </Screen>
      );
    }
    return (
      <Screen>
        <PageTitle>Trouble spots</PageTitle>
        <EmptyState
          icon={CircleSlash}
          action={
            <Button component={RouterLink} to="/" variant="outlined" color="inherit">
              Go to Revise
            </Button>
          }
        >
          Nothing is flagged. A code lands here after six lapses, and most codes never get there.
        </EmptyState>
      </Screen>
    );
  }

  const done = summary.total;
  const total = done + session.remaining;

  return (
    <Screen gap={2} sx={{ flex: 1, justifyContent: { xs: 'flex-start', md: 'center' } }}>
      <Box>
        <Numeral size={13} color={palette.inkMuted}>
          {`${done} / ${total}`}
        </Numeral>
        <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 0.5 }}>
          {RECOVERY_LINE}
        </Typography>
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
        <ReviewPrompt
          yy={session.item.yy}
          phase={phase}
          correctCode={session.correctCode ?? 0}
          chosen={session.chosen}
          hint={session.hint}
          // The hint is never asked for here, so the button must never appear.
          autoHint
          onOpenHint={() => undefined}
        />
      </Box>

      <AnswerPad
        options={OPTIONS}
        onAnswer={session.answer}
        promptKey={session.promptKey}
        feedback={
          session.chosen === null || session.correctCode === null
            ? null
            : { chosen: session.chosen, correct: session.correctCode }
        }
        disabled={phase === 'correct'}
        keyboard={settings.keyboardInput}
      />
    </Screen>
  );
}
