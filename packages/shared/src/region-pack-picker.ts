/**
 * W092 — Closet onboarding region pack picker (IN / US / UK / GLOBAL).
 * Seeds Fit Vault customization templates (WV06-REGION-PACKS).
 */

export const FIT_REGION_PACK_IDS = ["IN", "US", "UK", "GLOBAL"] as const;
export type FitRegionPackId = (typeof FIT_REGION_PACK_IDS)[number];

export type FitRegionPackOption = {
  region: FitRegionPackId;
  label: string;
  chipLabel: string;
  /** Short hint under the chip (Closet ethos — regional fit, not India-only). */
  hint: string;
};

export const FIT_REGION_PACK_OPTIONS: readonly FitRegionPackOption[] = [
  {
    region: "IN",
    label: "India",
    chipLabel: "IN",
    hint: "Blouse, kurti, saree & local alterations",
  },
  {
    region: "US",
    label: "United States",
    chipLabel: "US",
    hint: "US suit & hemming templates",
  },
  {
    region: "UK",
    label: "United Kingdom",
    chipLabel: "UK",
    hint: "UK high-street alterations",
  },
  {
    region: "GLOBAL",
    label: "Global",
    chipLabel: "Global",
    hint: "Shirt & universal fit pack",
  },
] as const;

export function isFitRegionPackId(value: unknown): value is FitRegionPackId {
  return (
    typeof value === "string" &&
    (FIT_REGION_PACK_IDS as readonly string[]).includes(value.toUpperCase())
  );
}

export function normalizeFitRegionPack(
  value: string | null | undefined,
  fallback: FitRegionPackId = "IN",
): FitRegionPackId {
  if (!value) return fallback;
  const upper = value.trim().toUpperCase();
  return isFitRegionPackId(upper) ? upper : fallback;
}

/** Map Closet currency pick → default fit region (W003 → W092). */
export function defaultFitRegionFromCurrency(
  currency: string | null | undefined,
): FitRegionPackId {
  switch ((currency ?? "").toUpperCase()) {
    case "USD":
      return "US";
    case "GBP":
      return "UK";
    case "INR":
      return "IN";
    default:
      return "GLOBAL";
  }
}
