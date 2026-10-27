import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { budgetCategoryEnum, budgetPeriodEnum } from "./enums.js";
import { users } from "./users.js";

export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: budgetCategoryEnum("category").notNull(),
    period: budgetPeriodEnum("period").notNull(),
    limitMinor: integer("limit_minor").notNull(),
    ...timestamps,
  },
  (t) => [index("budgets_user_created_idx").on(t.userId, t.createdAt.desc().nullsFirst())],
);

export const spendRollups = pgTable(
  "spend_rollups",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    category: text("category").notNull(),
    totalMinor: integer("total_minor").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("spend_rollups_user_period_category_uidx").on(t.userId, t.period, t.category)],
);

export type BudgetRow = typeof budgets.$inferSelect;
export type SpendRollupRow = typeof spendRollups.$inferSelect;
