import { afterEach, describe, expect, it } from 'vitest';
import {
  detectReminderCapability,
  readReminderEnvironment,
  sameCapability,
  type ReminderEnvironment,
} from './capability';

function env(patch: Partial<ReminderEnvironment>): ReminderEnvironment {
  return {
    hasNotification: true,
    permission: 'granted',
    hasServiceWorker: true,
    hasPeriodicSync: true,
    backgroundReminderActive: true,
    standalone: true,
    ...patch,
  };
}

describe('detectReminderCapability', () => {
  it('reports the full arrangement when everything is present', () => {
    const capability = detectReminderCapability(env({}));
    expect(capability.supported).toBe(true);
    expect(capability.canDeliverInBackground).toBe(true);
    expect(capability.reason).toContain('background');
  });

  it('degrades to unsupported without the Notification API', () => {
    const capability = detectReminderCapability(env({ hasNotification: false }));
    expect(capability.supported).toBe(false);
    expect(capability.permission).toBe('denied');
    expect(capability.canDeliverInBackground).toBe(false);
    expect(capability.reason).toBe(
      'This browser cannot show notifications, so reminders are not available here.',
    );
  });

  it('degrades without a service worker', () => {
    const capability = detectReminderCapability(env({ hasServiceWorker: false }));
    expect(capability.supported).toBe(true);
    expect(capability.canDeliverInBackground).toBe(false);
    expect(capability.reason).toContain('only appear while the app is open');
  });

  it('degrades without periodic sync', () => {
    const capability = detectReminderCapability(env({ hasPeriodicSync: false }));
    expect(capability.canDeliverInBackground).toBe(false);
    expect(capability.reason).toContain('no way to wake a closed app');
  });

  it('degrades when the periodic sync exists but no worker handles it', () => {
    const capability = detectReminderCapability(env({ backgroundReminderActive: false }));
    expect(capability.canDeliverInBackground).toBe(false);
    expect(capability.reason).toContain('has not agreed to wake this app');
  });

  it('points at installing when running in a plain tab', () => {
    const capability = detectReminderCapability(
      env({ standalone: false, backgroundReminderActive: false }),
    );
    expect(capability.canDeliverInBackground).toBe(false);
    expect(capability.reason).toContain('home screen');
  });

  it('says permission is still needed before anything else', () => {
    const capability = detectReminderCapability(env({ permission: 'default' }));
    expect(capability.supported).toBe(true);
    expect(capability.permission).toBe('default');
    expect(capability.canDeliverInBackground).toBe(false);
    expect(capability.reason).toContain('permission');
  });

  it('explains a block rather than offering to ask again', () => {
    const capability = detectReminderCapability(env({ permission: 'denied' }));
    expect(capability.supported).toBe(true);
    expect(capability.canDeliverInBackground).toBe(false);
    expect(capability.reason).toContain('blocked');
  });

  it('never claims background delivery without permission', () => {
    for (const permission of ['default', 'denied'] as const) {
      expect(detectReminderCapability(env({ permission })).canDeliverInBackground).toBe(false);
    }
  });

  it('always mentions the in-app fallback when delivery is foreground only', () => {
    const degraded: Partial<ReminderEnvironment>[] = [
      { hasServiceWorker: false },
      { hasPeriodicSync: false },
      { backgroundReminderActive: false },
      { backgroundReminderActive: false, standalone: false },
    ];
    for (const patch of degraded) {
      expect(detectReminderCapability(env(patch)).reason).toContain('next time you open it');
    }
  });

  it('never uses an exclamation mark or a gamified word', () => {
    const all: Partial<ReminderEnvironment>[] = [
      {},
      { hasNotification: false },
      { permission: 'default' },
      { permission: 'denied' },
      { hasServiceWorker: false },
      { hasPeriodicSync: false },
      { backgroundReminderActive: false },
      { backgroundReminderActive: false, standalone: false },
    ];
    for (const patch of all) {
      const { reason } = detectReminderCapability(env(patch));
      expect(reason).not.toContain('!');
      expect(reason.toLowerCase()).not.toMatch(/streak|don't break|keep it up/);
    }
  });
});

describe('readReminderEnvironment', () => {
  const globals = globalThis as Record<string, unknown>;

  afterEach(() => {
    delete globals.Notification;
    delete globals.ServiceWorkerRegistration;
  });

  it('reports nothing available in a runtime with none of the APIs', () => {
    // jsdom ships no Notification, no serviceWorker and no registration type.
    const environment = readReminderEnvironment(true);
    expect(environment.hasNotification).toBe(false);
    expect(environment.hasServiceWorker).toBe(false);
    expect(environment.hasPeriodicSync).toBe(false);
    expect(environment.permission).toBe('denied');
    expect(detectReminderCapability(environment).supported).toBe(false);
  });

  it('reads the permission from the Notification API when it exists', () => {
    globals.Notification = { permission: 'granted' };
    expect(readReminderEnvironment(false).permission).toBe('granted');
    globals.Notification = { permission: 'default' };
    expect(readReminderEnvironment(false).permission).toBe('default');
  });

  it('detects periodic sync from the registration prototype', () => {
    class FakeRegistration {}
    globals.ServiceWorkerRegistration = FakeRegistration;
    expect(readReminderEnvironment(false).hasPeriodicSync).toBe(false);

    Object.defineProperty(FakeRegistration.prototype, 'periodicSync', { value: {} });
    expect(readReminderEnvironment(false).hasPeriodicSync).toBe(true);
  });
});

describe('sameCapability', () => {
  it('compares every field that a consumer renders', () => {
    const a = detectReminderCapability(env({}));
    expect(sameCapability(a, detectReminderCapability(env({})))).toBe(true);
    expect(sameCapability(a, detectReminderCapability(env({ permission: 'default' })))).toBe(false);
    expect(sameCapability(a, detectReminderCapability(env({ backgroundReminderActive: false })))).toBe(
      false,
    );
  });
});
