import { relations } from "drizzle-orm";
import { avatars } from "./avatars.js";
import { cartItems } from "./cart-items.js";
import { carts } from "./carts.js";
import { coinLedger } from "./coin-ledger.js";
import { iapReceipts } from "./iap-receipts.js";
import { listingVariants } from "./listing-variants.js";
import { listings } from "./listings.js";
import { sellers } from "./sellers.js";
import { orderItems } from "./order-items.js";
import { orders } from "./orders.js";
import { pushEvents } from "./push-events.js";
import { renders } from "./renders.js";
import { tryonPreviews } from "./tryon-previews.js";
import { users } from "./users.js";

export const usersRelations = relations(users, ({ one, many }) => ({
  seller: one(sellers, {
    fields: [users.id],
    references: [sellers.userId],
  }),
  avatar: one(avatars, {
    fields: [users.id],
    references: [avatars.userId],
  }),
  cart: one(carts, {
    fields: [users.id],
    references: [carts.userId],
  }),
  tryonPreviews: many(tryonPreviews),
  orders: many(orders),
  coinLedgerEntries: many(coinLedger),
  iapReceipts: many(iapReceipts),
  pushEvents: many(pushEvents),
}));

export const avatarsRelations = relations(avatars, ({ one }) => ({
  user: one(users, {
    fields: [avatars.userId],
    references: [users.id],
  }),
}));

export const sellersRelations = relations(sellers, ({ one, many }) => ({
  user: one(users, {
    fields: [sellers.userId],
    references: [users.id],
  }),
  listings: many(listings),
}));

export const listingsRelations = relations(listings, ({ one, many }) => ({
  seller: one(sellers, {
    fields: [listings.sellerId],
    references: [sellers.id],
  }),
  variants: many(listingVariants),
}));

export const listingVariantsRelations = relations(
  listingVariants,
  ({ one, many }) => ({
    listing: one(listings, {
      fields: [listingVariants.listingId],
      references: [listings.id],
    }),
    tryonPreviews: many(tryonPreviews),
    cartItems: many(cartItems),
    orderItems: many(orderItems),
  }),
);

export const tryonPreviewsRelations = relations(tryonPreviews, ({ one }) => ({
  user: one(users, {
    fields: [tryonPreviews.userId],
    references: [users.id],
  }),
  listingVariant: one(listingVariants, {
    fields: [tryonPreviews.listingVariantId],
    references: [listingVariants.id],
  }),
}));

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, {
    fields: [carts.userId],
    references: [users.id],
  }),
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, {
    fields: [cartItems.cartId],
    references: [carts.id],
  }),
  listingVariant: one(listingVariants, {
    fields: [cartItems.listingVariantId],
    references: [listingVariants.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
  pushEvents: many(pushEvents),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  listingVariant: one(listingVariants, {
    fields: [orderItems.listingVariantId],
    references: [listingVariants.id],
  }),
  renders: many(renders),
}));

export const rendersRelations = relations(renders, ({ one }) => ({
  orderItem: one(orderItems, {
    fields: [renders.orderItemId],
    references: [orderItems.id],
  }),
}));

export const coinLedgerRelations = relations(coinLedger, ({ one }) => ({
  user: one(users, {
    fields: [coinLedger.userId],
    references: [users.id],
  }),
}));

export const iapReceiptsRelations = relations(iapReceipts, ({ one }) => ({
  user: one(users, {
    fields: [iapReceipts.userId],
    references: [users.id],
  }),
}));

export const pushEventsRelations = relations(pushEvents, ({ one }) => ({
  user: one(users, {
    fields: [pushEvents.userId],
    references: [users.id],
  }),
  order: one(orders, {
    fields: [pushEvents.orderId],
    references: [orders.id],
  }),
}));
