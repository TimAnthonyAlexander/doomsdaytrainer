import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { WeekdayMode } from '@/domain/types';
import { formatDate, monthName, trueWeekdayName } from '@/domain/weekday';
import { formatYear } from '@/domain/yearCodes';
import { Numeral } from '@/components/ui/Numeral';
import { palette } from '@/theme/palette';
import type { WeekdayPhase } from './useWeekdaySession';

interface WeekdayPromptProps {
  fullYear: number;
  /** 1-based. */
  month: number;
  day: number;
  /** The year code for this date's year. Shown in assisted mode only. */
  yearCode: number;
  mode: WeekdayMode;
  phase: WeekdayPhase;
  correctCode: number;
}

/**
 * The date, and above it the one number assisted mode hands over.
 *
 * The month is spelled out on purpose: 3/14/87 and 14/3/87 are the same six
 * characters and different dates, and nobody should have to work out which
 * convention the app meant before they can start on the actual problem.
 */
export function WeekdayPrompt({
  fullYear,
  month,
  day,
  yearCode,
  mode,
  phase,
  correctCode,
}: WeekdayPromptProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, width: '100%' }}>
      <Box sx={{ minHeight: 20 }}>
        {mode === 'assisted' ? (
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
            <Typography component="span" sx={{ fontSize: 14, color: palette.inkMuted }}>
              Year code
            </Typography>
            <Numeral size={14} color={palette.inkMuted}>
              {`${yearCode} (XX${formatYear(fullYear % 100)})`}
            </Numeral>
          </Box>
        ) : null}
      </Box>

      <Typography
        component="h1"
        aria-label={formatDate(fullYear, month, day)}
        sx={{
          m: 0,
          textAlign: 'center',
          fontSize: { xs: 40, sm: 52 },
          fontWeight: 600,
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
          textWrap: 'balance',
        }}
      >
        <Numeral size="inherit" weight={600} lineHeight={1.1}>
          {day}
        </Numeral>{' '}
        {monthName(month)}{' '}
        <Numeral size="inherit" weight={600} lineHeight={1.1}>
          {fullYear}
        </Numeral>
      </Typography>

      {phase === 'wrong' ? (
        <Typography variant="h3" component="p" sx={{ color: palette.brandDeep }}>
          {trueWeekdayName(correctCode as 0)}
        </Typography>
      ) : null}
    </Box>
  );
}
