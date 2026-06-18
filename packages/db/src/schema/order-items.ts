import { integer, pgTable, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { listingVariants } from "./listing-variants";
import { orders } from "./orders";

export const orderItems = pgTable("order_items", {
  id: id(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  listingVariantId: uuid("listing_variant_id")
    .notNull()
    .references(() => listingVariants.id, { onDelete: "restrict" }),
  coinPriceSnapshot: integer("coin_price_snapshot").notNull(),
  quantity: integer("quantity").notNull().default(1),
  ...timestamps,
});
