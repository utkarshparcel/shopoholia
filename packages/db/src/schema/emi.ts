import { date, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";
import { emiPlanStatusEnum } from "./enums.js";
import { users } from "./users.js";

/** N13 — BNPL / EMI fashion installment plans. */
export const emiPlans = pgTable(
  "emi_plans",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    merchant: text("merchant"),
    principalMinor: integer("principal_minor").notNull(),
    remainingMinor: integer("remaining_minor").notNull(),
    installmentMinor: integer("installment_minor").notNull(),
    nextDueOn: date("next_due_on").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: emiPlanStatusEnum("status").notNull().default("ACTIVE"),
    ...timestamps,
  },
  (t) => [index("emi_plans_user_next_due_idx").on(t.userId, t.nextDueOn)],
);

export type EmiPlanRow = typeof emiPlans.$inferSelect;
