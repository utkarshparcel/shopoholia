import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { recipients } from "./gift.js";
import { households } from "./household.js";
import { ingestionDocuments } from "./ingestion.js";
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
    /** ISO currency the cap and `spent_minor` count in; spends in another currency are refused. */
    spendCapCurrency: text("spend_cap_currency"),
    spentMinor: integer("spent_minor").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("household_vault_settings_household_user_uidx").on(t.householdId, t.userId),
    index("household_vault_settings_user_idx").on(t.userId),
  ],
);

/** U042 — a user's merchant aliases ("AMZN MKTP" → "Amazon"); `alias` is the normalised key. */
export const merchantAliases = pgTable(
  "merchant_aliases",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    canonical: text("canonical").notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.userId, t.alias] })],
);

/**
 * U050 — ops flags for a merchant whose email/SMS parser is broken. Process-wide (no user
 * column): every user sees the "scanning delayed" banner until ops clears the flag.
 */
export const parserBreakFlags = pgTable("parser_break_flags", {
  /** Upper-cased merchant name. */
  merchantKey: text("merchant_key").primaryKey(),
  merchant: text("merchant").notNull(),
  reason: text("reason").notNull(),
  region: text("region"),
  setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
});

/** U049 — budget lock and shortlist (at most 3) for one recipient's occasion on one day. */
export const giftBudgetLocks = pgTable(
  "gift_budget_locks",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => recipients.id, { onDelete: "cascade" }),
    occasion: text("occasion").notNull(),
    /** The occasion's calendar day (YYYY-MM-DD): with recipient and occasion, the lock's key. */
    occasionDay: text("occasion_day").notNull(),
    /** The occasion date as the client sent it. */
    occasionDate: timestamp("occasion_date", { withTimezone: true }).notNull(),
    budgetLockMinor: integer("budget_lock_minor").notNull(),
    currency: text("currency").notNull(),
    shortlistIds: jsonb("shortlist_ids").$type<string[]>().notNull().default([]),
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gift_budget_locks_recipient_occasion_day_uidx").on(t.recipientId, t.occasion, t.occasionDay),
    index("gift_budget_locks_user_idx").on(t.userId),
  ],
);

/**
 * U041 — a user's parse correction as a training fixture: merchant, total and currency before
 * and after, never the raw email/SMS body. `export_status` tracks the fixture export.
 */
export const parserTrainingFixtures = pgTable(
  "parser_training_fixtures",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => ingestionDocuments.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    merchantHint: text("merchant_hint"),
    fields: jsonb("fields").$type<string[]>().notNull().default([]),
    before: jsonb("before")
      .$type<{ merchant: string | null; totalMinor: number | null; currency: string | null }>()
      .notNull(),
    after: jsonb("after")
      .$type<{ merchant: string | null; totalMinor: number | null; currency: string | null }>()
      .notNull(),
    exportStatus: text("export_status").$type<"QUEUED" | "EXPORTED" | "SKIPPED">().notNull().default("QUEUED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("parser_training_fixtures_created_idx").on(t.createdAt),
    index("parser_training_fixtures_user_idx").on(t.userId),
    index("parser_training_fixtures_document_idx").on(t.documentId),
  ],
);

/** U039 — "lost while lent" write-off notes. */
export const lentWasteNotes = pgTable(
  "lent_waste_notes",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wardrobeItemId: uuid("wardrobe_item_id").references(() => wardrobeItems.id, { onDelete: "set null" }),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lent_waste_notes_user_created_idx").on(t.userId, t.createdAt),
    index("lent_waste_notes_wardrobe_item_idx").on(t.wardrobeItemId),
  ],
);
