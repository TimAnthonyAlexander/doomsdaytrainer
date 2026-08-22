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
import { answerRecall, currentYear, progress, startRecall } from './recall';

const OPTIONS: AnswerOption[] = Array.from({ length: 7 }, (_unused, value) => ({
  value,
  label: String(value),
}));

interface RecallPassProps {
  decade: number;
  /** Which years to ask for. Defaults to the whole decade. */
  years?: YearKey[];
  /** Already-known years mixed in to space the block's years apart. */
  mixIn?: YearKey[];
  /** Varies the rotation between runs of the same block. */
  seed?: number;
  /**
   * These years have already been produced correctly in an earlier pass, so
   * their ordered ask is spent and this pass opens mixed.
   */
  alreadyProduced?: boolean;
  /** What the header calls this step. */
  stepLabel?: string;
  onDone: (wrongTaps: number) => void;
  onExit: () => void;
}

/**
 * The recall pass: ascending until each year has been right once, varied after
 * that. See `recall.ts` for why the switch happens where it does.
 *
 * Attempts are recorded with source 'learn', which appends history and leaves
 * scheduling alone: nothing here is a review, so nothing here should move an
 * interval. Learn attempts do not feed fluency either — the code was on screen
 * a moment ago.
 */
export function RecallPass({
  decade,
  years: only,
  mixIn,
  seed = 0,
  alreadyProduced = false,
  stepLabel,
  onDone,
  onExit,
}: RecallPassProps) {
  const { settings, recordDrillAttempt } = useAppState();
  const [state, setState] = useState(() =>
    startRecall(only ?? decadeYears(decade), seed, mixIn, alreadyProduced),
  );
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
  const { position, total } = progress(state);

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
        pass={stepLabel ?? (state.phase === 'ordered' ? 'In order' : 'Mixed up')}
        position={position}
        total={total}
        onExit={onExit}
      />

      <Typography variant="body2" color="text.secondary">
        {state.phase === 'ordered'
          ? 'The year is shown. Tap its code. In order this time, once each.'
          : 'Same years, mixed up now. Each one twice in a row without a miss.'}
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
        promptKey={`${state.phase}-${yy ?? 'none'}-${state.wrongTaps}-${position}`}
        feedback={feedback}
        disabled={feedback !== null}
        keyboard={settings.keyboardInput}
      />
    </>
  );
}
