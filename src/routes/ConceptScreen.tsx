import { useState } from 'react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Screen } from '@/components/ui/Screen';
import type { CalendarDate } from '@/domain/types';
import { GuidedWalkView } from '@/features/concept/GuidedWalkView';
import { MethodIntro } from '@/features/concept/MethodIntro';
import { randomConceptDate } from '@/features/concept/conceptDate';
import { useAppState } from '@/state/useAppState';

/**
 * The explainer is wider than the rest of the app, and only the explainer.
 *
 * Every other screen is 560, which is the width the seven-button pad and the
 * year prompt were laid out against. This one is prose and two columns of
 * working, and at 560 those columns would come out narrower than the same
 * content is on a phone.
 */
const EXPLAINER_WIDTH = 900;

/**
 * The whole method on one date, start to finish, with the user answering every
 * step.
 *
 * The explainer comes first on every mount rather than being remembered as
 * seen. It is one screen with the way on at the bottom, and a returning user
 * scrolls past it; a flag in storage would buy a second and cost a setting.
 *
 * The walk opens on a random date rather than on today, because today is the
 * one date whose weekday the user already knows. Nothing on this screen is
 * timed and nothing on it is written: it is a demonstration of how the answer
 * is produced, not practice at producing it. Nothing on it needs to be
 * understood first either, since every question is a sum on numbers already
 * printed above it.
 *
 * The walk's title and date control belong to `GuidedWalkView` rather than to
 * this file, because they are only wanted until the walk starts.
 */
export function ConceptScreen() {
  const { settings } = useAppState();
  const [date, setDate] = useState<CalendarDate>(() => randomConceptDate());
  const [explained, setExplained] = useState(false);

  if (!explained) {
    return (
      <Screen gap={4} maxWidth={EXPLAINER_WIDTH}>
        <MethodIntro onStart={() => setExplained(true)} />
      </Screen>
    );
  }

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
