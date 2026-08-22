import { useMemo } from 'react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Screen } from '@/components/ui/Screen';
import { TileGrid } from '@/components/ui/TileGrid';
import { doomsdayTiles } from '@/features/doomsdays/tiles';
import { useAppState } from '@/state/useAppState';

/**
 * One destination for the doomsday itself: the sixteen dates and weekdays it
 * is looked up from, and the count off it to the day actually being asked.
 *
 * Both used to sit under the Weekday screen as rows below the answer pad, and
 * the pad is pinned to the bottom of the viewport on a phone by the layout, so
 * both began exactly at the fold on every visit. Nothing in the date loop ever
 * scrolls — a correct answer advances itself — so neither was ever seen.
 */
export function DoomsdaysScreen() {
  const { monthItems, centuryItems, dayStepTotals } = useAppState();

  // Date.now() rather than a frozen value: the due line has to be right when
  // the user reads it, not when the screen mounted.
  const tiles = useMemo(
    () => doomsdayTiles({ monthItems, centuryItems, dayStepTotals, now: Date.now() }),
    [monthItems, centuryItems, dayStepTotals],
  );

  return (
    <Screen gap={4}>
      <PageTitle subtitle="Every month has one day that falls on the year's doomsday, and every century starts on one weekday. Those are the sixteen. The step is what turns one of them into the day you were actually asked for.">
        Doomsdays
      </PageTitle>
      <TileGrid tiles={tiles} />
    </Screen>
  );
}
