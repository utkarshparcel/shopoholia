import {
  integer,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { avatarStatusEnum } from "./enums";

export const users = pgTable("users", {
  id: id(),
  phone: text("phone").notNull().unique(),
  displayName: text("display_name"),
  avatarStatus: avatarStatusEnum("avatar_status").notNull().default("NONE"),
  coinBalanceCache: integer("coin_balance_cache").notNull().default(0),
  consentFlags: jsonb("consent_flags")
    .$type<Record<string, boolean>>()
    .notNull()
    .default({}),
  pushToken: text("push_token"),
  ...timestamps,
});
