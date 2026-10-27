/**
 * U034 — weather / occasion missing layer → Closet-framed shop list (1–3).
 */

export type MissingLayerWeather = {
  tempC?: number | null;
  condition?: string | null;
};

export type MissingLayerOccasion =
  | "CASUAL"
  | "WORK"
  | "FORMAL"
  | "PARTY"
  | "SPORT"
  | "TRAVEL"
  | null
  | undefined;

export type MissingLayerSuggestion = {
  id: string;
  gapReason: string;
  suggestion: string;
  slot: "outer" | "layer" | "shoes" | "accessory";
  affiliateUrl: string;
};

export type OwnedSlotCounts = {
  outer?: number;
  layer?: number;
  shoes?: number;
  accessory?: number;
};

function shopUrl(query: string): string {
  const q = encodeURIComponent(query.trim() || "layer");
  return `https://www.myntra.com/${q.replace(/%20/g, "-")}?ref=shopoholia-closet`;
}

/**
 * Detect 1–3 missing layers for current weather + occasion given owned counts.
 * Closet-framed: affiliate optional, never auto-checkout.
 */
export function detectMissingLayers(opts: {
  weather?: MissingLayerWeather | null;
  occasion?: MissingLayerOccasion;
  owned?: OwnedSlotCounts;
  dismissedIds?: string[] | null;
}): MissingLayerSuggestion[] {
  const owned = opts.owned ?? {};
  const dismissed = new Set(opts.dismissedIds ?? []);
  const temp = opts.weather?.tempC ?? 24;
  const condition = (opts.weather?.condition ?? "").toLowerCase();
  const occasion = opts.occasion ?? "CASUAL";
  const candidates: MissingLayerSuggestion[] = [];

  if (temp <= 18 && (owned.outer ?? 0) < 1) {
    candidates.push({
      id: "layer-outer-cold",
      gapReason: `Cool weather (${temp}°C) — missing outer layer`,
      suggestion: "Light jacket or cardigan",
      slot: "outer",
      affiliateUrl: shopUrl("light jacket"),
    });
  }
  if ((condition.includes("rain") || condition.includes("humid")) && (owned.outer ?? 0) < 1) {
    candidates.push({
      id: "layer-rain",
      gapReason: `Weather is ${condition || "wet"} — need rain layer`,
      suggestion: "Rain jacket or umbrella-friendly shell",
      slot: "outer",
      affiliateUrl: shopUrl("rain jacket"),
    });
  }
  if (temp >= 30 && (owned.layer ?? 0) < 1) {
    candidates.push({
      id: "layer-breathable",
      gapReason: `Hot day (${temp}°C) — breathable base layer gap`,
      suggestion: "Breathable cotton tee or tank",
      slot: "layer",
      affiliateUrl: shopUrl("cotton tee"),
    });
  }
  if ((occasion === "FORMAL" || occasion === "WORK") && (owned.layer ?? 0) < 1) {
    candidates.push({
      id: "layer-work",
      gapReason: `${occasion.toLowerCase()} occasion — missing polished layer`,
      suggestion: "Blazer or structured shirt",
      slot: "layer",
      affiliateUrl: shopUrl("blazer"),
    });
  }
  if ((occasion === "PARTY" || occasion === "FORMAL") && (owned.shoes ?? 0) < 1) {
    candidates.push({
      id: "layer-shoes",
      gapReason: `${occasion.toLowerCase()} — dress shoes gap`,
      suggestion: "Dress shoes or heels",
      slot: "shoes",
      affiliateUrl: shopUrl("dress shoes"),
    });
  }
  if (occasion === "SPORT" && (owned.layer ?? 0) < 1) {
    candidates.push({
      id: "layer-sport",
      gapReason: "Sport occasion — active layer gap",
      suggestion: "Athletic top or joggers pair",
      slot: "layer",
      affiliateUrl: shopUrl("athletic top"),
    });
  }

  // Dedupe by slot, keep highest priority first, cap 3, respect dismiss.
  const seenSlots = new Set<string>();
  const out: MissingLayerSuggestion[] = [];
  for (const c of candidates) {
    if (dismissed.has(c.id)) continue;
    if (seenSlots.has(c.slot)) continue;
    seenSlots.add(c.slot);
    out.push(c);
    if (out.length >= 3) break;
  }
  return out;
}
