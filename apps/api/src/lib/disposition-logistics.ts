/**
 * DISP-LOGISTICS — resale/donate pricing suggestions + pickup/logistics partner stub.
 */

export type DispositionMode = "SELL" | "DONATE" | "BARTER";

export type LogisticsPartner = {
  id: string;
  name: string;
  modes: DispositionMode[];
  metro: string;
  etaHours: number;
  stub: true;
};

/** Static India metro logistics partners (stub — no live booking API). */
export const LOGISTICS_PARTNERS: readonly LogisticsPartner[] = [
  {
    id: "stub-delhivery-resale",
    name: "Delhivery Resale Pickup",
    modes: ["SELL", "BARTER"],
    metro: "PAN-IN",
    etaHours: 48,
    stub: true,
  },
  {
    id: "stub-shadowfax-closet",
    name: "Shadowfax Closet Courier",
    modes: ["SELL", "BARTER"],
    metro: "T1",
    etaHours: 36,
    stub: true,
  },
  {
    id: "stub-goonj-donate",
    name: "Goonj Donation Van",
    modes: ["DONATE"],
    metro: "DEL/NCR",
    etaHours: 72,
    stub: true,
  },
  {
    id: "stub-habitat-donate",
    name: "Habitat for Humanity Drop",
    modes: ["DONATE"],
    metro: "BLR/HYD",
    etaHours: 96,
    stub: true,
  },
] as const;

export type SuggestPriceInput = {
  costMinor: number;
  createdAt: Date;
  category: string;
  brand?: string | null;
  wearCount?: number;
  now?: Date;
};

export type SuggestPriceResult = {
  suggestedPriceMinor: number;
  floorMinor: number;
  ceilingMinor: number;
  depreciationPct: number;
  ageYears: number;
  rationale: string;
};

const CATEGORY_DEFAULT_MINOR: Record<string, number> = {
  blazer: 450000,
  "dress shirt": 150000,
  trousers: 200000,
  chinos: 180000,
  oxford: 250000,
  loafers: 300000,
  formal: 200000,
  shirt: 120000,
  jeans: 150000,
  kurta: 180000,
  dress: 220000,
};

function defaultCostForCategory(category: string): number {
  const key = category.trim().toLowerCase();
  for (const [k, v] of Object.entries(CATEGORY_DEFAULT_MINOR)) {
    if (key.includes(k)) return v;
  }
  return 100000; // ₹1,000 fallback
}

/**
 * Heuristic resale/donate ask price from cost, age, and wears.
 * - Starts at 55% of cost (or category default when cost unknown)
 * - −8% per full year owned (cap 40%)
 * - −1.5% per wear (cap 25%)
 * - Floor 12% of basis, ceiling 70% of basis
 * - DONATE-oriented callers may still use the number as a fair-value estimate
 */
export function suggestDispositionPrice(input: SuggestPriceInput): SuggestPriceResult {
  const now = input.now ?? new Date();
  const basis =
    input.costMinor > 0 ? input.costMinor : defaultCostForCategory(input.category);
  const ageMs = Math.max(0, now.getTime() - input.createdAt.getTime());
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
  const wearCount = Math.max(0, input.wearCount ?? 0);

  const ageDep = Math.min(0.4, ageYears * 0.08);
  const wearDep = Math.min(0.25, wearCount * 0.015);
  const depreciationPct = Math.round((ageDep + wearDep) * 1000) / 10;

  const startPct = 0.55;
  let pct = startPct - ageDep - wearDep;
  pct = Math.max(0.12, Math.min(0.7, pct));

  const suggested = Math.max(100, Math.round((basis * pct) / 100) * 100); // round to ₹1
  const floorMinor = Math.max(100, Math.round((basis * 0.12) / 100) * 100);
  const ceilingMinor = Math.max(floorMinor, Math.round((basis * 0.7) / 100) * 100);
  const suggestedPriceMinor = Math.min(ceilingMinor, Math.max(floorMinor, suggested));

  const brandBit = input.brand ? ` (${input.brand})` : "";
  const rationale = `Resale ask from ${Math.round(startPct * 100)}% of basis ₹${(basis / 100).toFixed(0)}${brandBit}; age ${ageYears.toFixed(1)}y (−${Math.round(ageDep * 100)}%) and ${wearCount} wears (−${Math.round(wearDep * 100)}%).`;

  return {
    suggestedPriceMinor,
    floorMinor,
    ceilingMinor,
    depreciationPct,
    ageYears: Math.round(ageYears * 10) / 10,
    rationale,
  };
}

export function findLogisticsPartner(partnerId: string): LogisticsPartner | null {
  return LOGISTICS_PARTNERS.find((p) => p.id === partnerId) ?? null;
}

export function partnersForMode(mode: DispositionMode): LogisticsPartner[] {
  return LOGISTICS_PARTNERS.filter((p) => p.modes.includes(mode));
}

export type PickupBookingInput = {
  partnerId: string;
  pickupSlotAt: Date;
  mode: DispositionMode;
  now?: Date;
};

export type PickupBooking = {
  partnerId: string;
  partnerName: string;
  pickupSlotAt: Date;
  bookedAt: Date;
  stub: true;
  etaHours: number;
};

export function bookDispositionPickup(
  input: PickupBookingInput,
): { ok: true; booking: PickupBooking } | { ok: false; error: string } {
  const partner = findLogisticsPartner(input.partnerId);
  if (!partner) return { ok: false, error: "Unknown logistics partner" };
  if (!partner.modes.includes(input.mode)) {
    return { ok: false, error: `Partner does not support mode ${input.mode}` };
  }
  const now = input.now ?? new Date();
  if (Number.isNaN(input.pickupSlotAt.getTime())) {
    return { ok: false, error: "Invalid pickupSlotAt" };
  }
  if (input.pickupSlotAt.getTime() < now.getTime() - 60_000) {
    return { ok: false, error: "pickupSlotAt must be in the future" };
  }
  return {
    ok: true,
    booking: {
      partnerId: partner.id,
      partnerName: partner.name,
      pickupSlotAt: input.pickupSlotAt,
      bookedAt: now,
      stub: true,
      etaHours: partner.etaHours,
    },
  };
}
