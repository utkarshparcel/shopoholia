import { index, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { listings } from "./listings.js";
import { users } from "./users.js";

/** Listings a user saved to their lookbook: at most one row per user and listing. */
export const lookbookItems = pgTable(
  "lookbook_items",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.listingId] }),
    index("lookbook_items_user_id_created_at_idx").on(table.userId, table.createdAt.desc()),
    // Lets a listing delete find the rows it cascades to without scanning every lookbook.
    index("lookbook_items_listing_id_idx").on(table.listingId),
  ],
);
