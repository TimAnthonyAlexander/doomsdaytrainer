import { useMemo, useState } from 'react';
import { Screen } from '@/components/ui/Screen';
import { resolveScope } from '@/domain/scope';
import { BlockPicker } from '@/features/learn/BlockPicker';
import { LearnSession } from '@/features/learn/LearnSession';
import { dailyAllowance, decadeBlocks, newItemsIntroducedToday } from '@/features/learn/blocks';
import { useAppState } from '@/state/useAppState';

/**
 * Learn is either the block picker or one block in progress. Which block is
 * open is view state: nothing about a part-finished block is worth storing.
 */
export function LearnScreen() {
  const { data, settings, items } = useAppState();
  const [active, setActive] = useState<number | null>(null);

  const blocks = useMemo(() => decadeBlocks(items, resolveScope(settings)), [items, settings]);
  const allowance = useMemo(
    () => dailyAllowance(settings.newItemsPerDay, newItemsIntroducedToday(data.days, Date.now())),
    [settings.newItemsPerDay, data.days],
  );

  return (
    <Screen sx={{ flex: 1 }}>
      {active === null ? (
        <BlockPicker blocks={blocks} allowance={allowance} onStart={setActive} />
      ) : (
        <LearnSession
          key={active}
          decade={active}
          blocks={blocks}
          allowance={allowance}
          onStart={setActive}
          onExit={() => setActive(null)}
        />
      )}
    </Screen>
  );
}
