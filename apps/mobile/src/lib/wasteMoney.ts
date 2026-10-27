import { Share } from 'react-native';
import {
  buildNeverWornShareCard,
  formatNeverWornAmount,
  redactBrandLabel,
  redactCardDigits,
  wearChallengeNudgeCopy,
  wearChallengeProgress,
  type NeverWornShareCard,
  type NeverWornShareInput,
  type WearChallengeStatus,
} from '@worn/shared';

/** Never-worn value from waste metrics (cost of items with zero wears). */

export type WasteMetricLike = {
  wearCount: number;
  status?: string;
  item?: { costMinor?: number | null; brand?: string | null; category?: string | null } | null;
  wearChallenge?: WearChallengeStatus;
};

export {
  formatNeverWornAmount,
  redactBrandLabel,
  redactCardDigits,
  buildNeverWornShareCard,
  wearChallengeProgress,
  wearChallengeNudgeCopy,
};

export function neverWornCostMinor(metrics: WasteMetricLike[]): number {
  return metrics.reduce((sum, m) => {
    if (m.wearCount > 0) return sum;
    const cost = m.item?.costMinor ?? 0;
    return sum + (typeof cost === 'number' && cost > 0 ? cost : 0);
  }, 0);
}

export function deadItemCount(metrics: WasteMetricLike[]): number {
  return metrics.filter((m) => m.status === 'DEAD' || m.wearCount === 0).length;
}

/** Build share card from waste summary metrics (blurred brands, no card digits). */
export function neverWornShareFromMetrics(
  metrics: WasteMetricLike[],
  opts?: { currency?: string; neverWornCostMinor?: number },
): NeverWornShareCard {
  const neverWorn = metrics.filter((m) => m.wearCount === 0);
  const total =
    opts?.neverWornCostMinor ?? neverWornCostMinor(metrics);
  return buildNeverWornShareCard({
    neverWornCostMinor: total,
    itemCount: neverWorn.length,
    brands: neverWorn.map((m) => m.item?.brand ?? m.item?.category ?? null),
    currency: opts?.currency ?? 'INR',
  } satisfies NeverWornShareInput);
}

/** @deprecated alias — prefer neverWornShareFromMetrics */
export const buildNeverWornShareFromMetrics = neverWornShareFromMetrics;

/** Open the system share sheet with watermarked never-worn copy. */
export async function shareNeverWornCard(
  card: NeverWornShareCard,
): Promise<{ shared: boolean }> {
  const result = await Share.share({
    message: card.shareText,
    title: card.headline,
  });
  const shared =
    result.action === Share.sharedAction ||
    // iOS may omit action on dismiss; treat successful sheet open as shared when available.
    (typeof result.action === 'undefined' && Boolean(card.shareText));
  return { shared: Boolean(shared) };
}
