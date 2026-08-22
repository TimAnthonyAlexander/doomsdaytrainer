import CssBaseline from '@mui/material/CssBaseline';
import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/router';
import { startServiceWorker, trackAppHeight } from '@/features/pwa';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';
// Side effect only: `beforeinstallprompt` fires early and once, so the store has
// to be listening from app start rather than from whenever the shell mounts.
import '@/features/pwa/installStore';

export function App() {
  // The visible chrome lives in the shell, but registration does not wait for
  // it: someone who leaves during onboarding should still have the app cached.
  // The call is idempotent, so a second caller is harmless.
  useEffect(() => {
    startServiceWorker();
  }, []);

  // Above the router rather than in the shell: onboarding is a full-height
  // screen too, and it is the first thing an installed app shows.
  useEffect(trackAppHeight, []);

  return (
    <ThemeModeProvider>
      <CssBaseline />
      <AppStateProvider>
        <AppStateGate>
          <RouterProvider router={router} />
        </AppStateGate>
      </AppStateProvider>
    </ThemeModeProvider>
  );
}
