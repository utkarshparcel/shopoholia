import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { orderStateEnum, orderTierEnum } from "./enums.js";
import { users } from "./users.js";

export type OrderStateEta = Partial<Record<string, string>>;

export const orders = pgTable("orders", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  tier: orderTierEnum("tier").notNull(),
  state: orderStateEnum("state").notNull().default("PENDING"),
  coinTotal: integer("coin_total").notNull(),
  placedAt: timestamp("placed_at", { withTimezone: true }),
  stateEta: jsonb("state_eta").$type<OrderStateEta>().notNull().default({}),
  revealReadyAt: timestamp("reveal_ready_at", { withTimezone: true }),
  idempotencyKey: text("idempotency_key").unique(),
  ...timestamps,
});
