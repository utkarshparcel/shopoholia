import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'EXPO_PUBLIC_FEATURE_CLOSET',
  'EXPO_PUBLIC_FEATURE_PREMIUM_GATES',
  'EXPO_PUBLIC_FEATURE_UPI',
  'EXPO_PUBLIC_EXPERIMENT_UPI_CHECKOUT',
  'EXPO_PUBLIC_WORN_REGION',
] as const;

const originals: Record<string, string | undefined> = {};

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (originals[k] === undefined) delete process.env[k];
    else process.env[k] = originals[k];
  }
  vi.resetModules();
});

describe('FEATURE flags (monetization)', () => {
  it('FEATURE_PREMIUM_GATES defaults off', async () => {
    for (const k of ENV_KEYS) {
      originals[k] = process.env[k];
      delete process.env[k];
    }
    vi.resetModules();
    const { FEATURE_PREMIUM_GATES } = await import('./features');
    expect(FEATURE_PREMIUM_GATES).toBe(false);
  });

  it('enables the premium gates + UPI experiment flags', async () => {
    for (const k of ENV_KEYS) originals[k] = process.env[k];
    process.env.EXPO_PUBLIC_EXPERIMENT_UPI_CHECKOUT = '1';
    process.env.EXPO_PUBLIC_FEATURE_PREMIUM_GATES = '1';
    vi.resetModules();
    const mod = await import('./features');
    expect(mod.EXPERIMENT_UPI_CHECKOUT).toBe(true);
    expect(mod.FEATURE_PREMIUM_GATES).toBe(true);
  });
});
