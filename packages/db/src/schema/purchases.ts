import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import {
  packageDeliveryStatusEnum,
  purchaseSourceEnum,
  purchaseStatusEnum,
} from "./enums.js";
import { users } from "./users.js";

export const merchantPurchases = pgTable(
  "merchant_purchases",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: purchaseSourceEnum("source").notNull(),
    merchant: text("merchant").notNull(),
    orderRef: text("order_ref"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    currency: text("currency").notNull(),
    totalMinor: integer("total_minor").notNull(),
    status: purchaseStatusEnum("status").notNull().default("CONFIRMED"),
    rawDocId: uuid("raw_doc_id"),
    /** Closet package tracker — separate from purchase confirmation status. */
    deliveryStatus: packageDeliveryStatusEnum("delivery_status")
      .notNull()
      .default("ORDERED"),
    etaAt: timestamp("eta_at", { withTimezone: true }),
    trackingCode: text("tracking_code"),
    /** U018 — carrier from tracking paste. */
    carrier: text("carrier"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    /** Merchant return window (may differ from exchange). */
    returnWindowDeadline: timestamp("return_window_deadline", { withTimezone: true }),
    /** Merchant exchange window (size swaps) — may be shorter/longer than return. */
    exchangeWindowDeadline: timestamp("exchange_window_deadline", {
      withTimezone: true,
    }),
    /** U023 — RTO address note for reattempt. */
    deliveryAddressNote: text("delivery_address_note"),
    /** U024 — JSON array of R2 keys for delivery/damage proof. */
    deliveryProofKeys: text("delivery_proof_keys"),
    /** U030 — household member assigned to receive this package. */
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("merchant_purchases_user_created_idx").on(t.userId, t.createdAt.desc().nullsFirst()),
    // Not unique yet: ingest inserts one row per email without an order_ref upsert.
    index("merchant_purchases_user_order_ref_idx")
      .on(t.userId, t.orderRef)
      .where(sql`${t.orderRef} IS NOT NULL`),
    index("merchant_purchases_assignee_idx")
      .on(t.assigneeUserId)
      .where(sql`${t.assigneeUserId} IS NOT NULL`),
  ],
);

export const merchantPurchaseItems = pgTable(
  "merchant_purchase_items",
  {
    id: id(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => merchantPurchases.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category"),
    brand: text("brand"),
    priceMinor: integer("price_minor").notNull(),
    imageKey: text("image_key"),
    qty: integer("qty").notNull().default(1),
    /** Set when ingest detects a likely wardrobe duplicate. */
    duplicateWardrobeItemId: uuid("duplicate_wardrobe_item_id"),
    ...timestamps,
  },
  (t) => [index("merchant_purchase_items_purchase_created_idx").on(t.purchaseId, t.createdAt.desc().nullsFirst())],
);
