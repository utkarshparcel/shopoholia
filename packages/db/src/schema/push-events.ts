import { jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { pushEventStatusEnum } from "./enums.js";
import { orders } from "./orders.js";
import { users } from "./users.js";

export const pushEvents = pgTable(
  "push_events",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: pushEventStatusEnum("status").notNull().default("QUEUED"),
    expoTicketId: text("expo_ticket_id"),
    ...timestamps,
  },
  (table) => [uniqueIndex("push_events_dedupe_key_idx").on(table.dedupeKey)],
);
