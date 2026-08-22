import Box from '@mui/material/Box';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { Numeral } from '@/components/ui/Numeral';
import type { HintType, Settings } from '@/domain/types';
import { formatYear } from '@/domain/yearCodes';
import { palette } from '@/theme/palette';
import { Field, SettingsSection } from './SettingsSection';
import { HINT_EXAMPLE_YEAR, hintChoices } from './settingsModel';

interface HintSettingsProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

/**
 * Each option carries the line it would actually produce, rendered by the same
 * functions review uses. Three abstract nouns would make this a guess.
 */
export function HintSettings({ settings, onChange }: HintSettingsProps) {
  const choices = hintChoices();

  return (
    <SettingsSection title="Hints">
      <Field
        label="Hint type"
        note={`What a hint shows when you ask for one during review, here for year ${formatYear(HINT_EXAMPLE_YEAR)}. Asking caps that answer at grade 3.`}
      >
        <ToggleButtonGroup
          orientation="vertical"
          exclusive
          fullWidth
          color="primary"
          value={settings.hintType}
          onChange={(_event, next: HintType | null) => {
            if (next) onChange({ hintType: next });
          }}
        >
          {choices.map((choice) => (
            <ToggleButton
              key={choice.type}
              value={choice.type}
              sx={{ display: 'block', textAlign: 'left', px: 2, py: 1.5 }}
            >
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {choice.label}
              </Typography>
              <Box sx={{ mt: 0.75 }}>
                <Numeral size={15} color={palette.greenDeep}>
                  {choice.hint.text}
                </Numeral>
              </Box>
              {choice.hint.note ? (
                <Typography variant="caption" component="div" color="text.secondary" sx={{ mt: 0.5 }}>
                  {choice.hint.note}
                </Typography>
              ) : null}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Field>
    </SettingsSection>
  );
}
