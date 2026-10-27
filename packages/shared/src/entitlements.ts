/**
 * Closet premium entitlements (Accountant + Outfits), sold as App Store / Google Play
 * subscriptions (PREMIUM_SUBSCRIPTIONS in economy.ts). Product / entitlement IDs are stable strings.
 */

export const CLOSET_ENTITLEMENTS = ["accountant", "outfits"] as const;
export type ClosetEntitlement = (typeof CLOSET_ENTITLEMENTS)[number];

export const CLOSET_PREMIUM_PRODUCTS = [
  {
    id: "closet_premium_monthly",
    entitlementIds: ["accountant", "outfits"] as const,
    trialDays: 7,
    label: "Closet Premium",
  },
  {
    id: "closet_accountant_monthly",
    entitlementIds: ["accountant"] as const,
    trialDays: 7,
    label: "Accountant",
  },
  {
    id: "closet_outfits_monthly",
    entitlementIds: ["outfits"] as const,
    trialDays: 7,
    label: "Outfits",
  },
] as const;

export type ClosetPremiumProduct = (typeof CLOSET_PREMIUM_PRODUCTS)[number];

export function closetProductById(id: string): ClosetPremiumProduct | undefined {
  return CLOSET_PREMIUM_PRODUCTS.find((p) => p.id === id);
}

export function entitlementsForProduct(productId: string): ClosetEntitlement[] {
  const product = closetProductById(productId);
  return product ? [...product.entitlementIds] : [];
}

export type EntitlementGrant = {
  entitlementId: ClosetEntitlement;
  productId: string;
  /** ISO expiry; null = lifetime / open-ended. */
  expiresAt: string | null;
  /** True while within trial window. */
  isTrial: boolean;
  source: "app_store" | "play_store" | "upi" | "dev";
};

export type EntitlementSnapshot = {
  userId: string;
  grants: EntitlementGrant[];
  /** Server clock used for gate checks. */
  asOf: string;
};

/** Active if no expiry or expiresAt is strictly after `now`. */
export function isGrantActive(grant: EntitlementGrant, now: Date = new Date()): boolean {
  if (!grant.expiresAt) return true;
  return new Date(grant.expiresAt).getTime() > now.getTime();
}

export function hasEntitlement(
  snapshot: Pick<EntitlementSnapshot, "grants">,
  entitlementId: ClosetEntitlement,
  now: Date = new Date(),
): boolean {
  return snapshot.grants.some(
    (g) => g.entitlementId === entitlementId && isGrantActive(g, now),
  );
}

/**
 * Gate premium Closet surfaces.
 * When `gatesEnabled` is false (default in staging without flag), always allow.
 */
export function canAccessPremiumSurface(
  surface: ClosetEntitlement,
  snapshot: Pick<EntitlementSnapshot, "grants"> | null | undefined,
  opts: { gatesEnabled: boolean; now?: Date } = { gatesEnabled: false },
): boolean {
  if (!opts.gatesEnabled) return true;
  if (!snapshot) return false;
  return hasEntitlement(snapshot, surface, opts.now ?? new Date());
}

/** Trial expiry from purchase/start instant. */
export function trialExpiresAt(
  productId: string,
  startedAt: Date = new Date(),
): Date | null {
  const product = closetProductById(productId);
  if (!product) return null;
  return new Date(startedAt.getTime() + product.trialDays * 24 * 60 * 60 * 1000);
}

export function buildTrialGrants(
  productId: string,
  opts?: { startedAt?: Date; source?: EntitlementGrant["source"] },
): EntitlementGrant[] {
  const product = closetProductById(productId);
  if (!product) return [];
  const startedAt = opts?.startedAt ?? new Date();
  const expires = trialExpiresAt(productId, startedAt);
  return product.entitlementIds.map((entitlementId) => ({
    entitlementId,
    productId,
    expiresAt: expires?.toISOString() ?? null,
    isTrial: true,
    source: opts?.source ?? "dev",
  }));
}
