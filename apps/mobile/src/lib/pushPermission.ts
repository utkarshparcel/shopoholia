/**
 * Pluggable notification permission request for Closet deadline nudges.
 *
 * Production can inject an Expo Notifications adapter; tests / Expo Go
 * without a bridge use the in-memory stub (undetermined → granted/denied).
 */

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
  return adapter ?? memoryStub;
}

/** Reset the default memory stub (tests only). */
export function resetPushPermissionStub(
  status: PushPermissionStatus = 'undetermined',
): void {
  memoryStub._reset(status);
  adapter = null;
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
