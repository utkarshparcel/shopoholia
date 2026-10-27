import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platformState = { OS: 'android' as string };

const permissionsAndroid = {
  PERMISSIONS: { READ_SMS: 'android.permission.READ_SMS' },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    NEVER_ASK_AGAIN: 'never_ask_again',
  },
  request: vi.fn(),
};

const setSmsInboxAdapter = vi.fn();
const getSmsInboxAdapter = vi.fn(() => null);

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return platformState.OS;
    },
  },
  PermissionsAndroid: permissionsAndroid,
  NativeModules: {},
}));

vi.mock('@/src/lib/sms', () => ({
  setSmsInboxAdapter: (adapter: unknown) => setSmsInboxAdapter(adapter),
  getSmsInboxAdapter: () => getSmsInboxAdapter(),
}));

vi.mock('@/src/api/client', () => ({
  ingestSms: vi.fn(),
}));

describe('smsAndroidAdapter', () => {
  beforeEach(() => {
    platformState.OS = 'android';
    permissionsAndroid.request.mockReset();
    permissionsAndroid.request.mockResolvedValue('granted');
    setSmsInboxAdapter.mockReset();
    getSmsInboxAdapter.mockReset();
    getSmsInboxAdapter.mockReturnValue(null);
    vi.resetModules();
  });

  afterEach(async () => {
    const { setSmsNativeBridge } = await import('./smsNativeBridge');
    setSmsNativeBridge(null);
  });

  it('looksLikeOrderSms keeps merchant order texts and drops noise', async () => {
    const { looksLikeOrderSms } = await import('./smsAndroidAdapter');
    expect(looksLikeOrderSms('Your Amazon order has shipped')).toBe(true);
    expect(looksLikeOrderSms('OTP 123456 for login')).toBe(false);
    expect(looksLikeOrderSms('Hi', 'FLIPKART')).toBe(true);
  });

  it('mapNativeRowsToMessages filters and normalizes dates', async () => {
    const { mapNativeRowsToMessages } = await import('./smsAndroidAdapter');
    const mapped = mapNativeRowsToMessages([
      {
        address: 'AMAZON',
        body: 'Your order shipped',
        date: 1_700_000_000_000,
      },
      { address: 'BANK', body: 'OTP 99', date: '2026-01-02T00:00:00.000Z' },
      { address: '', body: 'empty from' },
    ]);
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.from).toBe('AMAZON');
    expect(mapped[0]?.receivedAt).toMatch(/^\d{4}-/);
  });

  it('createAndroidSmsInboxAdapter reads via injected bridge', async () => {
    const { createAndroidSmsInboxAdapter } = await import('./smsAndroidAdapter');
    const adapter = createAndroidSmsInboxAdapter({
      listInbox: async () => [
        { address: 'MYNTRA', body: 'Refund credited to store credit', date: 1_700_000_000_000 },
        { address: 'SPAM', body: 'Win a prize now' },
      ],
    });
    await expect(adapter.requestPermission()).resolves.toBe('granted');
    const inbox = await adapter.readInbox();
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.from).toBe('MYNTRA');
  });

  it('returns [] when bridge is null or throws', async () => {
    const { createAndroidSmsInboxAdapter } = await import('./smsAndroidAdapter');
    const empty = createAndroidSmsInboxAdapter(null);
    await expect(empty.readInbox()).resolves.toEqual([]);

    const failing = createAndroidSmsInboxAdapter({
      listInbox: async () => {
        throw new Error('native boom');
      },
    });
    await expect(failing.readInbox()).resolves.toEqual([]);
  });

  it('requests permission with order-texts-only microcopy', async () => {
    const { createAndroidSmsInboxAdapter } = await import('./smsAndroidAdapter');
    const { getAndroidSmsPermCopy } = await import('./smsPermCopy');
    const copy = getAndroidSmsPermCopy();
    const adapter = createAndroidSmsInboxAdapter(null);
    await expect(adapter.requestPermission()).resolves.toBe('granted');
    expect(permissionsAndroid.request).toHaveBeenCalledWith(
      'android.permission.READ_SMS',
      expect.objectContaining({
        title: copy.title,
        message: copy.message,
      }),
    );
  });

  it('ensureAndroidSmsInboxAdapterRegistered is Android-only', async () => {
    const { ensureAndroidSmsInboxAdapterRegistered } = await import('./smsAndroidAdapter');

    expect(ensureAndroidSmsInboxAdapterRegistered()).toBe(true);
    expect(setSmsInboxAdapter).toHaveBeenCalled();

    setSmsInboxAdapter.mockClear();
    platformState.OS = 'ios';
    expect(ensureAndroidSmsInboxAdapterRegistered()).toBe(false);
    expect(setSmsInboxAdapter).not.toHaveBeenCalled();
  });
});
