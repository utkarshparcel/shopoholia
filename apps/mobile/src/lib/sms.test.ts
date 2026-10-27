import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platformState = { OS: 'ios' as string };

const permissionsAndroid = {
  PERMISSIONS: { READ_SMS: 'android.permission.READ_SMS' },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    NEVER_ASK_AGAIN: 'never_ask_again',
  },
  request: vi.fn(),
};

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return platformState.OS;
    },
  },
  NativeModules: {},
  PermissionsAndroid: permissionsAndroid,
}));

const ingestSms = vi.fn();
vi.mock('@/src/api/client', () => ({
  ingestSms: (...args: unknown[]) => ingestSms(...args),
}));

describe('sms', () => {
  beforeEach(() => {
    platformState.OS = 'ios';
    permissionsAndroid.request.mockReset();
    ingestSms.mockReset();
    vi.resetModules();
  });

  afterEach(async () => {
    vi.doUnmock('@/src/lib/smsAndroidAdapter');
    const { setSmsInboxAdapter } = await import('./sms');
    setSmsInboxAdapter(null);
    const { setSmsNativeBridge } = await import('./smsNativeBridge');
    setSmsNativeBridge(null);
  });

  it('exports iOS forwarding copy with address', async () => {
    const { getIosSmsForwardingCopy, getSmsForwardingAddress, supportsSmsInboxRead } =
      await import('./sms');
    expect(supportsSmsInboxRead()).toBe(false);
    expect(getSmsForwardingAddress()).toContain('@');
    expect(getIosSmsForwardingCopy('fwd@example.com')).toContain('fwd@example.com');
    expect(getIosSmsForwardingCopy()).toMatch(/iOS doesn't allow/i);
  });

  it('denies permission and skips sync on iOS', async () => {
    const { requestSmsPermission, readSmsInbox, syncSmsInbox } = await import('./sms');
    await expect(requestSmsPermission()).resolves.toBe('denied');
    await expect(readSmsInbox()).resolves.toEqual([]);
    await expect(syncSmsInbox('token')).resolves.toEqual([]);
    expect(ingestSms).not.toHaveBeenCalled();
  });

  it('uses PermissionsAndroid on Android when no adapter is set', async () => {
    platformState.OS = 'android';
    permissionsAndroid.request.mockResolvedValue('granted');
    const { requestSmsPermission, readSmsInbox, supportsSmsInboxRead } = await import('./sms');
    expect(supportsSmsInboxRead()).toBe(true);
    await expect(requestSmsPermission()).resolves.toBe('granted');
    expect(permissionsAndroid.request).toHaveBeenCalled();
    // Without a native bridge, inbox stays empty.
    await expect(readSmsInbox()).resolves.toEqual([]);
  });

  it('syncs via injectable adapter and posts each message', async () => {
    platformState.OS = 'android';
    const { setSmsInboxAdapter, syncSmsInbox } = await import('./sms');
    setSmsInboxAdapter({
      requestPermission: async () => 'granted',
      readInbox: async () => [
        { from: '+919999999999', body: 'Your Amazon order shipped', receivedAt: '2026-01-01T00:00:00.000Z' },
        { from: 'MYNTRA', body: 'Refund credited' },
      ],
    });
    ingestSms
      .mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111111', status: 'RECEIVED' })
      .mockResolvedValueOnce({ id: '22222222-2222-4222-8222-222222222222', status: 'RECEIVED' });

    const ids = await syncSmsInbox('access-token');
    expect(ids).toHaveLength(2);
    expect(ingestSms).toHaveBeenCalledTimes(2);
    expect(ingestSms).toHaveBeenCalledWith('access-token', {
      from: '+919999999999',
      body: 'Your Amazon order shipped',
      receivedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('returns empty when Android permission is denied', async () => {
    platformState.OS = 'android';
    const { setSmsInboxAdapter, syncSmsInbox } = await import('./sms');
    setSmsInboxAdapter({
      requestPermission: async () => 'denied',
      readInbox: async () => [{ from: 'X', body: 'Y' }],
    });
    await expect(syncSmsInbox('token')).resolves.toEqual([]);
    expect(ingestSms).not.toHaveBeenCalled();
  });

  it('uses order-texts-only microcopy on Android permission dialog', async () => {
    platformState.OS = 'android';
    permissionsAndroid.request.mockResolvedValue('granted');
    const { requestSmsPermission } = await import('./sms');
    const { getAndroidSmsPermCopy } = await import('./smsPermCopy');
    const copy = getAndroidSmsPermCopy();
    await expect(requestSmsPermission()).resolves.toBe('granted');
    expect(permissionsAndroid.request).toHaveBeenCalledWith(
      'android.permission.READ_SMS',
      expect.objectContaining({
        title: copy.title,
        message: copy.message,
        buttonPositive: copy.buttonPositive,
        buttonNegative: copy.buttonNegative,
      }),
    );
    expect(copy.message).toMatch(/order/i);
    expect(copy.message).toMatch(/shipping/i);
    expect(copy.message).toMatch(/gift-?card/i);
  });

  it('never markets READ_SMS on iOS helpers', async () => {
    const { getIosSmsForwardingCopy } = await import('./sms');
    const copy = getIosSmsForwardingCopy();
    expect(copy).not.toMatch(/READ_SMS/i);
    expect(copy).toMatch(/forward/i);
  });

  it('Android permission dialog uses order-texts-only microcopy (W010)', async () => {
    platformState.OS = 'android';
    permissionsAndroid.request.mockResolvedValue('granted');
    const { requestSmsPermission } = await import('./sms');
    const { getAndroidSmsPermCopy } = await import('./smsPermCopy');
    await requestSmsPermission();
    expect(permissionsAndroid.request).toHaveBeenCalled();
    const [, opts] = permissionsAndroid.request.mock.calls[0]!;
    const expected = getAndroidSmsPermCopy();
    expect(opts.title).toBe(expected.title);
    expect(opts.message).toBe(expected.message);
  });

  it('falls back to PermissionsAndroid when adapter factory throws', async () => {
    platformState.OS = 'android';
    vi.resetModules();
    vi.doMock('@/src/lib/smsAndroidAdapter', () => ({
      createAndroidSmsInboxAdapter: () => {
        throw new Error('native unavailable');
      },
    }));
    permissionsAndroid.request.mockResolvedValue('never_ask_again');
    const { requestSmsPermission, readSmsInbox, setSmsInboxAdapter, getSmsInboxAdapter } =
      await import('./sms');
    setSmsInboxAdapter(null);
    expect(getSmsInboxAdapter()).toBeNull();
    await expect(requestSmsPermission()).resolves.toBe('denied');
    await expect(readSmsInbox()).resolves.toEqual([]);
    expect(permissionsAndroid.request).toHaveBeenCalled();
  });

  it('maps PermissionsAndroid throw to undetermined', async () => {
    platformState.OS = 'android';
    vi.resetModules();
    vi.doMock('@/src/lib/smsAndroidAdapter', () => ({
      createAndroidSmsInboxAdapter: () => {
        throw new Error('native unavailable');
      },
    }));
    permissionsAndroid.request.mockRejectedValue(new Error('perm dialog failed'));
    const { requestSmsPermission, setSmsInboxAdapter } = await import('./sms');
    setSmsInboxAdapter(null);
    await expect(requestSmsPermission()).resolves.toBe('undetermined');
  });

  it('honors EXPO_PUBLIC_FORWARDING_ADDRESS and empty inbox sync', async () => {
    const prev = process.env.EXPO_PUBLIC_FORWARDING_ADDRESS;
    process.env.EXPO_PUBLIC_FORWARDING_ADDRESS = 'custom@inbox.test';
    try {
      const {
        getSmsForwardingAddress,
        getIosSmsForwardingCopy,
        setSmsInboxAdapter,
        syncSmsInbox,
      } = await import('./sms');
      expect(getSmsForwardingAddress()).toBe('custom@inbox.test');
      expect(getIosSmsForwardingCopy()).toContain('custom@inbox.test');

      platformState.OS = 'android';
      setSmsInboxAdapter({
        requestPermission: async () => 'granted',
        readInbox: async () => [],
      });
      await expect(syncSmsInbox('tok')).resolves.toEqual([]);
      expect(ingestSms).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.EXPO_PUBLIC_FORWARDING_ADDRESS;
      else process.env.EXPO_PUBLIC_FORWARDING_ADDRESS = prev;
    }
  });

  async function importSmsWithBrokenAdapterFactory() {
    vi.resetModules();
    vi.doMock('@/src/lib/smsAndroidAdapter', () => ({
      createAndroidSmsInboxAdapter: () => {
        throw new Error('native unavailable');
      },
    }));
    const mod = await import('./sms');
    mod.setSmsInboxAdapter(null);
    return mod;
  }

  it('maps PermissionsAndroid RESULTS.GRANTED via sms.ts fallback', async () => {
    platformState.OS = 'android';
    permissionsAndroid.request.mockResolvedValue(permissionsAndroid.RESULTS.GRANTED);
    const { requestSmsPermission } = await importSmsWithBrokenAdapterFactory();
    await expect(requestSmsPermission()).resolves.toBe('granted');
  });

  it('maps plain DENIED result via sms.ts fallback (not never-ask)', async () => {
    platformState.OS = 'android';
    permissionsAndroid.request.mockResolvedValue(permissionsAndroid.RESULTS.DENIED);
    const { requestSmsPermission } = await importSmsWithBrokenAdapterFactory();
    await expect(requestSmsPermission()).resolves.toBe('denied');
  });

  it('maps RESULTS.NEVER_ASK_AGAIN when distinct from string literal', async () => {
    platformState.OS = 'android';
    const prev = permissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
    permissionsAndroid.RESULTS.NEVER_ASK_AGAIN = 'NEVER_ASK_AGAIN_CONST';
    try {
      permissionsAndroid.request.mockResolvedValue('NEVER_ASK_AGAIN_CONST');
      const { requestSmsPermission } = await importSmsWithBrokenAdapterFactory();
      await expect(requestSmsPermission()).resolves.toBe('denied');
    } finally {
      permissionsAndroid.RESULTS.NEVER_ASK_AGAIN = prev;
    }
  });

  it('lazy-loads Android adapter and reads inbox through it', async () => {
    platformState.OS = 'android';
    vi.resetModules();
    const readInbox = vi.fn(async () => [
      { from: 'AMAZON', body: 'Your order shipped', receivedAt: '2026-02-01T00:00:00.000Z' },
    ]);
    const requestPermission = vi.fn(async () => 'granted' as const);
    vi.doMock('@/src/lib/smsAndroidAdapter', () => ({
      createAndroidSmsInboxAdapter: () => ({ requestPermission, readInbox }),
    }));
    const { readSmsInbox, requestSmsPermission, setSmsInboxAdapter, getSmsInboxAdapter } =
      await import('./sms');
    setSmsInboxAdapter(null);
    expect(getSmsInboxAdapter()).toBeNull();
    await expect(requestSmsPermission()).resolves.toBe('granted');
    await expect(readSmsInbox()).resolves.toEqual([
      { from: 'AMAZON', body: 'Your order shipped', receivedAt: '2026-02-01T00:00:00.000Z' },
    ]);
    expect(requestPermission).toHaveBeenCalled();
    expect(readInbox).toHaveBeenCalled();
  });

  it('ingestSmsMessages posts each message and returns ids', async () => {
    const { ingestSmsMessages } = await import('./sms');
    ingestSms
      .mockResolvedValueOnce({ id: 'a', status: 'RECEIVED' })
      .mockResolvedValueOnce({ id: 'b', status: 'RECEIVED' });
    const out = await ingestSmsMessages('tok', [
      { from: 'A', body: 'one' },
      { from: 'B', body: 'two', receivedAt: '2026-03-01T00:00:00.000Z' },
    ]);
    expect(out).toEqual([
      { id: 'a', status: 'RECEIVED' },
      { id: 'b', status: 'RECEIVED' },
    ]);
    expect(ingestSms).toHaveBeenNthCalledWith(1, 'tok', {
      from: 'A',
      body: 'one',
      receivedAt: undefined,
    });
    expect(ingestSms).toHaveBeenNthCalledWith(2, 'tok', {
      from: 'B',
      body: 'two',
      receivedAt: '2026-03-01T00:00:00.000Z',
    });
  });

  it('lazy adapter syncSmsInbox posts when permission granted', async () => {
    platformState.OS = 'android';
    vi.resetModules();
    const requestPermission = vi.fn(async () => 'granted' as const);
    const readInbox = vi.fn(async () => [
      { from: 'MYNTRA', body: 'Refund credited to store credit' },
    ]);
    vi.doMock('@/src/lib/smsAndroidAdapter', () => ({
      createAndroidSmsInboxAdapter: () => ({ requestPermission, readInbox }),
    }));
    ingestSms.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      status: 'RECEIVED',
    });
    const { syncSmsInbox, setSmsInboxAdapter, getSmsInboxAdapter } = await import('./sms');
    setSmsInboxAdapter(null);
    expect(getSmsInboxAdapter()).toBeNull();
    const ids = await syncSmsInbox('lazy-tok');
    expect(ids).toEqual(['44444444-4444-4444-8444-444444444444']);
    expect(requestPermission).toHaveBeenCalled();
    expect(readInbox).toHaveBeenCalled();
    expect(ingestSms).toHaveBeenCalledWith('lazy-tok', {
      from: 'MYNTRA',
      body: 'Refund credited to store credit',
      receivedAt: undefined,
    });
  });
});
