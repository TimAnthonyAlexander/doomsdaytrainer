import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AppShell } from '@/components/shell/AppShell';
import { CalcScreen } from '@/routes/CalcScreen';
import { LearnScreen } from '@/routes/LearnScreen';
import { NotFoundScreen } from '@/routes/NotFoundScreen';
import { ReviseScreen } from '@/routes/ReviseScreen';
import { SettingsScreen } from '@/routes/SettingsScreen';
import { StatsScreen } from '@/routes/StatsScreen';
import { TroubleScreen } from '@/routes/TroubleScreen';
import { WeekdayScreen } from '@/routes/WeekdayScreen';
import { WelcomeScreen } from '@/routes/WelcomeScreen';
import { YearCodesScreen } from '@/routes/YearCodesScreen';

/**
 * The route table, exported so it can be asserted without a browser.
 *
 * Onboarding sits outside the shell: there is nothing to navigate to until it
 * is finished, so the rail and bottom bar would only be dead targets. AppShell
 * sends the user here while `settings.onboardingComplete` is false.
 *
 * Everything about the 100 codes is nested under `/year-codes`. The nesting is
 * load-bearing rather than tidy: `isNavActive` matches a `${path}/` prefix, so
 * one nav entry lights up on all four children and no extra rule is needed.
 */
export const routes: RouteObject[] = [
  { path: '/welcome', element: <WelcomeScreen /> },
  {
    element: <AppShell />,
    children: [
      { index: true, element: <WeekdayScreen /> },
      { path: 'year-codes', element: <YearCodesScreen /> },
      { path: 'year-codes/learn', element: <LearnScreen /> },
      { path: 'year-codes/revise', element: <ReviseScreen /> },
      { path: 'year-codes/calc', element: <CalcScreen /> },
      // Off the grid until something is flagged, and off the nav always. It is
      // reached from the Year codes grid, from Revise, and from the mastery
      // grid, which is where leeches become visible.
      { path: 'year-codes/trouble', element: <TroubleScreen /> },
      { path: 'stats', element: <StatsScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
