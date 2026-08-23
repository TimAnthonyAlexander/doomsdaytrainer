import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData, ItemState, Settings } from '@/domain/types';
import { closeDb, loadAppData, saveAppData } from '@/storage/db';
import { DEFAULT_SETTINGS, defaultAppData, itemKey } from '@/storage/defaults';
import { serialiseExport } from '@/storage/exportImport';
import { AppStateProvider } from '@/state/AppStateProvider';
import { SettingsScreen } from '@/routes/SettingsScreen';
import { refreshReminderCapability } from '@/features/notifications';
import { theme } from '@/theme/theme';

async function deleteDb(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('doomsday-trainer');
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function seedData(
  entries: Array<{ yy: number } & Partial<ItemState>> = [],
  settings: Partial<Settings> = {},
): AppData {
  const now = Date.now();
  const data = defaultAppData(now);
  data.settings = { ...data.settings, onboardingComplete: true, ...settings };
  for (const entry of entries) {
    const key = itemKey(entry.yy);
    data.items[key] = { ...data.items[key], introduced: true, introducedAt: now, ...entry };
  }
  return data;
}

async function seed(
  entries: Array<{ yy: number } & Partial<ItemState>> = [],
  settings: Partial<Settings> = {},
): Promise<void> {
  await saveAppData(seedData(entries, settings));
  await closeDb();
}

function mount() {
  return render(
    <ThemeProvider theme={theme}>
      <AppStateProvider>
        <MemoryRouter>
          <SettingsScreen />
        </MemoryRouter>
      </AppStateProvider>
    </ThemeProvider>,
  );
}

function field(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

/** Type a value into a text field and commit it the way a blur would. */
function retype(label: string, value: string): void {
  const input = field(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

async function chooseFile(json: string, name = 'export.json'): Promise<void> {
  const input = screen.getByLabelText('Import file') as HTMLInputElement;
  const file = new File([json], name, { type: 'application/json' });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByRole('button', { name: 'Replace all data' });
}

beforeEach(async () => {
  await deleteDb();
  // jsdom has no Notification API, and without one the screen correctly refuses
  // to show a reminder switch at all. These tests are about the settings a
  // browser that can show notifications offers, so give it one.
  vi.stubGlobal('Notification', {
    permission: 'granted',
    requestPermission: async () => 'granted',
  });
  refreshReminderCapability();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Latency thresholds', () => {
  it('pushes the medium cutoff up when fast passes it', async () => {
    await seed();
    mount();

    await waitFor(() => expect(field('Fast')).toHaveValue('2000'));
    retype('Fast', '6000');

    expect(field('Medium')).toHaveValue('6100');
    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.settings.fastThresholdMs).toBe(6000);
      expect(stored.settings.mediumThresholdMs).toBe(6100);
    });
  });

  it('pulls the fast cutoff down when medium is lowered below it', async () => {
    await seed();
    mount();

    await waitFor(() => expect(field('Medium')).toHaveValue('5000'));
    retype('Medium', '1500');

    expect(field('Fast')).toHaveValue('1400');
    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.settings.mediumThresholdMs).toBe(1500);
      expect(stored.settings.fastThresholdMs).toBe(1400);
      expect(stored.settings.fastThresholdMs).toBeLessThan(stored.settings.mediumThresholdMs);
    });
  });

  it('refuses a cleared field rather than storing zero', async () => {
    await seed();
    mount();

    await waitFor(() => expect(field('Fast')).toHaveValue('2000'));
    retype('Fast', '');

    expect(field('Fast')).toHaveValue('2000');
    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.settings.fastThresholdMs).toBe(2000);
    });
  });
});

describe('Scope', () => {
  it('changes what is scheduled without touching any item', async () => {
    await seed([{ yy: 12, interval: 9, repetitions: 4, lapses: 2 }]);
    mount();

    const modern = await screen.findByRole('button', { name: /^Modern/ });
    fireEvent.click(modern);

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.settings.scopeId).toBe('modern');
      // Out of scope now, and completely unchanged.
      const item = stored.items[itemKey(12)];
      expect(item.introduced).toBe(true);
      expect(item.interval).toBe(9);
      expect(item.repetitions).toBe(4);
      expect(item.lapses).toBe(2);
      expect(Object.keys(stored.items)).toHaveLength(100);
    });
  });

  it('shows the real item count for each scope', async () => {
    await seed();
    mount();

    expect(await screen.findByRole('button', { name: /^Full/ })).toHaveTextContent(/100\s*codes/);
    expect(screen.getByRole('button', { name: /^Living memory/ })).toHaveTextContent(/75\s*codes/);
    expect(screen.getByRole('button', { name: /^Current era/ })).toHaveTextContent(/50\s*codes/);
  });

  it('clamps a custom range typed out of order', async () => {
    await seed([], { scopeId: 'custom', customScope: { from: 10, to: 20 } });
    mount();

    await waitFor(() => expect(field('From')).toHaveValue('10'));
    retype('From', '60');

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.settings.customScope).toEqual({ from: 20, to: 60 });
    });
  });
});

describe('Reset', () => {
  it('names what is lost and puts everything back to defaults', async () => {
    await seed([{ yy: 12, interval: 30, lapses: 4 }], { newItemsPerDay: 5, hintType: 'anchor' });
    mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Reset progress' }));
    const confirm = await screen.findByRole('button', { name: 'Delete everything' });
    fireEvent.click(confirm);

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.items[itemKey(12)].introduced).toBe(false);
      expect(stored.items[itemKey(12)].interval).toBe(0);
      expect(stored.items[itemKey(12)].lapses).toBe(0);
      expect(stored.settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  it('does nothing when the dialog is cancelled', async () => {
    await seed([{ yy: 12, interval: 30 }]);
    mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Reset progress' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    const stored = await loadAppData();
    expect(stored.items[itemKey(12)].interval).toBe(30);
  });
});

describe('Import', () => {
  it('shows the message the parser wrote when a file is rejected', async () => {
    await seed([{ yy: 12, interval: 30 }]);
    mount();

    await screen.findByRole('button', { name: 'Choose a file' });
    await chooseFile('this is not json');
    fireEvent.click(screen.getByRole('button', { name: 'Replace all data' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That file is not valid JSON.');
    // The rejected file changed nothing.
    const stored = await loadAppData();
    expect(stored.items[itemKey(12)].interval).toBe(30);
  });

  it('names the app when the file came from somewhere else', async () => {
    await seed();
    mount();

    await screen.findByRole('button', { name: 'Choose a file' });
    await chooseFile(JSON.stringify({ app: 'something-else', schemaVersion: 1, data: {} }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace all data' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That file was not exported by Doomsday Trainer.',
    );
  });

  it('replaces everything when the file is good', async () => {
    await seed([{ yy: 12, interval: 30 }]);
    mount();

    const incoming = seedData([{ yy: 88, interval: 4, repetitions: 2 }], { newItemsPerDay: 7 });
    await screen.findByRole('button', { name: 'Choose a file' });
    await chooseFile(serialiseExport(incoming));
    fireEvent.click(screen.getByRole('button', { name: 'Replace all data' }));

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.settings.newItemsPerDay).toBe(7);
      expect(stored.items[itemKey(88)].interval).toBe(4);
      expect(stored.items[itemKey(12)].interval).toBe(0);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Reminders', () => {
  /** Swap the browser out from under the capability store, the way a real one changes. */
  function browser(notification: unknown): void {
    if (notification === null) vi.unstubAllGlobals();
    else vi.stubGlobal('Notification', notification);
    refreshReminderCapability();
  }

  it('offers no switch at all where notifications do not exist', async () => {
    browser(null);
    await seed();
    mount();

    await screen.findByRole('heading', { name: 'Settings' });
    expect(screen.queryByRole('switch', { name: 'Daily reminder' })).not.toBeInTheDocument();
    expect(
      screen.getByText('This browser cannot show notifications, so reminders are not available here.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allow notifications' })).not.toBeInTheDocument();
  });

  it('asks for permission from a button, never a switch, before anything is granted', async () => {
    let asked = 0;
    browser({
      permission: 'default',
      async requestPermission() {
        asked += 1;
        browser({ permission: 'granted', requestPermission: async () => 'granted' });
        return 'granted';
      },
    });
    await seed();
    mount();

    const ask = await screen.findByRole('button', { name: 'Allow notifications' });
    expect(screen.queryByRole('switch', { name: 'Daily reminder' })).not.toBeInTheDocument();
    expect(screen.getByText('Reminders need your permission before anything can be shown.')).toBeInTheDocument();
    // Nothing was asked of the browser on mount.
    expect(asked).toBe(0);

    fireEvent.click(ask);
    await waitFor(() => expect(asked).toBe(1));
    expect(await screen.findByRole('switch', { name: 'Daily reminder' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allow notifications' })).not.toBeInTheDocument();
  });

  it('says a granted reminder only arrives while the app is open', async () => {
    await seed();
    mount();

    await screen.findByRole('switch', { name: 'Daily reminder' });
    expect(
      screen.getByText(/Reminders only appear while the app is open\./),
    ).toBeInTheDocument();
  });

  it('keeps the switch reachable when a reminder is on but the browser has blocked it', async () => {
    browser({ permission: 'denied', requestPermission: async () => 'denied' });
    await seed([], { reminderEnabled: true });
    mount();

    const toggle = await screen.findByRole('switch', { name: 'Daily reminder' });
    expect(toggle).toBeChecked();
    expect(screen.getByText(/Notifications are blocked for this site\./)).toBeInTheDocument();

    fireEvent.click(toggle);
    await waitFor(async () => {
      expect((await loadAppData()).settings.reminderEnabled).toBe(false);
    });
  });
});

describe('Everything else on the screen', () => {
  it('persists the switches and the hint preview choice', async () => {
    await seed();
    mount();

    fireEvent.click(await screen.findByRole('button', { name: /^Arithmetic/ }));
    fireEvent.click(screen.getByRole('switch', { name: 'Daily reminder' }));

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.settings.hintType).toBe('arithmetic');
      expect(stored.settings.reminderEnabled).toBe(true);
    });

    // The time field and the evening switch only exist once reminders are on.
    expect(await screen.findByLabelText('Time')).toHaveValue('19:00');
    fireEvent.click(screen.getByRole('switch', { name: 'Second reminder' }));

    await waitFor(async () => {
      const stored = await loadAppData();
      expect(stored.settings.eveningReminderEnabled).toBe(true);
    });
  });

  it('links back to onboarding without losing progress', async () => {
    await seed();
    mount();

    const link = await screen.findByRole('link', { name: 'Run onboarding again' });
    expect(link).toHaveAttribute('href', '/welcome?rerun=1');
  });
});
