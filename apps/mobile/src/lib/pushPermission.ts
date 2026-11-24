/**
 * Pluggable notification permission request for Closet deadline nudges.
 *
 * By default this asks the OS through expo-notifications. Tests switch to the in-memory stub
 * with `resetPushPermissionStub` (the stub "grants" without a prompt, so it must never be the
 * default: a release build would record a permission the user was never asked for).
 */

import { expoPushPermissionAdapter } from './expoNotificationAdapters';

export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type PushPermissionAdapter = {
  getStatus(): Promise<PushPermissionStatus>;
  requestPermission(): Promise<PushPermissionStatus>;
};

let adapter: PushPermissionAdapter | null = null;

const memoryStub = (() => {
  let status: PushPermissionStatus = 'undetermined';
  return {
    async getStatus() {
      return status;
    },
    async requestPermission() {
      // Default stub grants so deadline setup can complete in CI / simulators.
      if (status === 'undetermined') status = 'granted';
      return status;
    },
    /** Test helper — reset between cases. */
    _reset(next: PushPermissionStatus = 'undetermined') {
      status = next;
    },
  };
})();

export function setPushPermissionAdapter(next: PushPermissionAdapter | null): void {
  adapter = next;
}

export function getPushPermissionAdapter(): PushPermissionAdapter {
  return adapter ?? expoPushPermissionAdapter;
}

/** Reset the memory stub and use it instead of the OS (tests only). */
export function resetPushPermissionStub(
  status: PushPermissionStatus = 'undetermined',
): void {
  memoryStub._reset(status);
  adapter = memoryStub;
}

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  return getPushPermissionAdapter().getStatus();
}

export async function requestPushPermission(): Promise<PushPermissionStatus> {
  return getPushPermissionAdapter().requestPermission();
}

export function isPushPermissionGranted(status: PushPermissionStatus): boolean {
  return status === 'granted';
}
