import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { coinLedgerTypeEnum } from "./enums";
import { users } from "./users";

export const coinLedger = pgTable("coin_ledger", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  delta: integer("delta").notNull(),
  type: coinLedgerTypeEnum("type").notNull(),
  refType: text("ref_type"),
  refId: uuid("ref_id"),
  balanceAfter: integer("balance_after").notNull(),
  ...timestamps,
});
