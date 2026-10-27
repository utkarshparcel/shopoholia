/**
 * MON-REVENUECAT — Purchases client scaffold (no react-native-purchases dep).
 * Configure EXPO_PUBLIC_REVENUECAT_API_KEY when wiring a real SDK.
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

function revenueCatFlagOn(): boolean {
  return process.env.EXPO_PUBLIC_FEATURE_REVENUECAT === '1';
}

function upiCheckoutExperiment(): boolean {
  return (
    process.env.EXPO_PUBLIC_EXPERIMENT_UPI_CHECKOUT === '1' ||
    process.env.EXPO_PUBLIC_FEATURE_UPI === '1'
  );
}

function wornRegion(): string {
  return (process.env.EXPO_PUBLIC_WORN_REGION ?? 'IN').toUpperCase();
}

export function getRevenueCatApiKey(): string | null {
  const key = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
  return key && key.length > 0 ? key : null;
}

export function isRevenueCatConfigured(): boolean {
  return revenueCatFlagOn() && Boolean(getRevenueCatApiKey());
}

/** Stub configure — no-op without API key (never ships store secrets). */
export async function configureRevenueCat(_appUserId: string): Promise<{ configured: boolean }> {
  if (!isRevenueCatConfigured()) {
    return { configured: false };
  }
  // Real SDK: Purchases.configure({ apiKey: getRevenueCatApiKey()!, appUserID })
  return { configured: true };
}

export function setLocalEntitlements(snapshot: EntitlementSnapshot | null): void {
  localSnapshot = snapshot;
}

export function getLocalEntitlements(): EntitlementSnapshot | null {
  return localSnapshot;
}

/**
 * Start a local trial (dev / simulated IAP). Mirrors API /entitlements/sync.
 */
export function startLocalTrial(userId: string, productId: string): EntitlementSnapshot {
  const grants = buildTrialGrants(productId, { source: 'dev' });
  const snapshot: EntitlementSnapshot = {
    userId,
    grants,
    asOf: new Date().toISOString(),
  };
  localSnapshot = snapshot;
  return snapshot;
}

export function canAccessClosetPremium(
  surface: ClosetEntitlement,
  snapshot: Pick<EntitlementSnapshot, 'grants'> | null = localSnapshot,
): boolean {
  return canAccessPremiumSurface(surface, snapshot, {
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
  const upiCta = upiCheckoutExperiment() && wornRegion() === 'IN';
  if (surface === 'accountant') {
    return {
      title: 'Accountant Premium',
      subtitle: 'Budgets, ROI seasons, and CSV export with a 7-day trial.',
      cta: upiCta ? 'Continue with UPI' : 'Start free trial',
      trialDays: 7,
    };
  }
  return {
    title: 'Outfits Premium',
    subtitle: 'Morning outfits, week plans, and calendar looks — 7-day trial.',
    cta: upiCta ? 'Continue with UPI' : 'Start free trial',
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

export function __resetRevenueCatForTests(): void {
  localSnapshot = null;
}
