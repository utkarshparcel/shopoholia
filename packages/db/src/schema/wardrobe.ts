import { date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, timestamps } from "./columns.js";
import {
  closetStatusEnum,
  dispositionModeEnum,
  dispositionStatusEnum,
  itemMetricStatusEnum,
  laundryStatusEnum,
  outfitOccasionEnum,
  wardrobeSourceEnum,
} from "./enums.js";
import { closetProfiles } from "./household.js";
import { sellers } from "./sellers.js";
import { users } from "./users.js";

export const wardrobeItems = pgTable(
  "wardrobe_items",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: wardrobeSourceEnum("source").notNull().default("MANUAL"),
    category: text("category").notNull(),
    colors: text("colors").array().notNull().default([]),
    brand: text("brand"),
    costMinor: integer("cost_minor").notNull().default(0),
    imageKeys: text("image_keys").array().notNull().default([]),
    garmentImageKey: text("garment_image_key"),
    purchaseItemId: uuid("purchase_item_id"),
    laundryStatus: laundryStatusEnum("laundry_status").notNull().default("CLEAN"),
    /** ACTIVE = in rotation for today; STORED = off-season / packed away. */
    closetStatus: closetStatusEnum("closet_status").notNull().default("ACTIVE"),
    /** Free tags e.g. season:summer, season:winter, workwear. */
    tags: text("tags").array().notNull().default([]),
    /** N20 — structured care / wash-label rules from OCR. */
    careRules: jsonb("care_rules").$type<Record<string, unknown> | null>().default(null),
    /** N22 — dry-cleaner ticket id while item is out. */
    dryCleanTicket: text("dry_clean_ticket"),
    /** N22 — expected pickup calendar day (YYYY-MM-DD). */
    dryCleanPickupOn: date("dry_clean_pickup_on"),
    /** N25 — borrower display name while lent out. */
    lentTo: text("lent_to"),
    /** N25 — expected return day (YYYY-MM-DD). */
    lentDueOn: date("lent_due_on"),
    /** N27 — closet profile scope (kids / multi-profile). */
    profileId: uuid("profile_id").references(() => closetProfiles.id, { onDelete: "set null" }),
    /** Photo-dump discard: hidden from every list until undone or purged after the undo window. */
    discardedAt: timestamp("discarded_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("wardrobe_items_lent_due_on_idx")
      .on(t.lentDueOn)
      .where(sql`${t.lentTo} IS NOT NULL`),
    index("wardrobe_items_profile_id_idx").on(t.profileId),
    index("wardrobe_items_user_created_idx").on(t.userId, t.createdAt.desc().nullsFirst()),
    uniqueIndex("wardrobe_items_user_purchase_item_uidx")
      .on(t.userId, t.purchaseItemId)
      .where(sql`${t.purchaseItemId} IS NOT NULL`),
  ],
);

export const outfits = pgTable(
  "outfits",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemIds: uuid("item_ids").array().notNull().default([]),
    occasion: outfitOccasionEnum("occasion"),
    weatherCtx: jsonb("weather_ctx").$type<Record<string, unknown> | null>().default(null),
    /** Calendar day this outfit is planned for (YYYY-MM-DD). Null = unscheduled. */
    plannedFor: date("planned_for"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    styleProfileSnapshot: jsonb("style_profile_snapshot").$type<Record<string, unknown> | null>().default(null),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("outfits_user_planned_for_uidx")
      .on(t.userId, t.plannedFor)
      .where(sql`${t.plannedFor} IS NOT NULL`),
    index("outfits_user_generated_idx").on(t.userId, t.generatedAt.desc().nullsFirst()),
  ],
);

export const wearLog = pgTable(
  "wear_log",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wardrobeItemId: uuid("wardrobe_item_id").references(() => wardrobeItems.id, { onDelete: "cascade" }),
    outfitId: uuid("outfit_id").references(() => outfits.id, { onDelete: "cascade" }),
    wornOn: timestamp("worn_on", { withTimezone: true }).notNull().defaultNow(),
    imageKey: text("image_key"),
    /** Client key from POST /wear: a retried request returns the first row. */
    idempotencyKey: text("idempotency_key"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("wear_log_user_idempotency_uidx")
      .on(t.userId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
    index("wear_log_user_worn_on_idx").on(t.userId, t.wornOn.desc().nullsFirst()),
    index("wear_log_wardrobe_item_idx").on(t.wardrobeItemId),
    index("wear_log_outfit_idx")
      .on(t.outfitId)
      .where(sql`${t.outfitId} IS NOT NULL`),
  ],
);

export const itemMetrics = pgTable(
  "item_metrics",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wardrobeItemId: uuid("wardrobe_item_id")
      .notNull()
      .references(() => wardrobeItems.id, { onDelete: "cascade" })
      .unique(),
    wearCount: integer("wear_count").notNull().default(0),
    lastWornAt: timestamp("last_worn_at", { withTimezone: true }),
    costPerWearMinor: integer("cost_per_wear_minor"),
    /** Target cost-per-wear in minor units (N41-CPW-GOALS). */
    targetCpwMinor: integer("target_cpw_minor"),
    status: itemMetricStatusEnum("status").notNull().default("ACTIVE"),
    ...timestamps,
  },
  (t) => [index("item_metrics_user_updated_idx").on(t.userId, t.updatedAt.desc().nullsFirst())],
);

export const dispositionListings = pgTable(
  "disposition_listings",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wardrobeItemId: uuid("wardrobe_item_id")
      .notNull()
      .references(() => wardrobeItems.id, { onDelete: "cascade" }),
    mode: dispositionModeEnum("mode").notNull().default("SELL"),
    priceMinor: integer("price_minor"),
    status: dispositionStatusEnum("status").notNull().default("ACTIVE"),
    /** Marketplace seller when mode reuses sellers/listings rails (SELL / optional BARTER). */
    sellerId: uuid("seller_id").references(() => sellers.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("disposition_listings_user_created_idx").on(t.userId, t.createdAt.desc().nullsFirst()),
    index("disposition_listings_wardrobe_item_idx").on(t.wardrobeItemId),
    // #12: one ACTIVE listing per item (openDispositionListing returns the existing one).
    uniqueIndex("disposition_listings_active_item_uidx")
      .on(t.wardrobeItemId)
      .where(sql`${t.status} = 'ACTIVE'`),
    index("disposition_listings_seller_idx")
      .on(t.sellerId)
      .where(sql`${t.sellerId} IS NOT NULL`),
  ],
);

/** N21 — repair & alteration cost log (feeds accountant). */
export const repairLogs = pgTable(
  "repair_logs",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wardrobeItemId: uuid("wardrobe_item_id")
      .notNull()
      .references(() => wardrobeItems.id, { onDelete: "cascade" }),
    costMinor: integer("cost_minor").notNull().default(0),
    repairedOn: date("repaired_on").notNull(),
    kind: text("kind").notNull().default("REPAIR"),
    note: text("note"),
    tailorOrderId: uuid("tailor_order_id"),
    ...timestamps,
  },
  (t) => [
    index("repair_logs_user_created_idx").on(t.userId, t.createdAt.desc().nullsFirst()),
    index("repair_logs_item_created_idx").on(t.wardrobeItemId, t.createdAt.desc().nullsFirst()),
  ],
);

export type WardrobeItemRow = typeof wardrobeItems.$inferSelect;
export type OutfitRow = typeof outfits.$inferSelect;
export type WearLogRow = typeof wearLog.$inferSelect;
export type ItemMetricRow = typeof itemMetrics.$inferSelect;
export type DispositionListingRow = typeof dispositionListings.$inferSelect;
export type RepairLogRow = typeof repairLogs.$inferSelect;
