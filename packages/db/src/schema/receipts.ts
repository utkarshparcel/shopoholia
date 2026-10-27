import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { merchantPurchases } from "./purchases.js";
import { users } from "./users.js";

export const receipts = pgTable(
  "receipts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    imageKey: text("image_key").notNull(),
    merchant: text("merchant").notNull(),
    purchasedAt: timestamp("purchased_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    totalMinor: integer("total_minor").notNull().default(0),
    ocrJson: jsonb("ocr_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    purchaseId: uuid("purchase_id").references(() => merchantPurchases.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("receipts_user_created_idx").on(t.userId, t.createdAt.desc().nullsFirst()),
    index("receipts_purchase_idx")
      .on(t.purchaseId)
      .where(sql`${t.purchaseId} IS NOT NULL`),
  ],
);

export type ReceiptRow = typeof receipts.$inferSelect;
export type NewReceipt = typeof receipts.$inferInsert;
