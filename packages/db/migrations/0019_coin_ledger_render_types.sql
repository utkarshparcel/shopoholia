-- Paid reveal renders get their own ledger types. Earlier builds recorded a generate (-50) and a
-- combine (-75) as SPEND_UNLOCK, the type for unlocking a render that already exists. Those rows
-- keep their type: they carry the same ref as an unlock of the order, so they can't be told apart.
ALTER TYPE "public"."coin_ledger_type" ADD VALUE 'SPEND_RENDER' BEFORE 'SPEND_RUSH';--> statement-breakpoint
ALTER TYPE "public"."coin_ledger_type" ADD VALUE 'SPEND_COMBINE' BEFORE 'SPEND_RUSH';
