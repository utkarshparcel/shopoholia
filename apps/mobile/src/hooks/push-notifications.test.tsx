import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as PushLib from '@/src/lib/push-notifications';
import { useSessionStore } from '@/src/stores/session';
import { usePushNotifications } from './push-notifications';

const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

const notifications = vi.hoisted(() => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationHandler: vi.fn(),
  getLastNotificationResponse: vi.fn(),
  clearLastNotificationResponse: vi.fn(),
  addNotificationResponseReceivedListener: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));
const registration = vi.hoisted(() => ({ syncPushRegistration: vi.fn() }));
const analytics = vi.hoisted(() => ({ trackEvent: vi.fn() }));

vi.mock('expo-notifications', () => notifications);
vi.mock('expo-router', () => ({ router }));
vi.mock('expo', () => ({ isRunningInExpoGo: () => false }));
vi.mock('expo-constants', () => ({ default: {} }));
vi.mock('@/src/api/client', () => ({}));
vi.mock('@/src/lib/analytics', () => analytics);
// The real deep-link mapping; only the registration calls are stubbed.
vi.mock('@/src/lib/push-notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof PushLib>()),
  syncPushRegistration: registration.syncPushRegistration,
}));

const ORDER_ID = '22222222-2222-4222-8222-222222222222';

function tap(deepLink: string, identifier = 'push-1', actionIdentifier = DEFAULT_ACTION) {
  return {
    actionIdentifier,
    notification: {
      request: {
        identifier,
        content: { title: 'Your haul is here', data: { deepLink, orderId: ORDER_ID } },
      },
    },
  };
}

function signIn() {
  act(() => {
    useSessionStore.getState().setSession({ accessToken: 'access-token', refreshToken: 'r' });
  });
}

let onTap: (response: unknown) => void;

beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.getState().clear();
  notifications.getLastNotificationResponse.mockReturnValue(null);
  notifications.addNotificationResponseReceivedListener.mockImplementation((listener) => {
    onTap = listener;
    return { remove: vi.fn() };
  });
});

afterEach(() => {
  useSessionStore.getState().clear();
});

describe('usePushNotifications', () => {
  it('shows pushes that arrive while the app is open', async () => {
    renderHook(() => usePushNotifications());

    const handler = notifications.setNotificationHandler.mock.calls[0]![0];
    await expect(handler.handleNotification()).resolves.toMatchObject({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
    });
  });

  it('opens the order when a push is tapped while signed in', () => {
    signIn();
    renderHook(() => usePushNotifications());

    act(() => onTap(tap(`worn://order/${ORDER_ID}`)));

    expect(router.push).toHaveBeenCalledWith(`/order/${ORDER_ID}`);
    expect(notifications.clearLastNotificationResponse).toHaveBeenCalled();
    expect(analytics.trackEvent).toHaveBeenCalledWith('push_opened', {
      screen: 'order',
      orderId: ORDER_ID,
    });
  });

  it('opens the reveal from the push that launched the app, once the user signs in', () => {
    notifications.getLastNotificationResponse.mockReturnValue(tap(`worn://reveal/${ORDER_ID}`));
    renderHook(() => usePushNotifications());
    expect(router.push).not.toHaveBeenCalled();

    signIn();

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(`/reveal/${ORDER_ID}`);
  });

  it('opens a launch push only once, even if the listener also delivers it', () => {
    signIn();
    notifications.getLastNotificationResponse.mockReturnValue(tap(`worn://order/${ORDER_ID}`));
    renderHook(() => usePushNotifications());

    act(() => onTap(tap(`worn://order/${ORDER_ID}`)));

    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('ignores pushes that point nowhere in the app, and non-tap actions', () => {
    signIn();
    renderHook(() => usePushNotifications());

    act(() => onTap(tap('https://example.com/promo', 'push-2')));
    act(() => onTap(tap(`worn://order/${ORDER_ID}`, 'push-3', 'custom-action')));

    expect(router.push).not.toHaveBeenCalled();
  });

  it('keeps the device registration in step with the session', () => {
    renderHook(() => usePushNotifications());
    signIn();
    act(() => useSessionStore.getState().clear());

    expect(registration.syncPushRegistration.mock.calls).toEqual([
      [null],
      ['access-token'],
      [null],
    ]);
  });
});
