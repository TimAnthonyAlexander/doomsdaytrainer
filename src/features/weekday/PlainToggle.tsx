import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { palette } from '@/theme/palette';

export interface ToggleChoice<T extends string> {
  value: T;
  label: string;
}

interface PlainToggleProps<T extends string> {
  /** Named for screen readers. Never drawn: the choices say what they are. */
  label: string;
  choices: readonly ToggleChoice<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * A row of words, one of them current. No track, no pill, no icons — the
 * choice is between two or three plain labels, and drawing a control around
 * them would make a setting look like a feature.
 */
export function PlainToggle<T extends string>({ label, choices, value, onChange }: PlainToggleProps<T>) {
  return (
    <Box role="radiogroup" aria-label={label} sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {choices.map((choice) => {
        const current = choice.value === value;
        return (
          <ButtonBase
            key={choice.value}
            role="radio"
            aria-checked={current}
            onClick={() => onChange(choice.value)}
            sx={{
              minHeight: 48,
              px: 1,
              borderRadius: 1,
              '&:focus-visible': { outline: `2px solid ${palette.brandDeep}`, outlineOffset: 2 },
            }}
          >
            <Typography
              component="span"
              variant="body2"
              sx={{
                fontWeight: current ? 600 : 400,
                color: current ? 'text.primary' : 'text.secondary',
                // The underline is the only mark: it reads as "you are here"
                // rather than as a button that has been switched on.
                borderBottom: `2px solid ${current ? palette.brandDeep : 'transparent'}`,
                pb: 0.25,
              }}
            >
              {choice.label}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
