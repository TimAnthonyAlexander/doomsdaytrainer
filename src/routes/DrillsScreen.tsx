import Button from '@mui/material/Button';
import { BookOpen } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { resolveScope, scopeYears } from '@/domain/scope';
import type { DrillMode } from '@/domain/types';
import { DrillMenu } from '@/features/drills/DrillMenu';
import { DrillRunView } from '@/features/drills/DrillRunView';
import { decadeOptions, modeStatuses } from '@/features/drills/drillPlan';
import { troubleItems } from '@/features/trouble/troublePool';
import { useAppState } from '@/state/useAppState';

type View =
  | { kind: 'menu' }
  /** `nonce` restarts the run component, and with it the shuffle and the clock. */
  | { kind: 'run'; mode: DrillMode; decade: number | null; nonce: number };

export function DrillsScreen() {
  const { data, itemList, settings } = useAppState();

  const [view, setView] = useState<View>({ kind: 'menu' });
  const [notice, setNotice] = useState<string | null>(null);

  // Frozen for the life of the screen so the chart's last day cannot move
  // between renders.
  const now = useMemo(() => Date.now(), []);

  const scope = useMemo(() => resolveScope(settings), [settings]);
  const statuses = useMemo(() => modeStatuses(itemList, scope), [itemList, scope]);
  const decades = useMemo(() => decadeOptions(scope), [scope]);
  const gauntletTotal = useMemo(() => scopeYears(scope).length, [scope]);
  const anyIntroduced = useMemo(() => itemList.some((item) => item.introduced), [itemList]);
  // The same pool the trouble drill itself queues, so the row cannot promise a
  // drill that opens empty.
  const troubleCount = useMemo(() => troubleItems(itemList, scope).length, [itemList, scope]);

  const start = useCallback((mode: DrillMode, decade: number | null) => {
    setNotice(null);
    setView((current) => ({
      kind: 'run',
      mode,
      decade,
      nonce: current.kind === 'run' ? current.nonce + 1 : 1,
    }));
  }, []);

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
      current.kind === 'run' ? { ...current, nonce: current.nonce + 1 } : current,
    );
  }, []);

  if (view.kind === 'run') {
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
          Drills ask codes you have already met. Learn a decade block first, then come back.
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen gap={4}>
      <DrillMenu
        statuses={statuses}
        decades={decades}
        records={data.drills}
        gauntletTotal={gauntletTotal}
        now={now}
        notice={notice}
        troubleCount={troubleCount}
        onStart={start}
      />
    </Screen>
  );
}
