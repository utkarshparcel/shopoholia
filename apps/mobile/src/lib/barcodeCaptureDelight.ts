/**
 * W027 — Barcode / photo capture success delight.
 * Policy from shared `barcodeSuccessFeedback`; Reduce Motion → haptic-only.
 */

import {
  barcodeSuccessFeedback,
  shouldFireDelightHaptic,
  type DelightImpactStyle,
} from '@worn/shared';
import { AccessibilityInfo, Platform } from 'react-native';

export type BarcodeCaptureDelight = {
  /** Fire a success haptic. */
  haptic: boolean;
  /** Show brief confetti / celebration chrome. */
  confetti: boolean;
  mode: 'full' | 'haptic_only' | 'none';
  style: DelightImpactStyle;
};

type Deps = {
  isReduceMotionEnabled: () => Promise<boolean>;
  impactAsync: (style: DelightImpactStyle) => Promise<void>;
  platformOS: typeof Platform.OS;
};

const defaultDeps: Deps = {
  isReduceMotionEnabled: () => AccessibilityInfo.isReduceMotionEnabled(),
  impactAsync: async (style) => {
    const Haptics = await import('expo-haptics');
    if (style === 'success') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    const mapped =
      style === 'light'
        ? Haptics.ImpactFeedbackStyle.Light
        : style === 'heavy'
          ? Haptics.ImpactFeedbackStyle.Heavy
          : Haptics.ImpactFeedbackStyle.Medium;
    await Haptics.impactAsync(mapped);
  },
  platformOS: Platform.OS,
};

let deps: Deps = defaultDeps;

/** Test-only override. */
export function setBarcodeCaptureDelightDeps(next: Partial<Deps> | null) {
  deps = next ? { ...defaultDeps, ...next } : defaultDeps;
}

/**
 * Decide delight channels for a successful barcode/photo prefill.
 * Uses shared barcodeSuccessFeedback; web → none.
 */
export async function planBarcodeCaptureDelight(): Promise<BarcodeCaptureDelight> {
  if (deps.platformOS === 'web') {
    return { haptic: false, confetti: false, mode: 'none', style: 'success' };
  }
  try {
    const reduceMotion = await deps.isReduceMotionEnabled();
    const feedback = barcodeSuccessFeedback(reduceMotion);
    const haptic = shouldFireDelightHaptic({
      reduceMotion,
      platformOS: deps.platformOS,
      // W027: Reduce Motion keeps haptic, drops confetti.
      suppressHapticsWithReduceMotion: false,
    });
    return {
      haptic: haptic && feedback.haptic,
      confetti: feedback.confetti,
      mode: haptic ? feedback.mode : 'none',
      style: feedback.style,
    };
  } catch {
    return { haptic: false, confetti: false, mode: 'none', style: 'success' };
  }
}

/** Fire haptic per plan; returns the plan used. */
export async function delightBarcodeCaptureSuccess(): Promise<BarcodeCaptureDelight> {
  const plan = await planBarcodeCaptureDelight();
  if (plan.haptic) {
    try {
      await deps.impactAsync(plan.style);
    } catch {
      return {
        ...plan,
        haptic: false,
        mode: plan.confetti ? plan.mode : 'none',
      };
    }
  }
  return plan;
}
