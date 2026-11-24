-- Sign in with Apple (App Store Guideline 4.8): the Apple user id, unique like google_sub.
ALTER TABLE "users" ADD COLUMN "apple_sub" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_apple_sub_unique" UNIQUE("apple_sub");