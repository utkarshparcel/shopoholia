import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { id } from "./columns.js";

/**
 * MON-TAKE-RATE — one settlement (platform fee, GST on it, seller payout) per completed
 * marketplace order. Shared by the API and the workers; `(kind, order_ref)` makes a repeat
 * settle of the same order return the first row instead of a second payout.
 */
export const marketplaceSettlements = pgTable(
  "marketplace_settlements",
  {
    id: id(),
    kind: text("kind").$type<"tailoring" | "resale">().notNull(),
    orderRef: text("order_ref").notNull(),
    sellerId: text("seller_id").notNull(),
    orderAmountMinor: integer("order_amount_minor").notNull(),
    platformFeeMinor: integer("platform_fee_minor").notNull(),
    gstOnFeeMinor: integer("gst_on_fee_minor").notNull(),
    sellerPayoutMinor: integer("seller_payout_minor").notNull(),
    currency: text("currency").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("marketplace_settlements_kind_order_ref_uidx").on(t.kind, t.orderRef),
    index("marketplace_settlements_seller_idx").on(t.sellerId, t.completedAt),
  ],
);
