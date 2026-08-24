import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { Numeral } from '@/components/ui/Numeral';
import { SCOPES } from '@/domain/scope';
import type { ScopeId, Settings } from '@/domain/types';
import { formatYear } from '@/domain/yearCodes';
import {
  normaliseRange,
  sanitiseYearText,
  scopeItemCount,
  scopeRangeLabel,
  yearFromText,
} from '@/features/onboarding/onboardingModel';
import { monoFontFamily } from '@/theme/theme';
import { Field, SettingsSection } from './SettingsSection';
import { NEW_ITEMS_MAX, NEW_ITEMS_MIN } from './settingsModel';
import { useDraft } from './useDraft';

interface PracticeSettingsProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

/**
 * Both of these govern the 100 year codes and nothing else — not the tables,
 * not the day step, not the weekday trainer, not the Concept walk — and while
 * they were labelled "Scope" and "New codes per day" they read as the app's
 * practice settings, which made the whole app look like a year-code trainer
 * with some extra screens attached. Each names its subject now, and each note
 * names what it leaves alone.
 *
 * The section also held an index-convention toggle, Sunday against Monday. It
 * renamed the seven buttons and changed no number anywhere else, so picking
 * Monday left every century anchor, every worked line and every explanation in
 * the app still counting from Sunday. Sunday is the only convention now.
 */
export function PracticeSettings({ settings, onChange }: PracticeSettingsProps) {
  const range = normaliseRange(settings.customScope);
  const [fromText, setFromText] = useDraft(formatYear(range.from));
  const [toText, setToText] = useDraft(formatYear(range.to));
  const [newItems, setNewItems] = useDraft(settings.newItemsPerDay);

  const commitRange = (from: string, to: string) => {
    onChange({
      customScope: normaliseRange({ from: yearFromText(from), to: yearFromText(to) }),
    });
  };

  return (
    <SettingsSection title="Practice">
      <Field
        label="Year-code scope"
        note="Which of the 100 codes are scheduled. The rest stay stored and stop coming up; nothing is deleted, and widening the scope brings their progress back. It scopes the codes only — the month doomsdays, the century anchors, the day step, the weekday trainer and the Concept walk are always there in full."
      >
        <ToggleButtonGroup
          orientation="vertical"
          exclusive
          fullWidth
          color="primary"
          value={settings.scopeId}
          onChange={(_event, next: ScopeId | null) => {
            if (next) onChange({ scopeId: next });
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

        {settings.scopeId === 'custom' ? (
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <TextField
              label="From"
              value={fromText}
              autoComplete="off"
              onChange={(event) => setFromText(sanitiseYearText(event.target.value))}
              onBlur={() => commitRange(fromText, toText)}
              slotProps={{
                htmlInput: {
                  inputMode: 'numeric',
                  maxLength: 2,
                  style: { fontFamily: monoFontFamily, fontVariantNumeric: 'tabular-nums' },
                },
              }}
              sx={{ flex: 1 }}
            />
            <TextField
              label="To"
              value={toText}
              autoComplete="off"
              onChange={(event) => setToText(sanitiseYearText(event.target.value))}
              onBlur={() => commitRange(fromText, toText)}
              slotProps={{
                htmlInput: {
                  inputMode: 'numeric',
                  maxLength: 2,
                  style: { fontFamily: monoFontFamily, fontVariantNumeric: 'tabular-nums' },
                },
              }}
              sx={{ flex: 1 }}
            />
          </Box>
        ) : null}
      </Field>

      <Field
        label="New year codes per day"
        note="How many unlearned codes Learn mode will hand over in one day. Two decade blocks by default. It caps the codes only — the tables, the day step and the weekday trainer have no daily limit."
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Slider
            value={newItems}
            min={NEW_ITEMS_MIN}
            max={NEW_ITEMS_MAX}
            step={1}
            aria-label="New year codes per day"
            onChange={(_event, value) => setNewItems(value as number)}
            onChangeCommitted={(_event, value) => onChange({ newItemsPerDay: value as number })}
            sx={{ flex: 1 }}
          />
          <Numeral size={22} weight={600} sx={{ minWidth: 32, textAlign: 'right' }}>
            {newItems}
          </Numeral>
        </Box>
      </Field>
    </SettingsSection>
  );
}
