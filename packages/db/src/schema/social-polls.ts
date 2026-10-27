import { date, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { users } from "./users.js";

/**
 * Friend polls (N35 "Should I return?", N38 ask-a-friend). The share link carries a token
 * derived from the poll id with a server secret; only its sha256 is stored here.
 */
export const socialPolls = pgTable(
  "social_polls",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"return" | "outfit">().notNull(),
    tokenHash: text("token_hash").notNull(),
    itemLabel: text("item_label"),
    returnRequestId: uuid("return_request_id"),
    /** outfit polls: [{ id, label, itemIds, occasion }] */
    options: jsonb("options")
      .$type<Array<{ id: string; label: string; itemIds: string[]; occasion?: string | null }>>()
      .notNull()
      .default([]),
    plannedFor: date("planned_for"),
    winnerAppliedAt: timestamp("winner_applied_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("social_polls_token_hash_uidx").on(t.tokenHash),
    index("social_polls_user_created_idx").on(t.userId, t.createdAt.desc()),
  ],
);

export const socialPollVotes = pgTable(
  "social_poll_votes",
  {
    id: id(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => socialPolls.id, { onDelete: "cascade" }),
    /** KEEP | RETURN for return polls, the option id for outfit polls. */
    choice: text("choice").notNull(),
    /** sha256 of poll id + the voter's device key; one vote per voter per poll. */
    voterHash: text("voter_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("social_poll_votes_poll_voter_uidx").on(t.pollId, t.voterHash)],
);
