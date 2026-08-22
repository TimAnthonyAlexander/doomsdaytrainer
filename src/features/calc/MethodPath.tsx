import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Numeral } from '@/components/ui/Numeral';
import { space } from '@/theme/tokens';
import { DrillView } from './DrillView';
import { LabelledValues } from './LabelledValues';
import { PathHeader } from './PathHeader';
import { methodLessons, type Lesson } from './lessons';

interface MethodPathProps {
  keyboard: boolean;
  onBack: () => void;
}

type Phase = { kind: 'list' } | { kind: 'read'; step: number } | { kind: 'drill'; step: number } | { kind: 'done'; step: number; wrong: number };

/** The lesson text: what the step is, why it exists, then real numbers. */
function LessonRead({ lesson, onPractice }: { lesson: Lesson; onPractice: () => void }) {
  return (
    <>
      <Box>
        <Typography variant="h1" component="h2">
          {lesson.title}
        </Typography>
        {lesson.what.map((line) => (
          <Typography key={line} variant="body1" sx={{ mt: `${space[2]}px` }}>
            {line}
          </Typography>
        ))}
      </Box>

      <Box>
        <Typography variant="h2" component="h3" sx={{ mb: `${space[2]}px` }}>
          Why
        </Typography>
        {lesson.why.map((line) => (
          <Typography key={line} variant="body1" sx={{ color: 'var(--text-secondary)', mt: `${space[1]}px` }}>
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

      <Button variant="contained" onClick={onPractice} sx={{ alignSelf: 'flex-start' }}>
        Practice this step
      </Button>
    </>
  );
}

/**
 * The three-step formula, taught as five lessons.
 *
 * Five and not three because two of the steps hide a second idea inside them.
 * Dividing by four is one thing and throwing the leftover away is another;
 * finding the sevens is one thing and seeing what is left is another. A
 * beginner told to "divide by four and drop the remainder" has been handed two
 * instructions dressed as one.
 */
export function MethodPath({ keyboard, onBack }: MethodPathProps) {
  const lessons = useMemo(() => methodLessons(), []);
  const [phase, setPhase] = useState<Phase>({ kind: 'list' });

  if (phase.kind === 'list') {
    return (
      <>
        <PathHeader title="Learn the method" onBack={onBack} />
        <PageTitle subtitle="Five short lessons. Each one is a single thing to do, with the reason it is there and real numbers worked out before anything is asked.">
          Learn the method
        </PageTitle>

        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {lessons.map((lesson, index) => (
            <Box component="li" key={lesson.id} sx={{ borderTop: index === 0 ? 'none' : '1px solid var(--border)' }}>
              <ButtonBase
                onClick={() => setPhase({ kind: 'read', step: index })}
                sx={{
                  width: '100%',
                  minHeight: 64,
                  px: `${space[2]}px`,
                  py: `${space[3]}px`,
                  gap: `${space[4]}px`,
                  borderRadius: `${space[2]}px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textAlign: 'left',
                }}
              >
                <Box sx={{ display: 'flex', gap: `${space[4]}px`, alignItems: 'baseline', minWidth: 0 }}>
                  <Numeral size={15} color="var(--text-muted)">
                    {index + 1}
                  </Numeral>
                  <Typography component="span" variant="body1">
                    {lesson.title}
                  </Typography>
                </Box>
                <ChevronRight size={18} strokeWidth={1.75} color="var(--text-muted)" aria-hidden />
              </ButtonBase>
            </Box>
          ))}
        </Box>
      </>
    );
  }

  const lesson = lessons[phase.step];
  const header = (
    <PathHeader
      title="Learn the method"
      detail={lesson.title}
      position={phase.step + 1}
      total={lessons.length}
      onBack={() => setPhase({ kind: 'list' })}
    />
  );

  if (phase.kind === 'read') {
    return (
      <>
        {header}
        <LessonRead lesson={lesson} onPractice={() => setPhase({ kind: 'drill', step: phase.step })} />
      </>
    );
  }

  if (phase.kind === 'drill') {
    return (
      <>
        {header}
        <DrillView
          key={lesson.id}
          items={lesson.items}
          keyboard={keyboard}
          onDone={(wrong) => setPhase({ kind: 'done', step: phase.step, wrong })}
        />
      </>
    );
  }

  const last = phase.step === lessons.length - 1;
  return (
    <>
      {header}
      <Box>
        <Typography variant="h1" component="h2">
          {lesson.title}
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

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: `${space[3]}px` }}>
        {last ? null : (
          <Button variant="contained" onClick={() => setPhase({ kind: 'read', step: phase.step + 1 })}>
            Next step
          </Button>
        )}
        <Button variant="outlined" color="inherit" onClick={() => setPhase({ kind: 'list' })}>
          The five steps
        </Button>
      </Box>

      {last ? (
        <Typography variant="body1" sx={{ color: 'var(--text-secondary)' }}>
          That is the whole method. The 28-year shortcut makes the last step much smaller, and practice
          runs all three steps on one year at a time.
        </Typography>
      ) : null}
    </>
  );
}
