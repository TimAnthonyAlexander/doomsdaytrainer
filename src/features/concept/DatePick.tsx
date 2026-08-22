import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import type { CalendarDate } from '@/domain/types';
import { fontFamily, radius, space } from '@/theme/tokens';
import { CONCEPT_MAX_INPUT, CONCEPT_MIN_INPUT, randomConceptDate, readDateInput, toDateInput } from './conceptDate';

/** One control, two mounts: the Concept screen and the last onboarding step. */
const FIELD_ID = 'concept-date';

export interface DatePickProps {
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
export function DatePick({ date, onDate }: DatePickProps) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: `${space[3]}px` }}>
      <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
        <Typography
          component="label"
          htmlFor={FIELD_ID}
          variant="body2"
          sx={{ display: 'block', color: 'var(--text-secondary)', mb: `${space[1]}px` }}
        >
          Date
        </Typography>
        <Box
          component="input"
          id={FIELD_ID}
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
