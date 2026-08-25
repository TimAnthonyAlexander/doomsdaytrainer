import Button from '@mui/material/Button';
import { BookOpen } from 'lucide-react';
import { useMemo } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { resolveScope } from '@/domain/scope';
import { EndlessView } from '@/features/endless/EndlessView';
import { endlessPool } from '@/features/endless/endlessPlan';
import { useAppState } from '@/state/useAppState';

/**
 * Year codes, one after another, until the user leaves.
 *
 * A route rather than a fifth mode on Revise: Revise picks a mode and presses
 * Start, and everything behind that button is a run with an end — a queue to
 * empty, a minute to fill, a decade to get through. This has no end to choose
 * the length of, so the row it would occupy there would be a row with nothing
 * to configure and a Start button in front of it for no reason.
 */
export function EndlessScreen() {
  const { itemList, settings } = useAppState();
  const navigate = useNavigate();

  const scope = useMemo(() => resolveScope(settings), [settings]);
  const pool = useMemo(() => endlessPool(itemList, scope), [itemList, scope]);

  if (pool.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon={BookOpen}
          action={
            <Button component={RouterLink} to="/year-codes/learn" variant="contained">
              Go to Learn
            </Button>
          }
        >
          Nothing to ask yet. Learn a decade block and those ten codes join the pass.
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen gap={2} sx={{ flex: 1 }}>
      <EndlessView pool={pool} onBack={() => navigate('/year-codes')} />
    </Screen>
  );
}
