import { useState } from 'react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Screen } from '@/components/ui/Screen';
import type { CalendarDate } from '@/domain/types';
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
 *
 * The title and the date control belong to `GuidedWalkView` rather than to this
 * file, because they are only wanted until the walk starts. Once the user is
 * answering, a heading and a paragraph about the screen are two more things
 * competing with the row they are supposed to be reading.
 */
export function ConceptScreen() {
  const { settings } = useAppState();
  const [date, setDate] = useState<CalendarDate>(() => randomConceptDate());

  return (
    <Screen gap={3}>
      <GuidedWalkView
        date={date}
        onDate={setDate}
        convention={settings.indexConvention}
        keyboard={settings.keyboardInput}
        intro={
          <PageTitle subtitle="Pick a date and work out which day of the week it falls on. The app looks everything up; you do the sums.">
            Concept
          </PageTitle>
        }
      />
    </Screen>
  );
}
