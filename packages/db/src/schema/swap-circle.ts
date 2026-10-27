import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { swapCircleRoleEnum, swapListingStatusEnum } from "./enums.js";
import { users } from "./users.js";
import { wardrobeItems, dispositionListings } from "./wardrobe.js";

/** Invite-only closet swap circle (N37) — private barter among friends. */
export const swapCircles = pgTable(
  "swap_circles",
  {
    id: id(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteCode: text("invite_code").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("swap_circles_invite_code_uidx").on(t.inviteCode),
    index("swap_circles_owner_idx").on(t.ownerId),
  ],
);

export const swapCircleMembers = pgTable(
  "swap_circle_members",
  {
    id: id(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => swapCircles.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: swapCircleRoleEnum("role").notNull().default("MEMBER"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("swap_circle_members_circle_user_uidx").on(t.circleId, t.userId),
    index("swap_circle_members_user_idx").on(t.userId),
  ],
);

export const swapListings = pgTable(
  "swap_listings",
  {
    id: id(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => swapCircles.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wardrobeItemId: uuid("wardrobe_item_id")
      .notNull()
      .references(() => wardrobeItems.id, { onDelete: "cascade" }),
    dispositionListingId: uuid("disposition_listing_id").references(
      () => dispositionListings.id,
      { onDelete: "set null" },
    ),
    status: swapListingStatusEnum("status").notNull().default("LISTED"),
    borrowerUserId: uuid("borrower_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("swap_listings_circle_created_idx").on(t.circleId, t.createdAt.desc().nullsFirst()),
    index("swap_listings_wardrobe_item_idx").on(t.wardrobeItemId),
    index("swap_listings_owner_idx").on(t.ownerUserId),
    index("swap_listings_borrower_idx")
      .on(t.borrowerUserId)
      .where(sql`${t.borrowerUserId} IS NOT NULL`),
    index("swap_listings_disposition_listing_idx")
      .on(t.dispositionListingId)
      .where(sql`${t.dispositionListingId} IS NOT NULL`),
  ],
);

export type SwapCircleRow = typeof swapCircles.$inferSelect;
export type SwapCircleMemberRow = typeof swapCircleMembers.$inferSelect;
export type SwapListingRow = typeof swapListings.$inferSelect;
