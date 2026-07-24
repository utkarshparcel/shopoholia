import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { avatarStatusEnum } from "./enums.js";
import { users } from "./users.js";

export const avatars = pgTable("avatars", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  referenceImageKey: text("reference_image_key"),
  sourceUploadKeys: text("source_upload_keys").array().notNull().default([]),
  bodyMeta: jsonb("body_meta")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  status: avatarStatusEnum("status").notNull().default("PROCESSING"),
  ...timestamps,
});
