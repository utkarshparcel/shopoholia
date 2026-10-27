/**
 * Closet Premium gate helpers. Entitlements come from the server's verified snapshot
 * (GET /entitlements, POST /entitlements/sync); store purchases go through
 * `src/lib/purchases`. The only client-side grant is a local trial, and it exists only in
 * __DEV__ builds.
 */

import {
  buildTrialGrants,
  canAccessPremiumSurface,
  type ClosetEntitlement,
  type EntitlementGrant,
  type EntitlementSnapshot,
} from '@worn/shared';

let localSnapshot: EntitlementSnapshot | null = null;

/** Read at call time so vitest can flip env without `vi.resetModules()`. */
function premiumGatesEnabled(): boolean {
  return process.env.EXPO_PUBLIC_FEATURE_PREMIUM_GATES === '1';
}

export function getLocalEntitlements(): EntitlementSnapshot | null {
  return __DEV__ ? localSnapshot : null;
}

/**
 * Starts a local trial that unlocks the gate on this device only. __DEV__ builds only:
 * elsewhere it grants nothing and returns null.
 */
export function startLocalTrial(userId: string, productId: string): EntitlementSnapshot | null {
  if (!__DEV__) return null;
  const grants = buildTrialGrants(productId, { source: 'dev' });
  const snapshot: EntitlementSnapshot = {
    userId,
    grants,
    asOf: new Date().toISOString(),
  };
  localSnapshot = snapshot;
  return snapshot;
}

/** `snapshot` is the server's verified snapshot; a __DEV__ local trial also counts. */
export function canAccessClosetPremium(
  surface: ClosetEntitlement,
  snapshot: Pick<EntitlementSnapshot, 'grants'> | null = null,
): boolean {
  const local = getLocalEntitlements();
  const merged = local ? { grants: mergeGrants(snapshot?.grants ?? [], local.grants) } : snapshot;
  return canAccessPremiumSurface(surface, merged, {
    gatesEnabled: premiumGatesEnabled(),
  });
}

export type PaywallCopy = {
  title: string;
  subtitle: string;
  cta: string;
  trialDays: number;
};

export function paywallCopyFor(surface: ClosetEntitlement): PaywallCopy {
  if (surface === 'accountant') {
    return {
      title: 'Accountant Premium',
      subtitle: 'Budgets, ROI seasons, and CSV export with a 7-day trial.',
      cta: 'Start free trial',
      trialDays: 7,
    };
  }
  return {
    title: 'Outfits Premium',
    subtitle: 'Morning outfits, week plans, and calendar looks — 7-day trial.',
    cta: 'Start free trial',
    trialDays: 7,
  };
}

export function mergeGrants(
  existing: EntitlementGrant[],
  incoming: EntitlementGrant[],
): EntitlementGrant[] {
  const map = new Map<string, EntitlementGrant>();
  for (const g of existing) map.set(`${g.entitlementId}:${g.productId}`, g);
  for (const g of incoming) map.set(`${g.entitlementId}:${g.productId}`, g);
  return [...map.values()];
}

export function __resetLocalTrialForTests(): void {
  localSnapshot = null;
}
