import { useCallback } from 'react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Screen } from '@/components/ui/Screen';
import type { Settings } from '@/domain/types';
import { requestReminderPermission, useReminderCapability } from '@/features/notifications';
import { useInstallPrompt } from '@/features/pwa';
import { AboutSettings } from '@/features/settings/AboutSettings';
import { AnsweringSettings } from '@/features/settings/AnsweringSettings';
import { AudioSettings } from '@/features/settings/AudioSettings';
import { DataSettings } from '@/features/settings/DataSettings';
import { HintSettings } from '@/features/settings/HintSettings';
import { PracticeSettings } from '@/features/settings/PracticeSettings';
import { ReminderSettings } from '@/features/settings/ReminderSettings';
import { useAppState } from '@/state/useAppState';

export function SettingsScreen() {
  const { data, settings, updateSettings, importData, reset } = useAppState();
  const capability = useReminderCapability();
  const install = useInstallPrompt();

  const change = useCallback(
    (patch: Partial<Settings>) => {
      void updateSettings(patch);
    },
    [updateSettings],
  );

  // Only ever from the button in the reminder section. An unprompted permission
  // dialog is the fastest way to get blocked for good.
  const askPermission = useCallback(() => {
    void requestReminderPermission();
  }, []);

  return (
    <Screen gap={4}>
      <PageTitle>Settings</PageTitle>

      <PracticeSettings settings={settings} onChange={change} />
      <AnsweringSettings settings={settings} onChange={change} />
      <HintSettings settings={settings} onChange={change} />
      <AudioSettings settings={settings} onChange={change} />
      <ReminderSettings
        settings={settings}
        onChange={change}
        capability={capability}
        onRequestPermission={askPermission}
      />
      <DataSettings data={data} onImport={importData} onReset={reset} />
      <AboutSettings install={install} />
    </Screen>
  );
}
