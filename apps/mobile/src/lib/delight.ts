/**
 * UX-HAPTICS — re-exports the delight haptic helpers.
 * Prefer `@/src/lib/delightHaptics` for new call sites.
 */

export {
  delightHaptic as triggerDelightHaptic,
  delightHaptic,
  delightHapticFoundMoney,
  delightHapticRefundLanded,
  delightHapticWoreIt,
  hapticStyleForMoment,
  initDelightHaptics,
  setDelightHapticsDeps,
  type DelightHapticEvent as DelightMoment,
  type DelightHapticsDeps,
} from './delightHaptics';
