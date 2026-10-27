import { index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { listingVariants } from "./listing-variants.js";
import { users } from "./users.js";
import { wardrobeItems } from "./wardrobe.js";

export const tryonPreviews = pgTable(
  "tryon_previews",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listingVariantId: uuid("listing_variant_id").references(() => listingVariants.id, {
      onDelete: "cascade",
    }),
    /** Wardrobe try-on cache key. */
    wardrobeItemId: uuid("wardrobe_item_id").references(() => wardrobeItems.id, {
      onDelete: "cascade",
    }),
    imageKey: text("image_key"),
    provider: text("provider").notNull(),
    costMicros: integer("cost_micros").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("tryon_previews_user_variant_idx").on(table.userId, table.listingVariantId),
    uniqueIndex("tryon_previews_user_wardrobe_idx").on(table.userId, table.wardrobeItemId),
    index("tryon_previews_wardrobe_item_idx").on(table.wardrobeItemId),
  ],
);
