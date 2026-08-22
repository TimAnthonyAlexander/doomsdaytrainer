import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/shell/AppShell';
import { DrillsScreen } from '@/routes/DrillsScreen';
import { LearnScreen } from '@/routes/LearnScreen';
import { NotFoundScreen } from '@/routes/NotFoundScreen';
import { ReviewScreen } from '@/routes/ReviewScreen';
import { SettingsScreen } from '@/routes/SettingsScreen';
import { StatsScreen } from '@/routes/StatsScreen';
import { TroubleScreen } from '@/routes/TroubleScreen';
import { CalcScreen } from '@/routes/CalcScreen';
import { WeekdayScreen } from '@/routes/WeekdayScreen';
import { WelcomeScreen } from '@/routes/WelcomeScreen';

/**
 * Onboarding sits outside the shell: there is nothing to navigate to until it
 * is finished, so the rail and bottom bar would only be dead targets. AppShell
 * sends the user here while `settings.onboardingComplete` is false.
 */
export const router = createBrowserRouter([
  { path: '/welcome', element: <WelcomeScreen /> },
  {
    element: <AppShell />,
    children: [
      { index: true, element: <ReviewScreen /> },
      { path: 'learn', element: <LearnScreen /> },
      { path: 'drills', element: <DrillsScreen /> },
      // Not in the nav. Five destinations already crowd 375px, and a drill that
      // is empty for most users does not earn a permanent slot. Reached from
      // Drills and from the mastery grid, which is where leeches become visible.
      { path: 'trouble', element: <TroubleScreen /> },
      { path: 'weekday', element: <WeekdayScreen /> },
      { path: 'calc', element: <CalcScreen /> },
      { path: 'stats', element: <StatsScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
]);
