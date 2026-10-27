import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { giftOccasionEnum, giftOrderStatusEnum, recipientRelationshipEnum } from "./enums.js";
import { users } from "./users.js";
import { listings } from "./listings.js";

/** Structured wishlist entry (listing / URL / free-text ref). */
export type WishlistRef = {
  listingId?: string | null;
  title: string;
  url?: string | null;
  note?: string | null;
};

export const recipients = pgTable(
  "recipients",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    relationship: recipientRelationshipEnum("relationship").notNull().default("OTHER"),
    region: text("region").notNull().default("IN"),
    ...timestamps,
  },
  (t) => [index("recipients_user_created_idx").on(t.userId, t.createdAt.desc().nullsFirst())],
);

export const recipientProfiles = pgTable("recipient_profiles", {
  id: id(),
  recipientId: uuid("recipient_id")
    .notNull()
    .unique()
    .references(() => recipients.id, { onDelete: "cascade" }),
  sizes: jsonb("sizes").$type<Record<string, string>>().notNull().default({}),
  tasteTags: text("taste_tags").array().notNull().default([]),
  wishlist: jsonb("wishlist").$type<WishlistRef[]>().notNull().default([]),
  importantDates: jsonb("important_dates")
    .$type<Array<{ occasion: string; date: string; label?: string }>>()
    .notNull()
    .default([]),
  notes: text("notes"),
  ...timestamps,
});

export const giftOrders = pgTable(
  "gift_orders",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => recipients.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
    occasion: giftOccasionEnum("occasion"),
    status: giftOrderStatusEnum("status").notNull().default("PLANNED"),
    affiliateLink: text("affiliate_link"),
    /** Gift wrap / card message shown to recipient. */
    wrapMessage: text("wrap_message"),
    /** When set, gift is a group-contribute pool (stub). */
    groupTargetMinor: integer("group_target_minor"),
    groupCurrency: text("group_currency").default("INR"),
    ...timestamps,
  },
  (t) => [
    index("gift_orders_user_created_idx").on(t.userId, t.createdAt.desc().nullsFirst()),
    index("gift_orders_recipient_idx").on(t.recipientId),
    index("gift_orders_listing_idx")
      .on(t.listingId)
      .where(sql`${t.listingId} IS NOT NULL`),
  ],
);

/** Stub contributions toward a group gift order. */
export const groupGiftContributions = pgTable(
  "group_gift_contributions",
  {
    id: id(),
    giftOrderId: uuid("gift_order_id")
      .notNull()
      .references(() => giftOrders.id, { onDelete: "cascade" }),
    contributorUserId: uuid("contributor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    contributorName: text("contributor_name"),
    amountMinor: integer("amount_minor").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("group_gift_contributions_order_created_idx").on(t.giftOrderId, t.createdAt.desc().nullsFirst()),
    index("group_gift_contributions_contributor_idx")
      .on(t.contributorUserId)
      .where(sql`${t.contributorUserId} IS NOT NULL`),
  ],
);

export type RecipientRow = typeof recipients.$inferSelect;
export type RecipientProfileRow = typeof recipientProfiles.$inferSelect;
export type GiftOrderRow = typeof giftOrders.$inferSelect;
export type GroupGiftContributionRow = typeof groupGiftContributions.$inferSelect;
