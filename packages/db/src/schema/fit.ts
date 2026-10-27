import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { garmentTypeEnum, tailorOrderStateEnum } from "./enums.js";
import { sellers } from "./sellers.js";
import { users } from "./users.js";

export const measurementProfiles = pgTable(
  "measurement_profiles",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    region: text("region").notNull().default("IN"),
    unit: text("unit").notNull().default("CM"),
    points: jsonb("points").$type<Record<string, number>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index("measurement_profiles_user_created_idx").on(t.userId, t.createdAt.desc().nullsFirst())],
);

export const customizationTemplates = pgTable("customization_templates", {
  id: id(),
  region: text("region").notNull().default("IN"),
  garmentType: garmentTypeEnum("garment_type").notNull(),
  name: text("name").notNull(),
  optionsSchema: jsonb("options_schema")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  ...timestamps,
});

/** Rendered fit previews, one per (user, template, selections): repeat requests reuse the render. */
export const fitPreviews = pgTable(
  "fit_previews",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => customizationTemplates.id, { onDelete: "cascade" }),
    /** sha256 of the garment key and the sorted selections. */
    selectionsKey: text("selections_key").notNull(),
    garmentKey: text("garment_key").notNull(),
    /** READY | PROCESSING | FAILED. */
    status: text("status").$type<"READY" | "PROCESSING" | "FAILED">().notNull().default("PROCESSING"),
    imageKey: text("image_key"),
    error: text("error"),
    retryAfter: timestamp("retry_after", { withTimezone: true }),
    provider: text("provider").notNull(),
    costMicros: integer("cost_micros").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("fit_previews_user_template_selections_uidx").on(t.userId, t.templateId, t.selectionsKey)],
);

export const tailoringOrders = pgTable(
  "tailoring_orders",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => customizationTemplates.id, { onDelete: "set null" }),
    measurementProfileId: uuid("measurement_profile_id").references(() => measurementProfiles.id, {
      onDelete: "set null",
    }),
    selections: jsonb("selections").$type<Record<string, string>>().notNull().default({}),
    fabricRef: text("fabric_ref"),
    fabricPhotoKeys: jsonb("fabric_photo_keys").$type<string[]>().notNull().default([]),
    tailorSellerId: uuid("tailor_seller_id").references(() => sellers.id, { onDelete: "set null" }),
    measurementSnapshot: jsonb("measurement_snapshot").$type<Record<string, unknown> | null>().default(null),
    state: tailorOrderStateEnum("state").notNull().default("PENDING"),
    ...timestamps,
  },
  (t) => [
    index("tailoring_orders_user_created_idx").on(t.userId, t.createdAt.desc().nullsFirst()),
    index("tailoring_orders_measurement_profile_idx")
      .on(t.measurementProfileId)
      .where(sql`${t.measurementProfileId} IS NOT NULL`),
    index("tailoring_orders_template_idx")
      .on(t.templateId)
      .where(sql`${t.templateId} IS NOT NULL`),
    index("tailoring_orders_tailor_seller_idx")
      .on(t.tailorSellerId)
      .where(sql`${t.tailorSellerId} IS NOT NULL`),
  ],
);

export const tailoringReviews = pgTable(
  "tailoring_reviews",
  {
    id: id(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => tailoringOrders.id, { onDelete: "set null" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    ...timestamps,
  },
  (t) => [
    index("tailoring_reviews_seller_created_idx").on(t.sellerId, t.createdAt.desc().nullsFirst()),
    index("tailoring_reviews_user_idx").on(t.userId),
    index("tailoring_reviews_order_idx")
      .on(t.orderId)
      .where(sql`${t.orderId} IS NOT NULL`),
  ],
);

export type MeasurementProfileRow = typeof measurementProfiles.$inferSelect;
export type CustomizationTemplateRow = typeof customizationTemplates.$inferSelect;
export type FitPreviewRow = typeof fitPreviews.$inferSelect;
export type TailoringOrderRow = typeof tailoringOrders.$inferSelect;
export type TailoringReviewRow = typeof tailoringReviews.$inferSelect;
