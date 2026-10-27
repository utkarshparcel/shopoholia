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
  },
  (t) => [
    index("consent_grants_user_idx").on(t.userId),
    // One active grant per scope; callers check findActiveConsent before grantConsent.
    uniqueIndex("consent_grants_user_scope_active_uidx")
      .on(t.userId, t.scope)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);
