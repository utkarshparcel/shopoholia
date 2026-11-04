/**
 * The real notification adapters (expo-notifications), used by default outside tests.
 *
 * expo-notifications is imported lazily so that screens and tests that never ask for a
 * permission don't load the native module.
 */

import { Platform } from 'react-native';
import type * as ExpoNotifications from 'expo-notifications';

import type { AndroidChannelAdapter, AndroidChannelImportance } from './androidChannels';
import type { PushPermissionAdapter, PushPermissionStatus } from './pushPermission';

type NotificationsModule = typeof ExpoNotifications;

function loadNotifications(): Promise<NotificationsModule> {
  return import('expo-notifications');
}

type PermissionResponse = Awaited<ReturnType<NotificationsModule['getPermissionsAsync']>>;

export function permissionStatusFrom(
  Notifications: Pick<NotificationsModule, 'IosAuthorizationStatus'>,
  permission: PermissionResponse,
): PushPermissionStatus {
  if (
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return 'granted';
  }
  if (permission.status === 'denied') return 'denied';
  return 'undetermined';
}

export const expoPushPermissionAdapter: PushPermissionAdapter = {
  async getStatus() {
    // The web build can't show Closet pushes: report it as not allowed instead of asking.
    if (Platform.OS === 'web') return 'denied';
    const Notifications = await loadNotifications();
    return permissionStatusFrom(Notifications, await Notifications.getPermissionsAsync());
  },
  async requestPermission() {
    if (Platform.OS === 'web') return 'denied';
    const Notifications = await loadNotifications();
    const current = permissionStatusFrom(Notifications, await Notifications.getPermissionsAsync());
    // The OS remembers the answer; only a user who was never asked sees the prompt.
    if (current !== 'undetermined') return current;
    return permissionStatusFrom(Notifications, await Notifications.requestPermissionsAsync());
  },
};

export function androidImportance(
  Notifications: Pick<NotificationsModule, 'AndroidImportance'>,
  importance: AndroidChannelImportance,
) {
  const map = {
    max: Notifications.AndroidImportance.MAX,
    high: Notifications.AndroidImportance.HIGH,
    default: Notifications.AndroidImportance.DEFAULT,
    low: Notifications.AndroidImportance.LOW,
    min: Notifications.AndroidImportance.MIN,
  } as const;
  return map[importance];
}

export const expoAndroidChannelAdapter: AndroidChannelAdapter = {
  async setNotificationChannelAsync(id, config) {
    if (Platform.OS !== 'android') return;
    const Notifications = await loadNotifications();
    await Notifications.setNotificationChannelAsync(id, {
      name: config.name,
      description: config.description,
      importance: androidImportance(Notifications, config.importance),
    });
  },
};
