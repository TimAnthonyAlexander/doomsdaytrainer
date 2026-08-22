import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import { Activity } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnswerPad, type AnswerOption } from '@/components/answer/AnswerPad';
import { Screen } from '@/components/ui/Screen';
import type { WeekdayMode, WeekdayRangeId } from '@/domain/types';
import { weekdayRanges } from '@/features/weekday/datePool';
import { PlainToggle, type ToggleChoice } from '@/features/weekday/PlainToggle';
import { WeekdayPrompt } from '@/features/weekday/WeekdayPrompt';
import { WeekdayStatsView } from '@/features/weekday/WeekdayStatsView';
import { WeekdayTotalsView } from '@/features/weekday/WeekdayTotalsView';
import { WeekdayWorking } from '@/features/weekday/WeekdayWorking';
import { useWeekdaySession } from '@/features/weekday/useWeekdaySession';
import { weekdayOptions } from '@/features/weekday/weekdayPad';
import {
  readWeekdayMode,
  readWeekdayRange,
  writeWeekdayMode,
  writeWeekdayRange,
} from '@/features/weekday/weekdayPrefs';
import { useAppState } from '@/state/useAppState';

/**
 * Two views, and only because the numbers belong to this screen alone.
 *
 * The day step and the tables used to be here too, as rows under the answer
 * pad. On a phone the pad is pinned to the bottom of the viewport by the
 * layout, so those rows began exactly at the fold on every visit, and nothing
 * in the date loop ever scrolls — a correct answer advances itself. They were
 * not hard to find, they were unreachable without going looking. Both are now
 * their own destination under `/doomsdays`.
 *
 * Stats stayed, because it reports on the dates answered here and nowhere
 * else, and moved above the prompt for the same reason the other two left.
 */
type View = 'dates' | 'stats';

const MODE_CHOICES: readonly ToggleChoice<WeekdayMode>[] = [
  { value: 'assisted', label: 'Assisted' },
  { value: 'unassisted', label: 'Unassisted' },
];

/**
 * The one control on this screen that is not a word.
 *
 * Everything else in the header row is a `PlainToggle`, which is a setting;
 * this goes somewhere, and drawing it as a fourth and fifth word would make it
 * read as a third thing to switch. It carries its name for screen readers and
 * on hover, and the position is what makes it findable — an icon below the
 * fold would be the bug this screen just had.
 */
function StatsButton({ onOpen }: { onOpen: () => void }) {
  return (
    <ButtonBase
      onClick={onOpen}
      aria-label="Stats"
      title="Stats"
      sx={{
        minWidth: 48,
        minHeight: 48,
        borderRadius: 1,
        color: 'text.secondary',
        '@media (hover: hover)': {
          '&:hover': { color: 'var(--brand-deep)' },
        },
        '&:focus-visible': { outline: '2px solid var(--brand)', outlineOffset: 2 },
      }}
    >
      <Activity size={20} strokeWidth={1.75} aria-hidden />
    </ButtonBase>
  );
}

interface TrainerProps {
  mode: WeekdayMode;
  rangeId: WeekdayRangeId;
  onMode: (mode: WeekdayMode) => void;
  onRange: (rangeId: WeekdayRangeId) => void;
  onView: (view: View) => void;
}

/**
 * The date loop.
 *
 * Split out from the screen so the session hook only lives while the trainer
 * is actually on screen: leaving it closes the open run, and that has to
 * happen when the user opens the stats, not only when they leave the route.
 */
function Trainer({ mode, rangeId, onMode, onRange, onView }: TrainerProps) {
  const { settings, weekdayTotals } = useAppState();
  const session = useWeekdaySession(mode, rangeId);
  const { phase, advance } = session;

  // Correct answers advance themselves. Errors never do: the working has to be
  // read, and reading it takes as long as it takes.
  useEffect(() => {
    if (phase !== 'correct') return;
    const id = setTimeout(advance, Math.max(0, settings.autoAdvanceMs));
    return () => clearTimeout(id);
  }, [phase, advance, settings.autoAdvanceMs]);

  const rangeChoices = useMemo<ToggleChoice<WeekdayRangeId>[]>(
    () => weekdayRanges(Date.now()).map((range) => ({ value: range.id, label: range.label })),
    [],
  );

  const options = useMemo<AnswerOption[]>(
    () =>
      weekdayOptions(settings.indexConvention).map((option) => ({
        // Three letters, not "Wednesday": the pad's figures are wide, and a pad
        // whose buttons change width between prompts is a pad that moves under
        // the thumb.
        value: option.value,
        label: option.short,
      })),
    [settings.indexConvention],
  );

  return (
    <Screen gap={2} sx={{ flex: 1 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <PlainToggle label="Help" choices={MODE_CHOICES} value={mode} onChange={onMode} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PlainToggle label="Date range" choices={rangeChoices} value={rangeId} onChange={onRange} />
          <StatsButton onOpen={() => onView('stats')} />
        </Box>
      </Box>

      <Box
        sx={{
          // On a phone the pad belongs in the thumb zone, so the date takes the
          // space above it. On a desktop the two read better centred together.
          flex: { xs: 1, md: '0 0 auto' },
          minHeight: { xs: 0, md: 200 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <WeekdayPrompt
          fullYear={session.date.fullYear}
          month={session.date.month}
          day={session.date.day}
          yearCode={session.working.yearCode}
          mode={mode}
          phase={phase}
          correctCode={session.correctCode}
        />
        {phase === 'wrong' ? (
          <Box sx={{ width: '100%', maxWidth: 360 }}>
            <WeekdayWorking working={session.working} />
          </Box>
        ) : null}
      </Box>

      {phase === 'wrong' ? (
        // Above the pad, so a fast second tap in the thumb zone lands on a dead
        // button rather than on "continue".
        <Button fullWidth variant="outlined" color="inherit" autoFocus onClick={advance} sx={{ mb: 1 }}>
          Continue
        </Button>
      ) : null}

      <AnswerPad
        options={options}
        onAnswer={session.answer}
        promptKey={session.promptKey}
        feedback={session.chosen === null ? null : { chosen: session.chosen, correct: session.correctCode }}
        disabled={phase !== 'prompt'}
        keyboard={settings.keyboardInput}
      />

      <WeekdayTotalsView session={session.results} lifetime={weekdayTotals} />
    </Screen>
  );
}

/**
 * Give the user a full date, they pick the weekday. Assisted mode hands over
 * the year code and nothing else; unassisted hands over nothing.
 *
 * Mode and range are remembered per device, so the screen comes back on
 * whatever the user last chose. The view is not: the screen exists to ask for
 * weekdays, so it opens on the dates whatever was last read.
 */
export function WeekdayScreen() {
  const [view, setView] = useState<View>('dates');
  const [mode, setMode] = useState<WeekdayMode>(readWeekdayMode);
  const [rangeId, setRangeId] = useState<WeekdayRangeId>(readWeekdayRange);

  // Written on the change, not on every render: a preference is only touched
  // when the user touches it.
  const chooseMode = useCallback((next: WeekdayMode) => {
    setMode(next);
    writeWeekdayMode(next);
  }, []);

  const chooseRange = useCallback((next: WeekdayRangeId) => {
    setRangeId(next);
    writeWeekdayRange(next);
  }, []);

  if (view === 'stats') {
    return (
      <Screen gap={3}>
        <WeekdayStatsView onBack={() => setView('dates')} />
      </Screen>
    );
  }

  return <Trainer mode={mode} rangeId={rangeId} onMode={chooseMode} onRange={chooseRange} onView={setView} />;
}
