import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { Numeral } from '@/components/ui/Numeral';
import { space } from '@/theme/tokens';
import { AnswerField } from './AnswerField';
import { LabelledValues } from './LabelledValues';
import type { DrillItem } from './lessons';
import { answerRun, currentItem, startRun } from './runs';

/** How long a right answer stays on screen before the next question. */
const HOLD_MS = 400;

interface DrillViewProps {
  items: readonly DrillItem[];
  keyboard: boolean;
  onDone: (wrongTotal: number) => void;
}

/**
 * The practice half of a lesson: the same one step, a few times, on its own.
 *
 * A wrong answer does not move on. It puts the whole thing worked out on
 * screen, with every number named, and waits for the right answer. Moving on
 * would teach the user that the wrong answer was close enough.
 */
export function DrillView({ items, keyboard, onDone }: DrillViewProps) {
  const [run, setRun] = useState(() => startRun(items));
  const [held, setHeld] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const item = currentItem(run);
  if (item === null) return null;

  const handleAnswer = (value: number, latencyMs: number) => {
    if (held !== null) return;
    const result = answerRun(run, value, latencyMs);
    if (!result.correct) {
      setRun(result.state);
      return;
    }
    setHeld(value);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHeld(null);
      if (result.state.done) {
        onDoneRef.current(result.state.wrongTotal);
        return;
      }
      setRun(result.state);
    }, HOLD_MS);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${space[4]}px` }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Typography variant="h2" component="h2">
          Your turn
        </Typography>
        <Typography variant="body2" data-testid="calc-progress" sx={{ color: 'var(--text-secondary)' }}>
          <Numeral color="inherit" weight={500}>
            {run.index + 1}
          </Numeral>
          {' of '}
          <Numeral color="inherit">{items.length}</Numeral>
        </Typography>
      </Box>

      <LabelledValues lines={item.givens} size={22} />

      <Typography variant="body1">{item.question}</Typography>

      {/* Fixed floor, so the input does not jump when the working appears. */}
      <Box sx={{ minHeight: 76 }}>
        {held !== null ? (
          <Box>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
              {item.answerLabel}
            </Typography>
            <Numeral size={34} weight={500}>
              {held}
            </Numeral>
          </Box>
        ) : run.lastWrong !== null ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${space[2]}px` }}>
            <Typography variant="body2" sx={{ color: 'var(--grade-wrong)' }}>
              <Numeral color="inherit">{run.lastWrong}</Numeral>
              {' is not it. Here it is worked out.'}
            </Typography>
            <LabelledValues lines={item.working} />
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
              Answer it to go on.
            </Typography>
          </Box>
        ) : null}
      </Box>

      <AnswerField
        pad={item.pad}
        label={item.answerLabel}
        promptKey={`${item.key}-${run.wrongTotal}`}
        max={item.max}
        onAnswer={handleAnswer}
        disabled={held !== null}
        wrong={run.lastWrong}
        correct={item.answer}
        keyboard={keyboard}
      />
    </Box>
  );
}
