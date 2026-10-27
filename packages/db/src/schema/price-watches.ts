import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { users } from "./users.js";

/** N12 — brand price watchlist for affiliate catalog drops. */
export const brandPriceWatches = pgTable(
  "brand_price_watches",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    brand: text("brand").notNull(),
    watchedPriceMinor: integer("watched_price_minor").notNull(),
    thresholdPct: integer("threshold_pct").notNull().default(10),
    lastSeenPriceMinor: integer("last_seen_price_minor"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("brand_price_watches_user_created_idx").on(t.userId, t.createdAt.desc().nullsFirst())],
);

export type BrandPriceWatchRow = typeof brandPriceWatches.$inferSelect;
