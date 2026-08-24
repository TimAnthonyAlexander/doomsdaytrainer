import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { AnswerPad, type AnswerFeedback, type AnswerOption } from '@/components/answer/AnswerPad';
import { Numeral } from '@/components/ui/Numeral';
import { NumericText, useNumericSettled } from '@/components/ui/NumericText';
import type { Attempt, Code, YearKey } from '@/domain/types';
import { codeFor, formatYear } from '@/domain/yearCodes';
import { cueUrl, pairUrl } from '@/features/audio/speech';
import { useSpokenPrompt } from '@/features/audio/useSpokenPrompt';
import { useAppState } from '@/state/useAppState';
import { SessionHeader } from './SessionHeader';
import { decadeLabel } from './blocks';
import { answerStudy, currentStudyYear, startStudy, studyProgress } from './study';

const OPTIONS: AnswerOption[] = Array.from({ length: 7 }, (_unused, value) => ({
  value,
  label: String(value),
}));

interface StudyPassProps {
  decade: number;
  /** The batch being introduced. Three or four years, never adjacent ones. */
  years: YearKey[];
  /** What the header calls this step. */
  stepLabel: string;
  onDone: (wrongTaps: number) => void;
  onExit: () => void;
}

/**
 * The teaching step: one pair, shown and then immediately asked for, through
 * the batch.
 *
 * There is no layout here that puts two years side by side, and there cannot
 * be. The screen holds one year, one code, and the labels saying which is
 * which. See `study.ts` for why show-then-ask is the order and why the show
 * trial still takes a tap.
 */
export function StudyPass({ decade, years, stepLabel, onDone, onExit }: StudyPassProps) {
  const { settings, recordDrillAttempt } = useAppState();
  const [state, setState] = useState(() => startStudy(years));
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

  const yy = currentStudyYear(state);
  const { position, total } = studyProgress(state);
  const showing = state.trial === 'show';
  const nextYear = state.years[state.index + 1] ?? null;
  // A wrong tap keeps the same trial on screen, so the key has to move on the
  // retry too or the pad would refuse the second answer.
  const promptKey = `${state.trial}-${yy ?? 'none'}-${state.wrongTaps}`;
  // The pad's latency clock stays at zero until the year settles into place —
  // see useAnswerTimer.ts and NumericText.tsx.
  const settled = useNumericSettled(promptKey);

  useSpokenPrompt(
    yy === null ? null : showing ? pairUrl(yy) : cueUrl(yy),
    settings.spokenPrompts,
    // The show trial is followed by the same year without its code; the test
    // trial is followed by the next pair.
    yy === null ? null : showing ? cueUrl(yy) : nextYear === null ? null : pairUrl(nextYear),
  );

  const handleAnswer = (value: number, latencyMs: number) => {
    if (feedback !== null || yy === null) return;

    const chosen = value as Code;
    const wasTest = state.trial === 'test';
    const { state: next, correct } = answerStudy(state, chosen);

    // Only the ask is an attempt. A tap on a code that is on the screen is not
    // a retrieval and recording it as one would put a free correct answer into
    // the item's history.
    if (wasTest) {
      const attempt: Attempt = {
        timestamp: Date.now(),
        correct,
        latencyMs: Math.round(latencyMs),
        answered: chosen,
        hintUsed: false,
        source: 'learn',
      };
      void recordDrillAttempt(yy, attempt);
    }

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
    }, Math.max(500, settings.autoAdvanceMs));
  };

  return (
    <>
      <SessionHeader
        label={decadeLabel(decade)}
        pass={stepLabel}
        position={position}
        total={total}
        onExit={onExit}
      />

      <Typography variant="body2" color="text.secondary">
        {showing
          ? 'One pair at a time. Tap the code shown, then the same year comes back without it.'
          : 'Same year, code hidden. Tap it.'}
      </Typography>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Box sx={{ textAlign: 'center', pt: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Year
          </Typography>
          <Box
            data-testid="study-year"
            aria-label={yy === null ? undefined : `Year ${formatYear(yy)}`}
          >
            <NumericText text={yy === null ? '' : formatYear(yy)} size={56} weight={600} mono />
          </Box>
        </Box>

        {/* The code slot keeps its height whether or not there is a code in it,
            so the pad never moves between the two trials of a pair. */}
        <Box sx={{ minHeight: 92, textAlign: 'center', pt: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Code
          </Typography>
          <Box data-testid="study-code">
            <Numeral size={40} weight={600}>
              {yy === null ? '' : showing || feedback !== null ? codeFor(yy) : ''}
            </Numeral>
          </Box>
        </Box>

        <Box sx={{ minHeight: 44, textAlign: 'center' }}>
          {feedback === null && state.lastWrong !== null && state.lastWrongYear !== null ? (
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
        promptKey={promptKey}
        feedback={feedback}
        disabled={feedback !== null}
        keyboard={settings.keyboardInput}
        armed={settled}
      />
    </>
  );
}
