import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { households } from "./household.js";
import { users } from "./users.js";
import { wardrobeItems } from "./wardrobe.js";

/** "Wear it 3×" challenges started from the waste screen; one per user and item. */
export const wearChallenges = pgTable(
  "wear_challenges",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wardrobeItemId: uuid("wardrobe_item_id")
      .notNull()
      .references(() => wardrobeItems.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("wear_challenges_user_item_uidx").on(t.userId, t.wardrobeItemId)],
);

/** Interview / ceremony outfit kits with a night-before reminder. */
export const interviewKits = pgTable(
  "interview_kits",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").$type<"interview" | "ceremony">().notNull(),
    itemIds: uuid("item_ids").array().notNull(),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull(),
    occasion: text("occasion"),
    remindAt: timestamp("remind_at", { withTimezone: true }),
    reminderScheduled: boolean("reminder_scheduled").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("interview_kits_user_event_idx").on(t.userId, t.eventAt)],
);

/** Per-member vault access and spend cap inside a household. */
export const householdVaultSettings = pgTable(
  "household_vault_settings",
  {
    id: id(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vaultAccess: text("vault_access").$type<"VIEW" | "SPEND">().notNull().default("VIEW"),
    spendCapMinor: integer("spend_cap_minor"),
    spentMinor: integer("spent_minor").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("household_vault_settings_household_user_uidx").on(t.householdId, t.userId),
    index("household_vault_settings_user_idx").on(t.userId),
  ],
);
