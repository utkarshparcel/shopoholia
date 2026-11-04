CREATE TABLE "render_agents" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"last_heartbeat_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tryon_previews" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "tryon_previews" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tryon_previews" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "renders_status_created_idx" ON "renders" USING btree ("status","created_at");