import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { avatarStatusEnum } from "./enums.js";

export const users = pgTable("users", {
  id: id(),
  phone: text("phone").unique(),
  email: text("email").unique(),
  googleSub: text("google_sub").unique(),
  displayName: text("display_name"),
  avatarStatus: avatarStatusEnum("avatar_status").notNull().default("NONE"),
  coinBalanceCache: integer("coin_balance_cache").notNull().default(0),
  consentFlags: jsonb("consent_flags")
    .$type<Record<string, boolean>>()
    .notNull()
    .default({}),
  pushToken: text("push_token"),
  referralCode: text("referral_code").unique(),
  referredBy: text("referred_by"),
  streakCount: integer("streak_count").notNull().default(0),
  lastStreakClaimAt: timestamp("last_streak_claim_at", { withTimezone: true }),
  styleProfile: jsonb("style_profile").$type<{ tags: string[]; answers: Record<string, string> }>(),
  ...timestamps,
});
