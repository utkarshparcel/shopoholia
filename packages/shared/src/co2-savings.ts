/**
 * WV05-CO2 — thin heuristic CO₂ / water saved by re-wearing (not a full LCA ledger).
 *
 * Industry-ballpark factors (apparel): each wear beyond the first avoids a slice of
 * replacement-manufacture + first-wash impact. Tunable constants — product copy only.
 */

/** kg CO₂e avoided per rewear (wear beyond the first). */
export const KG_CO2_PER_REWEAR = 2.1;

/** Liters of water avoided per rewear (cotton-heavy apparel ballpark). */
export const LITERS_WATER_PER_REWEAR = 1_000;

export type Co2WaterSavingsInput = {
  /** Per-item wear counts from item_metrics. */
  metrics: Array<{ wearCount: number }>;
  /** Optional N53 streak days — thin bonus (1 day ≈ 0.25 rewear-equivalent). */
  rewearStreakDays?: number;
};

export type Co2WaterSavings = {
  /** Sum of max(0, wearCount − 1) across items. */
  rewearCount: number;
  /** Streak days counted toward the heuristic (0 if omitted). */
  streakDays: number;
  /** Effective wears used in the formula (rewearCount + 0.25 × streakDays). */
  effectiveRewears: number;
  kgCo2Saved: number;
  litersWaterSaved: number;
  /** Short UI label e.g. "~4.2 kg CO₂ · ~2,000 L water saved". */
  label: string;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatCo2WaterLabel(kgCo2: number, litersWater: number): string {
  const kg = round1(Math.max(0, kgCo2));
  const L = Math.max(0, Math.round(litersWater));
  if (kg <= 0 && L <= 0) return "No CO₂/water savings yet — rewear to start";
  const water =
    L >= 1000 ? `~${(L / 1000).toFixed(L % 1000 === 0 ? 0 : 1)}k L` : `~${L} L`;
  return `~${kg} kg CO₂ · ${water} water saved`;
}

/**
 * Heuristic savings from rewear counts (+ optional streak bonus).
 * First wear does not count; each additional wear is one rewear.
 */
export function computeCo2WaterSavings(input: Co2WaterSavingsInput): Co2WaterSavings {
  let rewearCount = 0;
  for (const m of input.metrics) {
    const wears = Math.max(0, Math.floor(m.wearCount));
    rewearCount += Math.max(0, wears - 1);
  }
  const streakDays = Math.max(0, Math.floor(input.rewearStreakDays ?? 0));
  const effectiveRewears = rewearCount + streakDays * 0.25;
  const kgCo2Saved = round1(effectiveRewears * KG_CO2_PER_REWEAR);
  const litersWaterSaved = Math.round(effectiveRewears * LITERS_WATER_PER_REWEAR);

  return {
    rewearCount,
    streakDays,
    effectiveRewears: round1(effectiveRewears),
    kgCo2Saved,
    litersWaterSaved,
    label: formatCo2WaterLabel(kgCo2Saved, litersWaterSaved),
  };
}
