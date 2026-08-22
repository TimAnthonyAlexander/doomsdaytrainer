import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/components/ui/Screen';
import type { CalendarDate } from '@/domain/types';
import { randomConceptDate } from '@/features/concept/conceptDate';
import { useAppState } from '@/state/useAppState';
import { IndexStep } from './IndexStep';
import { IntroStep } from './IntroStep';
import { ScopeStep, type RangeField } from './ScopeStep';
import { StepIndicator } from './StepIndicator';
import { WalkStep } from './WalkStep';
import { WhyStep } from './WhyStep';
import {
  STEP_COUNT,
  type OnboardingDraft,
  type OnboardingStep,
  draftRange,
  initialDraft,
  nextStep,
  previousStep,
  settingsFromDraft,
  stepNumber,
} from './onboardingModel';

const PRIMARY_LABEL: Record<OnboardingStep, string> = {
  intro: 'Next',
  why: 'Next',
  index: 'Next',
  scope: 'Next',
  walk: 'Start learning',
};

/**
 * Five steps, one commit. Choices live in local state until the last button, so
 * a run that is abandoned halfway leaves nothing behind and starts clean.
 *
 * The last step is the guided walk, and it is the one step with no way past it:
 * the four before it are read, and this one is done. The commit and the
 * navigation therefore hang off the end of the walk rather than off a button in
 * the flow's own footer, which is why step five draws no primary button of its
 * own.
 *
 * It finishes on Learn rather than on Weekday, which is otherwise the app's
 * first destination: nothing has been introduced yet, so there is no code to
 * recall and nothing due to revise. Learn is the only screen with work on it.
 */
export function OnboardingFlow() {
  const { settings, updateSettings } = useAppState();
  const navigate = useNavigate();

  const [step, setStep] = useState<OnboardingStep>('intro');
  const [draft, setDraft] = useState<OnboardingDraft>(() => initialDraft(settings));
  const [saving, setSaving] = useState(false);
  // Held here rather than inside the step, so stepping back to the scope choice
  // and forward again returns to the date the user picked.
  const [walkDate, setWalkDate] = useState<CalendarDate>(() => randomConceptDate());

  const range = draftRange(draft);
  const back = previousStep(step);

  const commit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateSettings(settingsFromDraft(draft));
      navigate('/year-codes/learn', { replace: true });
    } catch {
      setSaving(false);
    }
  };

  const advance = () => {
    const target = nextStep(step);
    if (target) setStep(target);
    else void commit();
  };

  const setRange = (field: RangeField, text: string) => {
    setDraft((current) =>
      field === 'from' ? { ...current, customFrom: text } : { ...current, customTo: text },
    );
  };

  return (
    <Screen
      gap={4}
      sx={{
        minHeight: '100dvh',
        pt: { xs: 'calc(24px + var(--safe-top))', sm: 'calc(32px + var(--safe-top))' },
        pb: { xs: 'calc(24px + var(--safe-bottom))', sm: 'calc(32px + var(--safe-bottom))' },
      }}
    >
      <StepIndicator current={stepNumber(step)} total={STEP_COUNT} />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {step === 'intro' ? <IntroStep /> : null}
        {step === 'why' ? <WhyStep /> : null}
        {step === 'index' ? (
          <IndexStep
            value={draft.indexConvention}
            onChange={(indexConvention) => setDraft((current) => ({ ...current, indexConvention }))}
          />
        ) : null}
        {step === 'scope' ? (
          <ScopeStep
            scopeId={draft.scopeId}
            customFrom={draft.customFrom}
            customTo={draft.customTo}
            range={range}
            onScopeChange={(scopeId) => setDraft((current) => ({ ...current, scopeId }))}
            onRangeChange={setRange}
          />
        ) : null}
        {step === 'walk' ? (
          <WalkStep
            date={walkDate}
            onDate={setWalkDate}
            convention={draft.indexConvention}
            keyboard={settings.keyboardInput}
            footer={
              <Button
                fullWidth
                variant="contained"
                disabled={saving}
                onClick={() => void commit()}
                sx={{ minHeight: 48 }}
              >
                {PRIMARY_LABEL.walk}
              </Button>
            }
          />
        ) : null}
      </Box>

      <Box sx={{ mt: 'auto', pt: 4, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', minHeight: 48 }}>
          {back ? (
            <Button onClick={() => setStep(back)} color="inherit" sx={{ color: 'text.secondary' }}>
              Back
            </Button>
          ) : (
            <Box />
          )}
          {step === 'why' ? (
            <Button onClick={advance} color="inherit" sx={{ color: 'text.secondary' }}>
              Skip
            </Button>
          ) : null}
        </Box>
        {step === 'walk' ? null : (
          <Button fullWidth variant="contained" disabled={saving} onClick={advance}>
            {PRIMARY_LABEL[step]}
          </Button>
        )}
      </Box>
    </Screen>
  );
}
