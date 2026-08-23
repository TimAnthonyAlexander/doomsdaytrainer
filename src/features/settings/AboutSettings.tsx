import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import { Numeral } from '@/components/ui/Numeral';
import { STEP_COUNT } from '@/features/onboarding/onboardingModel';
import type { InstallPrompt } from '@/features/pwa';
import { Field, SettingsSection } from './SettingsSection';
import { APP_VERSION } from './settingsModel';

/**
 * The install control appears only when a real prompt is held. Safari and
 * Firefox never fire one, and a button that opens nothing is worse than no
 * button: there is no way to write honest copy for it.
 */
export function AboutSettings({ install }: { install: InstallPrompt }) {
  return (
    <SettingsSection title="About">
      {install.canInstall ? (
        <Field
          label="Install"
          note="Adds the app to your home screen. It runs the same and still stores everything on this device."
        >
          <Button variant="outlined" color="inherit" onClick={() => void install.install()}>
            Install
          </Button>
        </Field>
      ) : null}

      {/* Counted from the flow itself: the old note said four and the flow had
          five, which is the one way a number in prose goes wrong quietly. */}
      <Field
        label="Onboarding"
        note={
          <>
            All <Numeral size={13}>{STEP_COUNT}</Numeral> intro screens again, including the
            explainer that walks the whole method. Your progress is not touched.
          </>
        }
      >
        <Button component={RouterLink} to="/welcome?rerun=1" variant="outlined" color="inherit">
          Run onboarding again
        </Button>
      </Field>

      <Typography variant="body2" color="text.secondary">
        Doomsday Trainer <Numeral size={13}>{APP_VERSION}</Numeral>. Everything you do here is
        stored on this device. There is no account and no server, and nothing is sent anywhere.
      </Typography>
    </SettingsSection>
  );
}
