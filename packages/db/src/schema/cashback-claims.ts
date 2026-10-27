import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { cashbackClaimStatusEnum } from "./enums.js";
import { users } from "./users.js";

/** N14 — manual card/bank cashback claim queue (≠ affiliate cashback_events). */
export const cashbackClaims = pgTable(
  "cashback_claims",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    merchant: text("merchant"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("INR"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: cashbackClaimStatusEnum("status").notNull().default("UNCLAIMED"),
    notes: text("notes"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("cashback_claims_user_status_idx").on(t.userId, t.status)],
);

export type CashbackClaimRow = typeof cashbackClaims.$inferSelect;
