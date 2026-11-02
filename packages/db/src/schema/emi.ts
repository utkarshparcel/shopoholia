import { date, index, integer, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";
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
    /**
     * Day of the month installments fall on (1–31). A short month clamps to its last day, and the
     * next month goes back to this day, so a 31st plan is due Feb 28/29, then Mar 31.
     */
    dueDay: smallint("due_day"),
    currency: text("currency").notNull().default("INR"),
    status: emiPlanStatusEnum("status").notNull().default("ACTIVE"),
    /** idempotencyKey of the last recorded payment (POST /emi/:id/pay replays). */
    lastPaymentKey: text("last_payment_key"),
    ...timestamps,
  },
  (t) => [index("emi_plans_user_next_due_idx").on(t.userId, t.nextDueOn)],
);

export type EmiPlanRow = typeof emiPlans.$inferSelect;
