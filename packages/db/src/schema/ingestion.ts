import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import {
  ingestionDocStatusEnum,
  ingestionKindEnum,
  ingestionStatusEnum,
} from "./enums.js";
import { consentGrants } from "./consent.js";
import { users } from "./users.js";

export const ingestionSources = pgTable(
  "ingestion_sources",
  {
    id: id(),
    /** Owner. Nullable until FIX/privacy/backfill.sql has filled old rows; every new row sets it. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    kind: ingestionKindEnum("kind").notNull(),
    provider: text("provider").notNull(),
    consentGrantId: uuid("consent_grant_id")
      .notNull()
      .references(() => consentGrants.id, { onDelete: "restrict" }),
    status: ingestionStatusEnum("status").notNull().default("IDLE"),
    cursor: text("cursor"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    /** AES-256-GCM encrypted OAuth tokens (jsonb envelope: { data: base64 }).
     * Plaintext tokens are never persisted; the key comes from OAUTH_TOKEN_SECRET. */
    encryptedToken: jsonb("encrypted_token")
      .$type<{ data: string } | null>()
      .default(null),
    /** Soft prefs: mutedMerchants[], etc. Never store tokens here. */
    meta: jsonb("meta")
      .$type<Record<string, unknown> | null>()
      .default(null),
    ...timestamps,
  },
  (t) => [
    index("ingestion_sources_consent_grant_idx").on(t.consentGrantId),
    index("ingestion_sources_user_created_idx").on(t.userId, t.createdAt.desc()),
  ],
);

export const ingestionDocuments = pgTable(
  "ingestion_documents",
  {
    id: id(),
    /** Owner. Nullable until FIX/privacy/backfill.sql has filled old rows; every new row sets it. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    kind: ingestionKindEnum("kind").notNull(),
    rawKey: text("raw_key").notNull(),
    parsedJson: jsonb("parsed_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    matchedPurchaseId: uuid("matched_purchase_id"),
    status: ingestionDocStatusEnum("status").notNull().default("RECEIVED"),
    ...timestamps,
  },
  (t) => [
    // Legacy rows without user_id are found through parsed_json->>'__userId' until the backfill runs.
    index("ingestion_documents_user_created_idx").on(
      sql`(${t.parsedJson}->>'__userId')`,
      t.createdAt.desc().nullsFirst(),
    ),
    index("ingestion_documents_matched_purchase_idx")
      .on(t.matchedPurchaseId)
      .where(sql`${t.matchedPurchaseId} IS NOT NULL`),
    index("ingestion_documents_user_id_created_idx").on(t.userId, t.createdAt.desc(), t.id.desc()),
    // Retention sweep: rows that still hold a raw object, oldest first per kind.
    index("ingestion_documents_retention_idx")
      .on(t.kind, t.createdAt)
      .where(sql`${t.rawKey} <> ''`),
  ],
);
