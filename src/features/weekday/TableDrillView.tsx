import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { AnswerPad, type AnswerOption } from '@/components/answer/AnswerPad';
import { Numeral } from '@/components/ui/Numeral';
import { NumericValue, NumericText, useNumericSettled } from '@/components/ui/NumericText';
import { formatInterval, formatMs } from '@/domain/time';
import { useAppState } from '@/state/useAppState';
import { nextDueLabel } from '@/features/review/summary';
import { palette } from '@/theme/palette';
import { MonthPad } from './MonthPad';
import {
  allTableEntries,
  entryAlternatesNote,
  entryAnswerNote,
  entryId,
  entryLabel,
} from './tableDrill';
import { useTableSession, type TableSession } from './useTableSession';

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
        Doomsdays
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
 * What is being asked, in words.
 *
 * January and February name the year kind, because for those two the answer
 * depends on it and a question that did not say which would have two right
 * answers and mark one of them wrong. The other ten never mention leap years:
 * their doomsday does not move, so raising the possibility would suggest it
 * might.
 */
function questionFor(session: TableSession): string {
  const prompt = session.prompt;
  if (!prompt) return '';
  if (prompt.kind === 'century') return 'Which code is the anchor?';
  if (session.partCount === 1) return 'Which date is the doomsday?';
  return `Which date is the doomsday in a ${prompt.leapYear ? 'leap' : 'common'} year?`;
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

  // The cells need a bare pixel number to derive an even cell height
  // from (see NumericValue.tsx); the `sx.fontSize` breakpoint object below
  // can't give them one. Resolves to the same two numbers the heading's own
  // `fontSize` already used, so the responsive sizing is unchanged.
  const theme = useTheme();
  const promptSize = useMediaQuery(theme.breakpoints.up('sm')) ? 56 : 44;

  // The pad's latency clock stays at zero until this settles, matching the
  // window the entry above it is mid-transition and not yet readable — see
  // useAnswerTimer.ts. Keyed on the same `promptKey` the pad restarts its
  // clock on, so the two arm and rearm together.
  const settled = useNumericSettled(session.promptKey);

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

  const prompt = session.prompt;
  if (!prompt) return null;

  // A correct answer is a correct answer, whichever of the month's doomsdays it
  // is: green, and gone. Only a wrong one holds. Stopping to say "the 28th is
  // the one to remember" after a right answer is the same claim the twelve-value
  // pad was making — that the method has one real doomsday per month — moved
  // from the pad into the copy. It does not. It has an anchor, and the taught
  // one is the anchor with a mnemonic attached, not the only one that works.
  const held = phase === 'wrong';
  const alternates = held ? entryAlternatesNote(prompt.kind, prompt.key, prompt.leapYear) : null;

  return (
    <>
      <BackRow onBack={onBack} />

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 2 }}>
        <Typography
          component="h1"
          aria-label={entryLabel(entry.kind, entry.key)}
          sx={{ m: 0, fontSize: { xs: 44, sm: 56 }, fontWeight: 600, lineHeight: 1.1, textAlign: 'center' }}
        >
          {entry.kind === 'century' ? (
            // A century as its digits, one cell per character, the same face
            // every numeral in the app uses.
            <NumericText text={entryLabel(entry.kind, entry.key)} size={promptSize} weight={600} mono />
          ) : (
            // A month as one word cell — it is a name, not a number, and
            // moving it letter by letter would animate every letter of
            // "September" for a change that is really one word replacing
            // another.
            <NumericValue value={entryLabel(entry.kind, entry.key)} size={promptSize} weight={600} />
          )}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          {questionFor(session)}
        </Typography>
        {held ? (
          <Typography variant="body2" sx={{ color: palette.brandDeep, textAlign: 'center' }}>
            {entryAnswerNote(prompt.kind, prompt.key, prompt.leapYear)}
            {alternates === null ? '' : ` ${alternates}`}
          </Typography>
        ) : null}
      </Box>

      {held ? (
        <Button fullWidth variant="outlined" color="inherit" autoFocus onClick={advance} sx={{ mb: 1 }}>
          Continue
        </Button>
      ) : null}

      {prompt.kind === 'month' ? (
        <MonthPad
          month={prompt.key}
          leapYear={prompt.leapYear}
          onAnswer={session.answer}
          promptKey={session.promptKey}
          feedback={
            session.chosen === null || session.canonical === null
              ? null
              : {
                  chosen: session.chosen,
                  canonical: session.canonical,
                  accepted: session.accepted,
                  reveal: held,
                }
          }
          disabled={phase !== 'prompt'}
          armed={settled}
        />
      ) : (
        <AnswerPad
          options={CODE_OPTIONS}
          onAnswer={session.answer}
          promptKey={session.promptKey}
          feedback={
            session.chosen === null || session.canonical === null
              ? null
              : { chosen: session.chosen, correct: session.canonical }
          }
          disabled={phase !== 'prompt'}
          keyboard={settings.keyboardInput}
          armed={settled}
        />
      )}

      <Numeral size={12} color={palette.inkMuted}>
        {`${session.summary.total} answered, ${session.remaining} left`}
      </Numeral>
    </>
  );
}
