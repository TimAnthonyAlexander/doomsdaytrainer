import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Screen } from '@/components/ui/Screen';
import type { CalendarDate } from '@/domain/types';
import { GuidedWalkView } from '@/features/concept/GuidedWalkView';
import {
  CONCEPT_MAX_INPUT,
  CONCEPT_MIN_INPUT,
  randomConceptDate,
  readDateInput,
  toDateInput,
} from '@/features/concept/conceptDate';
import { useAppState } from '@/state/useAppState';
import { fontFamily, radius, space } from '@/theme/tokens';

interface DatePickProps {
  date: CalendarDate;
  onDate: (date: CalendarDate) => void;
}

/**
 * The date the walk is standing on.
 *
 * A native `<input type="date">`, which gets the platform picker on a phone and
 * costs nothing. It is not an answer field, so the seven-button rule does not
 * reach it. What it hands back is checked before it goes anywhere near the
 * maths: see `readDateInput`.
 */
function DatePick({ date, onDate }: DatePickProps) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: `${space[3]}px` }}>
      <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
        <Typography
          component="label"
          htmlFor="concept-date"
          variant="body2"
          sx={{ display: 'block', color: 'var(--text-secondary)', mb: `${space[1]}px` }}
        >
          Date
        </Typography>
        <Box
          component="input"
          id="concept-date"
          type="date"
          min={CONCEPT_MIN_INPUT}
          max={CONCEPT_MAX_INPUT}
          value={toDateInput(date)}
          onChange={(event: { target: { value: string } }) =>
            onDate(readDateInput(event.target.value, date))
          }
          sx={{
            width: '100%',
            minHeight: 48,
            px: `${space[3]}px`,
            bgcolor: 'var(--surface-2)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-strong)',
            borderRadius: `${radius.md}px`,
            fontFamily: fontFamily.mono,
            fontVariantNumeric: 'tabular-nums',
            fontSize: 17,
            outline: 'none',
            '&:focus-visible': { outline: '2px solid var(--brand)', outlineOffset: 2 },
          }}
        />
      </Box>
      <Button
        variant="outlined"
        color="inherit"
        onClick={() => onDate(randomConceptDate())}
        sx={{ minHeight: 48 }}
      >
        Another date
      </Button>
    </Box>
  );
}

/**
 * The whole method on one date, start to finish, with the user answering every
 * step.
 *
 * It opens on a random date rather than on today, because today is the one date
 * whose weekday the user already knows. Nothing on this screen is timed and
 * nothing on it is written: it is a demonstration of how the answer is
 * produced, not practice at producing it.
 */
export function ConceptScreen() {
  const { settings } = useAppState();
  const [date, setDate] = useState<CalendarDate>(() => randomConceptDate());

  return (
    <Screen gap={3}>
      <PageTitle subtitle="Pick any date and work out which day of the week it falls on, one question at a time. The two tables you need are on screen. You do the arithmetic.">
        Concept
      </PageTitle>

      <DatePick date={date} onDate={setDate} />

      <GuidedWalkView
        date={date}
        convention={settings.indexConvention}
        keyboard={settings.keyboardInput}
      />
    </Screen>
  );
}
