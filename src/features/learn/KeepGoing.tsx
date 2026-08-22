import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { AnswerPad, type AnswerFeedback, type AnswerOption } from '@/components/answer/AnswerPad';
import { Numeral } from '@/components/ui/Numeral';
import type { Attempt, Code, YearKey } from '@/domain/types';
import { cueUrl } from '@/features/audio/speech';
import { useSpokenPrompt } from '@/features/audio/useSpokenPrompt';
import { codeFor, formatYear } from '@/domain/yearCodes';
import { useAppState } from '@/state/useAppState';
import { SessionHeader } from './SessionHeader';
import { decadeLabel } from './blocks';
import { answerEndless, currentYear, startEndless, upcomingYear } from './endless';

const OPTIONS: AnswerOption[] = Array.from({ length: 7 }, (_unused, value) => ({
  value,
  label: String(value),
}));

interface KeepGoingProps {
  decade: number;
  /** Every year to draw from. All of them are already introduced. */
  pool: YearKey[];
  seed?: number;
  /** Ends the pass and shows the block's summary. */
  onStop: (wrongTaps: number) => void;
}

/**
 * The pass that does not end.
 *
 * It introduces nothing: every year here was introduced by the block that just
 * finished, so the daily new-item cap is untouched and there is no reason for
 * this to stop at any particular count. Attempts are recorded with source
 * 'learn', which appends history and leaves scheduling alone — the same
 * contract every other pass in Learn works under.
 */
export function KeepGoing({ decade, pool, seed = 0, onStop }: KeepGoingProps) {
  const { settings, recordDrillAttempt } = useAppState();
  const [state, setState] = useState(() => startEndless(pool, seed));
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const timer = useRef<number | null>(null);
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const yy = currentYear(state);
  const upcoming = upcomingYear(state);

  // The cue only, the same as every other ask. A wrong tap leaves the year on
  // screen, so the url does not change and nothing is spoken over the correction.
  useSpokenPrompt(
    yy === null ? null : cueUrl(yy),
    settings.spokenPrompts,
    upcoming === null ? null : cueUrl(upcoming),
  );

  const handleAnswer = (value: number, latencyMs: number) => {
    if (feedback !== null || yy === null) return;

    const chosen = value as Code;
    const { state: next, correct } = answerEndless(state, chosen);

    const attempt: Attempt = {
      timestamp: Date.now(),
      correct,
      latencyMs: Math.round(latencyMs),
      answered: chosen,
      hintUsed: false,
      source: 'learn',
    };
    void recordDrillAttempt(yy, attempt);

    if (!correct) {
      setState(next);
      return;
    }

    setFeedback({ chosen, correct: codeFor(yy) });
    timer.current = window.setTimeout(
      () => {
        timer.current = null;
        setState(next);
        setFeedback(null);
      },
      Math.max(500, settings.autoAdvanceMs),
    );
  };

  return (
    <>
      <SessionHeader
        label={decadeLabel(decade)}
        pass="Keep going"
        position={state.answered}
        total={null}
        onExit={() => onStopRef.current(state.wrong)}
      />

      <Typography variant="body2" color="text.secondary">
        {`All ${pool.length} are learned. This keeps asking them, mixed, for as long as you want. Nothing new is introduced here.`}
      </Typography>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Box sx={{ textAlign: 'center', pt: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Year
          </Typography>
          <Box data-testid="recall-prompt">
            <Numeral size={56} weight={600}>
              {yy === null ? '' : formatYear(yy)}
            </Numeral>
          </Box>
        </Box>

        {/* Fixed height: the answer appears in place, the pad never moves. */}
        <Box sx={{ minHeight: 92, textAlign: 'center', pt: 1 }}>
          {feedback !== null ? (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Code
              </Typography>
              <Numeral size={40} weight={600} data-testid="recall-answer">
                {feedback.chosen}
              </Numeral>
            </>
          ) : state.lastWrong !== null && state.lastWrongYear !== null ? (
            <Typography variant="body2" color="error.main">
              <Numeral color="inherit">{formatYear(state.lastWrongYear)}</Numeral>
              {' is '}
              <Numeral color="inherit">{codeFor(state.lastWrongYear)}</Numeral>
              {', not '}
              <Numeral color="inherit">{state.lastWrong}</Numeral>
              {'. Tap the right one to go on.'}
            </Typography>
          ) : null}
        </Box>
      </Box>

      <AnswerPad
        options={OPTIONS}
        onAnswer={handleAnswer}
        // A wrong tap keeps the same year on screen, so the key has to move on
        // the retry too or the pad would refuse the second answer.
        promptKey={`keep-${yy ?? 'none'}-${state.answered}-${state.wrong}`}
        feedback={feedback}
        disabled={feedback !== null}
        keyboard={settings.keyboardInput}
      />
    </>
  );
}
