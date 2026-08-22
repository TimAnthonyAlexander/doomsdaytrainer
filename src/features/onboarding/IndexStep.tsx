import Box from '@mui/material/Box';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { PageTitle } from '@/components/ui/PageTitle';
import { Numeral } from '@/components/ui/Numeral';
import type { IndexConvention } from '@/domain/types';
import { codeFor, formatYear, weekdayName } from '@/domain/yearCodes';
import { palette } from '@/theme/palette';
import { INDEX_EXAMPLE_YEARS } from './onboardingModel';

interface IndexStepProps {
  value: IndexConvention;
  onChange: (value: IndexConvention) => void;
}

/**
 * The likeliest misunderstanding in the app is that this setting changes the
 * codes. It does not, so the screen demonstrates rather than claims: the middle
 * column is rendered from `codeFor` and the right column from `weekdayName`, and
 * only the right one reacts to the toggle.
 */
export function IndexStep({ value, onChange }: IndexStepProps) {
  return (
    <>
      <PageTitle>Which day is code 0?</PageTitle>
      <Typography variant="body1" color="text.secondary">
        Some people learn this table with 0 meaning Sunday, some with 0 meaning Monday. Pick
        whichever you were taught. It renames the weekdays the app shows you, and nothing else.
      </Typography>

      <ToggleButtonGroup
        exclusive
        fullWidth
        color="primary"
        value={value}
        onChange={(_event, next: IndexConvention | null) => {
          if (next) onChange(next);
        }}
      >
        <ToggleButton value="sunday">
          <Numeral weight={600}>0</Numeral>
          <Box component="span" sx={{ ml: 0.75 }}>
            = Sunday
          </Box>
        </ToggleButton>
        <ToggleButton value="monday">
          <Numeral weight={600}>0</Numeral>
          <Box component="span" sx={{ ml: 0.75 }}>
            = Monday
          </Box>
        </ToggleButton>
      </ToggleButtonGroup>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', columnGap: 3, rowGap: 1.5 }}>
        {['Year', 'Code', 'Weekday'].map((heading) => (
          <Typography key={heading} variant="caption" color="text.secondary">
            {heading}
          </Typography>
        ))}
        {INDEX_EXAMPLE_YEARS.map((yy) => {
          const code = codeFor(yy);
          return (
            <Box key={yy} sx={{ display: 'contents' }}>
              <Numeral size={17}>{formatYear(yy)}</Numeral>
              <Numeral size={17} weight={600} color={palette.green}>
                {code}
              </Numeral>
              <Typography variant="body1">{weekdayName(code, value)}</Typography>
            </Box>
          );
        })}
      </Box>

      <Typography variant="body2" color="text.secondary">
        Switch it and watch. The code column stays where it is.
      </Typography>
    </>
  );
}
