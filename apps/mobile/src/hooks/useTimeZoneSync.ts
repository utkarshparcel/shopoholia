import AsyncStorage from '@react-native-async-storage/async-storage';
import { isValidTimeZone } from '@worn/shared';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { updateTimeZone } from '@/src/api/client';
import { userIdFromAccessToken } from '@/src/lib/access-token';
import { useSessionStore } from '@/src/stores/session';

/** The zone last saved on the server for a user, so it's only sent again when it changes. */
export function timeZoneSentKey(userId: string) {
  return `worn.time-zone-sent.v1:${userId}`;
}

/** The device's IANA zone, or null when the runtime doesn't report a usable one. */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

let inFlight: Promise<void> | null = null;

/**
 * Sends the device's zone (C1, `PUT /me/time-zone`) when it differs from the last one saved for
 * this user. On failure nothing is recorded, so the next call tries again. Never throws.
 */
export function syncTimeZone(): Promise<void> {
  inFlight ??= (async () => {
    try {
      const token = useSessionStore.getState().accessToken;
      const userId = userIdFromAccessToken(token);
      const zone = deviceTimeZone();
      if (!token || !userId || !zone) return;
      const key = timeZoneSentKey(userId);
      if ((await AsyncStorage.getItem(key)) === zone) return;
      const saved = await updateTimeZone(token, zone);
      await AsyncStorage.setItem(key, saved.timeZone);
    } catch (error) {
      if (__DEV__) console.warn('[time-zone] not saved; will retry', error);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Root-layout wiring: keeps the server's copy of the user's zone current, so reminders and the
 * day's outfit roll over at local midnight. Runs after sign-in and each time the app comes back
 * to the foreground (the zone changes when the user travels).
 */
export function useTimeZoneSync() {
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));

  useEffect(() => {
    if (!userId) return;
    void syncTimeZone();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncTimeZone();
    });
    return () => subscription.remove();
  }, [userId]);
}

/** Test hook. */
export function resetTimeZoneSyncForTests() {
  inFlight = null;
}
