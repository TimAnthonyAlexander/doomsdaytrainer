import Box from '@mui/material/Box';
import { centuryLabel, monthName, trueWeekdayName, type WeekdayWorking as Working } from '@/domain/weekday';
import { formatYear } from '@/domain/yearCodes';
import { Numeral } from '@/components/ui/Numeral';
import { palette } from '@/theme/palette';

interface WeekdayWorkingProps {
  working: Working;
}

interface Line {
  label: string;
  expression: string;
  value: string;
}

function signed(value: number): string {
  return value < 0 ? `- ${Math.abs(value)}` : `+ ${value}`;
}

/**
 * The five steps, with this date's real numbers.
 *
 * A wrong weekday says nothing about which part failed — the anchor, the year
 * code, the month doomsday or the subtraction. Showing all four is the only
 * way the user finds out, and it is why a wrong answer here never reschedules
 * the month or century item.
 */
export function WeekdayWorking({ working }: WeekdayWorkingProps) {
  const leap = working.leapYear && (working.month === 1 || working.month === 2);
  const lines: Line[] = [
    {
      label: 'Century anchor',
      expression: centuryLabel(working.century),
      value: String(working.centuryAnchor),
    },
    {
      label: 'Year code',
      expression: formatYear(working.yy),
      value: String(working.yearCode),
    },
    {
      label: 'Month doomsday',
      expression: leap ? `${monthName(working.month)}, leap year` : monthName(working.month),
      value: String(working.monthDoomsday),
    },
    {
      label: 'Day offset',
      expression: `${working.day} - ${working.monthDoomsday}`,
      value: String(working.offset),
    },
    {
      label: 'Weekday',
      expression: `${working.centuryAnchor} + ${working.yearCode} ${signed(working.offset)} mod 7`,
      value: `${working.weekday}  ${trueWeekdayName(working.weekday)}`,
    },
  ];

  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        width: '100%',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        columnGap: { xs: 1.5, sm: 2.5 },
        rowGap: 0.75,
        alignItems: 'baseline',
      }}
    >
      {lines.map((line, index) => (
        <Box key={line.label} sx={{ display: 'contents' }}>
          <Box component="dt" sx={{ m: 0 }}>
            <Numeral size={12} color={palette.inkMuted}>
              {line.label}
            </Numeral>
          </Box>
          <Box component="dd" sx={{ m: 0, justifySelf: 'end' }}>
            <Numeral size={12} color={palette.inkFaint}>
              {line.expression}
            </Numeral>
          </Box>
          <Box component="dd" sx={{ m: 0, justifySelf: 'end' }}>
            <Numeral
              size={13}
              weight={index === lines.length - 1 ? 600 : 400}
              color={index === lines.length - 1 ? palette.green : palette.ink}
            >
              {line.value}
            </Numeral>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
