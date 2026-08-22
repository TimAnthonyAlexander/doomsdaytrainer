import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Numeral } from '@/components/ui/Numeral';
import { CYCLE } from '@/domain/calc';
import { formatYear } from '@/domain/yearCodes';
import { space } from '@/theme/tokens';
import { DrillView } from './DrillView';
import { LabelledValues } from './LabelledValues';
import { PathHeader } from './PathHeader';
import { shortcutLesson, type RepeatPair } from './lessons';

interface ShortcutPathProps {
  keyboard: boolean;
  onBack: () => void;
}

type Phase = 'read' | 'drill' | { wrong: number };

/** One repeat, with both years' codes named and the gap between them stated. */
function Pair({ pair }: { pair: RepeatPair }) {
  return (
    <Box>
      <LabelledValues
        lines={[
          { label: `Code of ${formatYear(pair.high)}`, value: String(pair.code) },
          { label: `Code of ${formatYear(pair.low)}`, value: String(pair.code) },
        ]}
        size={22}
      />
      <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mt: `${space[1]}px` }}>
        <Numeral color="inherit">{formatYear(pair.low)}</Numeral>
        {' plus '}
        <Numeral color="inherit">{CYCLE}</Numeral>
        {' is '}
        <Numeral color="inherit">{formatYear(pair.high)}</Numeral>
        {'. Same code.'}
      </Typography>
    </Box>
  );
}

/**
 * The 28-year cycle, taught after the three steps and not before.
 *
 * It is a shortcut, and a shortcut only means something once the user knows
 * what it is cutting short. Shown first it would read as a fourth rule to
 * memorise.
 */
export function ShortcutPath({ keyboard, onBack }: ShortcutPathProps) {
  const lesson = useMemo(() => shortcutLesson(), []);
  const [phase, setPhase] = useState<Phase>('read');

  const header = <PathHeader title="The 28-year shortcut" detail={lesson.title} onBack={onBack} />;

  if (phase === 'read') {
    return (
      <>
        {header}
        <PageTitle subtitle="Every code comes back around after 28 years. That is worth knowing on its own, and it makes the last step much smaller.">
          The 28-year shortcut
        </PageTitle>

        <Box>
          <Typography variant="h2" component="h3" sx={{ mb: `${space[3]}px` }}>
            Two you may already know
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${space[5]}px` }}>
            {lesson.pairs.map((pair) => (
              <Pair key={pair.high} pair={pair} />
            ))}
          </Box>
        </Box>

        <Box>
          <Typography variant="h2" component="h3" sx={{ mb: `${space[3]}px` }}>
            Why it repeats
          </Typography>
          <LabelledValues lines={lesson.reason} />
        </Box>

        <Box>
          <Typography variant="h2" component="h3" sx={{ mb: `${space[2]}px` }}>
            What it saves
          </Typography>
          {lesson.payoff.map((line) => (
            <Typography key={line} variant="body1" sx={{ color: 'var(--text-secondary)', mt: `${space[2]}px` }}>
              {line}
            </Typography>
          ))}
        </Box>

        <Box>
          <Typography variant="h2" component="h3" sx={{ mb: `${space[3]}px` }}>
            Worked out
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${space[5]}px` }}>
            {lesson.worked.map((example) => (
              <Box key={example.lead}>
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: `${space[2]}px` }}>
                  {example.lead}
                </Typography>
                <LabelledValues lines={example.lines} />
                <Typography variant="body1" sx={{ mt: `${space[2]}px` }}>
                  {example.close}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        <Button variant="contained" onClick={() => setPhase('drill')} sx={{ alignSelf: 'flex-start' }}>
          Practice reducing
        </Button>
      </>
    );
  }

  if (phase === 'drill') {
    return (
      <>
        {header}
        <Typography variant="body1">
          Only the reducing. Take whole 28s off the year and say what is left.
        </Typography>
        <DrillView items={lesson.items} keyboard={keyboard} onDone={(wrong) => setPhase({ wrong })} />
      </>
    );
  }

  return (
    <>
      {header}
      <Box>
        <Typography variant="h1" component="h2">
          Reducing
        </Typography>
        <Typography variant="body1" sx={{ color: 'var(--text-secondary)', mt: `${space[2]}px` }}>
          <Numeral color="inherit">{lesson.items.length}</Numeral>
          {' answered, '}
          {phase.wrong === 0 ? (
            'no wrong answers.'
          ) : (
            <>
              <Numeral color="inherit">{phase.wrong}</Numeral>
              {phase.wrong === 1 ? ' wrong answer.' : ' wrong answers.'}
            </>
          )}
        </Typography>
      </Box>
      <Typography variant="body1" sx={{ color: 'var(--text-secondary)' }}>
        Practice has a reduce-first switch. Turn it on and the same year takes smaller numbers.
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: `${space[3]}px` }}>
        <Button variant="outlined" color="inherit" onClick={() => setPhase('read')}>
          Read it again
        </Button>
        <Button variant="text" color="inherit" onClick={onBack} sx={{ color: 'var(--text-secondary)' }}>
          Calculate
        </Button>
      </Box>
    </>
  );
}
