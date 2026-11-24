import { Platform } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const n = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(async () => null),
}));

vi.mock('expo-notifications', () => ({
  ...n,
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3 },
  AndroidImportance: { MIN: 3, LOW: 4, DEFAULT: 5, HIGH: 6, MAX: 7 },
}));

import { ensureAndroidNotificationChannels } from './androidChannels';
import { requestPushPermission, setPushPermissionAdapter } from './pushPermission';

const undetermined = { granted: false, status: 'undetermined', canAskAgain: true };
const granted = { granted: true, status: 'granted', canAskAgain: true };
const denied = { granted: false, status: 'denied', canAskAgain: false };

const originalOS = Platform.OS;

beforeEach(() => {
  setPushPermissionAdapter(null);
  n.getPermissionsAsync.mockReset();
  n.requestPermissionsAsync.mockReset();
  n.setNotificationChannelAsync.mockClear();
  (Platform as { OS: string }).OS = 'ios';
});

afterEach(() => {
  (Platform as { OS: string }).OS = originalOS;
});

describe('default push permission adapter (S2-08)', () => {
  it('shows the OS prompt and reports its answer instead of granting silently', async () => {
    n.getPermissionsAsync.mockResolvedValue(undetermined);
    n.requestPermissionsAsync.mockResolvedValue(denied);
    expect(await requestPushPermission()).toBe('denied');
    expect(n.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('does not prompt again once the user answered', async () => {
    n.getPermissionsAsync.mockResolvedValue(granted);
    expect(await requestPushPermission()).toBe('granted');
    expect(n.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('reports denied on web, where Closet pushes cannot arrive', async () => {
    (Platform as { OS: string }).OS = 'web';
    expect(await requestPushPermission()).toBe('denied');
    expect(n.getPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('default Android channel adapter (S2-08)', () => {
  it('creates the Closet channels through expo-notifications on Android', async () => {
    (Platform as { OS: string }).OS = 'android';
    const channels = await ensureAndroidNotificationChannels();
    expect(n.setNotificationChannelAsync).toHaveBeenCalledTimes(channels.length);
    const returns = channels.find((c) => c.id === 'worn-returns')!;
    expect(n.setNotificationChannelAsync).toHaveBeenCalledWith(
      'worn-returns',
      expect.objectContaining({ name: returns.name, importance: 6 }),
    );
  });
});
