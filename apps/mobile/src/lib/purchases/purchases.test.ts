import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/api/client', () => ({ API_URL: 'http://api.test', refreshSession: vi.fn() }));

const dev = globalThis as { __DEV__?: boolean };

async function clientWith(native: unknown, isDev: boolean) {
  vi.resetModules();
  vi.doMock('@/modules/worn-iap', () => ({ default: native }));
  dev.__DEV__ = isDev;
  const { getPurchasesClient } = await import('./purchases');
  return getPurchasesClient();
}

afterEach(() => {
  dev.__DEV__ = true;
  vi.doUnmock('@/modules/worn-iap');
});

// Each test re-imports the module graph after vi.resetModules(); the first, cold import alone can
// pass the default 5 s when the whole suite runs in parallel.
describe('getPurchasesClient', { timeout: 30_000 }, () => {
  it('uses the native store module when the build has it', async () => {
    const client = await clientWith({ addListener: vi.fn() }, false);
    expect(client).toMatchObject({ kind: 'store', store: 'app_store' });
  });

  it('has no client in a release build without the module', async () => {
    expect(await clientWith(null, false)).toBeNull();
  });

  it('simulates the store only in __DEV__', async () => {
    expect(await clientWith(null, true)).toMatchObject({ kind: 'dev' });
  });
});

describe('purchaseKindFor', () => {
  it('tells subscriptions from coin packs', async () => {
    vi.doMock('@/modules/worn-iap', () => ({ default: null }));
    const { purchaseKindFor } = await import('./purchases');
    expect(purchaseKindFor('worn.closet.premium.monthly')).toBe('subscription');
    expect(purchaseKindFor('worn.closet.outfits.monthly')).toBe('subscription');
    expect(purchaseKindFor('worn.coins.650')).toBe('coins');
  });
});
