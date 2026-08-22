import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { OnboardingFlow } from '@/features/onboarding/OnboardingFlow';
import { useAppState } from '@/state/useAppState';

/**
 * The router sends first-run users here and never sends them away again, so the
 * guard lives on this side: someone who already finished onboarding gets bounced
 * to review unless they asked for another run with `?rerun=1` (Settings links
 * there). The decision is taken once, on mount, so committing the flow at the
 * last step cannot bounce the user mid-navigation.
 */
export function WelcomeScreen() {
  const { settings } = useAppState();
  const [params] = useSearchParams();
  const [redirect] = useState(
    () => settings.onboardingComplete && params.get('rerun') !== '1',
  );

  if (redirect) return <Navigate to="/" replace />;
  return <OnboardingFlow />;
}
