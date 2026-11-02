import { boolean, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import {
  renderScenarioEnum,
  renderStatusEnum,
} from "./enums.js";
import { orderItems } from "./order-items.js";

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
  /**
   * The order items a combined render dresses together, in order; null for a single item's
   * render. Earlier builds kept these in `provider` as `combined:<ids>`, which the provider name
   * overwrote once the render was done.
   */
  combinedItemIds: uuid("combined_item_ids").array(),
  status: renderStatusEnum("status").notNull().default("QUEUED"),
  costMicros: integer("cost_micros").notNull().default(0),
  ...timestamps,
});
