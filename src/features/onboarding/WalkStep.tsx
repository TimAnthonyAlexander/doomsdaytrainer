import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { PageTitle } from '@/components/ui/PageTitle';
import type { CalendarDate, IndexConvention } from '@/domain/types';
import { DatePick } from '@/features/concept/DatePick';
import { GuidedWalkView } from '@/features/concept/GuidedWalkView';

interface WalkStepProps {
  date: CalendarDate;
  onDate: (date: CalendarDate) => void;
  /**
   * The convention the user picked two steps ago, straight off the draft. The
   * choice has not been written to `AppData` yet, so a read of committed
   * settings here would order the last pad by the old value and contradict what
   * the user just chose.
   */
  convention: IndexConvention;
  keyboard: boolean;
  /** The button that commits the draft, drawn once the walk is finished. */
  footer: ReactNode;
}

/**
 * The last step: one date taken to its weekday, every step answered.
 *
 * It is the only step with no way past it, which is the point. The four before
 * it are read; this one is done, and the app opens on the other side of a
 * weekday the user produced themselves. It is safe to make it compulsory
 * because nothing on it requires having understood anything: every question is
 * a sum on numbers already on screen, and a wrong answer prints the working
 * rather than moving on, so somebody who knows nothing can still finish.
 *
 * Nothing here is timed and nothing here is written.
 */
export function WalkStep({ date, onDate, convention, keyboard, footer }: WalkStepProps) {
  return (
    <>
      <PageTitle>One whole date</PageTitle>
      <Typography variant="body1" color="text.secondary">
        Pick a date and work out which day of the week it falls on. The app looks everything up.
        Every question is a sum on numbers already on screen, and a wrong answer shows the working
        rather than moving on.
      </Typography>

      <DatePick date={date} onDate={onDate} />

      <GuidedWalkView date={date} convention={convention} keyboard={keyboard} footer={footer} />
    </>
  );
}
