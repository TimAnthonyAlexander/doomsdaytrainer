import { useMemo } from 'react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Screen } from '@/components/ui/Screen';
import { TileGrid } from '@/components/ui/TileGrid';
import { resolveScope } from '@/domain/scope';
import { dailyAllowance, newItemsIntroducedToday } from '@/features/learn/blocks';
import { yearCodeTiles } from '@/features/yearCodes/tiles';
import { useAppState } from '@/state/useAppState';

/**
 * One destination for everything about the 100 codes, and a grid of the ways
 * in. Weekday is the app, and the codes are one step of it; keeping Learn,
 * Revise and Calc at the top level put three names for the same subject next to
 * the thing the subject is for.
 */
export function YearCodesScreen() {
  const { data, items, itemList, settings } = useAppState();

  const scope = useMemo(() => resolveScope(settings), [settings]);
  const allowance = useMemo(
    () => dailyAllowance(settings.newItemsPerDay, newItemsIntroducedToday(data.days, Date.now())),
    [settings.newItemsPerDay, data.days],
  );
  // Date.now() rather than a frozen value: the due line has to be right when
  // the user reads it, not when the screen mounted.
  const tiles = useMemo(
    () => yearCodeTiles({ items, itemList, scope, allowance, now: Date.now() }),
    [items, itemList, scope, allowance],
  );

  return (
    <Screen gap={4}>
      <PageTitle subtitle="A year code is the number from 0 to 6 that turns a century anchor into that year's doomsday, and every weekday answer starts there. These are the ways to get the hundred of them and keep them.">
        Year codes
      </PageTitle>
      <TileGrid tiles={tiles} />
    </Screen>
  );
}
