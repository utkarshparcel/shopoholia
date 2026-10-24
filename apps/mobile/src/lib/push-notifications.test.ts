import { Platform } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notifications = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3 },
  AndroidImportance: { HIGH: 6 },
}));
const constants = vi.hoisted(() => ({
  expoConfig: null as { extra?: { eas?: { projectId?: string } } } | null,
  easConfig: null as { projectId?: string } | null,
}));
const expo = vi.hoisted(() => ({ isRunningInExpoGo: vi.fn(() => false) }));
const api = vi.hoisted(() => ({ registerPushToken: vi.fn(), clearPushToken: vi.fn() }));
const analytics = vi.hoisted(() => ({ trackEvent: vi.fn() }));

vi.mock('expo-notifications', () => notifications);
vi.mock('expo-constants', () => ({ default: constants }));
vi.mock('expo', () => expo);
vi.mock('@/src/api/client', () => api);
vi.mock('@/src/lib/analytics', () => analytics);

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const EXPO_TOKEN = 'ExponentPushToken[abcdefghijklmnopqrstuv]';

function permission(status: 'granted' | 'undetermined' | 'denied', iosStatus?: number) {
  return {
    status,
    granted: status === 'granted',
    canAskAgain: status !== 'denied',
    expires: 'never',
    ...(iosStatus === undefined ? {} : { ios: { status: iosStatus } }),
  };
}

// Fresh module state (the registered token and call queue) for every test.
async function loadPush() {
  vi.resetModules();
  return import('./push-notifications');
}

beforeEach(() => {
  vi.clearAllMocks();
  constants.expoConfig = { extra: { eas: { projectId: 'eas-project-id' } } };
  constants.easConfig = null;
  notifications.getPermissionsAsync.mockResolvedValue(permission('granted'));
  notifications.requestPermissionsAsync.mockResolvedValue(permission('granted'));
  notifications.getExpoPushTokenAsync.mockResolvedValue({ type: 'expo', data: EXPO_TOKEN });
  api.registerPushToken.mockResolvedValue({ registered: true });
  api.clearPushToken.mockResolvedValue({ registered: false });
});

afterEach(() => {
  (Platform as { OS: string }).OS = 'ios';
});

describe('pushTargetFromData', () => {
  it('opens the order tracker for order-step pushes', async () => {
    const { pushTargetFromData } = await loadPush();

    expect(
      pushTargetFromData({ deepLink: `worn://order/${ORDER_ID}`, screen: 'order', orderId: ORDER_ID }),
    ).toEqual({ screen: 'order', orderId: ORDER_ID, href: `/order/${ORDER_ID}` });
  });

  it('opens the reveal for "Your haul is here"', async () => {
    const { pushTargetFromData } = await loadPush();

    expect(pushTargetFromData({ deepLink: `worn://reveal/${ORDER_ID}` })).toEqual({
      screen: 'reveal',
      orderId: ORDER_ID,
      href: `/reveal/${ORDER_ID}`,
    });
  });

  it('falls back to screen and orderId without a deep link', async () => {
    const { pushTargetFromData } = await loadPush();

    expect(pushTargetFromData({ screen: 'reveal', orderId: ORDER_ID })?.href).toBe(
      `/reveal/${ORDER_ID}`,
    );
  });

  it.each([
    null,
    'worn://order/x',
    {},
    { deepLink: `https://example.com/order/${ORDER_ID}` },
    { deepLink: `worn://settings/${ORDER_ID}` },
    { deepLink: 'worn://order/../../(auth)/login' },
    { deepLink: `worn://order/${ORDER_ID}?next=/cart` },
    { screen: 'cart', orderId: ORDER_ID },
    { screen: 'order', orderId: 'not-an-order-id' },
  ])('ignores %j', async (data) => {
    const { pushTargetFromData } = await loadPush();

    expect(pushTargetFromData(data)).toBeNull();
  });
});

describe('registerForPushNotifications', () => {
  it('asks once, then registers the Expo push token with the API', async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission('undetermined'));
    const { registerForPushNotifications } = await loadPush();

    await expect(registerForPushNotifications('access-token')).resolves.toBe(EXPO_TOKEN);

    expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(analytics.trackEvent).toHaveBeenCalledWith('push_permission', { granted: true });
    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'eas-project-id',
    });
    expect(api.registerPushToken).toHaveBeenCalledWith('access-token', EXPO_TOKEN);
  });

  it('registers without prompting when notifications are already allowed', async () => {
    const { registerForPushNotifications } = await loadPush();

    await registerForPushNotifications('access-token');

    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(api.registerPushToken).toHaveBeenCalledWith('access-token', EXPO_TOKEN);
  });

  it("doesn't ask again after the user said no", async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission('denied'));
    const { registerForPushNotifications } = await loadPush();

    await expect(registerForPushNotifications('access-token')).resolves.toBeNull();

    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(api.registerPushToken).not.toHaveBeenCalled();
  });

  it('registers with provisional (quiet) permission on iOS', async () => {
    notifications.getPermissionsAsync.mockResolvedValue(
      permission('denied', notifications.IosAuthorizationStatus.PROVISIONAL),
    );
    const { registerForPushNotifications } = await loadPush();

    await expect(registerForPushNotifications('access-token')).resolves.toBe(EXPO_TOKEN);
  });

  it('uses the EAS build projectId when the app config has none', async () => {
    constants.expoConfig = { extra: {} };
    constants.easConfig = { projectId: 'build-project-id' };
    const { registerForPushNotifications } = await loadPush();

    await registerForPushNotifications('access-token');

    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'build-project-id',
    });
  });

  it('skips registration, without prompting, when there is no projectId', async () => {
    constants.expoConfig = { extra: {} };
    notifications.getPermissionsAsync.mockResolvedValue(permission('undetermined'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { registerForPushNotifications } = await loadPush();

    await expect(registerForPushNotifications('access-token')).resolves.toBeNull();

    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(api.registerPushToken).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('creates the Android channel before asking, so the prompt can appear', async () => {
    (Platform as { OS: string }).OS = 'android';
    notifications.getPermissionsAsync.mockResolvedValue(permission('undetermined'));
    const { registerForPushNotifications } = await loadPush();

    await registerForPushNotifications('access-token');

    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith('default', {
      name: 'Order updates',
      importance: notifications.AndroidImportance.HIGH,
    });
    expect(notifications.setNotificationChannelAsync.mock.invocationCallOrder[0]).toBeLessThan(
      notifications.requestPermissionsAsync.mock.invocationCallOrder[0]!,
    );
  });

  it.each([
    ['web', false],
    ['android', true],
  ])('does nothing on %s (Expo Go: %s)', async (os, inExpoGo) => {
    (Platform as { OS: string }).OS = os;
    expo.isRunningInExpoGo.mockReturnValue(inExpoGo);
    const { registerForPushNotifications } = await loadPush();

    await expect(registerForPushNotifications('access-token')).resolves.toBeNull();

    expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expo.isRunningInExpoGo.mockReturnValue(false);
  });
});

describe('syncPushRegistration', () => {
  it('registers after sign-in and clears that token on sign-out', async () => {
    const { syncPushRegistration } = await loadPush();

    await syncPushRegistration('access-token');
    expect(api.registerPushToken).toHaveBeenCalledWith('access-token', EXPO_TOKEN);

    await syncPushRegistration(null);
    expect(api.clearPushToken).toHaveBeenCalledWith('access-token', EXPO_TOKEN);

    // Signing out again has nothing left to clear.
    await syncPushRegistration(null);
    expect(api.clearPushToken).toHaveBeenCalledTimes(1);
  });

  it('has nothing to clear when the device never registered', async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission('denied'));
    const { syncPushRegistration } = await loadPush();

    await syncPushRegistration('access-token');
    await syncPushRegistration(null);

    expect(api.clearPushToken).not.toHaveBeenCalled();
  });

  it('lets a quick sign-out finish the sign-in registration first, then clears it', async () => {
    let finishRegistering!: () => void;
    api.registerPushToken.mockReturnValue(
      new Promise((resolve) => {
        finishRegistering = () => resolve({ registered: true });
      }),
    );
    const { syncPushRegistration } = await loadPush();

    void syncPushRegistration('access-token');
    const signedOut = syncPushRegistration(null);
    await vi.waitFor(() => expect(api.registerPushToken).toHaveBeenCalled());
    expect(api.clearPushToken).not.toHaveBeenCalled();

    finishRegistering();
    await signedOut;
    expect(api.clearPushToken).toHaveBeenCalledWith('access-token', EXPO_TOKEN);
  });

  it('keeps working after a registration fails', async () => {
    api.registerPushToken.mockRejectedValueOnce(new Error('offline'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { syncPushRegistration } = await loadPush();

    await expect(syncPushRegistration('access-token')).resolves.toBeUndefined();
    await syncPushRegistration(null);
    expect(api.clearPushToken).not.toHaveBeenCalled();

    await syncPushRegistration('next-access-token');
    expect(api.registerPushToken).toHaveBeenLastCalledWith('next-access-token', EXPO_TOKEN);
    warn.mockRestore();
  });
});
