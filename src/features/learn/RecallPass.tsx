import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { AnswerPad, type AnswerFeedback, type AnswerOption } from '@/components/answer/AnswerPad';
import { Numeral } from '@/components/ui/Numeral';
import type { Attempt, Code } from '@/domain/types';
import { codeFor, formatYear } from '@/domain/yearCodes';
import { useAppState } from '@/state/useAppState';
import { SessionHeader } from './SessionHeader';
import { BLOCK_SIZE, decadeLabel, decadeYears } from './blocks';
import { answerRecall, currentYear, startRecall } from './recall';

const OPTIONS: AnswerOption[] = Array.from({ length: 7 }, (_unused, value) => ({
  value,
  label: String(value),
}));

interface RecallPassProps {
  decade: number;
  onDone: (wrongTaps: number) => void;
  onExit: () => void;
}

/**
 * Pass 2. Same ten years, codes hidden, unlimited retries and no grade. Attempts
 * are recorded with source 'learn', which appends history and leaves scheduling
 * alone: nothing here is a review, so nothing here should move an interval.
 */
export function RecallPass({ decade, onDone, onExit }: RecallPassProps) {
  const { settings, recordDrillAttempt } = useAppState();
  const [state, setState] = useState(() => startRecall(decadeYears(decade)));
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const timer = useRef<number | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const yy = currentYear(state);

  const handleAnswer = (value: number, latencyMs: number) => {
    if (feedback !== null || yy === null) return;

    const chosen = value as Code;
    const { state: next, correct } = answerRecall(state, chosen);

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
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (next.done) {
        onDoneRef.current(next.wrongTaps);
        return;
      }
      setState(next);
      setFeedback(null);
    }, Math.max(120, settings.autoAdvanceMs));
  };

  return (
    <>
      <SessionHeader
        label={decadeLabel(decade)}
        pass="Pass 2 of 2"
        position={Math.min(state.index + 1, BLOCK_SIZE)}
        total={BLOCK_SIZE}
        onExit={onExit}
      />

      <Typography variant="body2" color="text.secondary">
        Codes hidden. Wrong taps are not scored, so take as many as you need.
      </Typography>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Box sx={{ textAlign: 'center', py: 2 }} data-testid="recall-prompt">
          <Numeral size={56} weight={600}>
            {yy === null ? '' : formatYear(yy)}
          </Numeral>
        </Box>
        <Box sx={{ minHeight: 24, textAlign: 'center' }}>
          {state.lastWrong !== null ? (
            <Typography variant="body2" color="error.main">
              {'Not '}
              <Numeral color="inherit">{state.lastWrong}</Numeral>
              {'. Try again.'}
            </Typography>
          ) : null}
        </Box>
      </Box>

      <AnswerPad
        options={OPTIONS}
        onAnswer={handleAnswer}
        // A wrong tap keeps the same year on screen, so the key has to move on
        // the retry too or the pad would refuse the second answer.
        promptKey={`${state.index}-${state.wrongTaps}`}
        feedback={feedback}
        disabled={feedback !== null}
        keyboard={settings.keyboardInput}
      />
    </>
  );
}
