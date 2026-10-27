import { OCR_CONFIRM_CONFIDENCE_THRESHOLD } from '@worn/shared';

export type ConfidenceTone = 'high' | 'medium' | 'low';

export type ConfidenceBadge = {
  tone: ConfidenceTone;
  label: string;
  percent: number;
};

export { OCR_CONFIRM_CONFIDENCE_THRESHOLD };

/**
 * Pure helper for OCR confidence badge copy + tone in the Vault receipts tab.
 *  - high: ≥ 0.85
 *  - medium: ≥ product confirm threshold (default 0.7)
 *  - low: below confirm threshold
 */
export function confidenceBadge(
  confidence: number | null | undefined,
): ConfidenceBadge {
  const value =
    typeof confidence === 'number' && Number.isFinite(confidence)
      ? Math.min(1, Math.max(0, confidence))
      : 0;
  const percent = Math.round(value * 100);
  if (value >= 0.85) {
    return { tone: 'high', label: `${percent}% confident`, percent };
  }
  if (value >= OCR_CONFIRM_CONFIDENCE_THRESHOLD) {
    return { tone: 'medium', label: `${percent}% confident`, percent };
  }
  return { tone: 'low', label: `${percent}% — review needed`, percent };
}

/**
 * Whether confirm should be blocked until the user explicitly overrides.
 */
export function requiresConfirmOverride(
  confidence: number | null | undefined,
  threshold: number = OCR_CONFIRM_CONFIDENCE_THRESHOLD,
): boolean {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
    return true;
  }
  return confidence < threshold;
}
