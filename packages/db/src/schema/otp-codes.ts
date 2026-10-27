import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id } from "./columns.js";

/**
 * Phone sign-in codes. Only an HMAC of each code is stored. A code works once, until
 * `expires_at`, and stops working after too many wrong guesses (`attempts`). The rows
 * also count each phone's sends for the hourly send limit.
 */
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: id(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("otp_codes_phone_created_at_idx").on(table.phone, table.createdAt)],
);
