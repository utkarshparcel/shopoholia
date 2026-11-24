import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Render agents (the owner's Mac) that have checked in, with their last heartbeat. */
export const renderAgents = pgTable("render_agents", {
  agentId: text("agent_id").primaryKey(),
  version: text("version").notNull(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull(),
});
