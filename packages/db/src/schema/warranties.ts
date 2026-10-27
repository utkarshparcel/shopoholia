import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { warrantyStateEnum } from "./enums.js";
import { receipts } from "./receipts.js";
import { users } from "./users.js";

export const warranties = pgTable(
  "warranties",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    receiptId: uuid("receipt_id").references(() => receipts.id, {
      onDelete: "set null",
    }),
    itemTitle: text("item_title").notNull(),
    provider: text("provider").notNull(),
    coverageUntil: timestamp("coverage_until", { withTimezone: true }).notNull(),
    claimContact: text("claim_contact"),
    /** electronics | appliances | apparel when known. */
    category: text("category"),
    state: warrantyStateEnum("state").notNull().default("ACTIVE"),
    ...timestamps,
  },
  (t) => [
    index("warranties_user_coverage_idx").on(t.userId, t.coverageUntil.desc().nullsFirst()),
    index("warranties_receipt_idx")
      .on(t.receiptId)
      .where(sql`${t.receiptId} IS NOT NULL`),
  ],
);

export type WarrantyRow = typeof warranties.$inferSelect;
export type NewWarranty = typeof warranties.$inferInsert;
