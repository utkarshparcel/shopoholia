/**
 * Closet premium entitlements, stored per user (entitlement_grants). Grants come only from a verified
 * source: an App Store / Google Play subscription checked with the store (POST /entitlements/sync,
 * App Store Server Notifications, the daily Play re-check), or the dev simulation outside production.
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import {
  buildTrialGrants,
  canAccessPremiumSurface,
  entitlementsForProduct,
  isGrantActive,
  premiumSubscriptionByStoreProductId,
  type ClosetEntitlement,
  type EntitlementGrant,
  type EntitlementSnapshot,
  type EntitlementSyncBody,
} from "@worn/shared";
import {
  rejectionResponse,
  simulatedPurchasesAllowed,
  type PurchaseVerifier,
  type ValidateOutcome,
  type VerifiedSubscription,
} from "./coin-purchases.js";
import type { EntitlementGrantRecord, Repositories } from "./repositories/types.js";

export function premiumGatesEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.FEATURE_PREMIUM_GATES === "1";
}

function toGrant(record: EntitlementGrantRecord): EntitlementGrant {
  return {
    entitlementId: record.entitlementId as ClosetEntitlement,
    productId: record.productId,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    isTrial: record.isTrial,
    source: record.source,
  };
}

export async function snapshotForUser(
  repos: Repositories,
  userId: string,
): Promise<EntitlementSnapshot> {
  const grants = await repos.listEntitlementGrants(userId);
  return { userId, grants: grants.map(toGrant), asOf: new Date().toISOString() };
}

/** Grant records for every entitlement of `productId` (none for an unknown product). */
export function grantsForProduct(
  productId: string,
  opts: {
    expiresAt: Date | null;
    isTrial: boolean;
    source: EntitlementGrantRecord["source"];
    eventAt: Date;
    storeRef?: string | null;
  },
): EntitlementGrantRecord[] {
  return entitlementsForProduct(productId).map((entitlementId) => ({
    entitlementId,
    productId,
    ...opts,
  }));
}

/** Dev simulation only (callers check NODE_ENV): a trial from the product's trial length. */
export function devTrialGrants(productId: string, startedAt: Date): EntitlementGrantRecord[] {
  return buildTrialGrants(productId, { startedAt, source: "dev" }).map((grant) => ({
    entitlementId: grant.entitlementId,
    productId: grant.productId,
    expiresAt: grant.expiresAt ? new Date(grant.expiresAt) : null,
    isTrial: true,
    source: "dev" as const,
    eventAt: startedAt,
  }));
}

export async function userCanAccess(
  repos: Repositories,
  userId: string,
  surface: ClosetEntitlement,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const gatesEnabled = premiumGatesEnabled(env);
  if (!gatesEnabled) return true;
  return canAccessPremiumSurface(surface, await snapshotForUser(repos, userId), { gatesEnabled });
}

/**
 * preHandler: when FEATURE_PREMIUM_GATES=1, require an active entitlement.
 * Off by default so staging / existing tests stay open.
 */
export function requireEntitlement(surface: ClosetEntitlement) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.sub;
    if (!userId) {
      return reply
        .code(401)
        .send({ error: "Unauthorized", message: "Invalid or missing token" });
    }
    if (await userCanAccess(request.server.deps.repos, userId, surface)) return;
    return reply.code(403).send({
      error: "Forbidden",
      message: `Premium entitlement required: ${surface}`,
    });
  };
}

/** Grants for a verified store subscription, under its Closet product (none for another product). */
export function subscriptionGrants(sub: VerifiedSubscription): EntitlementGrantRecord[] {
  const premium = premiumSubscriptionByStoreProductId(sub.productId);
  if (!premium) return [];
  return grantsForProduct(premium.productId, {
    expiresAt: sub.expiresAt,
    isTrial: sub.isTrial,
    source: sub.store,
    eventAt: sub.eventAt,
    storeRef: sub.storeRef,
  });
}

export type SyncOutcome =
  | { ok: true; snapshot: EntitlementSnapshot }
  | Extract<ValidateOutcome, { ok: false }>;

/**
 * POST /entitlements/sync: checks the subscription with its store and stores what the store says.
 * Without proof, only the dev simulation (simulatedPurchasesAllowed) answers, with a trial.
 */
export async function syncStoreSubscription(
  repos: Repositories,
  verifier: PurchaseVerifier,
  userId: string,
  body: EntitlementSyncBody,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SyncOutcome> {
  const { productId } = body;
  if (entitlementsForProduct(productId).length === 0) {
    return { ok: false, status: 400, error: "Bad Request", message: `Unknown product: ${productId}` };
  }

  if (!body.jws && !body.purchaseToken) {
    if (!simulatedPurchasesAllowed(env)) {
      return {
        ok: false,
        status: 400,
        error: "Bad Request",
        message: "store and jws (App Store) or purchaseToken (Google Play) are required",
      };
    }
    // Dev simulation outside production: one trial per product, marked source "dev".
    const existing = await repos.listEntitlementGrants(userId);
    if (!existing.some((g) => g.productId === productId)) {
      await repos.applyEntitlementGrants(userId, devTrialGrants(productId, new Date()));
    }
    return { ok: true, snapshot: await snapshotForUser(repos, userId) };
  }

  const store = body.store;
  if (!store) return { ok: false, status: 400, error: "Bad Request", message: "store is required" };
  const verified = await verifier.verifySubscription({
    store,
    proof: store === "app_store" ? body.jws : body.purchaseToken,
    userId,
  });
  if (!verified.ok) return rejectionResponse(verified);
  if (premiumSubscriptionByStoreProductId(verified.subscription.productId)?.productId !== productId) {
    return {
      ok: false,
      status: 402,
      error: "product_mismatch",
      message: "This subscription is for a different product",
    };
  }

  await repos.applyEntitlementGrants(userId, subscriptionGrants(verified.subscription));
  const snapshot = await snapshotForUser(repos, userId);
  if (!snapshot.grants.some((g) => g.productId === productId && g.source === store && isGrantActive(g))) {
    return {
      ok: false,
      status: 402,
      error: "subscription_inactive",
      message: "This subscription isn't active",
    };
  }
  return { ok: true, snapshot };
}
