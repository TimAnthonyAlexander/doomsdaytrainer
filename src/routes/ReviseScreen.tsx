import Button from '@mui/material/Button';
import { BookOpen } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { resolveScope, scopeYears } from '@/domain/scope';
import type { DrillMode } from '@/domain/types';
import { DrillRunView } from '@/features/drills/DrillRunView';
import { decadeOptions } from '@/features/drills/drillPlan';
import { ReviewRun } from '@/features/review/ReviewRun';
import { ReviseMenu } from '@/features/revise/ReviseMenu';
import { DEFAULT_MODE, reviseStatuses, type ReviseMode } from '@/features/revise/revisePlan';
import { troubleItems } from '@/features/trouble/troublePool';
import { useAppState } from '@/state/useAppState';

type View =
  | { kind: 'menu' }
  | { kind: 'revise' }
  /** `nonce` restarts the run component, and with it the shuffle and the clock. */
  | { kind: 'drill'; mode: DrillMode; decade: number | null; nonce: number };

/**
 * Everything that asks for a year code you already have: the due queue and the
 * three drills, one list, one Start.
 *
 * They were two destinations named Review and Drills, which is two words for
 * the same act. Merging them costs one tap — the queue used to run the moment
 * the screen mounted — and buys a screen a person can read before committing to
 * sixty seconds of anything.
 */
export function ReviseScreen() {
  const { data, itemList, settings } = useAppState();

  const [view, setView] = useState<View>({ kind: 'menu' });
  const [mode, setMode] = useState<ReviseMode>(DEFAULT_MODE);
  const [decade, setDecade] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Frozen for the life of the screen so the chart's last day cannot move
  // between renders.
  const now = useMemo(() => Date.now(), []);

  const scope = useMemo(() => resolveScope(settings), [settings]);
  // Date.now() rather than the frozen `now`: the due count is the one number
  // here that has to be right when the user reads it, not when they arrived.
  const statuses = useMemo(
    () => reviseStatuses(itemList, scope, Date.now()),
    [itemList, scope],
  );
  const decades = useMemo(() => decadeOptions(scope), [scope]);
  const gauntletTotal = useMemo(() => scopeYears(scope).length, [scope]);
  const anyIntroduced = useMemo(() => itemList.some((item) => item.introduced), [itemList]);
  // The same pool the trouble drill itself queues, so the row cannot promise a
  // drill that opens empty.
  const troubleCount = useMemo(() => troubleItems(itemList, scope).length, [itemList, scope]);

  const start = useCallback(() => {
    setNotice(null);
    if (mode === 'revise') {
      setView({ kind: 'revise' });
      return;
    }
    const which = mode === 'decade' ? decade : null;
    setView((current) => ({
      kind: 'drill',
      mode,
      decade: which,
      nonce: current.kind === 'drill' ? current.nonce + 1 : 1,
    }));
  }, [mode, decade]);

  const discard = useCallback((message: string) => {
    setNotice(message);
    setView({ kind: 'menu' });
  }, []);

  const done = useCallback(() => {
    setNotice(null);
    setView({ kind: 'menu' });
  }, []);

  const again = useCallback(() => {
    setView((current) =>
      current.kind === 'drill' ? { ...current, nonce: current.nonce + 1 } : current,
    );
  }, []);

  if (view.kind === 'revise') {
    return <ReviewRun onDone={done} />;
  }

  if (view.kind === 'drill') {
    return (
      <DrillRunView
        key={view.nonce}
        mode={view.mode}
        decade={view.decade}
        onDiscard={discard}
        onDone={done}
        onAgain={again}
      />
    );
  }

  if (!anyIntroduced) {
    return (
      <Screen>
        <EmptyState
          icon={BookOpen}
          action={
            <Button component={RouterLink} to="/learn" variant="contained">
              Go to Learn
            </Button>
          }
        >
          Nothing to revise yet. Learn a decade block and those ten codes enter the queue.
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen gap={4}>
      <ReviseMenu
        statuses={statuses}
        decades={decades}
        records={data.drills}
        gauntletTotal={gauntletTotal}
        now={now}
        notice={notice}
        troubleCount={troubleCount}
        mode={mode}
        onModeChange={setMode}
        decade={decade}
        onDecadeChange={setDecade}
        onStart={start}
      />
    </Screen>
  );
}
