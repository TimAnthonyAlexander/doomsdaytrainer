import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { Settings } from '@/domain/types';
import type { ReminderCapability } from '@/features/notifications';
import { monoFontFamily } from '@/theme/theme';
import { Field, SettingsSection, SwitchField } from './SettingsSection';
import { isReminderTime } from './settingsModel';

interface ReminderSettingsProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  /** What this browser can honestly do. `reason` is finished copy. */
  capability: ReminderCapability;
  /** Opens the browser's permission dialog. Only ever from a tap. */
  onRequestPermission: () => void;
}

/**
 * Reminders, and what the browser will actually do about them.
 *
 * The switch appears only once the browser has agreed to show notifications:
 * before that it would store a preference nothing can act on, which is the one
 * thing a settings screen must never do. Until then there is a permission
 * button, or, where notifications do not exist at all, only the sentence saying
 * so. A reminder that is already switched on keeps its switch whatever the
 * permission says, so it can always be switched off again.
 */
export function ReminderSettings({
  settings,
  onChange,
  capability,
  onRequestPermission,
}: ReminderSettingsProps) {
  // A reminder that is already on always keeps its switch, whatever the browser
  // says, or a setting turned on somewhere else could never be turned off here.
  const showSwitch = capability.permission === 'granted' || settings.reminderEnabled;

  return (
    <SettingsSection title="Reminders">
      {showSwitch ? (
        <SwitchField
          label="Daily reminder"
          note="One notification at the time you pick, saying how many codes are due."
          control={
            <Switch
              checked={settings.reminderEnabled}
              slotProps={{ input: { 'aria-label': 'Daily reminder' } }}
              onChange={(event) => onChange({ reminderEnabled: event.target.checked })}
            />
          }
        />
      ) : (
        <Field label="Daily reminder" />
      )}

      <Typography variant="body2" color="text.secondary">
        {capability.reason}
      </Typography>

      {capability.supported && capability.permission === 'default' ? (
        <Box>
          <Button variant="outlined" color="inherit" onClick={onRequestPermission}>
            Allow notifications
          </Button>
        </Box>
      ) : null}

      {showSwitch && settings.reminderEnabled ? (
        <>
          <Field label="Reminder time">
            <Box sx={{ display: 'flex' }}>
              <TextField
                type="time"
                label="Time"
                value={settings.reminderTime}
                onChange={(event) => {
                  const next = event.target.value;
                  // An empty or half-typed field arrives here mid-edit; keeping
                  // the stored time until it parses avoids writing "1:0".
                  if (isReminderTime(next)) onChange({ reminderTime: next });
                }}
                slotProps={{
                  htmlInput: {
                    style: { fontFamily: monoFontFamily, fontVariantNumeric: 'tabular-nums' },
                  },
                }}
                sx={{ width: 160 }}
              />
            </Box>
          </Field>

          <SwitchField
            label="Second reminder"
            note="Another one in the evening if the day's codes are still waiting."
            control={
              <Switch
                checked={settings.eveningReminderEnabled}
                slotProps={{ input: { 'aria-label': 'Second reminder' } }}
                onChange={(event) => onChange({ eveningReminderEnabled: event.target.checked })}
              />
            }
          />
        </>
      ) : null}
    </SettingsSection>
  );
}
