import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import {
  moneyAccountKindEnum,
  moneyAccountStatusEnum,
  moneyLedgerTypeEnum,
} from "./enums.js";
import { users } from "./users.js";

export const moneyAccounts = pgTable(
  "money_accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: moneyAccountKindEnum("kind").notNull(),
    merchant: text("merchant").notNull(),
    currency: text("currency").notNull(),
    balanceCacheMinor: integer("balance_cache_minor").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: moneyAccountStatusEnum("status").notNull().default("ACTIVE"),
    ...timestamps,
  },
  (t) => [index("money_accounts_user_created_idx").on(t.userId, t.createdAt.desc().nullsFirst())],
);

export const moneyLedger = pgTable(
  "money_ledger",
  {
    id: id(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => moneyAccounts.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    delta: integer("delta").notNull(),
    type: moneyLedgerTypeEnum("type").notNull(),
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    balanceAfter: integer("balance_after").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("money_ledger_ref_id_idx")
      .on(table.userId, table.refId, table.type)
      .where(sql`${table.refId} IS NOT NULL`),
    index("money_ledger_user_created_idx").on(table.userId, table.createdAt.desc().nullsFirst()),
    index("money_ledger_account_created_idx").on(table.accountId, table.createdAt.desc().nullsFirst()),
  ],
);
