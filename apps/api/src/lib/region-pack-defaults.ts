/**
 * U048 — Region pack defaults: merchants, festivals, size systems.
 * Complements W092 fit-template seeding.
 */

import type { FitRegionPackId } from "@worn/shared";

export type RegionFestivalSeed = {
  occasion: string;
  label: string;
  /** Month 1–12 (approx Gregorian; yearly roll handled by callers). */
  month: number;
  day: number;
};

export type RegionPackDefaults = {
  region: FitRegionPackId;
  merchants: string[];
  festivals: RegionFestivalSeed[];
  /** Size system labels for Fit Vault UI. */
  sizeSystem: {
    id: string;
    label: string;
    examples: string[];
  };
  /** Short copy for onboarding confirmation. */
  summary: string;
};

const PACKS: Record<FitRegionPackId, RegionPackDefaults> = {
  IN: {
    region: "IN",
    merchants: ["Myntra", "Ajio", "Flipkart", "Amazon", "Nykaa", "Meesho"],
    festivals: [
      { occasion: "FESTIVAL", label: "Diwali", month: 11, day: 8 },
      { occasion: "FESTIVAL", label: "Rakhi", month: 8, day: 28 },
      { occasion: "FESTIVAL", label: "Holi", month: 3, day: 3 },
    ],
    sizeSystem: {
      id: "IN_ALPHA",
      label: "India (S–XXL / blouse inches)",
      examples: ["S", "M", "L", "XL", "32", "34", "36"],
    },
    summary: "India merchants, festival dates, and blouse/kurti size labels.",
  },
  US: {
    region: "US",
    merchants: ["Amazon", "Target", "Walmart", "Nordstrom", "Nike"],
    festivals: [
      { occasion: "FESTIVAL", label: "Thanksgiving", month: 11, day: 26 },
      { occasion: "FESTIVAL", label: "Black Friday", month: 11, day: 27 },
      { occasion: "FESTIVAL", label: "Christmas", month: 12, day: 25 },
    ],
    sizeSystem: {
      id: "US_NUMERIC",
      label: "US numeric / alpha",
      examples: ["0", "2", "4", "6", "8", "S", "M", "L"],
    },
    summary: "US merchants, holiday dates, and US size labels.",
  },
  UK: {
    region: "UK",
    merchants: ["ASOS", "John Lewis", "Marks & Spencer", "Zara", "Nike"],
    festivals: [
      { occasion: "FESTIVAL", label: "Boxing Day", month: 12, day: 26 },
      { occasion: "FESTIVAL", label: "Christmas", month: 12, day: 25 },
      { occasion: "FESTIVAL", label: "Bank Holiday", month: 8, day: 31 },
    ],
    sizeSystem: {
      id: "UK_NUMERIC",
      label: "UK numeric",
      examples: ["6", "8", "10", "12", "14", "16"],
    },
    summary: "UK merchants, holiday dates, and UK size labels.",
  },
  GLOBAL: {
    region: "GLOBAL",
    merchants: ["Amazon", "Zara", "Nike", "H&M"],
    festivals: [
      { occasion: "FESTIVAL", label: "New Year", month: 1, day: 1 },
      { occasion: "FESTIVAL", label: "Christmas", month: 12, day: 25 },
    ],
    sizeSystem: {
      id: "GLOBAL_ALPHA",
      label: "International alpha",
      examples: ["XS", "S", "M", "L", "XL"],
    },
    summary: "Global merchants, common holidays, and alpha sizes.",
  },
};

export function getRegionPackDefaults(region: FitRegionPackId): RegionPackDefaults {
  return PACKS[region];
}

/** Festival seeds for a region + year (ISO UTC midnight). */
export function regionFestivalDates(
  region: FitRegionPackId,
  opts?: { year?: number; from?: Date },
): Array<{ occasion: string; label: string; date: string }> {
  const year = opts?.year ?? (opts?.from ?? new Date()).getUTCFullYear();
  const from = opts?.from ?? new Date();
  const pack = getRegionPackDefaults(region);
  return pack.festivals
    .map((f) => ({
      occasion: f.occasion,
      label: f.label,
      date: new Date(Date.UTC(year, f.month - 1, f.day, 0, 0, 0)).toISOString(),
    }))
    .filter((f) => new Date(f.date).getTime() >= from.getTime() - 86_400_000)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function listRegionPackDefaults(): RegionPackDefaults[] {
  return (Object.keys(PACKS) as FitRegionPackId[]).map((r) => PACKS[r]);
}
