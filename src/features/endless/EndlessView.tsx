import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnswerPad, type AnswerFeedback, type AnswerOption } from '@/components/answer/AnswerPad';
import { CodeCorrection } from '@/components/answer/CodeCorrection';
import { Numeral } from '@/components/ui/Numeral';
import { NumericText, useNumericSettled } from '@/components/ui/NumericText';
import type { Attempt, Code, YearKey } from '@/domain/types';
import { codeFor, formatYear } from '@/domain/yearCodes';
import { answerEndless, currentYear, startEndless } from '@/features/learn/endless';
import { summarise, type SessionResult } from '@/features/review/summary';
import { useAppState } from '@/state/useAppState';
import { palette } from '@/theme/palette';
import { endlessSessionLine } from './endlessPlan';

const OPTIONS: AnswerOption[] = Array.from({ length: 7 }, (_unused, value) => ({
  value,
  label: String(value),
}));

interface EndlessViewProps {
  /** Every year it may ask. All of them are introduced and in scope. */
  pool: YearKey[];
  onBack: () => void;
  /** Fixed only by tests. The order is deterministic given one. */
  seed?: number;
}

function BackRow({ onBack }: { onBack: () => void }) {
  return (
    <ButtonBase
      onClick={onBack}
      sx={{
        alignSelf: 'flex-start',
        minHeight: 48,
        pr: 1.25,
        gap: 0.5,
        borderRadius: 1,
        color: 'text.secondary',
        '&:hover': { color: 'primary.main' },
      }}
    >
      <ChevronLeft size={18} strokeWidth={1.75} aria-hidden />
      <Typography component="span" variant="body2">
        Year codes
      </Typography>
    </ButtonBase>
  );
}

/**
 * A two-digit year, the code it has, and nothing else, for as long as the user
 * stays. 33, 6. 04, 5. On and on.
 *
 * It is the year half of the weekday trainer with the century taken off, and
 * that is the whole reason it exists: `(anchor + code) mod 7` is two things to
 * recall and this is the one of them that has a hundred values. The other
 * three tiles under Year codes each stop somewhere — Learn at the block's
 * criterion, Revise when the queue empties, Calc at the end of a derivation —
 * and there was no way to simply keep going over everything already learned.
 *
 * Nothing here schedules. Attempts are recorded with source 'endless', which
 * appends history and leaves `interval`, `easeFactor`, `dueAt`, `repetitions`
 * and `lapses` exactly where they were: an answer given at a moment the user
 * chose says nothing about when the item should next be due, and letting it
 * move the schedule would let a long sitting empty tomorrow's queue.
 *
 * There is no answer window either, whatever Settings says. In a drill an
 * expiry counts a miss and moves on, which is coherent because a drill has a
 * length to move through. This has none, so an expiry could only either
 * advance past a year the user did not answer, or reveal the code and wait —
 * and waiting is what a wrong tap already does.
 */
export function EndlessView({ pool, onBack, seed }: EndlessViewProps) {
  const { settings, recordDrillAttempt } = useAppState();

  // Both fixed at mount. The pool is read off a context that changes on every
  // recorded attempt, so recomputing it would rebuild the queue mid-sitting;
  // the seed is what makes the order vary between visits rather than within
  // one.
  const [state, setState] = useState(() => startEndless(pool, seed ?? Date.now()));
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [results, setResults] = useState<SessionResult[]>([]);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const yy = currentYear(state);
  // A wrong tap keeps the same year on screen, so the key has to move on the
  // retry too or the pad would refuse the second answer.
  const promptKey = `endless-${yy ?? 'none'}-${state.answered}-${state.wrong}`;
  // The pad's latency clock stays at zero until the year has settled into
  // place — see useAnswerTimer.ts and NumericText.tsx.
  const settled = useNumericSettled(promptKey);

  const line = useMemo(() => endlessSessionLine(summarise(results)), [results]);

  const handleAnswer = (value: number, latencyMs: number) => {
    if (feedback !== null || yy === null) return;

    const chosen = value as Code;
    const { state: next, correct } = answerEndless(state, chosen);
    const latency = Math.round(latencyMs);

    const attempt: Attempt = {
      timestamp: Date.now(),
      correct,
      latencyMs: latency,
      answered: chosen,
      hintUsed: false,
      source: 'endless',
    };
    void recordDrillAttempt(yy, attempt);
    setResults((previous) => [...previous, { correct, latencyMs: latency }]);

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
      Math.max(0, settings.autoAdvanceMs),
    );
  };

  return (
    <>
      <BackRow onBack={onBack} />

      {/* The one sentence this screen needs. It sits beside Revise under the
          same heading and is identical in the hand, a year and seven buttons,
          so without it a long sitting here reads as work the queue will
          credit. No count in it: the tile that leads here carries that, and a
          second copy on the screen itself would be a number nothing acts on. */}
      <Typography variant="body2" color="text.secondary">
        Every code you have learned, mixed. Nothing here changes when a code is next due.
      </Typography>

      <Box
        sx={{
          flex: { xs: 1, md: '0 0 auto' },
          minHeight: { xs: 0, md: 180 },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <Box sx={{ textAlign: 'center' }}>
          {/* Invariant 7: the figure below is two digits with no century on
              it, which on a screen full of small numbers is not self-naming. */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Year
          </Typography>
          <Box data-testid="endless-prompt" aria-label={yy === null ? undefined : `Year ${formatYear(yy)}`}>
            <NumericText text={yy === null ? '' : formatYear(yy)} size={56} weight={600} mono />
          </Box>
        </Box>

        {/* Fixed height: the answer and the correction both appear in place, so
            the pad under them never moves between prompts. */}
        <Box sx={{ minHeight: 92, textAlign: 'center', pt: 1 }}>
          {feedback !== null ? (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Code
              </Typography>
              <Numeral size={40} weight={600} data-testid="endless-answer">
                {feedback.chosen}
              </Numeral>
            </>
          ) : state.lastWrong !== null && state.lastWrongYear !== null ? (
            <CodeCorrection yy={state.lastWrongYear} chosen={state.lastWrong} />
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

      {/* Keeps its place whether or not there is anything in it, so nothing
          moves when the first answer lands. */}
      <Numeral size={12} color={palette.inkMuted}>
        {line === '' ? 'Nothing answered in this sitting.' : `This sitting: ${line}`}
      </Numeral>
    </>
  );
}
