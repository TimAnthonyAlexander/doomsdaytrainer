import { useState } from 'react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Screen } from '@/components/ui/Screen';
import type { CalendarDate } from '@/domain/types';
import { DatePick } from '@/features/concept/DatePick';
import { GuidedWalkView } from '@/features/concept/GuidedWalkView';
import { randomConceptDate } from '@/features/concept/conceptDate';
import { useAppState } from '@/state/useAppState';

/**
 * The whole method on one date, start to finish, with the user answering every
 * step.
 *
 * It opens on a random date rather than on today, because today is the one date
 * whose weekday the user already knows. Nothing on this screen is timed and
 * nothing on it is written: it is a demonstration of how the answer is
 * produced, not practice at producing it. Nothing on it needs to be understood
 * first either — every question is a sum on numbers already printed above it.
 */
export function ConceptScreen() {
  const { settings } = useAppState();
  const [date, setDate] = useState<CalendarDate>(() => randomConceptDate());

  return (
    <Screen gap={3}>
      <PageTitle subtitle="Pick any date and work out which day of the week it falls on. The app looks everything up. Every question is a sum on numbers already on screen.">
        Concept
      </PageTitle>

      <DatePick date={date} onDate={setDate} />

      <GuidedWalkView
        date={date}
        convention={settings.indexConvention}
        keyboard={settings.keyboardInput}
      />
    </Screen>
  );
}
