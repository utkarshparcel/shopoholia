-- The day of the month an EMI plan is due on, so a plan due on the 29th–31st returns to that day
-- after a short month instead of staying on the 28th. Existing plans take the day of their next
-- due date (one that already drifted can't be told apart); the API falls back the same way.
ALTER TABLE "emi_plans" ADD COLUMN "due_day" smallint;--> statement-breakpoint
UPDATE "emi_plans" SET "due_day" = EXTRACT(DAY FROM "next_due_on")::smallint WHERE "due_day" IS NULL;
