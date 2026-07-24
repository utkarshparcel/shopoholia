import { integer, pgTable, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { carts } from "./carts.js";
import { listingVariants } from "./listing-variants.js";

export const cartItems = pgTable("cart_items", {
  id: id(),
  cartId: uuid("cart_id")
    .notNull()
    .references(() => carts.id, { onDelete: "cascade" }),
  listingVariantId: uuid("listing_variant_id")
    .notNull()
    .references(() => listingVariants.id, { onDelete: "restrict" }),
  coinPriceSnapshot: integer("coin_price_snapshot").notNull(),
  quantity: integer("quantity").notNull().default(1),
  ...timestamps,
});
