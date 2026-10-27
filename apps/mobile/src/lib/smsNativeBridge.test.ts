import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platformState = { OS: 'android' as string };
const nativeModules: {
  WornSmsInbox?: { listInbox?: (opts?: unknown) => Promise<unknown[]> };
  SmsAndroid?: {
    list: (
      filter: string,
      fail: (err: unknown) => void,
      success: (count: number, smsList: string) => void,
    ) => void;
  };
} = {};

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return platformState.OS;
    },
  },
  NativeModules: nativeModules,
}));

describe('smsNativeBridge', () => {
  beforeEach(() => {
    platformState.OS = 'android';
    delete nativeModules.WornSmsInbox;
    delete nativeModules.SmsAndroid;
    vi.resetModules();
  });

  afterEach(async () => {
    const { setSmsNativeBridge } = await import('./smsNativeBridge');
    setSmsNativeBridge(null);
  });

  it('prefers an injected bridge', async () => {
    const { setSmsNativeBridge, resolveSmsNativeBridge } = await import('./smsNativeBridge');
    const bridge = { listInbox: async () => [{ address: 'A', body: 'B' }] };
    setSmsNativeBridge(bridge);
    expect(resolveSmsNativeBridge()).toBe(bridge);
  });

  it('resolves WornSmsInbox NativeModule', async () => {
    nativeModules.WornSmsInbox = {
      listInbox: async () => [{ address: 'X', body: 'Y', date: 1 }],
    };
    const { resolveSmsNativeBridge } = await import('./smsNativeBridge');
    const bridge = resolveSmsNativeBridge();
    expect(bridge).not.toBeNull();
    await expect(bridge!.listInbox()).resolves.toEqual([
      { address: 'X', body: 'Y', date: 1 },
    ]);
  });

  it('wraps react-native-get-sms-android SmsAndroid.list', async () => {
    nativeModules.SmsAndroid = {
      list: (_filter, _fail, success) => {
        success(
          1,
          JSON.stringify([{ address: 'AMZ', body: 'Shipped', date: 99 }]),
        );
      },
    };
    const { resolveSmsNativeBridge } = await import('./smsNativeBridge');
    const bridge = resolveSmsNativeBridge();
    await expect(bridge!.listInbox({ maxCount: 10 })).resolves.toEqual([
      { address: 'AMZ', body: 'Shipped', date: 99 },
    ]);
  });

  it('returns null on iOS / missing modules', async () => {
    platformState.OS = 'ios';
    const { resolveSmsNativeBridge } = await import('./smsNativeBridge');
    expect(resolveSmsNativeBridge()).toBeNull();
  });
});
