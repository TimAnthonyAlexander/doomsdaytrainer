import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { AnswerPad, type AnswerFeedback, type AnswerOption } from '@/components/answer/AnswerPad';
import { Numeral } from '@/components/ui/Numeral';
import type { Attempt, Code, YearKey } from '@/domain/types';
import { codeFor, formatYear } from '@/domain/yearCodes';
import { useAppState } from '@/state/useAppState';
import { SessionHeader } from './SessionHeader';
import { decadeLabel, decadeYears } from './blocks';
import { answerRecall, currentYear, startRecall } from './recall';

const OPTIONS: AnswerOption[] = Array.from({ length: 7 }, (_unused, value) => ({
  value,
  label: String(value),
}));

interface RecallPassProps {
  decade: number;
  /** Which years to ask for. Defaults to the whole decade. */
  years?: YearKey[];
  /** What the header calls this step. */
  stepLabel?: string;
  onDone: (wrongTaps: number) => void;
  onExit: () => void;
}

/**
 * Pass 2. Same ten years, codes hidden, unlimited retries and no grade. Attempts
 * are recorded with source 'learn', which appends history and leaves scheduling
 * alone: nothing here is a review, so nothing here should move an interval.
 */
export function RecallPass({ decade, years: only, stepLabel, onDone, onExit }: RecallPassProps) {
  const { settings, recordDrillAttempt } = useAppState();
  const askedRef = useRef(only ?? decadeYears(decade));
  const asked = askedRef.current;
  const [state, setState] = useState(() => startRecall(asked));
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
      // Long enough to actually read the code you just tapped. Learn mode is not
      // where the app measures speed, so the review screen's shorter
      // auto-advance would only hide the answer before it registers.
    }, Math.max(500, settings.autoAdvanceMs));
  };

  return (
    <>
      <SessionHeader
        label={decadeLabel(decade)}
        pass={stepLabel ?? 'All ten · pass 2 of 2'}
        position={Math.min(state.index + 1, asked.length)}
        total={asked.length}
        onExit={onExit}
      />

      <Typography variant="body2" color="text.secondary">
        {`The year is shown. Tap its code. One wrong tap starts these ${asked.length} again, so finishing means ${asked.length} right in a row.`}
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
              {'. Back to the start of the block.'}
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
