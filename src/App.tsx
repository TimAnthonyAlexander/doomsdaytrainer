import CssBaseline from '@mui/material/CssBaseline';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/router';
import { AppChrome } from '@/features/pwa';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';

export function App() {
  return (
    <ThemeModeProvider>
      <CssBaseline />
      <AppStateProvider>
        <AppStateGate>
          <AppChrome />
          <RouterProvider router={router} />
        </AppStateGate>
      </AppStateProvider>
    </ThemeModeProvider>
  );
}
