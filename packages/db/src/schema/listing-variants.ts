import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { listings } from "./listings.js";

export const listingVariants = pgTable("listing_variants", {
  id: id(),
  listingId: uuid("listing_id")
    .notNull()
    .references(() => listings.id, { onDelete: "cascade" }),
  size: text("size").notNull(),
  color: text("color").notNull(),
  garmentImageKey: text("garment_image_key").notNull(),
  ...timestamps,
});
