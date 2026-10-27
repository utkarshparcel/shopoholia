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
  | "dispose.tree.resolved"
  | "privacy.erase.requested"
  | "privacy.erase.completed"
  | "privacy.export.requested"
  | "privacy.export.completed";

export type AuditRecord = {
  id: string;
  event: AuditEvent;
  userId?: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

/** A row for the durable sink (`repos.appendAuditRecords`). */
export type AuditSinkRow = {
  userId: string | null;
  event: string;
  meta: Record<string, unknown>;
  at: Date;
};

// Log ids and event names only, never emails, phone numbers, names or message bodies: the
// payload is reduced to an allowlist before it reaches the log line, the in-process mirror or
// the audit_log table.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PHONE_LIKE_RE = /^\+?\d{7,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENUM_RE = /^[A-Za-z0-9_.-]{1,40}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
/** Keys whose string values are short codes (scope names, statuses, field names), not free text. */
const ENUM_KEYS = new Set([
  "scope",
  "surface",
  "kind",
  "status",
  "source",
  "mode",
  "format",
  "period",
  "category",
  "type",
  "provider",
  "decision",
  "nextAction",
  "fields",
  "patch",
  "reason",
]);
const MAX_ARRAY = 50;
const MAX_KEYS = 50;

function isIdKey(key: string): boolean {
  return key === "id" || key === "userId" || /Id$/.test(key);
}

function safeId(value: unknown): string | undefined {
  return typeof value === "string" && ID_RE.test(value) && !PHONE_LIKE_RE.test(value) ? value : undefined;
}

function safeEnum(value: unknown): string | undefined {
  return typeof value === "string" && ENUM_RE.test(value) && !PHONE_LIKE_RE.test(value) ? value : undefined;
}

function safeValue(key: string, value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === "string") {
    if (isIdKey(key)) return safeId(value);
    if (ISO_RE.test(value)) return value;
    if (ENUM_KEYS.has(key)) return safeEnum(value);
    return undefined;
  }
  if (Array.isArray(value)) {
    const pick = /Ids$/.test(key) ? safeId : ENUM_KEYS.has(key) ? safeEnum : null;
    if (!pick) return undefined;
    const out = value.slice(0, MAX_ARRAY).map(pick).filter((v): v is string => v !== undefined);
    return out;
  }
  if (value && typeof value === "object") {
    // Counters such as { created: 2, skipped: 1 }; anything with text inside is dropped.
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_KEYS) return undefined;
    if (!entries.every(([k, v]) => ENUM_RE.test(k) && typeof v === "number" && Number.isFinite(v))) {
      return undefined;
    }
    return Object.fromEntries(entries);
  }
  return undefined;
}

/** The part of an audit payload that may be stored: ids, numbers, flags, dates and short codes. */
export function sanitizeAuditPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let kept = 0;
  for (const [key, value] of Object.entries(payload)) {
    if (kept >= MAX_KEYS) break;
    const safe = safeValue(key, value);
    if (safe === undefined) continue;
    out[key] = safe;
    kept += 1;
  }
  return out;
}

// In-process mirror of recent records (tests read it synchronously). The durable copy is the
// audit_log table, written through the sink that vaultRoutes registers.
const MAX_AUDIT_ROWS = 5000;
const auditLog: AuditRecord[] = [];

/** Rows waiting for the sinks. Bounded: past MAX_PENDING the oldest are dropped and counted. */
const MAX_PENDING = 2000;
const SINK_BATCH = 200;
const FLUSH_DELAY_MS = 250;
type Sink = { write: (rows: AuditSinkRow[]) => Promise<void>; log: FastifyBaseLogger };
/** Keyed by the repositories object, so one app registers once however often it is built. */
const sinks = new Map<object, Sink>();
let pending: AuditSinkRow[] = [];
let dropped = 0;
let flushTimer: NodeJS.Timeout | null = null;
let flushing: Promise<void> | null = null;

function randomId(): string {
  try {
    // Node 19+ has crypto.randomUUID
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

/**
 * Registers a durable audit sink (repos.appendAuditRecords) under `key`. Rows are written in
 * micro-batches; `flushAudit` writes what is pending. Returns the unregister function.
 */
export function registerAuditSink(
  key: object,
  write: (rows: AuditSinkRow[]) => Promise<void>,
  log: FastifyBaseLogger,
): () => void {
  sinks.set(key, { write, log });
  return () => {
    if (sinks.get(key)?.write === write) sinks.delete(key);
    if (sinks.size === 0) {
      pending = [];
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
    }
  };
}

function scheduleFlush() {
  if (flushTimer || sinks.size === 0) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushAudit();
  }, FLUSH_DELAY_MS);
  flushTimer.unref?.();
}

/** Writes every pending row to the sinks. A failed batch is logged with its size, not retried. */
export async function flushAudit(): Promise<void> {
  while (flushing) await flushing;
  if (sinks.size === 0 || pending.length === 0) return;
  flushing = (async () => {
    while (pending.length > 0) {
      const batch = pending.splice(0, SINK_BATCH);
      await Promise.all(
        [...sinks.values()].map(async (s) => {
          try {
            await s.write(batch);
          } catch (err) {
            s.log.error({ err, count: batch.length }, "audit.sink.write_failed");
          }
        }),
      );
    }
    if (dropped > 0) {
      for (const s of sinks.values()) s.log.error({ count: dropped }, "audit.sink.dropped_overflow");
      dropped = 0;
    }
  })();
  try {
    await flushing;
  } finally {
    flushing = null;
  }
}

export function audit(
  log: FastifyBaseLogger,
  event: AuditEvent,
  payload: Record<string, unknown>,
): void {
  const safe = sanitizeAuditPayload(payload);
  log.info({ audit: true, event, ...safe });
  const userId = typeof safe.userId === "string" ? safe.userId : undefined;
  const record: AuditRecord = {
    id: randomId(),
    event,
    userId,
    timestamp: new Date().toISOString(),
    payload: safe,
  };
  auditLog.push(record);
  if (auditLog.length > MAX_AUDIT_ROWS) auditLog.shift();

  if (sinks.size > 0) {
    const { userId: _userId, ...meta } = safe;
    pending.push({
      userId: userId && UUID_RE.test(userId) ? userId : null,
      event,
      meta,
      at: new Date(record.timestamp),
    });
    if (pending.length > MAX_PENDING) {
      dropped += pending.length - MAX_PENDING;
      pending.splice(0, pending.length - MAX_PENDING);
    }
    scheduleFlush();
  }
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
