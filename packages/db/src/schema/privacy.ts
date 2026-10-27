import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id } from "./columns.js";

/**
 * Durable audit log: event names and ids only (lib/audit.ts strips everything else).
 * `user_id` has no FK so events about a user outlive the user row; erasure sets it to NULL
 * and `subject_ref` (keyed HMAC of the user id) stays.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    userId: uuid("user_id"),
    subjectRef: text("subject_ref"),
    event: text("event").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_user_at_idx").on(t.userId, t.at.desc(), t.id.desc()),
    index("audit_log_at_idx").on(t.at),
  ],
);

export type PrivacyRequestKind = "ERASE" | "EXPORT";
export type PrivacyRequestStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED";

/**
 * Erasure and export requests, run by C6 jobs. For ERASE, `storage_keys` is the outbox of
 * objects still to delete: the job collects it before the rows go and clears it once storage
 * confirms. `user_id` has no FK because the row outlives the user; it is nulled when DONE.
 */
export const privacyRequests = pgTable(
  "privacy_requests",
  {
    id: id(),
    userId: uuid("user_id"),
    subjectRef: text("subject_ref").notNull(),
    kind: text("kind").$type<PrivacyRequestKind>().notNull(),
    status: text("status").$type<PrivacyRequestStatus>().notNull().default("PENDING"),
    storageKeys: jsonb("storage_keys").$type<string[]>().notNull().default([]),
    /** Step outcomes, e.g. { keysCollected: true, tokenRevoke: "REVOKED", rowsDeleted: true }. */
    steps: jsonb("steps").$type<Record<string, unknown>>().notNull().default({}),
    /** EXPORT: storage key of the finished export file. */
    resultKey: text("result_key"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // At most one open request per subject and kind: a repeated DELETE /vault reuses it.
    uniqueIndex("privacy_requests_open_uidx")
      .on(t.subjectRef, t.kind)
      .where(sql`${t.status} IN ('PENDING', 'RUNNING')`),
    index("privacy_requests_user_idx").on(t.userId, t.requestedAt.desc()),
  ],
);
