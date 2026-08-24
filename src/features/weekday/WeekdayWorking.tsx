import { centuryLabel, monthName, trueWeekdayName, type WeekdayWorking as Working } from '@/domain/weekday';
import { formatYear } from '@/domain/yearCodes';
import { WorkingLines, type WorkingLine } from './WorkingLines';

interface WeekdayWorkingProps {
  working: Working;
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
  const lines: WorkingLine[] = [
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

  return <WorkingLines lines={lines} />;
}
