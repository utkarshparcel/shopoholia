/**
 * U021 — Exchange flow prefills recommended size from size-map (never auto-submit).
 */

import { sizeMapTipForBrand, type SizeMapBrandRow, type SizeMapTip } from "./size-map.js";

export type ExchangeSizePrefill = {
  recommendedSize: string | null;
  tip: SizeMapTip | null;
  editable: true;
  autoSubmit: false;
};

export function buildExchangeSizePrefill(input: {
  brands: SizeMapBrandRow[];
  merchant?: string | null;
  orderedSize?: string | null;
  preferredSize?: string | null;
}): ExchangeSizePrefill {
  const tip = sizeMapTipForBrand(input.brands, input.merchant, {
    orderedSize: input.orderedSize,
    preferredSize: input.preferredSize,
  });
  const preferred = (input.preferredSize ?? "").trim();
  const fromTip = tip?.suggestedSize?.trim() || null;
  return {
    recommendedSize: preferred || fromTip,
    tip,
    editable: true,
    autoSubmit: false,
  };
}
