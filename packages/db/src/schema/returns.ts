import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { returnStateEnum } from "./enums.js";
import { users } from "./users.js";
import { merchantPurchases, merchantPurchaseItems } from "./purchases.js";

export const returnRequests = pgTable(
  "return_requests",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purchaseId: uuid("purchase_id").references(() => merchantPurchases.id, {
      onDelete: "cascade",
    }),
    purchaseItemId: uuid("purchase_item_id").references(() => merchantPurchaseItems.id, {
      onDelete: "set null",
    }),
    windowDeadline: timestamp("window_deadline", { withTimezone: true }).notNull(),
    /** Size-exchange deadline — may differ from return/refund window. */
    exchangeDeadline: timestamp("exchange_deadline", { withTimezone: true }),
    state: returnStateEnum("state").notNull().default("REQUESTED"),
    refundMinor: integer("refund_minor"),
    method: text("method"),
    tracking: text("tracking"),
    /** Scheduled logistics pickup slot (WV01-PICKUP-BOOK). */
    pickupSlotAt: timestamp("pickup_slot_at", { withTimezone: true }),
    /** N17 — size inconsistency reason from returns. */
    reason: text("reason"),
    orderedSize: text("ordered_size"),
    preferredSize: text("preferred_size"),
    /** U020 — chase snooze until. */
    chaseSnoozeUntil: timestamp("chase_snooze_until", { withTimezone: true }),
    /** U020 — escalate overdue refund chase for ops. */
    chaseEscalated: integer("chase_escalated").notNull().default(0),
    /** U026 — when user requested a missing GST invoice. */
    invoiceRequestedAt: timestamp("invoice_requested_at", { withTimezone: true }),
    /** U026 — receipt id once invoice arrives / is linked. */
    invoiceReceiptId: uuid("invoice_receipt_id"),
    /** U029 — return label / QR object key in R2. */
    labelImageKey: text("label_image_key"),
    /** U029 — when pickup agent used the label. */
    labelUsedAt: timestamp("label_used_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("return_requests_user_created_idx").on(t.userId, t.createdAt.desc().nullsFirst()),
    index("return_requests_purchase_idx").on(t.purchaseId),
    index("return_requests_purchase_item_idx")
      .on(t.purchaseItemId)
      .where(sql`${t.purchaseItemId} IS NOT NULL`),
  ],
);

export const returnEvents = pgTable(
  "return_events",
  {
    id: id(),
    returnRequestId: uuid("return_request_id")
      .notNull()
      .references(() => returnRequests.id, { onDelete: "cascade" }),
    fromState: text("from_state"),
    toState: text("to_state").notNull(),
    actor: text("actor"),
    meta: jsonb("meta").$type<Record<string, unknown> | null>().default(null),
    ...timestamps,
  },
  (t) => [index("return_events_request_created_idx").on(t.returnRequestId, t.createdAt.desc().nullsFirst())],
);

export type ReturnRequestRow = typeof returnRequests.$inferSelect;
export type ReturnEventRow = typeof returnEvents.$inferSelect;
