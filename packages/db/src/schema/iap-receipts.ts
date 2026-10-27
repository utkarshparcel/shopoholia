import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { users } from "./users.js";

/**
 * Coin purchases, one row per store transaction. `(store, store_transaction_id)` is unique, so a
 * transaction credits coins once whichever path (app validate or store notification) gets there first.
 * A refund sets `refunded_at`, with the coins taken back in `refunded_coins` and the part the user had
 * already spent in `refund_shortfall`. A refund that arrives before the grant leaves a row with
 * `coins_granted` 0 so that a later grant is refused.
 */
export const iapReceipts = pgTable(
  "iap_receipts",
  {
    id: id(),
    /** Legacy unique key. New rows store `${store}:${storeTransactionId}`. */
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
    /** app_store | play_store. Null on legacy rows. */
    store: text("store"),
    storeTransactionId: text("store_transaction_id"),
    /** production | sandbox | simulated, as the verifier reported it. */
    environment: text("environment"),
    /** validate | notification: the path that created the row. */
    source: text("source"),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundedCoins: integer("refunded_coins").notNull().default(0),
    refundShortfall: integer("refund_shortfall").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("iap_receipts_store_transaction_uidx").on(table.store, table.storeTransactionId),
  ],
);
