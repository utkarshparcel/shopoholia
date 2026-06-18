import { boolean, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import {
  renderScenarioEnum,
  renderStatusEnum,
} from "./enums";
import { orderItems } from "./order-items";

export const renders = pgTable("renders", {
  id: id(),
  orderItemId: uuid("order_item_id")
    .notNull()
    .references(() => orderItems.id, { onDelete: "cascade" }),
  scenario: renderScenarioEnum("scenario").notNull(),
  imageKey: text("image_key"),
  isFree: boolean("is_free").notNull().default(false),
  unlocked: boolean("unlocked").notNull().default(false),
  provider: text("provider").notNull(),
  status: renderStatusEnum("status").notNull().default("QUEUED"),
  costMicros: integer("cost_micros").notNull().default(0),
  ...timestamps,
});
