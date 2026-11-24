-- Sign in with Apple: the refresh token from the authorization-code exchange, encrypted, so account
-- deletion can revoke it at Apple (App Store requirement). Deleted with the user row.
ALTER TABLE "users" ADD COLUMN "apple_refresh_token_enc" text;
