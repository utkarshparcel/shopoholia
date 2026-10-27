/**
 * MON-REVENUECAT — in-memory entitlement store + RevenueCat webhook handling.
 * No App Store / Play secrets; gated by FEATURE_REVENUECAT / REVENUECAT_WEBHOOK_SECRET.
 */

import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  buildTrialGrants,
  canAccessPremiumSurface,
  entitlementsForProduct,
  type ClosetEntitlement,
  type EntitlementGrant,
  type EntitlementSnapshot,
} from "@worn/shared";

const grantsByUser = new Map<string, EntitlementGrant[]>();
const processedEventIds = new Set<string>();

export function premiumGatesEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.FEATURE_PREMIUM_GATES === "1";
}

export function revenueCatEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.FEATURE_REVENUECAT === "1";
}

export function snapshotForUser(userId: string): EntitlementSnapshot {
  return {
    userId,
    grants: [...(grantsByUser.get(userId) ?? [])],
    asOf: new Date().toISOString(),
  };
}

export function upsertGrants(userId: string, incoming: EntitlementGrant[]): EntitlementSnapshot {
  const existing = grantsByUser.get(userId) ?? [];
  const byKey = new Map<string, EntitlementGrant>();
  for (const g of existing) {
    byKey.set(`${g.entitlementId}:${g.productId}`, g);
  }
  for (const g of incoming) {
    byKey.set(`${g.entitlementId}:${g.productId}`, g);
  }
  const merged = [...byKey.values()];
  grantsByUser.set(userId, merged);
  return snapshotForUser(userId);
}

export function grantTrial(
  userId: string,
  productId: string,
  source: EntitlementGrant["source"] = "revenuecat",
): EntitlementSnapshot {
  return upsertGrants(userId, buildTrialGrants(productId, { source }));
}

export function grantPaid(
  userId: string,
  productId: string,
  expiresAt: Date | null,
  source: EntitlementGrant["source"] = "revenuecat",
): EntitlementSnapshot {
  const ids = entitlementsForProduct(productId);
  const grants: EntitlementGrant[] = ids.map((entitlementId) => ({
    entitlementId,
    productId,
    expiresAt: expiresAt?.toISOString() ?? null,
    isTrial: false,
    source,
  }));
  return upsertGrants(userId, grants);
}

export function userCanAccess(
  userId: string,
  surface: ClosetEntitlement,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return canAccessPremiumSurface(surface, snapshotForUser(userId), {
    gatesEnabled: premiumGatesEnabled(env),
  });
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
    if (userCanAccess(userId, surface)) return;
    return reply.code(403).send({
      error: "Forbidden",
      message: `Premium entitlement required: ${surface}`,
    });
  };
}

export type RevenueCatWebhookResult =
  | { ok: true; duplicate?: boolean; userId?: string; productId?: string }
  | { ok: false; reason: string };

/**
 * Process a RevenueCat-shaped webhook payload (scaffold).
 * Expects optional Authorization Bearer matching REVENUECAT_WEBHOOK_SECRET when set.
 */
export function processRevenueCatWebhook(
  body: Record<string, unknown>,
  opts?: { authorization?: string | null },
): RevenueCatWebhookResult {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (secret) {
    const auth = opts?.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
    if (token !== secret) {
      return { ok: false, reason: "invalid_webhook_secret" };
    }
  } else if (!revenueCatEnabled()) {
    return { ok: false, reason: "revenuecat_disabled" };
  }

  const event = (body.event ?? body) as Record<string, unknown>;
  const eventId =
    (typeof event.id === "string" && event.id) ||
    (typeof body.event_id === "string" && body.event_id) ||
    randomUUID();

  if (processedEventIds.has(eventId)) {
    return { ok: true, duplicate: true };
  }

  const appUserId =
    (typeof event.app_user_id === "string" && event.app_user_id) ||
    (typeof event.appUserId === "string" && event.appUserId) ||
    null;
  const productId =
    (typeof event.product_id === "string" && event.product_id) ||
    (typeof event.productId === "string" && event.productId) ||
    null;
  const type =
    (typeof event.type === "string" && event.type) ||
    (typeof body.type === "string" && body.type) ||
    "INITIAL_PURCHASE";

  if (!appUserId || !productId) {
    return { ok: false, reason: "missing_user_or_product" };
  }

  if (entitlementsForProduct(productId).length === 0) {
    return { ok: false, reason: "unknown_product" };
  }

  const expiration =
    typeof event.expiration_at_ms === "number"
      ? new Date(event.expiration_at_ms)
      : typeof event.expiration_at === "string"
        ? new Date(event.expiration_at)
        : null;

  if (type === "EXPIRATION" || type === "CANCELLATION") {
    // Expire by writing grants with past expiry
    grantPaid(appUserId, productId, new Date(0), "revenuecat");
  } else if (type === "TRIAL_STARTED" || type === "INITIAL_PURCHASE") {
    const isTrial = type === "TRIAL_STARTED" || event.period_type === "TRIAL";
    if (isTrial) {
      grantTrial(appUserId, productId, "revenuecat");
    } else {
      grantPaid(appUserId, productId, expiration, "revenuecat");
    }
  } else {
    grantPaid(appUserId, productId, expiration, "revenuecat");
  }

  processedEventIds.add(eventId);
  return { ok: true, userId: appUserId, productId };
}

/** Test helper. */
export function __resetEntitlementsForTests(): void {
  grantsByUser.clear();
  processedEventIds.clear();
}
