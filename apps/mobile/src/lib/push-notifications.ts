import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { clearPushToken, registerPushToken } from '@/src/api/client';
import { userIdFromAccessToken } from '@/src/lib/access-token';
import { trackEvent } from '@/src/lib/analytics';
import { onBeforeSignOut } from '@/src/lib/signOut';
import { useSessionStore } from '@/src/stores/session';

/** Where a tapped push leads: the order tracker, or the reveal once the haul is here. */
export type PushTarget = {
  screen: 'order' | 'reveal';
  orderId: string;
  href: string;
};

const WORN_LINK = /^worn:\/\/(order|reveal)\/([^/?#]+)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pushes sent without a channelId land in Expo's "default" channel; this gives it a name.
const ANDROID_CHANNEL_ID = 'default';

/** Maps a push's data (`worn://order/:id` or `worn://reveal/:orderId`) to the screen to open. */
export function pushTargetFromData(data: unknown): PushTarget | null {
  if (!data || typeof data !== 'object') return null;
  const { deepLink, screen, orderId } = data as Record<string, unknown>;
  const link = typeof deepLink === 'string' ? WORN_LINK.exec(deepLink) : null;
  const target = link ? link[1] : screen;
  const id = link ? link[2] : orderId;
  if ((target !== 'order' && target !== 'reveal') || typeof id !== 'string' || !UUID.test(id)) {
    return null;
  }
  return { screen: target, orderId: id, href: `/${target}/${id}` };
}

/** Remote pushes need a native build: not web, and not Expo Go on Android (SDK 53+). */
export function canReceivePushes() {
  if (Platform.OS === 'web') return false;
  return !(Platform.OS === 'android' && isRunningInExpoGo());
}

async function notificationsAllowed() {
  let permission = await Notifications.getPermissionsAsync();
  // Only a user who was never asked gets the prompt; the OS remembers the answer after that.
  if (permission.status === Notifications.PermissionStatus.UNDETERMINED) {
    permission = await Notifications.requestPermissionsAsync();
    trackEvent('push_permission', { granted: permission.granted });
  }
  return (
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

/**
 * Registers this device's Expo push token for the signed-in user, asking for notification
 * permission the first time. Returns the token, or null when pushes aren't available here,
 * aren't allowed, or the app config has no EAS projectId.
 */
export async function registerForPushNotifications(accessToken: string): Promise<string | null> {
  if (!canReceivePushes()) return null;

  const projectId: string | undefined =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    if (__DEV__) console.warn('[push] No EAS projectId in the app config; not registering.');
    return null;
  }

  if (Platform.OS === 'android') {
    // Android 13+ only shows the permission prompt once a channel exists.
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Order updates',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  if (!(await notificationsAllowed())) return null;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerPushToken(accessToken, token);
  return token;
}

let registered: { accessToken: string; token: string } | null = null;
let queue: Promise<void> = Promise.resolve();
/** Sync calls queued or running. */
let pending = 0;

/**
 * Keeps the device's push registration in step with the session: registers after sign-in and
 * clears the token after sign-out. Calls run in order, so a quick sign-out can't overtake the
 * registration it undoes.
 */
export function syncPushRegistration(accessToken: string | null): Promise<void> {
  pending += 1;
  queue = queue
    .then(async () => {
      if (accessToken) {
        // A renewed token for the same user skips re-registering; sign-out clears with the newest.
        const userId = userIdFromAccessToken(accessToken);
        if (registered && userId && userId === userIdFromAccessToken(registered.accessToken)) {
          registered = { accessToken, token: registered.token };
          return;
        }
        const token = await registerForPushNotifications(accessToken);
        if (token) registered = { accessToken, token };
      } else if (registered) {
        const previous = registered;
        registered = null;
        // The session's current token when there still is one (sign-out runs this first).
        await clearPushToken(
          useSessionStore.getState().accessToken ?? previous.accessToken,
          previous.token,
        );
      }
    })
    .catch((error: unknown) => {
      if (__DEV__) console.warn('[push]', error instanceof Error ? error.message : error);
    })
    .finally(() => {
      pending -= 1;
    });
  return queue;
}

/**
 * Sign-out unregisters this device's push token first, while the session can still sign (and if
 * need be renew) the request. Clearing it after the session was gone sent the last saved access
 * token, usually expired by then: the server answered 401, nothing could renew it, and the
 * signed-out device kept getting the previous user's order pushes.
 */
export function unregisterPushBeforeSignOut(): Promise<void> | null {
  if (!registered && pending === 0) return null;
  return syncPushRegistration(null);
}

onBeforeSignOut(unregisterPushBeforeSignOut);
