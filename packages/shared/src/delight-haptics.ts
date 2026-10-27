/**
 * Delight haptic catalog — platform-agnostic stubs for Closet wow moments.
 * Mobile wires expo-haptics; this module owns event → style + Reduce Motion policy.
 *
 * Covers UX-HAPTICS + W007 celebration variants + W027 barcode success.
 */

export type DelightHapticEvent =
  | "found_money"
  | "wore_it"
  | "refund_landed"
  | "barcode_success"
  | "celebration_manual"
  | "celebration_oauth"
  | "celebration_demo";

export type DelightImpactStyle = "light" | "medium" | "heavy" | "success";

/** Visual + haptic feedback mode (W027 Reduce Motion path). */
export type DelightFeedbackMode = "full" | "haptic_only" | "none";

const IMPACT: Record<DelightHapticEvent, DelightImpactStyle> = {
  found_money: "medium",
  wore_it: "light",
  refund_landed: "medium",
  barcode_success: "success",
  celebration_manual: "medium",
  celebration_oauth: "medium",
  celebration_demo: "light",
};

export const DELIGHT_HAPTIC_EVENTS = Object.keys(IMPACT) as DelightHapticEvent[];

export function isDelightHapticEvent(
  value: string,
): value is DelightHapticEvent {
  return value in IMPACT;
}

export function hapticStyleForMoment(
  event: DelightHapticEvent,
): DelightImpactStyle {
  return IMPACT[event];
}

/**
 * W027 — barcode/photo capture success.
 * Full: haptic + confetti. Reduce Motion → haptic-only (confetti off).
 */
export function barcodeSuccessFeedback(reduceMotion: boolean): {
  mode: DelightFeedbackMode;
  haptic: boolean;
  confetti: boolean;
  event: "barcode_success";
  style: DelightImpactStyle;
} {
  if (reduceMotion) {
    return {
      mode: "haptic_only",
      haptic: true,
      confetti: false,
      event: "barcode_success",
      style: IMPACT.barcode_success,
    };
  }
  return {
    mode: "full",
    haptic: true,
    confetti: true,
    event: "barcode_success",
    style: IMPACT.barcode_success,
  };
}

/**
 * Map celebration source (W007) onto a delight haptic event.
 * Distinct style per source without overselling demo.
 */
export function celebrationHapticEvent(
  source: "manual" | "oauth" | "demo",
): Extract<
  DelightHapticEvent,
  "celebration_manual" | "celebration_oauth" | "celebration_demo"
> {
  if (source === "oauth") return "celebration_oauth";
  if (source === "demo") return "celebration_demo";
  return "celebration_manual";
}

/**
 * Whether a delight moment should fire native impact.
 * Web / unavailable platforms stay no-op at the call site.
 */
export function shouldFireDelightHaptic(input: {
  reduceMotion: boolean;
  /** When true, haptics are treated as motion and suppressed (strict a11y). */
  suppressHapticsWithReduceMotion?: boolean;
  platformOS?: string;
}): boolean {
  if (input.platformOS === "web") return false;
  if (input.reduceMotion && input.suppressHapticsWithReduceMotion !== false) {
    // Default: match existing mobile UX-HAPTICS (skip when Reduce Motion).
    // W027 barcode path can pass suppressHapticsWithReduceMotion: false for haptic-only.
    return false;
  }
  return true;
}
