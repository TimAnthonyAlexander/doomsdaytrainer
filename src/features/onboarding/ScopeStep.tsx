import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { PageTitle } from '@/components/ui/PageTitle';
import { Numeral } from '@/components/ui/Numeral';
import { SCOPES } from '@/domain/scope';
import type { ScopeId } from '@/domain/types';
import { formatYear } from '@/domain/yearCodes';
import { monoFontFamily } from '@/theme/theme';
import {
  type CustomRange,
  sanitiseYearText,
  scopeItemCount,
  scopeRangeLabel,
  yearFromText,
} from './onboardingModel';

export type RangeField = 'from' | 'to';

interface ScopeStepProps {
  scopeId: ScopeId;
  customFrom: string;
  customTo: string;
  range: CustomRange;
  onScopeChange: (scopeId: ScopeId) => void;
  onRangeChange: (field: RangeField, text: string) => void;
}

/** Code counts come from `scopeYears`, so a scope cannot advertise the wrong size. */
export function ScopeStep({
  scopeId,
  customFrom,
  customTo,
  range,
  onScopeChange,
  onRangeChange,
}: ScopeStepProps) {
  const field = (name: RangeField, label: string, value: string) => (
    <TextField
      label={label}
      value={value}
      inputMode="numeric"
      autoComplete="off"
      onChange={(event) => onRangeChange(name, sanitiseYearText(event.target.value))}
      onBlur={() => onRangeChange(name, formatYear(yearFromText(value)))}
      slotProps={{
        htmlInput: {
          inputMode: 'numeric',
          maxLength: 2,
          style: { fontFamily: monoFontFamily, fontVariantNumeric: 'tabular-nums' },
        },
      }}
      sx={{ flex: 1 }}
    />
  );

  return (
    <>
      <PageTitle>How much of the table</PageTitle>
      <Typography variant="body1" color="text.secondary">
        All hundred is the default and it is the right pick for most people. A narrower range is
        less to hold at once, and you can widen it later in settings without losing progress.
      </Typography>

      <ToggleButtonGroup
        orientation="vertical"
        exclusive
        fullWidth
        color="primary"
        value={scopeId}
        onChange={(_event, next: ScopeId | null) => {
          if (next) onScopeChange(next);
        }}
      >
        {SCOPES.map((scope) => (
          <ToggleButton
            key={scope.id}
            value={scope.id}
            sx={{ justifyContent: 'space-between', gap: 2, px: 2 }}
          >
            <Box component="span">{scope.label}</Box>
            <Box
              component="span"
              sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, fontWeight: 400 }}
            >
              <Numeral color="text.secondary">{scopeRangeLabel(scope.id, range)}</Numeral>
              <Box component="span" sx={{ color: 'text.secondary', fontSize: 13 }}>
                <Numeral>{scopeItemCount(scope.id, range)}</Numeral> codes
              </Box>
            </Box>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {scopeId === 'custom' ? (
        <Box sx={{ display: 'flex', gap: 2 }}>
          {field('from', 'From', customFrom)}
          {field('to', 'To', customTo)}
        </Box>
      ) : null}
    </>
  );
}
