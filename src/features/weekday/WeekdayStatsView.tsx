import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { ChevronLeft } from 'lucide-react';
import { useMemo } from 'react';
import { Numeral } from '@/components/ui/Numeral';
import { Stat } from '@/components/ui/Stat';
import { formatMs } from '@/domain/time';
import { useAppState } from '@/state/useAppState';
import { palette } from '@/theme/palette';
import {
  formatAccuracy,
  overallTally,
  tallyByCentury,
  tallyByMode,
  tallyByMonth,
  type Tally,
} from './weekdayStats';

interface WeekdayStatsViewProps {
  onBack: () => void;
}

interface Row extends Tally {
  label: string;
}

/**
 * One block of rows. The median is the column that matters — a month whose
 * doomsday is not quite automatic shows up as seconds long before it shows up
 * as mistakes.
 */
function Breakdown({ title, note, rows }: { title: string; note: string; rows: Row[] }) {
  const slowest = rows.reduce<number | null>(
    (worst, row) => (row.medianMs === null ? worst : worst === null ? row.medianMs : Math.max(worst, row.medianMs)),
    null,
  );

  return (
    <Box>
      <Typography variant="h3" component="h2">
        {title}
      </Typography>
      <Typography variant="caption" component="div" color="text.secondary" sx={{ mt: 0.5, mb: 1 }}>
        {note}
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {rows.map((row) => {
          const slow = slowest !== null && row.medianMs !== null && row.medianMs === slowest && rows.length > 1;
          return (
            <Box
              component="li"
              key={row.label}
              sx={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                columnGap: 2,
                alignItems: 'baseline',
                py: 0.75,
                borderBottom: `1px solid ${palette.rule}`,
              }}
            >
              <Typography component="span" variant="body2" sx={{ fontWeight: slow ? 600 : 400 }}>
                {row.label}
              </Typography>
              <Numeral size={12} color={palette.inkFaint}>
                {row.attempts === 0 ? '—' : formatAccuracy(row.accuracy)}
              </Numeral>
              <Numeral
                size={13}
                weight={slow ? 600 : 400}
                color={row.medianMs === null ? palette.inkFaint : palette.ink}
                sx={{ minWidth: 56, textAlign: 'right' }}
              >
                {row.medianMs === null ? '—' : formatMs(row.medianMs)}
              </Numeral>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/**
 * Everything the weekday trainer has recorded. Separate from the Stats screen
 * because none of it is per-item: a date belongs to no item, so the mastery
 * grid has nothing to say about it.
 */
export function WeekdayStatsView({ onBack }: WeekdayStatsViewProps) {
  const { data } = useAppState();
  const attempts = data.weekdayAttempts;

  const overall = useMemo(() => overallTally(attempts), [attempts]);
  const modes = useMemo(() => tallyByMode(attempts), [attempts]);
  const months = useMemo(() => tallyByMonth(attempts), [attempts]);
  const centuries = useMemo(() => tallyByCentury(attempts), [attempts]);

  return (
    <>
      <ButtonBase
        onClick={onBack}
        sx={{
          alignSelf: 'flex-start',
          minHeight: 44,
          pr: 1.25,
          gap: 0.5,
          borderRadius: 1,
          color: 'text.secondary',
          '&:hover': { color: 'primary.main' },
        }}
      >
        <ChevronLeft size={18} strokeWidth={1.75} aria-hidden />
        <Typography component="span" variant="body2">
          Dates
        </Typography>
      </ButtonBase>

      <Box>
        <Typography variant="h1" component="h1">
          Weekday stats
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          {overall.attempts === 0
            ? 'Nothing recorded yet. Answer a few dates and the breakdowns fill in.'
            : `${overall.attempts} dates answered.`}
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
        <Stat label="Accuracy" value={formatAccuracy(overall.accuracy)} size="lg" />
        <Stat
          label="Median"
          value={overall.medianMs === null ? '—' : formatMs(overall.medianMs)}
          size="lg"
        />
      </Box>

      <Breakdown
        title="By mode"
        note="Accuracy and median latency, assisted against unassisted."
        rows={modes.map((mode) => ({ ...mode, label: mode.label }))}
      />
      <Breakdown
        title="By month"
        note="The slowest month is the month doomsday to go back to."
        rows={months.map((month) => ({ ...month, label: month.label }))}
      />
      <Breakdown
        title="By century"
        note="Four anchors. A slow century is a slow anchor."
        rows={centuries.map((century) => ({ ...century, label: century.label }))}
      />
    </>
  );
}
