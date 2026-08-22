import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { palette } from '@/theme/palette';

/**
 * The whole visual system of this screen: a section label, a single hairline
 * above each section after the first, and whitespace. No cards, no rows with
 * chevrons, no icon per setting.
 */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box
      component="section"
      aria-label={title}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        pt: 4,
        borderTop: `1px solid ${palette.rule}`,
        '&:first-of-type': { pt: 0, borderTop: 'none' },
      }}
    >
      <Typography
        component="h2"
        variant="caption"
        sx={{
          textTransform: 'uppercase',
          letterSpacing: '0.09em',
          fontWeight: 600,
          color: 'text.secondary',
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

interface FieldProps {
  label: ReactNode;
  /** One line saying what the setting does, or what changing it costs. */
  note?: ReactNode;
  children?: ReactNode;
}

/** Label, one explanatory line, then the control. */
export function Field({ label, note, children }: FieldProps) {
  return (
    <Box>
      <Typography variant="body1" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      {note ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {note}
        </Typography>
      ) : null}
      {children ? <Box sx={{ mt: 1.5 }}>{children}</Box> : null}
    </Box>
  );
}

interface SwitchFieldProps {
  label: ReactNode;
  note?: ReactNode;
  /** The Switch itself. Passed in so this file stays free of state. */
  control: ReactNode;
}

/** A switch sits on the label's line; its explanation goes underneath. */
export function SwitchField({ label, note, control }: SwitchFieldProps) {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="body1" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        {control}
      </Box>
      {note ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, pr: 7 }}>
          {note}
        </Typography>
      ) : null}
    </Box>
  );
}
