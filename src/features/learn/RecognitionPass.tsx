import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { Fragment, useState } from 'react';
import { Numeral } from '@/components/ui/Numeral';
import { codeFor, formatYear } from '@/domain/yearCodes';
import type { YearKey } from '@/domain/types';
import { palette } from '@/theme/palette';
import { SessionHeader } from './SessionHeader';
import { BLOCK_SIZE, decadeLabel, decadeYears, leapRuns, stepAfter } from './blocks';

interface RecognitionPassProps {
  decade: number;
  /** Which years to show. Defaults to the whole decade. */
  years?: YearKey[];
  /** What the header calls this step. */
  stepLabel?: string;
  onDone: () => void;
  onExit: () => void;
}

/** The +1 that separates two years of the same run. */
function Step({ value, column }: { value: number; column: number }) {
  return (
    <Box
      sx={{
        gridColumn: column,
        alignSelf: 'center',
        // Nudged down so it sits beside the code, not between year and code.
        mt: '9px',
        px: 0.5,
        textAlign: 'center',
      }}
      aria-hidden
    >
      <Numeral size={11} color={palette.inkFaint}>
        {`+${value}`}
      </Numeral>
    </Box>
  );
}

/** The leap boundary: a rule across the block with the size of the jump on it. */
function Jump({ value }: { value: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, my: 1.5 }} aria-hidden>
      <Box sx={{ flex: 1, height: '1px', bgcolor: palette.rule }} />
      <Numeral size={11} color={palette.inkMuted}>
        {`+${value}`}
      </Numeral>
      <Box sx={{ flex: 1, height: '1px', bgcolor: palette.rule }} />
    </Box>
  );
}

/**
 * One labelled example, so the stacked pairs below are never two unexplained
 * numbers. It uses a year from outside any decade block's own run so it cannot
 * be mistaken for one of the ten being taught.
 */
function Legend() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <Numeral size={13} color={palette.inkMuted}>
          04
        </Numeral>
        <Numeral size={26} weight={600}>
          5
        </Numeral>
      </Box>
      <Box>
        <Typography variant="body2" color="text.secondary">
          Top number is the year.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Bottom number is its code.
        </Typography>
        <Typography variant="caption" color="text.disabled">
          So the year 04 has code 5.
        </Typography>
      </Box>
    </Box>
  );
}

function Pair({
  yy,
  current,
  onTap,
}: {
  yy: YearKey;
  current: boolean;
  onTap: () => void;
}) {
  const code = codeFor(yy);
  return (
    <ButtonBase
      disabled={!current}
      onClick={onTap}
      aria-label={`${formatYear(yy)} is ${code}`}
      sx={{
        width: '100%',
        minHeight: 56,
        py: 0.75,
        borderRadius: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        bgcolor: current ? palette.greenSoft : 'transparent',
        transition: 'opacity 160ms ease-out, background-color 160ms ease-out',
        '&.Mui-disabled': { opacity: 0.4 },
      }}
    >
      <Numeral size={13} color={current ? palette.green : palette.inkMuted}>
        {formatYear(yy)}
      </Numeral>
      <Numeral size={26} weight={600} color={current ? palette.green : palette.ink}>
        {code}
      </Numeral>
    </ButtonBase>
  );
}

/**
 * Pass 1. The ten pairs with their codes visible, laid out as the four-year runs
 * they actually belong to: columns hold a year's position inside its run, so a
 * decade that opens mid-run starts indented. The +1 steps sit between the pairs
 * and the +2 jump gets a rule of its own. Nothing is scored here.
 */
export function RecognitionPass({
  decade,
  years: only,
  stepLabel,
  onDone,
  onExit,
}: RecognitionPassProps) {
  const years = only ?? decadeYears(decade);
  const shown = new Set(years);
  // Keep the run grouping, but drop anything this step is not teaching yet.
  const runs = leapRuns(decade)
    .map((run) => ({ ...run, years: run.years.filter((yy) => shown.has(yy)) }))
    .filter((run) => run.years.length > 0);
  const [index, setIndex] = useState(0);

  const advance = () => {
    if (index >= years.length - 1) {
      onDone();
      return;
    }
    setIndex(index + 1);
  };

  return (
    <>
      <SessionHeader
        label={decadeLabel(decade)}
        pass={stepLabel ?? 'All ten · pass 1 of 2'}
        position={index + 1}
        total={years.length}
        onExit={onExit}
      />

      <Typography variant="body1" color="text.secondary">
        {years.length === BLOCK_SIZE
          ? 'All ten together now, with the structure in view. You will be asked for them on their own next.'
          : `Every year from 00 to 99 has one code, a number from 0 to 6. Here are ${years.length}. You will be asked for them on their own next.`}
      </Typography>

      <Legend />

      <Typography variant="body2" color="text.secondary">
        Inside a run of four years the code goes up by one. Crossing into the next run it goes up by
        two.
      </Typography>

      <Box>
        {runs.map((run, runIndex) => (
          <Fragment key={run.start}>
            {runIndex > 0 ? <Jump value={stepAfter(runs[runIndex - 1].end)} /> : null}
            <Box>
              <Numeral size={11} color={palette.inkFaint} sx={{ display: 'block', mb: 0.25 }}>
                {`${formatYear(run.start)}–${formatYear(run.end)}`}
              </Numeral>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr auto 1fr auto 1fr',
                  alignItems: 'center',
                }}
              >
                {run.years.map((yy, i) => (
                  <Fragment key={yy}>
                    <Box sx={{ gridColumn: (yy - run.start) * 2 + 1, minWidth: 0 }}>
                      <Pair yy={yy} current={yy === years[index]} onTap={advance} />
                    </Box>
                    {i < run.years.length - 1 ? (
                      <Step value={stepAfter(yy)} column={(yy - run.start) * 2 + 2} />
                    ) : null}
                  </Fragment>
                ))}
              </Box>
            </Box>
          </Fragment>
        ))}
      </Box>

      <Typography variant="body2" color="text.secondary">
        Tap each pair once, in order.
      </Typography>
    </>
  );
}
