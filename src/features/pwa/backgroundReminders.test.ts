import { afterEach, describe, expect, it } from 'vitest';
import {
  REMINDER_PROBE_REPLY,
  REMINDER_PROBE_REQUEST,
  REMINDER_SYNC_TAG,
  activateBackgroundReminders,
} from './backgroundReminders';

/**
 * Everything this module touches is absent in jsdom, which is the point: the
 * common case in a real browser is that most of it is absent too.
 */

const globals = globalThis as Record<string, unknown>;

interface FakeOptions {
  permissionState?: PermissionState;
  permissionThrows?: boolean;
  periodicSync?: boolean;
  registerThrows?: boolean;
  existingTags?: string[];
  activeWorker?: boolean;
  workerReplies?: boolean;
}

const registered: string[] = [];

function install(options: FakeOptions): void {
  globals.Notification = { permission: 'granted' };

  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: {
      query: async () => {
        if (options.permissionThrows) throw new Error('unknown permission name');
        return { state: options.permissionState ?? 'granted' };
      },
    },
  });

  const worker = options.activeWorker
    ? {
        postMessage(data: { type?: string }, transfer: MessagePort[]) {
          if (!options.workerReplies) return;
          if (data.type !== REMINDER_PROBE_REQUEST) return;
          transfer[0].postMessage({ type: REMINDER_PROBE_REPLY });
        },
      }
    : null;

  const registration: Record<string, unknown> = { active: worker };
  if (options.periodicSync !== false) {
    registration.periodicSync = {
      getTags: async () => options.existingTags ?? [],
      register: async (tag: string) => {
        if (options.registerThrows) throw new Error('permission denied');
        registered.push(tag);
      },
    };
  }

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve(registration) },
  });
}

afterEach(() => {
  registered.length = 0;
  delete globals.Notification;
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(navigator, 'permissions');
});

describe('activateBackgroundReminders', () => {
  it('is false when the browser has no service worker at all', async () => {
    globals.Notification = { permission: 'granted' };
    await expect(activateBackgroundReminders()).resolves.toBe(false);
  });

  it('is false without the Notification API', async () => {
    install({ activeWorker: true, workerReplies: true });
    delete globals.Notification;
    await expect(activateBackgroundReminders()).resolves.toBe(false);
  });

  it('is false before notification permission is granted', async () => {
    install({ activeWorker: true, workerReplies: true });
    globals.Notification = { permission: 'default' };
    await expect(activateBackgroundReminders()).resolves.toBe(false);
  });

  it('is false when the periodic sync permission is not granted', async () => {
    install({ activeWorker: true, workerReplies: true, permissionState: 'prompt' });
    await expect(activateBackgroundReminders()).resolves.toBe(false);
  });

  it('is false when the browser does not know the permission name', async () => {
    install({ activeWorker: true, workerReplies: true, permissionThrows: true });
    await expect(activateBackgroundReminders()).resolves.toBe(false);
  });

  it('is false when the registration has no periodicSync', async () => {
    install({ activeWorker: true, workerReplies: true, periodicSync: false });
    await expect(activateBackgroundReminders()).resolves.toBe(false);
  });

  it('is false when registering the job is refused', async () => {
    install({ activeWorker: true, workerReplies: true, registerThrows: true });
    await expect(activateBackgroundReminders()).resolves.toBe(false);
  });

  it('is false when no worker is active yet', async () => {
    install({ activeWorker: false });
    await expect(activateBackgroundReminders()).resolves.toBe(false);
  });

  it('is false when the worker does not answer the probe', async () => {
    install({ activeWorker: true, workerReplies: false });
    await expect(activateBackgroundReminders()).resolves.toBe(false);
    expect(registered).toEqual([REMINDER_SYNC_TAG]);
  });

  it('is true only when the worker answers', async () => {
    install({ activeWorker: true, workerReplies: true });
    await expect(activateBackgroundReminders()).resolves.toBe(true);
    expect(registered).toEqual([REMINDER_SYNC_TAG]);
  });

  it('does not register the job twice', async () => {
    install({ activeWorker: true, workerReplies: true, existingTags: [REMINDER_SYNC_TAG] });
    await expect(activateBackgroundReminders()).resolves.toBe(true);
    expect(registered).toEqual([]);
  });
});
