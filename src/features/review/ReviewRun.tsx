import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { Check } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AnswerPad, type AnswerOption } from '@/components/answer/AnswerPad';
import { EmptyState } from '@/components/ui/EmptyState';
import { Numeral } from '@/components/ui/Numeral';
import { Screen } from '@/components/ui/Screen';
import { SoundToggle } from '@/features/audio/SoundToggle';
import { cueUrl } from '@/features/audio/speech';
import { useSpokenPrompt } from '@/features/audio/useSpokenPrompt';
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

interface ReviewRunProps {
  /** Back to the mode list. Offered on the summary and on an empty queue. */
  onDone: () => void;
}

/**
 * The due queue, one year at a time. This is the only surface in the app that
 * schedules, and it owns nothing else: whether it should be running at all is
 * the caller's decision, and so is where the user goes afterwards.
 */
export function ReviewRun({ onDone }: ReviewRunProps) {
  const { settings, updateSettings } = useAppState();
  const session = useReviewSession();
  const { phase, advance } = session;

  /*
   * The spoken cue starts on the same commit that paints the year, which is the
   * commit the latency clock starts on too. The clock is not moved to the end
   * of the clip and never will be: an answer given while the year is still
   * being spoken would then measure as negative, clamp to zero, and take the
   * top grade — the exact defect paint-to-tap exists to prevent. So a spoken
   * review answer is simply a slower one, it is marked `audioPlayed`, and Stats
   * says how many of the recent answers carry the mark.
   *
   * The token, rather than the url, is what counts as a new prompt: a queue
   * with one item asks the same year twice and both are prompts, while the
   * correction tap after a wrong answer is not one and must not be spoken over.
   */
  useSpokenPrompt(
    session.item === null ? null : cueUrl(session.item.yy),
    settings.spokenReviewPrompts,
    session.upcoming === null ? null : cueUrl(session.upcoming),
    session.item === null ? 'none' : `${session.item.yy}#${session.results.length}`,
  );

  // Correct answers advance themselves. Errors never do: the user has to read
  // the right code and choose to move on.
  useEffect(() => {
    if (phase !== 'correct') return;
    const id = setTimeout(advance, Math.max(0, settings.autoAdvanceMs));
    return () => clearTimeout(id);
  }, [phase, advance, settings.autoAdvanceMs]);

  const summary = useMemo(() => summarise(session.results), [session.results]);

  // Where a finished queue leaves the user. Learn is offered only while the
  // scope still holds a code they have never seen; the mode list is always
  // there, and picking a drill from it cannot disturb what was just scheduled.
  const whatNext = (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1.5 }}>
      {session.unlearnedCount > 0 ? (
        <Button component={RouterLink} to="/learn" variant="contained">
          Go to Learn
        </Button>
      ) : null}
      <Button variant="outlined" color="inherit" onClick={onDone}>
        Back to modes
      </Button>
    </Box>
  );

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
      {/* The counter stays optically centred and the sound control sits out at
          the edge, above the prompt and well clear of the thumb zone, so it
          cannot be caught mid-rep. It is before the prompt in the DOM, so it is
          never in the tab path between the year and the pad. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <Box />
        <Numeral size={13} color={palette.inkMuted}>
          {`${done} / ${total}`}
        </Numeral>
        <Box sx={{ justifySelf: 'end' }}>
          <SoundToggle
            on={settings.spokenReviewPrompts}
            onChange={(next) => void updateSettings({ spokenReviewPrompts: next })}
          />
        </Box>
      </Box>

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
        // Off unless the user turned it on. Running out shows the hint and
        // reopens the pad; it never records an answer nobody gave.
        windowMs={phase === 'prompt' ? settings.answerWindowMs : null}
        onExpire={session.expire}
      />
    </Screen>
  );
}
