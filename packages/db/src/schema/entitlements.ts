import { boolean, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * Premium entitlements per user, product and source, written only from a verified source:
 * an App Store / Google Play subscription checked with the store, or the dev simulation
 * outside production. `event_at` is the source event's time, so an older event that
 * arrives late never overwrites a newer one.
 */
export const entitlementGrants = pgTable(
  "entitlement_grants",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entitlementId: text("entitlement_id").notNull(),
    productId: text("product_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isTrial: boolean("is_trial").notNull().default(false),
    source: text("source").notNull(),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull(),
    /** App Store original transaction id or Play purchase token, to re-check with the store. */
    storeRef: text("store_ref"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.entitlementId, table.productId, table.source] }),
  ],
);

/** Provider event ids already applied (App Store notifications, Play voids), so a retried delivery is a no-op. */
export const entitlementEvents = pgTable("entitlement_events", {
  eventId: text("event_id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});
