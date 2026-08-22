import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnswerPad, type AnswerOption } from '@/components/answer/AnswerPad';
import { Screen } from '@/components/ui/Screen';
import type { WeekdayMode, WeekdayRangeId } from '@/domain/types';
import { weekdayRanges } from '@/features/weekday/datePool';
import { DayStepView } from '@/features/weekday/DayStepView';
import { PlainToggle, type ToggleChoice } from '@/features/weekday/PlainToggle';
import { TableDrillView } from '@/features/weekday/TableDrillView';
import { WeekdayPrompt } from '@/features/weekday/WeekdayPrompt';
import { WeekdayStatsView } from '@/features/weekday/WeekdayStatsView';
import { WeekdayTotalsView } from '@/features/weekday/WeekdayTotalsView';
import { WeekdayWorking } from '@/features/weekday/WeekdayWorking';
import { tableQueue } from '@/features/weekday/tableDrill';
import { useWeekdaySession } from '@/features/weekday/useWeekdaySession';
import { weekdayOptions } from '@/features/weekday/weekdayPad';
import {
  readWeekdayMode,
  readWeekdayRange,
  writeWeekdayMode,
  writeWeekdayRange,
} from '@/features/weekday/weekdayPrefs';
import { useAppState } from '@/state/useAppState';
import { palette } from '@/theme/palette';

/**
 * The day step sits here rather than on a route of its own.
 *
 * It is the last step of the same method, it answers on the same seven weekday
 * buttons, and it follows the same rule as the dates above it: nothing on
 * either surface is a fixed item set, so nothing on either is scheduled.
 * Splitting it out would put two halves of one calculation behind two different
 * tabs. The bottom nav is also already seven entries wide, which at 375px is
 * 45.6px a column, so an eighth would cost the labels rather than earn a place.
 */
type View = 'dates' | 'daystep' | 'tables' | 'stats';

const MODE_CHOICES: readonly ToggleChoice<WeekdayMode>[] = [
  { value: 'assisted', label: 'Assisted' },
  { value: 'unassisted', label: 'Unassisted' },
];

/** One row of plain text, the way the drills menu lists a mode. */
function SectionRow({ title, detail, onOpen }: { title: string; detail: string; onOpen: () => void }) {
  return (
    <ButtonBase
      onClick={onOpen}
      sx={{
        width: '100%',
        minHeight: 56,
        px: 1,
        py: 1.25,
        gap: 2,
        borderRadius: 1,
        borderTop: `1px solid ${palette.rule}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        textAlign: 'left',
      }}
    >
      <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography component="span" variant="caption" color="text.secondary">
          {detail}
        </Typography>
        <ChevronRight size={18} strokeWidth={1.75} color={palette.inkFaint} aria-hidden />
      </Box>
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
 * happen when the user opens the tables, not only when they leave the route.
 */
function Trainer({ mode, rangeId, onMode, onRange, onView }: TrainerProps) {
  const { settings, data, monthItems, centuryItems, weekdayTotals } = useAppState();
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

  const tablesDue = tableQueue(monthItems, centuryItems, Date.now()).length;

  return (
    <Screen gap={2} sx={{ flex: 1 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 1 }}>
        <PlainToggle label="Help" choices={MODE_CHOICES} value={mode} onChange={onMode} />
        <PlainToggle label="Date range" choices={rangeChoices} value={rangeId} onChange={onRange} />
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

      <Box>
        <SectionRow
          title="Day step"
          detail={
            data.dayStepAttempts.length === 0
              ? 'Nothing yet'
              : data.dayStepAttempts.length === 1
                ? '1 step'
                : `${data.dayStepAttempts.length} steps`
          }
          onOpen={() => onView('daystep')}
        />
        <SectionRow
          title="Tables"
          detail={tablesDue === 0 ? 'Nothing due' : `${tablesDue} due`}
          onOpen={() => onView('tables')}
        />
        <SectionRow
          title="Stats"
          detail={data.weekdayAttempts.length === 0 ? 'Nothing yet' : `${data.weekdayAttempts.length} dates`}
          onOpen={() => onView('stats')}
        />
      </Box>
    </Screen>
  );
}

/**
 * Give the user a full date, they pick the weekday. Assisted mode hands over
 * the year code and nothing else; unassisted hands over nothing.
 *
 * Mode and range are remembered per device, so the screen comes back on
 * whatever the user last chose. The view is not: it is where they were standing
 * rather than what they picked, and a half-finished table drill is not a
 * preference worth restoring.
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

  if (view === 'daystep') {
    return (
      <Screen gap={2} sx={{ flex: 1 }}>
        <DayStepView onBack={() => setView('dates')} />
      </Screen>
    );
  }

  if (view === 'tables') {
    return (
      <Screen gap={2}>
        <TableDrillView onBack={() => setView('dates')} />
      </Screen>
    );
  }

  if (view === 'stats') {
    return (
      <Screen gap={3}>
        <WeekdayStatsView onBack={() => setView('dates')} />
      </Screen>
    );
  }

  return <Trainer mode={mode} rangeId={rangeId} onMode={chooseMode} onRange={chooseRange} onView={setView} />;
}
