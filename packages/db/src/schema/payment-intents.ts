import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { users } from "./users.js";

/**
 * Checkout intents for premium products. `status` (created | pending | paid | failed)
 * becomes "paid" only after the provider's signature checks out: the checkout callback
 * signature or the webhook HMAC.
 */
export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    productId: text("product_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    upiIntentUrl: text("upi_intent_url"),
    status: text("status").notNull().default("created"),
    providerOrderId: text("provider_order_id").unique(),
    providerPaymentId: text("provider_payment_id").unique(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("payment_intents_user_id_idx").on(table.userId)],
);
