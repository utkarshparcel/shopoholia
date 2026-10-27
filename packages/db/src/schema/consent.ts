import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id } from "./columns.js";
import { consentScopeEnum } from "./enums.js";
import { users } from "./users.js";

// NOTE: This consent ledger is the source of truth for granular consent grants.
// It is dual-read with the existing `users.consentFlags` jsonb column, which
// remains the fast-path boolean map for API checks. Writes should keep both in
// sync: grant a row here AND flip the corresponding flag in `consentFlags`.
export const consentGrants = pgTable(
  "consent_grants",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    scope: consentScopeEnum("scope").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    source: text("source").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    /** Version of the privacy notice shown when this grant was given (null on rows from before v2). */
    noticeVersion: text("notice_version"),
  },
  (t) => [
    index("consent_grants_user_idx").on(t.userId),
    // One active grant per scope; grantConsent inserts ON CONFLICT DO NOTHING and returns the live row.
    uniqueIndex("consent_grants_user_scope_active_uidx")
      .on(t.userId, t.scope)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

/**
 * Append-only consent history: one row per grant and per withdrawal, written in the same
 * transaction as the consent_grants change. Rows are never deleted. Erasure nulls `user_id`
 * (ON DELETE SET NULL) and `subject_ref` (a keyed HMAC of the old user id) keeps the proof.
 * Triggers in FIX/privacy/backfill.sql reject DELETE and any UPDATE other than nulling user_id.
 */
export const consentRecords = pgTable(
  "consent_records",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    subjectRef: text("subject_ref").notNull(),
    scope: consentScopeEnum("scope").notNull(),
    action: text("action").$type<"GRANT" | "WITHDRAW">().notNull(),
    noticeVersion: text("notice_version"),
    source: text("source").notNull(),
    /** consent_grants.id this event created or closed (no FK: grants are deleted on erasure). */
    grantId: uuid("grant_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("consent_records_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("consent_records_subject_ref_idx").on(t.subjectRef),
  ],
);
