import { pgEnum } from "drizzle-orm/pg-core";

export const avatarStatusEnum = pgEnum("avatar_status", [
  "NONE",
  "PROCESSING",
  "READY",
  "FAILED",
]);

export const listingStatusEnum = pgEnum("listing_status", [
  "DRAFT",
  "ACTIVE",
  "ARCHIVED",
]);

export const sellerStatusEnum = pgEnum("seller_status", ["ACTIVE", "SUSPENDED"]);

export const orderTierEnum = pgEnum("order_tier", [
  "EXPRESS",
  "STANDARD",
  "SLOW_BURN",
]);

export const orderStateEnum = pgEnum("order_state", [
  "PENDING",
  "PROCESSING",
  "PACKED",
  "OUT_FOR_DELIVERY",
  "ARRIVING_SOON",
  "DELIVERED",
  "REVEAL_READY",
  "FAILED",
  "CANCELLED",
]);

export const renderScenarioEnum = pgEnum("render_scenario", [
  "STUDIO",
  "GOLDEN_HOUR",
  "STREET",
  "EDITORIAL_DARK",
  "NIGHT",
  "CANDID",
]);

export const renderStatusEnum = pgEnum("render_status", [
  "QUEUED",
  "RUNNING",
  "DONE",
  "FAILED",
]);

export const coinLedgerTypeEnum = pgEnum("coin_ledger_type", [
  "GRANT",
  "IAP_PURCHASE",
  "SPEND_ORDER",
  "SPEND_UNLOCK",
  "SPEND_RUSH",
  "EARN_STREAK",
  "EARN_SHARE",
  "EARN_OPTIN",
  "REFUND",
]);

export const pushEventStatusEnum = pgEnum("push_event_status", [
  "QUEUED",
  "SENT",
  "FAILED",
]);
