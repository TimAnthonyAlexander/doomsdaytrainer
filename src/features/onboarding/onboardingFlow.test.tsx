import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Settings } from '@/domain/types';
import { WelcomeScreen } from '@/routes/WelcomeScreen';
import { AppStateGate, AppStateProvider } from '@/state/AppStateProvider';
import { useAppState } from '@/state/useAppState';
import { closeDb, loadAppData, saveAppData } from '@/storage/db';
import { defaultAppData } from '@/storage/defaults';
import { theme } from '@/theme/theme';

/** Renders the live settings document so assertions read what was persisted. */
function SettingsProbe() {
  const { settings } = useAppState();
  return <div data-testid="settings">{JSON.stringify(settings)}</div>;
}

function persistedSettings(): Settings {
  return JSON.parse(screen.getByTestId('settings').textContent ?? '{}') as Settings;
}

async function deleteDb(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('doomsday-trainer');
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function seedSettings(patch: Partial<Settings>): Promise<void> {
  const data = defaultAppData(1000);
  data.settings = { ...data.settings, ...patch };
  await saveAppData(data);
  await closeDb();
}

async function mount(entry = '/welcome') {
  const user = userEvent.setup();
  render(
    <ThemeProvider theme={theme}>
      <AppStateProvider>
        <AppStateGate>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path="/welcome" element={<WelcomeScreen />} />
              <Route path="/year-codes/learn" element={<div>learn screen</div>} />
              <Route path="/" element={<div>weekday screen</div>} />
            </Routes>
          </MemoryRouter>
          <SettingsProbe />
        </AppStateGate>
      </AppStateProvider>
    </ThemeProvider>,
  );
  await screen.findByTestId('settings');
  return { user };
}

const heading = (name: string | RegExp) => screen.queryByRole('heading', { name });
const button = (name: string | RegExp) => screen.getByRole('button', { name });

beforeEach(deleteDb);

describe('onboarding flow', () => {
  it('writes every choice at the end and finishes on learn', async () => {
    const { user } = await mount();

    expect(heading('100 number pairs')).not.toBeNull();
    await user.click(button('Next'));
    expect(heading('Where the codes come from')).not.toBeNull();

    await user.click(button('Next'));
    await user.click(button('0 = Monday'));
    await user.click(button('Next'));

    await user.click(button(/Custom range/));
    const from = screen.getByLabelText('From');
    const to = screen.getByLabelText('To');
    await user.clear(from);
    await user.type(from, '250');
    await user.clear(to);
    await user.type(to, '12');

    // Two digits maximum: "250" can never become year 250.
    expect(from).toHaveValue('25');

    await user.click(button('Next'));
    await user.click(button('Next'));

    expect(await screen.findByText('learn screen')).toBeInTheDocument();

    const settings = persistedSettings();
    expect(settings.onboardingComplete).toBe(true);
    expect(settings.indexConvention).toBe('monday');
    expect(settings.scopeId).toBe('custom');
    // Typed high-to-low, stored low-to-high.
    expect(settings.customScope).toEqual({ from: 12, to: 25 });
    // Untouched settings survive the single patch.
    expect(settings.newItemsPerDay).toBe(20);
  });

  it('keeps the defaults when the user only taps through', async () => {
    const { user } = await mount();
    await user.click(button('Next'));
    await user.click(button('Skip'));
    await user.click(button('Next'));
    await user.click(button('Next'));
    await user.click(button('Next'));

    await screen.findByText('learn screen');
    const settings = persistedSettings();
    expect(settings.indexConvention).toBe('sunday');
    expect(settings.scopeId).toBe('full');
    expect(settings.onboardingComplete).toBe(true);
  });

  it('skips the arithmetic screen straight to the index choice', async () => {
    const { user } = await mount();
    await user.click(button('Next'));
    await user.click(button('Skip'));

    expect(heading('Which day is code 0?')).not.toBeNull();
    expect(heading('Where the codes come from')).toBeNull();
    expect(screen.getByRole('group', { name: 'Step 3 of 5' })).toBeInTheDocument();
  });

  it('holds the year codes still while the weekday names change', async () => {
    const { user } = await mount();
    await user.click(button('Next'));
    await user.click(button('Skip'));

    // 20 → 4 and 44 → 6, whichever convention is selected.
    expect(screen.getByText('Thursday')).toBeInTheDocument();
    await user.click(button('0 = Monday'));
    expect(screen.getByText('Friday')).toBeInTheDocument();
    expect(screen.queryByText('Thursday')).toBeNull();
  });

  it('preserves choices when the user goes back', async () => {
    const { user } = await mount();
    await user.click(button('Next'));
    await user.click(button('Next'));
    await user.click(button('0 = Monday'));
    await user.click(button('Next'));
    await user.click(button(/Living memory/));

    await user.click(button('Back'));
    expect(button('0 = Monday')).toHaveAttribute('aria-pressed', 'true');

    await user.click(button('Back'));
    expect(heading('Where the codes come from')).not.toBeNull();

    await user.click(button('Next'));
    expect(button('0 = Monday')).toHaveAttribute('aria-pressed', 'true');
    await user.click(button('Next'));
    expect(button(/Living memory/)).toHaveAttribute('aria-pressed', 'true');

    await user.click(button('Next'));
    await user.click(button('Next'));
    await screen.findByText('learn screen');
    expect(persistedSettings().scopeId).toBe('living');
    expect(persistedSettings().indexConvention).toBe('monday');
  });

  it('shows each scope its own code count', async () => {
    const { user } = await mount();
    await user.click(button('Next'));
    await user.click(button('Skip'));
    await user.click(button('Next'));

    expect(button(/Full/).textContent).toContain('100 codes');
    expect(button(/Living memory/).textContent).toContain('75 codes');
    expect(button(/Modern/).textContent).toContain('50 codes');

    await user.click(button(/Custom range/));
    const from = screen.getByLabelText('From');
    await user.clear(from);
    await user.type(from, '95');
    expect(button(/Custom range/).textContent).toContain('5 codes');
  });

  it('leaves onboarding alone until the last step', async () => {
    const { user } = await mount();
    await user.click(button('Next'));
    await user.click(button('Next'));
    await user.click(button('0 = Monday'));

    // Nothing is committed mid-run: an abandoned flow starts clean next time.
    const settings = persistedSettings();
    expect(settings.onboardingComplete).toBe(false);
    expect(settings.indexConvention).toBe('sunday');
  });

  it('redirects away when onboarding is already complete', async () => {
    await seedSettings({ onboardingComplete: true });
    await mount();

    expect(await screen.findByText('weekday screen')).toBeInTheDocument();
    expect(heading('100 number pairs')).toBeNull();
  });

  it('runs again on request and starts from the stored settings', async () => {
    await seedSettings({
      onboardingComplete: true,
      indexConvention: 'monday',
      scopeId: 'custom',
      customScope: { from: 30, to: 40 },
    });
    const { user } = await mount('/welcome?rerun=1');

    expect(heading('100 number pairs')).not.toBeNull();
    await user.click(button('Next'));
    await user.click(button('Skip'));
    expect(button('0 = Monday')).toHaveAttribute('aria-pressed', 'true');

    await user.click(button('Next'));
    expect(button(/Custom range/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('From')).toHaveValue('30');
    expect(screen.getByLabelText('To')).toHaveValue('40');
  });
});

type User = ReturnType<typeof userEvent.setup>;

/** The four choice steps, tapped through, leaving the explainer on screen. */
async function reachMethod(user: User, convention: 'sunday' | 'monday' = 'sunday'): Promise<void> {
  await user.click(button('Next'));
  await user.click(button('Skip'));
  if (convention === 'monday') await user.click(button('0 = Monday'));
  await user.click(button('Next'));
  await user.click(button('Next'));
}

describe('the explainer at the end of onboarding', () => {
  it('is the last step, and the only thing on it', async () => {
    const { user } = await mount();
    await reachMethod(user);

    expect(heading('How it works')).not.toBeNull();
    expect(screen.getByRole('group', { name: 'Step 5 of 5' })).toBeInTheDocument();

    // The guided walk lives on `/concept` and no longer stands between the
    // reader and the app: neither the button that starts it nor anything it
    // draws is on this screen.
    expect(screen.queryByRole('button', { name: 'Try one yourself' })).toBeNull();
    expect(heading('One whole date')).toBeNull();
    expect(screen.queryByLabelText('Date')).toBeNull();
    expect(screen.queryByRole('progressbar', { name: 'Steps done' })).toBeNull();
  });

  it('writes nothing until its button, then commits the whole run', async () => {
    const { user } = await mount();
    await reachMethod(user, 'monday');

    const before = JSON.stringify(await loadAppData());
    expect(persistedSettings().onboardingComplete).toBe(false);
    expect(JSON.stringify(await loadAppData())).toBe(before);

    await user.click(button('Next'));
    await screen.findByText('learn screen');

    const settings = persistedSettings();
    expect(settings.indexConvention).toBe('monday');
    expect(settings.onboardingComplete).toBe(true);
  });
});
