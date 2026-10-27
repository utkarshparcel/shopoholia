import type { FastifyBaseLogger } from "fastify";

export type AuditEvent =
  | "consent.granted"
  | "consent.revoked"
  | "consent.exported"
  | "vault.deleted"
  | "vault.notification_preferences.updated"
  | "money.read"
  | "money.credit.added"
  | "money.credit.spent"
  | "money.credit.captured"
  | "money.credit.balance_check"
  | "money.credit.balance_confirmed"
  | "money.credit.added_override"
  | "money.credit.spend_undone"
  | "money.credit.merged"
  | "money.credit.expiry_handled"
  | "money.reconciled"
  | "ingestion.source.created"
  | "ingestion.source.updated"
  | "ingestion.source.disconnected"
  | "ingestion.sms.received"
  | "ingestion.oauth.initiated"
  | "ingestion.document.corrected"
  | "ingestion.fixture.exported"
  | "ingestion.merchant.aliased"
  | "ingestion.mute.rule"
  | "ingestion.mute.undone"
  | "ingestion.raw.deleted"
  | "ingestion.retention.purged"
  | "money.reconcile.investigated"
  | "gift.budget.locked"
  | "parser.break.flagged"
  | "purchases.merged"
  | "purchases.split"
  | "receipt.uploaded"
  | "receipt.confirmed"
  | "receipt.corrected"
  | "receipt.exported"
  | "warranty.claimed"
  | "warranty.unclaimed"
  | "warranty.snoozed"
  | "emi.payment"
  | "play.buy.tracked"
  | "bridge.play_buy_tracked"
  | "wardrobe.item.created"
  | "wardrobe.item.updated"
  | "wardrobe.item.deleted"
  | "wardrobe.bulk.created"
  | "wardrobe.photo_dump"
  | "wardrobe.from_purchases"
  | "wardrobe.autotag"
  | "wardrobe.tryon"
  | "wardrobe.capsule.updated"
  | "concierge.ingest"
  | "concierge.sort"
  | "concierge.list"
  | "concierge.wardrobe.read"
  | "wear.logged"
  | "wear.undone"
  | "waste.disposed"
  | "waste.keep_snoozed"
  | "budget.created"
  | "cpw_goal.set"
  | "cpw_threshold.set"
  | "return.created"
  | "return.initiated"
  | "return.confirmed"
  | "return.refunded"
  | "return.pickup_scheduled"
  | "return.pickup_rescheduled"
  | "return.pickup_cancelled"
  | "return.chase_snoozed"
  | "return.chase_escalated"
  | "return.window.corrected"
  | "package.rto_address_fixed"
  | "package.delivery_proof_attached"
  | "package.assigned"
  | "invoice.requested"
  | "wardrobe.care_ocr"
  | "wardrobe.dry_clean.drop_off"
  | "wardrobe.dry_clean.confirm"
  | "wardrobe.repair_logged"
  | "wardrobe.lend"
  | "wardrobe.lend.return"
  | "wardrobe.lend.nudge"
  | "wardrobe.lend.lost"
  | "wardrobe.laundry_rules"
  | "wardrobe.laundry_batch_clean"
  | "wardrobe.photo_dump.triage"
  | "wardrobe.photo_dump.triage_undo"
  | "outfit.day.pinned"
  | "outfit.day.unpinned"
  | "fit.measurement.updated"
  | "fit.tailor.received"
  | "fit.tailor.pickup_nudge"
  | "dispose.tree.resolved";

export type AuditRecord = {
  id: string;
  event: AuditEvent;
  userId?: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

// In-memory audit log — queryable via GET /vault/audit.
// In production this would be a Postgres `audit_log` table; the
// in-memory store keeps the contract while the Postgres repos are
// still stubbed to memory (see repositories/postgres.ts).
const MAX_AUDIT_ROWS = 5000;
const auditLog: AuditRecord[] = [];

function randomId(): string {
  try {
    // Node 19+ has crypto.randomUUID
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function audit(
  log: FastifyBaseLogger,
  event: AuditEvent,
  payload: Record<string, unknown>,
): void {
  log.info({ audit: true, event, ...payload });
  const record: AuditRecord = {
    id: randomId(),
    event,
    userId: typeof payload.userId === "string" ? payload.userId : undefined,
    timestamp: new Date().toISOString(),
    payload,
  };
  auditLog.push(record);
  if (auditLog.length > MAX_AUDIT_ROWS) auditLog.shift();
}

export function listAuditRecords(filter?: { userId?: string; event?: string; limit?: number }): AuditRecord[] {
  let rows = auditLog;
  if (filter?.userId) rows = rows.filter((r) => r.userId === filter.userId);
  if (filter?.event) rows = rows.filter((r) => r.event === filter.event);
  const limit = filter?.limit ?? 100;
  return rows.slice(-limit).reverse();
}

export function clearAuditLog(): void {
  auditLog.length = 0;
}
