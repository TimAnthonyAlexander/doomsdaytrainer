import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { Numeral } from '@/components/ui/Numeral';
import { formatMs } from '@/domain/time';
import type { YearKey } from '@/domain/types';
import { codeFor, formatYear } from '@/domain/yearCodes';
import { PlainToggle, type ToggleChoice } from '@/features/weekday/PlainToggle';
import { space } from '@/theme/tokens';
import { PathHeader } from './PathHeader';
import { StepRunner, type StepRunResult } from './StepRunner';
import { drawYear } from './yearPool';
import { stepLabel, stepsForMode } from './stepView';

type PathId = 'three' | 'reduce';

const PATH_CHOICES: readonly ToggleChoice<PathId>[] = [
  { value: 'three', label: 'Three steps' },
  { value: 'reduce', label: 'Reduce first' },
];

interface PracticePathProps {
  keyboard: boolean;
  onBack: () => void;
}

/** What the finished year cost, step by step. The whole point of the mode. */
function RoundResult({
  yy,
  result,
  onNext,
}: {
  yy: YearKey;
  result: StepRunResult;
  onNext: () => void;
}) {
  const { run } = result;
  return (
    <>
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          Year
        </Typography>
        <Numeral size={40} weight={500}>
          {formatYear(yy)}
        </Numeral>
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mt: `${space[2]}px` }}>
          Code
        </Typography>
        <Numeral size={40} weight={500}>
          {codeFor(yy)}
        </Numeral>
      </Box>

      <Box>
        <Typography variant="h2" component="h3" sx={{ mb: `${space[2]}px` }}>
          How long each step took
        </Typography>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {run.items.map((step, index) => (
            <Box
              component="li"
              key={step.id}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: `${space[4]}px`,
                py: `${space[1]}px`,
              }}
            >
              <Typography component="span" variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                {stepLabel(step.id)}
                {run.firstTry[index] ? '' : ' · wrong first time'}
              </Typography>
              <Numeral size={15} weight={500}>
                {run.timings[index] === null ? '—' : formatMs(run.timings[index] ?? 0)}
              </Numeral>
            </Box>
          ))}
        </Box>
      </Box>

      <Button variant="contained" onClick={onNext} sx={{ alignSelf: 'flex-start' }}>
        Next year
      </Button>
    </>
  );
}

/**
 * A year, worked all the way through, one step at a time.
 *
 * The reduce-first switch is here rather than in settings because it is meant
 * to be felt: the same year, the other way round, with the sums a third of the
 * size. Flipping it restarts the year so the two paths can be compared on the
 * same numbers.
 */
export function PracticePath({ keyboard, onBack }: PracticePathProps) {
  const [path, setPath] = useState<PathId>('three');
  const [draw, setDraw] = useState(() => drawYear([], Math.random));
  const [result, setResult] = useState<StepRunResult | null>(null);

  const reduceFirst = path === 'reduce';
  const steps = useMemo(() => stepsForMode(draw.yy, reduceFirst), [draw.yy, reduceFirst]);

  const nextYear = () => {
    setResult(null);
    setDraw((current) => drawYear(current.used, Math.random));
  };

  return (
    <>
      <PathHeader title="Practice the whole thing" onBack={onBack} />

      <Box>
        <PlainToggle label="Which path" choices={PATH_CHOICES} value={path} onChange={setPath} />
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          {reduceFirst
            ? 'Take whole 28s off the year first. Four questions, and the sum never passes 33.'
            : 'Straight through the formula. Three questions, and the sum can reach 123.'}
        </Typography>
      </Box>

      {result === null ? (
        <StepRunner
          // The switch restarts the year, so both paths can be felt on the same
          // numbers rather than on two different ones.
          key={`${draw.yy}-${path}`}
          yy={draw.yy}
          steps={steps}
          reduced={reduceFirst}
          keyboard={keyboard}
          holdOnWrong
          onDone={setResult}
        />
      ) : (
        <RoundResult yy={draw.yy} result={result} onNext={nextYear} />
      )}
    </>
  );
}
