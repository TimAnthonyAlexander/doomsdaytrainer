import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { AnswerPad, type AnswerOption } from '@/components/answer/AnswerPad';
import { Numeral } from '@/components/ui/Numeral';
import { formatInterval, formatMs } from '@/domain/time';
import { useAppState } from '@/state/useAppState';
import { nextDueLabel } from '@/features/review/summary';
import { palette } from '@/theme/palette';
import { MonthPad } from './MonthPad';
import { allTableEntries, entryAnswerNote, entryId, entryLabel } from './tableDrill';
import { useTableSession } from './useTableSession';

const CODE_OPTIONS: AnswerOption[] = Array.from({ length: 7 }, (_unused, value) => ({
  value,
  label: String(value),
}));

interface TableDrillProps {
  onBack: () => void;
}

function BackRow({ onBack }: TableDrillProps) {
  return (
    <ButtonBase
      onClick={onBack}
      sx={{
        alignSelf: 'flex-start',
        minHeight: 48,
        pr: 1.25,
        gap: 0.5,
        borderRadius: 1,
        color: 'text.secondary',
        '&:hover': { color: 'primary.main' },
      }}
    >
      <ChevronLeft size={18} strokeWidth={1.75} aria-hidden />
      <Typography component="span" variant="body2">
        Dates
      </Typography>
    </ButtonBase>
  );
}

/** The sixteen items and where each one stands. Shown when nothing is due. */
function TableList() {
  const { monthItems, centuryItems } = useAppState();
  const entries = useMemo(
    () => allTableEntries(monthItems, centuryItems),
    [monthItems, centuryItems],
  );

  return (
    <Box
      component="ul"
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' },
        columnGap: 3,
      }}
    >
      {entries.map((entry) => (
        <Box
          component="li"
          key={entryId(entry.kind, entry.key)}
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 1,
            py: 0.75,
            borderBottom: `1px solid ${palette.rule}`,
          }}
        >
          <Typography component="span" variant="body2">
            {entryLabel(entry.kind, entry.key)}
          </Typography>
          <Numeral size={12} color={palette.inkMuted}>
            {entry.item.introduced ? formatInterval(entry.item.interval) : 'new'}
          </Numeral>
        </Box>
      ))}
    </Box>
  );
}

/**
 * Sixteen fixed items on their own small surface. Same machinery as the year
 * codes — tap is the grade, latency decides it, SM-2 schedules it — and the
 * only place either table gets scheduled at all.
 */
export function TableDrillView({ onBack }: TableDrillProps) {
  const { settings } = useAppState();
  const session = useTableSession();
  const { phase, advance, entry } = session;

  useEffect(() => {
    if (phase !== 'correct') return;
    const id = setTimeout(advance, Math.max(0, settings.autoAdvanceMs));
    return () => clearTimeout(id);
  }, [phase, advance, settings.autoAdvanceMs]);

  if (!entry) {
    const next = nextDueLabel(session.nextDueAt, Date.now());
    return (
      <>
        <BackRow onBack={onBack} />
        <Box>
          <Typography variant="h1" component="h1">
            {session.summary.total > 0
              ? `${session.summary.total} answered, ${session.summary.wrong} wrong`
              : 'Nothing due'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            {session.summary.total > 0
              ? `Median ${formatMs(session.summary.medianLatencyMs)}.${next === null ? '' : ` Next one due ${next}.`}`
              : next === null
                ? 'The twelve month doomsdays and four century anchors.'
                : `Next one due ${next}.`}
          </Typography>
        </Box>
        <Button variant="outlined" color="inherit" onClick={session.practiseAll} sx={{ alignSelf: 'flex-start' }}>
          Practise all sixteen
        </Button>
        <TableList />
      </>
    );
  }

  const feedback =
    session.chosen === null || session.correctAnswer === null
      ? null
      : { chosen: session.chosen, correct: session.correctAnswer };

  return (
    <>
      <BackRow onBack={onBack} />

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 2 }}>
        <Typography
          component="h1"
          sx={{ m: 0, fontSize: { xs: 44, sm: 56 }, fontWeight: 600, lineHeight: 1.1, textAlign: 'center' }}
        >
          {entry.kind === 'century' ? (
            <Numeral size="inherit" weight={600} lineHeight={1.1}>
              {entryLabel(entry.kind, entry.key)}
            </Numeral>
          ) : (
            entryLabel(entry.kind, entry.key)
          )}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {entry.kind === 'month' ? 'Which date is the doomsday?' : 'Which code is the anchor?'}
        </Typography>
        {phase === 'wrong' ? (
          <Typography variant="body2" sx={{ color: palette.green, textAlign: 'center' }}>
            {entryAnswerNote(entry.kind, entry.key)}
          </Typography>
        ) : null}
      </Box>

      {phase === 'wrong' ? (
        <Button fullWidth variant="outlined" color="inherit" autoFocus onClick={advance} sx={{ mb: 1 }}>
          Continue
        </Button>
      ) : null}

      {entry.kind === 'month' ? (
        <MonthPad
          onAnswer={session.answer}
          promptKey={session.promptKey}
          feedback={feedback}
          disabled={phase !== 'prompt'}
        />
      ) : (
        <AnswerPad
          options={CODE_OPTIONS}
          onAnswer={session.answer}
          promptKey={session.promptKey}
          feedback={feedback}
          disabled={phase !== 'prompt'}
          keyboard={settings.keyboardInput}
        />
      )}

      <Numeral size={12} color={palette.inkMuted}>
        {`${session.summary.total} answered, ${session.remaining} left`}
      </Numeral>
    </>
  );
}
