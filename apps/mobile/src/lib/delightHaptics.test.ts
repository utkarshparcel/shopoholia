import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  delightHaptic,
  delightHapticFoundMoney,
  delightHapticForCelebrationSource,
  delightHapticRefundLanded,
  delightHapticSeasonalSwap,
  delightHapticWoreIt,
  hapticStyleForMoment,
  initDelightHaptics,
  setDelightHapticsDeps,
} from './delightHaptics';

describe('delightHaptics (UX-HAPTICS)', () => {
  afterEach(() => {
    setDelightHapticsDeps(null);
  });

  it('maps distinct styles for the three delight moments', () => {
    expect(hapticStyleForMoment('found_money')).toBe('medium');
    expect(hapticStyleForMoment('found_money_demo')).toBe('light');
    expect(hapticStyleForMoment('found_money_manual')).toBe('medium');
    expect(hapticStyleForMoment('found_money_oauth')).toBe('medium');
    expect(hapticStyleForMoment('wore_it')).toBe('light');
    expect(hapticStyleForMoment('refund_landed')).toBe('medium');
    expect(hapticStyleForMoment('seasonal_swap')).toBe('medium');
  });

  it('fires impact for each delight event', async () => {
    const impactAsync = vi.fn(async () => undefined);
    setDelightHapticsDeps({
      isReduceMotionEnabled: async () => false,
      impactAsync,
      platformOS: 'ios',
    });

    expect(await delightHapticFoundMoney()).toBe(true);
    expect(await delightHapticWoreIt()).toBe(true);
    expect(await delightHapticRefundLanded()).toBe(true);
    expect(await delightHapticSeasonalSwap()).toBe(true);
    expect(impactAsync).toHaveBeenCalledTimes(4);
    expect(impactAsync).toHaveBeenNthCalledWith(1, 'medium');
    expect(impactAsync).toHaveBeenNthCalledWith(2, 'light');
    expect(impactAsync).toHaveBeenNthCalledWith(3, 'medium');
    expect(impactAsync).toHaveBeenNthCalledWith(4, 'medium');
  });

  it('routes celebration source to found-money variants (W007)', async () => {
    const impactAsync = vi.fn(async () => undefined);
    setDelightHapticsDeps({
      isReduceMotionEnabled: async () => false,
      impactAsync,
      platformOS: 'ios',
    });
    expect(await delightHapticForCelebrationSource('demo')).toBe(true);
    expect(await delightHapticForCelebrationSource('manual')).toBe(true);
    expect(await delightHapticForCelebrationSource('oauth')).toBe(true);
    expect(impactAsync).toHaveBeenNthCalledWith(1, 'light');
    expect(impactAsync).toHaveBeenNthCalledWith(2, 'medium');
    expect(impactAsync).toHaveBeenNthCalledWith(3, 'medium');
  });

  it('initDelightHaptics warms the module (or no-ops on web)', async () => {
    setDelightHapticsDeps({ platformOS: 'web' });
    // init uses Platform.OS from RN; on jsdom it may still succeed via stub.
    expect(typeof (await initDelightHaptics())).toBe('boolean');
  });

  it('skips when Reduce Motion is enabled', async () => {
    const impactAsync = vi.fn(async () => undefined);
    setDelightHapticsDeps({
      isReduceMotionEnabled: async () => true,
      impactAsync,
      platformOS: 'ios',
    });

    expect(await delightHaptic('found_money')).toBe(false);
    expect(impactAsync).not.toHaveBeenCalled();
  });

  it('no-ops on web', async () => {
    const impactAsync = vi.fn(async () => undefined);
    setDelightHapticsDeps({
      isReduceMotionEnabled: async () => false,
      impactAsync,
      platformOS: 'web',
    });

    expect(await delightHaptic('wore_it')).toBe(false);
    expect(impactAsync).not.toHaveBeenCalled();
  });

  it('swallows native errors', async () => {
    setDelightHapticsDeps({
      isReduceMotionEnabled: async () => false,
      impactAsync: async () => {
        throw new Error('native unavailable');
      },
      platformOS: 'android',
    });

    expect(await delightHaptic('refund_landed')).toBe(false);
  });
});
