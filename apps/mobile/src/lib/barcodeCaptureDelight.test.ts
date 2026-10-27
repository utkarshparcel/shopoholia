import { afterEach, describe, expect, it, vi } from 'vitest';
import { barcodeSuccessFeedback } from '@worn/shared';

import {
  delightBarcodeCaptureSuccess,
  planBarcodeCaptureDelight,
  setBarcodeCaptureDelightDeps,
} from './barcodeCaptureDelight';

describe('barcodeCaptureDelight (W027)', () => {
  afterEach(() => {
    setBarcodeCaptureDelightDeps(null);
  });

  it('plans haptic + confetti from shared barcodeSuccessFeedback when motion ok', async () => {
    const impactAsync = vi.fn(async () => undefined);
    setBarcodeCaptureDelightDeps({
      platformOS: 'ios',
      isReduceMotionEnabled: async () => false,
      impactAsync,
    });
    const shared = barcodeSuccessFeedback(false);
    const plan = await planBarcodeCaptureDelight();
    expect(plan).toEqual({
      haptic: shared.haptic,
      confetti: shared.confetti,
      mode: shared.mode,
      style: shared.style,
    });
    expect(await delightBarcodeCaptureSuccess()).toMatchObject({
      haptic: true,
      confetti: true,
      mode: 'full',
      style: 'success',
    });
    expect(impactAsync).toHaveBeenCalledWith('success');
  });

  it('Reduce Motion → haptic-only via shared barcodeSuccessFeedback (no confetti)', async () => {
    const impactAsync = vi.fn(async () => undefined);
    setBarcodeCaptureDelightDeps({
      platformOS: 'android',
      isReduceMotionEnabled: async () => true,
      impactAsync,
    });
    const shared = barcodeSuccessFeedback(true);
    expect(await planBarcodeCaptureDelight()).toEqual({
      haptic: shared.haptic,
      confetti: shared.confetti,
      mode: shared.mode,
      style: shared.style,
    });
    expect(await delightBarcodeCaptureSuccess()).toMatchObject({
      haptic: true,
      confetti: false,
      mode: 'haptic_only',
    });
    expect(impactAsync).toHaveBeenCalledWith('success');
  });

  it('no-ops on web', async () => {
    const impactAsync = vi.fn(async () => undefined);
    setBarcodeCaptureDelightDeps({
      platformOS: 'web',
      isReduceMotionEnabled: async () => false,
      impactAsync,
    });
    expect(await planBarcodeCaptureDelight()).toEqual({
      haptic: false,
      confetti: false,
      mode: 'none',
      style: 'success',
    });
    expect(impactAsync).not.toHaveBeenCalled();
  });

  it('swallows native haptic errors', async () => {
    setBarcodeCaptureDelightDeps({
      platformOS: 'ios',
      isReduceMotionEnabled: async () => false,
      impactAsync: async () => {
        throw new Error('native unavailable');
      },
    });
    const result = await delightBarcodeCaptureSuccess();
    expect(result.haptic).toBe(false);
    expect(result.confetti).toBe(true);
  });
});
