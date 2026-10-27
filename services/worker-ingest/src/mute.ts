/**
 * Per-merchant mute helpers (N47). Muted names live on
 * `ingestion_sources.meta.mutedMerchants` (set via PATCH /ingestion/sources/:id).
 */

/** Case-fold + trim for stable mute comparisons. */
export function normalizeMerchant(name: string): string {
  return name.trim().toUpperCase();
}

/** Read muted merchant list from source meta (unknown JSON shape). */
export function mutedMerchantsFromMeta(
  meta: Record<string, unknown> | null | undefined,
): string[] {
  if (!meta || typeof meta !== "object") return [];
  const raw = meta.mutedMerchants;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
    .map(normalizeMerchant);
}

/**
 * True when `merchant` is on the mute list (case-insensitive).
 * Empty / missing mute list → never muted.
 */
export function isMerchantMuted(
  merchant: string | null | undefined,
  mutedMerchants: readonly string[] | null | undefined,
): boolean {
  if (!merchant?.trim()) return false;
  if (!mutedMerchants || mutedMerchants.length === 0) return false;
  const target = normalizeMerchant(merchant);
  return mutedMerchants.some((m) => normalizeMerchant(m) === target);
}
