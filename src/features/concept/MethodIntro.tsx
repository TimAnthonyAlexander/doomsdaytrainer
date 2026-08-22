import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useMemo, type ReactNode } from 'react';
import { Numeral } from '@/components/ui/Numeral';
import { PageTitle } from '@/components/ui/PageTitle';
import { radius, space, stroke } from '@/theme/tokens';
import { introExample, introGroups, type IntroMonth } from './introContent';

/** A section of the explainer: a quiet heading, then one idea under it. */
function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box component="section" sx={{ pt: `${space[4]}px`, borderTop: stroke.hairline }}>
      <Typography
        variant="caption"
        component="h2"
        sx={{ color: 'var(--text-secondary)', fontWeight: 500 }}
      >
        {title}
      </Typography>
      <Box sx={{ mt: `${space[3]}px` }}>{children}</Box>
    </Box>
  );
}

/**
 * One line of working: what is being done on the left, what it comes out at on
 * the right. Mono and tabular on both sides, so the results line up down the
 * column and the eye can read the answers without reading the sums.
 */
function Working({ sum, result, lead }: { sum: string; result: string; lead?: boolean }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: `${space[3]}px`,
        minHeight: 32,
      }}
    >
      <Numeral size={17} color={lead ? 'var(--text-primary)' : 'var(--text-secondary)'}>
        {sum}
      </Numeral>
      <Numeral size={lead ? 22 : 17} weight={500} color="var(--text-primary)">
        {result}
      </Numeral>
    </Box>
  );
}

/** The answer of a section, in the face a word deserves rather than a numeral. */
function Verdict({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        mt: `${space[3]}px`,
        px: `${space[3]}px`,
        py: `${space[2]}px`,
        bgcolor: 'var(--brand-tint)',
        borderRadius: `${radius.md}px`,
      }}
    >
      <Typography variant="body1" sx={{ color: 'var(--brand-on-tint)', fontWeight: 500 }}>
        {children}
      </Typography>
    </Box>
  );
}

/** One month of the doomsday table: the month, and the date it lands on. */
function MonthChip({ entry }: { entry: IntroMonth }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        gap: `${space[2]}px`,
        px: `${space[2]}px`,
        py: '6px',
        borderRadius: `${radius.sm}px`,
        border: stroke.hairline,
      }}
    >
      <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
        {entry.short}
      </Typography>
      <Numeral size={17} weight={500}>
        {entry.leapDay === null ? String(entry.day) : `${entry.day}/${entry.leapDay}`}
      </Numeral>
    </Box>
  );
}

export interface MethodIntroProps {
  /** Starts the walkthrough proper. */
  onStart: () => void;
}

/**
 * The whole method on one screen, worked on one fixed date, before the user is
 * asked to do anything.
 *
 * It sits in front of the walkthrough rather than replacing any part of it. The
 * walk proves the method by making somebody produce a weekday; this says what
 * they are about to produce and why it takes so few steps. It is one screen
 * with the way on at the bottom, so a reader who already knows this scrolls
 * past it in a second.
 *
 * The date is fixed at 20 March 2026 and every number on the screen is derived
 * rather than written into the copy. See `introContent.ts`.
 */
export function MethodIntro({ onStart }: MethodIntroProps) {
  const example = useMemo(introExample, []);
  const groups = useMemo(introGroups, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${space[5]}px` }}>
      <PageTitle subtitle="A dozen easy dates all fall on the same weekday every year. Which weekday it is changes from year to year. Find that weekday, hop to the date you want, and you are done. Here is the whole thing on one date.">
        How it works
      </PageTitle>

      <Part title="The year's doomsday">
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: `${space[3]}px` }}>
          Two numbers, added and then reduced. The first comes from the year on its own: take the
          last two digits, add a quarter of them with the remainder dropped, and take the sevens
          off. That is the year code.
        </Typography>
        <Working sum={`${example.yy} + ${example.quarters}`} result={String(example.rawSum)} />
        <Working
          sum={`${example.rawSum} − ${example.sevensOff}`}
          result={String(example.yearCode)}
          lead
        />
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mt: `${space[3]}px` }}>
          Then add what the century starts from. The {example.century} start from {example.anchor}.
        </Typography>
        {/* The intro date is chosen so this sum stays under seven and there is
            no third line to print here. `introContent.test.ts` pins that, so
            moving the date fails loudly rather than printing a wrong step. */}
        <Working
          sum={`${example.anchor} + ${example.yearCode}`}
          result={String(example.doomsdaySum)}
          lead
        />
        <Verdict>
          Every doomsday in {example.fullYear} is a {example.doomsdayName}.
        </Verdict>
      </Part>

      <Part title="Which dates are doomsdays">
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: `${space[3]}px` }}>
          The same dates every year, and almost all of them are one of three tricks.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${space[4]}px` }}>
          {groups.map((group) => (
            <Box key={group.id}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {group.title}
              </Typography>
              <Typography variant="caption" component="p" sx={{ color: 'var(--text-secondary)' }}>
                {group.hint}
              </Typography>
              <Box
                sx={{
                  mt: `${space[2]}px`,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: `${space[2]}px`,
                }}
              >
                {group.months.map((entry) => (
                  <MonthChip key={entry.month} entry={entry} />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      </Part>

      <Part title={example.dateLabel}>
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: `${space[3]}px` }}>
          {example.month}&apos;s doomsday is the {example.monthDoomsdayOrdinal}. So in{' '}
          {example.fullYear} that date is a {example.doomsdayName}. Count on from it to the{' '}
          {example.dayOrdinal} and take the sevens off.
        </Typography>
        <Working
          sum={`${example.day} − ${example.monthDoomsday}`}
          result={String(example.daysOn)}
        />
        <Working
          sum={`${example.doomsday} + ${example.daysOn}`}
          result={String(example.finalSum)}
        />
        <Working
          sum={`${example.finalSum} − ${example.finalSevensOff}`}
          result={String(example.weekday)}
          lead
        />
        <Verdict>
          {example.dateLabel} is a {example.weekdayName}.
        </Verdict>
      </Part>

      <Button
        variant="contained"
        onClick={onStart}
        sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' }, minHeight: 48, minWidth: 200 }}
      >
        Try one yourself
      </Button>
    </Box>
  );
}
