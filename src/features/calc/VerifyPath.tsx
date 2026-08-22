import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Numeral } from '@/components/ui/Numeral';
import { formatMs } from '@/domain/time';
import type { CalcAttempt, VerifyAttempt } from '@/domain/types';
import { codeFor, formatYear } from '@/domain/yearCodes';
import { PlainToggle, type ToggleChoice } from '@/features/weekday/PlainToggle';
import { useAppState } from '@/state/useAppState';
import { space } from '@/theme/tokens';
import { AnswerField } from './AnswerField';
import { LabelledValues } from './LabelledValues';
import { PathHeader } from './PathHeader';
import { StepRunner, type StepRunResult } from './StepRunner';
import { drawYear } from './yearPool';
import { stepLabel, stepsForMode, carryFor } from './stepView';
import { verifyCopy } from './verifyCopy';

type PathId = 'three' | 'reduce';

const PATH_CHOICES: readonly ToggleChoice<PathId>[] = [
  { value: 'three', label: 'Three steps' },
  { value: 'reduce', label: 'Reduce first' },
];

type Phase =
  | { kind: 'recall' }
  | { kind: 'derive'; recalled: number; latencyMs: number }
  | { kind: 'saving' }
  | { kind: 'result'; attempt: VerifyAttempt; run: StepRunResult };

interface VerifyPathProps {
  keyboard: boolean;
  onBack: () => void;
}

/**
 * Memory first, then the working, then the two side by side.
 *
 * This is the mode that turns the calculation into a safety net, so the
 * comparison is the result of the screen rather than a footnote under it. The
 * working is deliberately not corrected mid-derivation: a screen that refuses
 * to move until every step is right can only ever report that the working
 * agreed, which would make the whole comparison meaningless.
 */
export function VerifyPath({ keyboard, onBack }: VerifyPathProps) {
  const { recordCalcAttempt, recordVerifyResult } = useAppState();
  const [path, setPath] = useState<PathId>('three');
  const [draw, setDraw] = useState(() => drawYear([], Math.random));
  const [phase, setPhase] = useState<Phase>({ kind: 'recall' });
  const deriveStart = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reduceFirst = path === 'reduce';
  const yy = draw.yy;
  const steps = useMemo(() => stepsForMode(yy, reduceFirst), [yy, reduceFirst]);

  const nextYear = () => {
    setPhase({ kind: 'recall' });
    setDraw((current) => drawYear(current.used, Math.random));
  };

  const handleRecall = (value: number, latencyMs: number) => {
    const attempt: CalcAttempt = {
      timestamp: Date.now(),
      yy,
      step: 'code',
      answered: value,
      correct: value === codeFor(yy),
      latencyMs: Math.round(latencyMs),
      reduced: reduceFirst,
    };
    void recordCalcAttempt(attempt);
    deriveStart.current = performance.now();
    setPhase({ kind: 'derive', recalled: value, latencyMs: Math.round(latencyMs) });
  };

  const handleDerived = async (recalled: number, recallLatencyMs: number, run: StepRunResult) => {
    const derived = run.answers[run.answers.length - 1] ?? -1;
    setPhase({ kind: 'saving' });
    const attempt = await recordVerifyResult({
      timestamp: Date.now(),
      yy,
      recalled,
      derived,
      recallLatencyMs,
      deriveLatencyMs: Math.round(Math.max(0, performance.now() - deriveStart.current)),
      reduced: reduceFirst,
    });
    if (!alive.current) return;
    setPhase({ kind: 'result', attempt, run });
  };

  const header = <PathHeader title="Check against memory" onBack={onBack} />;

  if (phase.kind === 'saving') return header;

  if (phase.kind === 'result') {
    const { attempt, run } = phase;
    const copy = verifyCopy(attempt.outcome);
    return (
      <>
        {header}
        <Box>
          <Typography variant="h1" component="h2">
            {copy.title}
          </Typography>
          <Typography variant="body1" sx={{ color: 'var(--text-secondary)', mt: `${space[2]}px` }}>
            {copy.note}
          </Typography>
        </Box>

        <LabelledValues
          size={22}
          lines={[
            { label: 'Year', value: formatYear(attempt.yy) },
            { label: 'What memory said', value: String(attempt.recalled) },
            { label: 'What the working said', value: String(attempt.derived) },
            { label: 'The true code', value: String(attempt.actual) },
          ]}
        />

        <Box>
          <Typography variant="h2" component="h3" sx={{ mb: `${space[2]}px` }}>
            How long each part took
          </Typography>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            <Box
              component="li"
              sx={{ display: 'flex', justifyContent: 'space-between', py: `${space[1]}px` }}
            >
              <Typography component="span" variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                {stepLabel('code')}
              </Typography>
              <Numeral size={15} weight={500}>
                {formatMs(attempt.recallLatencyMs)}
              </Numeral>
            </Box>
            {run.run.items.map((step, index) => (
              <Box
                component="li"
                key={step.id}
                sx={{ display: 'flex', justifyContent: 'space-between', py: `${space[1]}px` }}
              >
                <Typography component="span" variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                  {stepLabel(step.id)}
                  {run.run.firstTry[index] ? '' : ' · wrong'}
                </Typography>
                <Numeral size={15} weight={500}>
                  {run.run.timings[index] === null ? '—' : formatMs(run.run.timings[index] ?? 0)}
                </Numeral>
              </Box>
            ))}
          </Box>
        </Box>

        <Button variant="contained" onClick={nextYear} sx={{ alignSelf: 'flex-start' }}>
          Next year
        </Button>
      </>
    );
  }

  if (phase.kind === 'derive') {
    const { recalled, latencyMs } = phase;
    return (
      <>
        {header}
        <Typography variant="body1">
          {'You said '}
          <Numeral weight={500}>{recalled}</Numeral>
          {'. Now work it out and see whether the two agree. Nothing is corrected until the end.'}
        </Typography>
        <StepRunner
          key={`${yy}-${path}`}
          yy={yy}
          steps={steps}
          reduced={reduceFirst}
          keyboard={keyboard}
          holdOnWrong={false}
          // A slip has to survive to the end here. If the next question handed
          // back the correct sum, the derivation could only fail on its last
          // step and "calculation was right" would mean almost nothing.
          carry={(given) => carryFor(yy, given, reduceFirst)}
          onDone={(run) => void handleDerived(recalled, latencyMs, run)}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <Box>
        <PlainToggle label="Which path" choices={PATH_CHOICES} value={path} onChange={setPath} />
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          {reduceFirst
            ? 'The working will take whole 28s off the year first.'
            : 'The working will go straight through the formula.'}
        </Typography>
      </Box>

      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          Year
        </Typography>
        <Numeral size={64} weight={500}>
          {formatYear(yy)}
        </Numeral>
      </Box>

      <Typography variant="body1">Say the code from memory. Do not work it out yet.</Typography>

      <AnswerField
        pad
        label="The code"
        promptKey={`recall-${yy}`}
        max={6}
        onAnswer={handleRecall}
        correct={codeFor(yy)}
        keyboard={keyboard}
      />
    </>
  );
}
