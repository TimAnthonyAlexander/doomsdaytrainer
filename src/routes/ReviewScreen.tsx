import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { BookOpen, Check } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AnswerPad, type AnswerOption } from '@/components/answer/AnswerPad';
import { EmptyState } from '@/components/ui/EmptyState';
import { Numeral } from '@/components/ui/Numeral';
import { Screen } from '@/components/ui/Screen';
import { ReviewPrompt } from '@/features/review/ReviewPrompt';
import { SessionSummary } from '@/features/review/SessionSummary';
import { nextDueLabel, summarise } from '@/features/review/summary';
import { useReviewSession } from '@/features/review/useReviewSession';
import { useAppState } from '@/state/useAppState';
import { palette } from '@/theme/palette';

const OPTIONS: AnswerOption[] = Array.from({ length: 7 }, (_unused, value) => ({
  value,
  label: String(value),
}));

export function ReviewScreen() {
  const { settings } = useAppState();
  const session = useReviewSession();
  const { phase, advance } = session;

  // Correct answers advance themselves. Errors never do: the user has to read
  // the right code and choose to move on.
  useEffect(() => {
    if (phase !== 'correct') return;
    const id = setTimeout(advance, Math.max(0, settings.autoAdvanceMs));
    return () => clearTimeout(id);
  }, [phase, advance, settings.autoAdvanceMs]);

  const summary = useMemo(() => summarise(session.results), [session.results]);

  // Where a finished queue leaves the user. Learn is offered only while the
  // scope still holds a code they have never seen; drills are always something
  // to do, and they cannot disturb what was just scheduled.
  const whatNext = (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1.5 }}>
      {session.unlearnedCount > 0 ? (
        <Button component={RouterLink} to="/learn" variant="contained">
          Go to Learn
        </Button>
      ) : null}
      <Button component={RouterLink} to="/drills" variant="outlined" color="inherit">
        Go to Drills
      </Button>
    </Box>
  );

  if (session.introducedCount === 0) {
    return (
      <Screen>
        <EmptyState
          icon={BookOpen}
          action={
            <Button component={RouterLink} to="/learn" variant="contained">
              Go to Learn
            </Button>
          }
        >
          Nothing to review yet. Learn a decade block and those ten codes enter the queue.
        </EmptyState>
      </Screen>
    );
  }

  if (session.item === null) {
    if (summary.total > 0) {
      return (
        <Screen>
          <SessionSummary summary={summary} nextDueAt={session.nextDueAt} actions={whatNext} />
        </Screen>
      );
    }
    const next = nextDueLabel(session.nextDueAt, Date.now());
    return (
      <Screen>
        <EmptyState icon={Check} action={whatNext}>
          {next === null
            ? 'Nothing due right now.'
            : `Nothing due right now. Next code due ${next}.`}
        </EmptyState>
      </Screen>
    );
  }

  const done = summary.total;
  const total = done + session.remaining;

  return (
    <Screen gap={2} sx={{ flex: 1, justifyContent: { xs: 'flex-start', md: 'center' } }}>
      <Numeral size={13} color={palette.inkMuted}>
        {`${done} / ${total}`}
      </Numeral>

      <Box
        sx={{
          // On a phone the pad belongs in the thumb zone, so the prompt takes
          // all the space above it. On a desktop, where the keyboard is the
          // input, year and pad read better centred together.
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
          autoHint={session.autoHint}
          onOpenHint={session.openHint}
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
        // Live during 'wrong': tapping the right code is how the user moves on,
        // which puts the correct pairing under their thumb instead of a
        // meaningless "continue".
        disabled={phase === 'correct'}
        keyboard={settings.keyboardInput}
      />
    </Screen>
  );
}
