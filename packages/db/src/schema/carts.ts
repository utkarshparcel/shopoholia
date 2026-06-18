import { pgTable, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { users } from "./users";

export const carts = pgTable("carts", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  ...timestamps,
});
