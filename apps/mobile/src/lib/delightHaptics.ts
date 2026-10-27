/**
 * UX-HAPTICS — light feedback on Closet delight moments.
 * Found money / wore-it / refund landed. Skipped when Reduce Motion is on.
 */

import { AccessibilityInfo, Platform } from 'react-native';

export type DelightHapticEvent =
  | 'found_money'
  | 'found_money_demo'
  | 'found_money_manual'
  | 'found_money_oauth'
  | 'wore_it'
  | 'refund_landed'
  | 'seasonal_swap';

type ImpactStyle = 'light' | 'medium';

const IMPACT: Record<DelightHapticEvent, ImpactStyle> = {
  found_money: 'medium',
  /** W007 — sample celebration stays lighter so demo never oversells. */
  found_money_demo: 'light',
  found_money_manual: 'medium',
  found_money_oauth: 'medium',
  wore_it: 'light',
  refund_landed: 'medium',
  /** W055 — tangible ACTIVE/STORED swap. */
  seasonal_swap: 'medium',
};

/** Injectable for unit smoke tests. */
export type DelightHapticsDeps = {
  isReduceMotionEnabled: () => Promise<boolean>;
  impactAsync: (style: ImpactStyle) => Promise<void>;
  platformOS: typeof Platform.OS;
};

const defaultDeps: DelightHapticsDeps = {
  isReduceMotionEnabled: () => AccessibilityInfo.isReduceMotionEnabled(),
  impactAsync: async (style) => {
    // Dynamic import so vitest / web shells work without the native module installed.
    const Haptics = await import('expo-haptics');
    const mapped =
      style === 'light'
        ? Haptics.ImpactFeedbackStyle.Light
        : Haptics.ImpactFeedbackStyle.Medium;
    await Haptics.impactAsync(mapped);
  },
  platformOS: Platform.OS,
};

let deps: DelightHapticsDeps = defaultDeps;

/** Test-only override. */
export function setDelightHapticsDeps(next: Partial<DelightHapticsDeps> | null) {
  deps = next ? { ...defaultDeps, ...next } : defaultDeps;
}

export function hapticStyleForMoment(event: DelightHapticEvent): ImpactStyle {
  return IMPACT[event];
}

/**
 * Warm the native module at app boot. Safe to call multiple times; no-ops on web
 * or when expo-haptics is unavailable. Per-event calls still import lazily.
 */
export async function initDelightHaptics(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    await import('expo-haptics');
    return true;
  } catch {
    return false;
  }
}

/**
 * Fire a delight haptic. No-ops on web, when Reduce Motion is enabled,
 * or when the native module is unavailable.
 */
export async function delightHaptic(event: DelightHapticEvent): Promise<boolean> {
  if (deps.platformOS === 'web') return false;
  try {
    if (await deps.isReduceMotionEnabled()) return false;
    await deps.impactAsync(IMPACT[event]);
    return true;
  } catch {
    return false;
  }
}

export function delightHapticFoundMoney(): Promise<boolean> {
  return delightHaptic('found_money');
}

/** W007 — source-specific found-money haptic (Reduce Motion safe via delightHaptic). */
export function delightHapticForCelebrationSource(
  source: 'manual' | 'oauth' | 'demo',
): Promise<boolean> {
  if (source === 'demo') return delightHaptic('found_money_demo');
  if (source === 'manual') return delightHaptic('found_money_manual');
  return delightHaptic('found_money_oauth');
}

export function delightHapticWoreIt(): Promise<boolean> {
  return delightHaptic('wore_it');
}

export function delightHapticRefundLanded(): Promise<boolean> {
  return delightHaptic('refund_landed');
}

/** W055 — seasonal closet swap (Reduce Motion safe via delightHaptic). */
export function delightHapticSeasonalSwap(): Promise<boolean> {
  return delightHaptic('seasonal_swap');
}
