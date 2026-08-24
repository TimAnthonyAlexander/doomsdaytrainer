import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/components/ui/Screen';
import { MethodIntro } from '@/features/concept/MethodIntro';
import { useAppState } from '@/state/useAppState';
import { IntroStep } from './IntroStep';
import { ScopeStep, type RangeField } from './ScopeStep';
import { StepIndicator } from './StepIndicator';
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

/**
 * Four steps, one commit. Choices live in local state until the last button, so
 * a run that is abandoned halfway leaves nothing behind and starts clean.
 *
 * It was five. The one that went asked whether 0 meant Sunday or Monday, and
 * the answer renamed the seven buttons and changed no number anywhere else — so
 * a user who picked Monday read "0 = Monday" on the pad while every century
 * anchor, every worked line and every explanation in the app still counted from
 * Sunday. There is one convention now, and no screen has to ask about it.
 *
 * Every step is read, including the last: it is the method explainer, the same
 * component the Concept screen opens on, and the button under it leaves for the
 * app. The guided walk used to be bolted to the back of it and answering its
 * twelve questions was the only way out of onboarding — a fine screen, and the
 * wrong place for it. Somebody who has just been told what a doomsday is should
 * reach the app after reading, not after a quiz; the walk is on `/concept`
 * whenever they want it.
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
        minHeight: 'var(--app-height)',
        pt: { xs: 'calc(24px + var(--safe-top))', sm: 'calc(32px + var(--safe-top))' },
        pb: { xs: 'calc(24px + var(--safe-bottom))', sm: 'calc(32px + var(--safe-bottom))' },
      }}
    >
      <StepIndicator current={stepNumber(step)} total={STEP_COUNT} />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {step === 'intro' ? <IntroStep /> : null}
        {step === 'why' ? <WhyStep /> : null}
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
        {/* No `onStart`: the way on is the flow's own footer button, which is
            also the button that commits the run. */}
        {step === 'method' ? <MethodIntro /> : null}
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
        <Button fullWidth variant="contained" disabled={saving} onClick={advance}>
          Next
        </Button>
      </Box>
    </Screen>
  );
}
