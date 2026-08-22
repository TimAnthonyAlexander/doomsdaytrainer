import Switch from '@mui/material/Switch';
import type { Settings } from '@/domain/types';
import { SettingsSection, SwitchField } from './SettingsSection';

interface AudioSettingsProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

/**
 * The two spoken-prompt switches.
 *
 * They are separate because they cost different things. Learn is not timed, so
 * speaking there is free. Revise is the app's measuring instrument, so speaking
 * there puts listening time inside every latency it grades on, and the note
 * says so in the plainest words available rather than leaving the user to
 * discover it in a median that moved.
 */
export function AudioSettings({ settings, onChange }: AudioSettingsProps) {
  return (
    <SettingsSection title="Audio">
      <SwitchField
        label="Spoken years in Learn"
        note="Says the year and its code while a pair is being taught, and the year on its own when it is asked for. Nothing in Learn is timed, so this cannot move any of your figures."
        control={
          <Switch
            checked={settings.spokenPrompts}
            slotProps={{ input: { 'aria-label': 'Spoken years in Learn' } }}
            onChange={(event) => onChange({ spokenPrompts: event.target.checked })}
          />
        }
      />

      <SwitchField
        label="Spoken years in Revise"
        note="Says the year on a Revise prompt. Latency is measured from the prompt appearing to your tap, so the second the clip takes sits inside every answer you give with this on, and that latency is what sets the grade, the fluency decision and the mastery grid. Stats says how many of your recent answers had it. The speaker button on the Revise screen is this same setting."
        control={
          <Switch
            checked={settings.spokenReviewPrompts}
            slotProps={{ input: { 'aria-label': 'Spoken years in Revise' } }}
            onChange={(event) => onChange({ spokenReviewPrompts: event.target.checked })}
          />
        }
      />
    </SettingsSection>
  );
}
