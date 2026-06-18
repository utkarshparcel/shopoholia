import { integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { users } from "./users.js";

export const iapReceipts = pgTable("iap_receipts", {
  id: id(),
  revenuecatEventId: text("revenuecat_event_id").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  productId: text("product_id").notNull(),
  coinsGranted: integer("coins_granted").notNull(),
  rawPayload: jsonb("raw_payload")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  ...timestamps,
});
