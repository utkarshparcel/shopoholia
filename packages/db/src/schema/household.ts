import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { closetProfileKindEnum, householdRoleEnum } from "./enums.js";
import { users } from "./users.js";

/** Shared household closet (N26) — couples / roommates. */
export const households = pgTable(
  "households",
  {
    id: id(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteCode: text("invite_code").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("households_invite_code_uidx").on(t.inviteCode),
    index("households_owner_idx").on(t.ownerId),
  ],
);

export const householdMembers = pgTable(
  "household_members",
  {
    id: id(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: householdRoleEnum("role").notNull().default("MEMBER"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("household_members_household_user_uidx").on(t.householdId, t.userId),
    index("household_members_user_idx").on(t.userId),
  ],
);

/** Multi-profile closets — kids / partner (N27). */
export const closetProfiles = pgTable(
  "closet_profiles",
  {
    id: id(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    householdId: uuid("household_id").references(() => households.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    kind: closetProfileKindEnum("kind").notNull().default("SELF"),
    ...timestamps,
  },
  (t) => [
    index("closet_profiles_owner_created_idx").on(t.ownerUserId, t.createdAt),
    index("closet_profiles_household_idx")
      .on(t.householdId)
      .where(sql`${t.householdId} IS NOT NULL`),
  ],
);

export type HouseholdRow = typeof households.$inferSelect;
export type HouseholdMemberRow = typeof householdMembers.$inferSelect;
export type ClosetProfileRow = typeof closetProfiles.$inferSelect;
