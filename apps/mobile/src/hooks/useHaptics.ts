import { useCallback } from 'react';
import { Platform } from 'react-native';
import { scheduleOnRN } from 'react-native-worklets';

/**
 * Haptic feedback types matching our token system
 */
export type HapticType =
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error';

/**
 * Hook for triggering haptic feedback
 * Automatically schedules on RN runtime when called from worklets
 */
export function useHaptics() {
  const trigger = useCallback(async (type: HapticType) => {
    // On web, no haptics available
    if (Platform.OS === 'web') return;

    try {
      const Haptics = await import('expo-haptics');
      const { ImpactFeedbackStyle, NotificationFeedbackType } = Haptics;

      switch (type) {
        case 'selection':
          await Haptics.selectionAsync();
          break;
        case 'light':
          await Haptics.impactAsync(ImpactFeedbackStyle.Light);
          break;
        case 'medium':
          await Haptics.impactAsync(ImpactFeedbackStyle.Medium);
          break;
        case 'heavy':
          await Haptics.impactAsync(ImpactFeedbackStyle.Heavy);
          break;
        case 'success':
          await Haptics.notificationAsync(NotificationFeedbackType.Success);
          break;
        case 'warning':
          await Haptics.notificationAsync(NotificationFeedbackType.Warning);
          break;
        case 'error':
          await Haptics.notificationAsync(NotificationFeedbackType.Error);
          break;
      }
    } catch (e) {
      // Silently fail if haptics unavailable
      if (__DEV__) {
        console.warn('[haptics]', e);
      }
    }
  }, []);

  /**
   * Version safe to call from Reanimated worklets
   * Schedules the haptic on the RN runtime
   */
  const triggerFromWorklet = useCallback((type: HapticType) => {
    if (Platform.OS === 'web') return;
    scheduleOnRN(() => trigger(type));
  }, [trigger]);

  return { trigger, triggerFromWorklet };
}

/**
 * Pre-configured haptic triggers for common interactions
 */
export const hapticPresets = {
  // Button press
  buttonPress: 'light' as HapticType,
  // Toggle, switch, segmented control
  toggle: 'selection' as HapticType,
  // Sheet detent, card snap, drag commit
  snap: 'light' as HapticType,
  // Delete, destructive action
  destructive: 'medium' as HapticType,
  // Success state
  success: 'success' as HapticType,
  // Error state
  error: 'error' as HapticType,
  // Pull to refresh
  refresh: 'selection' as HapticType,
  // Long press
  longPress: 'medium' as HapticType,
} as const;