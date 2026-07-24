import { integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { cashbackStatusEnum } from "./enums.js";
import { listings } from "./listings.js";
import { users } from "./users.js";

export const cashbackEvents = pgTable(
  "cashback_events",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id").references(() => listings.id, {
      onDelete: "set null",
    }),
    platform: text("platform").notNull(),
    clickId: text("click_id").notNull(),
    coinsEarned: integer("coins_earned").notNull().default(0),
    status: cashbackStatusEnum("status").notNull().default("PENDING"),
    ...timestamps,
  },
  (table) => [uniqueIndex("cashback_events_click_id_idx").on(table.clickId)],
);
