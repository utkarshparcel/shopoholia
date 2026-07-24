import { pgTable, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { users } from "./users.js";

export const carts = pgTable("carts", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  ...timestamps,
});
