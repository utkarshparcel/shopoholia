import { beforeEach, describe, expect, it } from 'vitest';

import {
  getPushPermissionStatus,
  isPushPermissionGranted,
  requestPushPermission,
  resetPushPermissionStub,
  setPushPermissionAdapter,
} from './pushPermission';

describe('pushPermission', () => {
  beforeEach(() => {
    resetPushPermissionStub('undetermined');
  });

  it('starts undetermined on the memory stub', async () => {
    expect(await getPushPermissionStatus()).toBe('undetermined');
  });

  it('requestPermission grants via default stub', async () => {
    expect(await requestPushPermission()).toBe('granted');
    expect(await getPushPermissionStatus()).toBe('granted');
    expect(isPushPermissionGranted('granted')).toBe(true);
    expect(isPushPermissionGranted('denied')).toBe(false);
  });

  it('honors an injected adapter', async () => {
    setPushPermissionAdapter({
      getStatus: async () => 'denied',
      requestPermission: async () => 'denied',
    });
    expect(await requestPushPermission()).toBe('denied');
  });
});
