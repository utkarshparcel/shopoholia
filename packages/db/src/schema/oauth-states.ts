import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { ingestionSources } from "./ingestion.js";
import { users } from "./users.js";

/** Pending OAuth connections. The callback deletes the row, so each signed state works once. */
export const oauthStates = pgTable(
  "oauth_states",
  {
    nonce: text("nonce").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => ingestionSources.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("oauth_states_user_id_idx").on(table.userId)],
);
