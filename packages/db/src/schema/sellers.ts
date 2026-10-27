import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { sellerStatusEnum, sellerTypeEnum } from "./enums.js";
import { users } from "./users.js";

export const sellers = pgTable("sellers", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id)
    .unique(),
  shopName: text("shop_name").notNull(),
  status: sellerStatusEnum("status").notNull().default("ACTIVE"),
  sellerType: sellerTypeEnum("seller_type").notNull().default("RETAILER"),
  ...timestamps,
});
