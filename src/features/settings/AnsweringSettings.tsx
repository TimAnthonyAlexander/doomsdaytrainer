import Box from '@mui/material/Box';
import InputAdornment from '@mui/material/InputAdornment';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import type { KeyboardEvent } from 'react';
import { Numeral } from '@/components/ui/Numeral';
import type { Settings } from '@/domain/types';
import { monoFontFamily } from '@/theme/theme';
import { Field, SettingsSection, SwitchField } from './SettingsSection';
import {
  AUTO_ADVANCE_MAX,
  AUTO_ADVANCE_MIN,
  AUTO_ADVANCE_STEP,
  msFromText,
  sanitiseMsText,
  withFastThreshold,
  withMediumThreshold,
} from './settingsModel';
import { useDraft } from './useDraft';

interface AnsweringSettingsProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

const MS_INPUT = {
  inputMode: 'numeric' as const,
  maxLength: 5,
  style: { fontFamily: monoFontFamily, fontVariantNumeric: 'tabular-nums' as const },
};

export function AnsweringSettings({ settings, onChange }: AnsweringSettingsProps) {
  const [fastText, setFastText] = useDraft(String(settings.fastThresholdMs));
  const [mediumText, setMediumText] = useDraft(String(settings.mediumThresholdMs));
  const [autoAdvance, setAutoAdvance] = useDraft(settings.autoAdvanceMs);

  const current = {
    fastThresholdMs: settings.fastThresholdMs,
    mediumThresholdMs: settings.mediumThresholdMs,
  };

  // Both fields are written on every commit. The pair is one setting with two
  // numbers in it: moving one cutoff past the other has to move both.
  const commit = (next: { fastThresholdMs: number; mediumThresholdMs: number }) => {
    setFastText(String(next.fastThresholdMs));
    setMediumText(String(next.mediumThresholdMs));
    onChange(next);
  };

  const commitFast = () => commit(withFastThreshold(current, msFromText(fastText, current.fastThresholdMs)));
  const commitMedium = () =>
    commit(withMediumThreshold(current, msFromText(mediumText, current.mediumThresholdMs)));

  const onEnter = (commitField: () => void) => (event: KeyboardEvent) => {
    if (event.key === 'Enter') commitField();
  };

  return (
    <SettingsSection title="Answering">
      <Field
        label="Latency thresholds"
        note="A correct answer under the fast cutoff grades 5, under the medium cutoff grades 4, and slower than that grades 3. A wrong answer always grades 1."
      >
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="Fast"
            value={fastText}
            autoComplete="off"
            onChange={(event) => setFastText(sanitiseMsText(event.target.value))}
            onBlur={commitFast}
            onKeyDown={onEnter(commitFast)}
            slotProps={{
              htmlInput: MS_INPUT,
              input: { endAdornment: <InputAdornment position="end">ms</InputAdornment> },
            }}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Medium"
            value={mediumText}
            autoComplete="off"
            onChange={(event) => setMediumText(sanitiseMsText(event.target.value))}
            onBlur={commitMedium}
            onKeyDown={onEnter(commitMedium)}
            slotProps={{
              htmlInput: MS_INPUT,
              input: { endAdornment: <InputAdornment position="end">ms</InputAdornment> },
            }}
            sx={{ flex: 1 }}
          />
        </Box>
      </Field>

      <Field
        label="Auto-advance delay"
        note="How long a correct answer stays on screen before the next year appears."
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Slider
            value={autoAdvance}
            min={AUTO_ADVANCE_MIN}
            max={AUTO_ADVANCE_MAX}
            step={AUTO_ADVANCE_STEP}
            aria-label="Auto-advance delay"
            onChange={(_event, value) => setAutoAdvance(value as number)}
            onChangeCommitted={(_event, value) => onChange({ autoAdvanceMs: value as number })}
            sx={{ flex: 1 }}
          />
          <Numeral size={22} weight={600} sx={{ minWidth: 66, textAlign: 'right' }}>
            {`${autoAdvance} ms`}
          </Numeral>
        </Box>
      </Field>

      <SwitchField
        label="Keyboard input"
        note="Answer with the number row or the numpad as well as the buttons."
        control={
          <Switch
            checked={settings.keyboardInput}
            slotProps={{ input: { 'aria-label': 'Keyboard input' } }}
            onChange={(event) => onChange({ keyboardInput: event.target.checked })}
          />
        }
      />
    </SettingsSection>
  );
}
