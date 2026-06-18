import {
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { listingStatusEnum } from "./enums.js";
import { sellers } from "./sellers.js";

export const listings = pgTable("listings", {
  id: id(),
  sellerId: uuid("seller_id").references(() => sellers.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  category: text("category").notNull(),
  tags: text("tags").array().notNull().default([]),
  coinPrice: integer("coin_price").notNull(),
  productImageKeys: text("product_image_keys").array().notNull().default([]),
  houseModelRenderKey: text("house_model_render_key"),
  affiliateUrl: text("affiliate_url"),
  status: listingStatusEnum("status").notNull().default("ACTIVE"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});
