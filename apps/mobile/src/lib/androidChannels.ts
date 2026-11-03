/**
 * Android notification channels for Closet pushes (NOTIF-RICH).
 *
 * Channel IDs must match `@worn/shared` ANDROID_NOTIFICATION_CHANNELS.
 * By default channels are created through expo-notifications; tests switch to the memory stub
 * with `resetAndroidChannelStub`.
 */

import {
  ANDROID_NOTIFICATION_CHANNELS,
  type AndroidNotificationChannel,
  type NotificationCategory,
} from '@worn/shared';

import { expoAndroidChannelAdapter } from './expoNotificationAdapters';

export type AndroidChannelImportance = AndroidNotificationChannel['importance'];

export type AndroidChannelAdapter = {
  setNotificationChannelAsync(
    id: string,
    config: {
      name: string;
      description: string;
      importance: AndroidChannelImportance;
    },
  ): Promise<void>;
};

let adapter: AndroidChannelAdapter | null = null;

const memoryStub = (() => {
  const created = new Map<string, AndroidNotificationChannel>();
  return {
    async setNotificationChannelAsync(
      id: string,
      config: {
        name: string;
        description: string;
        importance: AndroidChannelImportance;
      },
    ) {
      created.set(id, { id, ...config });
    },
    _list(): AndroidNotificationChannel[] {
      return [...created.values()];
    },
    _reset() {
      created.clear();
    },
  };
})();

export function setAndroidChannelAdapter(next: AndroidChannelAdapter | null): void {
  adapter = next;
}

export function getAndroidChannelAdapter(): AndroidChannelAdapter {
  return adapter ?? expoAndroidChannelAdapter;
}

/** Test helper — reset the memory stub and use it instead of expo-notifications. */
export function resetAndroidChannelStub(): void {
  memoryStub._reset();
  adapter = memoryStub;
}

/** Test helper — channels created via stub. */
export function listStubAndroidChannels(): AndroidNotificationChannel[] {
  return memoryStub._list();
}

export function closetAndroidChannels(): AndroidNotificationChannel[] {
  return (Object.keys(ANDROID_NOTIFICATION_CHANNELS) as NotificationCategory[]).map(
    (k) => ANDROID_NOTIFICATION_CHANNELS[k],
  );
}

/**
 * Ensure one Android channel per Closet notification category.
 * Safe to call on iOS (adapter no-ops or never set) — callers should gate on Platform.OS.
 */
export async function ensureAndroidNotificationChannels(): Promise<
  AndroidNotificationChannel[]
> {
  const channels = closetAndroidChannels();
  const a = getAndroidChannelAdapter();
  for (const ch of channels) {
    await a.setNotificationChannelAsync(ch.id, {
      name: ch.name,
      description: ch.description,
      importance: ch.importance,
    });
  }
  return channels;
}
