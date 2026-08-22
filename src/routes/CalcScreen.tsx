import { useState } from 'react';
import { Screen } from '@/components/ui/Screen';
import { CalcLanding, type CalcView } from '@/features/calc/CalcLanding';
import { MethodPath } from '@/features/calc/MethodPath';
import { PracticePath } from '@/features/calc/PracticePath';
import { ShortcutPath } from '@/features/calc/ShortcutPath';
import { VerifyPath } from '@/features/calc/VerifyPath';
import { useAppState } from '@/state/useAppState';

/**
 * The calculation trainer: the other way to a year code, when the table has
 * gone. Which path is open is view state — a half-read lesson is not worth
 * storing, and nothing here schedules anything.
 */
export function CalcScreen() {
  const { settings, calcTotals, verifyTotals } = useAppState();
  const [view, setView] = useState<CalcView>('landing');
  const back = () => setView('landing');
  const keyboard = settings.keyboardInput;

  if (view === 'method') {
    return (
      <Screen sx={{ flex: 1 }}>
        <MethodPath keyboard={keyboard} onBack={back} />
      </Screen>
    );
  }

  if (view === 'shortcut') {
    return (
      <Screen sx={{ flex: 1 }}>
        <ShortcutPath keyboard={keyboard} onBack={back} />
      </Screen>
    );
  }

  if (view === 'practice') {
    return (
      <Screen sx={{ flex: 1 }}>
        <PracticePath keyboard={keyboard} onBack={back} />
      </Screen>
    );
  }

  if (view === 'verify') {
    return (
      <Screen sx={{ flex: 1 }}>
        <VerifyPath keyboard={keyboard} onBack={back} />
      </Screen>
    );
  }

  return (
    <Screen sx={{ flex: 1 }}>
      <CalcLanding totals={calcTotals} verify={verifyTotals} onOpen={setView} />
    </Screen>
  );
}
