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
  "EARN_REFERRAL",
  "EARN_CASHBACK",
  "REFUND",
]);

export const cashbackStatusEnum = pgEnum("cashback_status", [
  "PENDING",
  "CONFIRMED",
  "REJECTED",
]);

export const pushEventStatusEnum = pgEnum("push_event_status", [
  "QUEUED",
  "SENT",
  "FAILED",
]);

export const consentScopeEnum = pgEnum("consent_scope", [
  "EMAIL",
  "SMS",
  "FINANCIAL",
  "LIKENESS",
  "CONCIERGE",
]);

export const moneyAccountKindEnum = pgEnum("money_account_kind", [
  "CASH",
  "STORE_CREDIT",
  "GIFT_CARD",
  "LOYALTY_POINTS",
  "PROMO_CREDIT",
]);

export const moneyLedgerTypeEnum = pgEnum("money_ledger_type", [
  "DEPOSIT",
  "WITHDRAW",
  "SPEND",
  "REFUND",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "PURCHASE_REWARD",
]);

export const moneyAccountStatusEnum = pgEnum("money_account_status", [
  "ACTIVE",
  "FROZEN",
  "CLOSED",
]);

export const purchaseSourceEnum = pgEnum("purchase_source", [
  "EMAIL",
  "SMS",
  "MANUAL",
  "RECEIPT",
]);

export const purchaseStatusEnum = pgEnum("purchase_status", [
  "PENDING",
  "CONFIRMED",
  "REJECTED",
  "DUPLICATE",
]);

export const packageDeliveryStatusEnum = pgEnum("package_delivery_status", [
  "ORDERED",
  "SHIPPED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
]);

export const ingestionKindEnum = pgEnum("ingestion_kind", [
  "EMAIL",
  "SMS",
  "RECEIPT",
]);

export const ingestionStatusEnum = pgEnum("ingestion_status", [
  "IDLE",
  "SYNCING",
  "PAUSED",
  "ERROR",
]);

export const ingestionDocStatusEnum = pgEnum("ingestion_doc_status", [
  "RECEIVED",
  "PARSED",
  "MATCHED",
  "UNMATCHED",
  "ERROR",
]);

export const warrantyStateEnum = pgEnum("warranty_state", [
  "ACTIVE",
  "CLAIMED",
  "EXPIRED",
]);

export const wardrobeSourceEnum = pgEnum("wardrobe_source", [
  "MANUAL",
  "RECEIPT",
  "EMAIL",
  "SMS",
]);

export const laundryStatusEnum = pgEnum("laundry_status", [
  "CLEAN",
  "DIRTY",
  "IN_LAUNDRY",
]);

export const closetStatusEnum = pgEnum("closet_status", ["ACTIVE", "STORED"]);

export const itemMetricStatusEnum = pgEnum("item_metric_status", [
  "ACTIVE",
  "DORMANT",
  "DEAD",
]);

export const outfitOccasionEnum = pgEnum("outfit_occasion", [
  "CASUAL",
  "WORK",
  "FORMAL",
  "PARTY",
  "SPORT",
  "TRAVEL",
]);

export const dispositionModeEnum = pgEnum("disposition_mode", [
  "SELL",
  "DONATE",
  "BARTER",
]);

export const budgetCategoryEnum = pgEnum("budget_category", [
  "APPAREL",
  "FOOTWEAR",
  "ACCESSORIES",
  "BEAUTY",
  "GENERAL",
]);

export const budgetPeriodEnum = pgEnum("budget_period", [
  "MONTHLY",
  "QUARTERLY",
]);

export const returnStateEnum = pgEnum("return_state", [
  "REQUESTED",
  "INITIATED",
  "PICKUP_SCHEDULED",
  "CONFIRMED",
  "REFUNDED",
  "EXPIRED",
  "CANCELLED",
]);

export const recipientRelationshipEnum = pgEnum("recipient_relationship", [
  "FAMILY",
  "FRIEND",
  "PARTNER",
  "COLLEAGUE",
  "OTHER",
]);

export const giftOccasionEnum = pgEnum("gift_occasion", [
  "BIRTHDAY",
  "ANNIVERSARY",
  "FESTIVAL",
  "HOUSEWARMING",
  "GRADUATION",
  "OTHER",
]);

export const giftOrderStatusEnum = pgEnum("gift_order_status", [
  "PLANNED",
  "ORDERED",
  "DELIVERED",
  "CANCELLED",
]);

export const garmentTypeEnum = pgEnum("garment_type", [
  "BLOUSE",
  "KURTI",
  "SUIT",
  "SAREE",
  "LEHENGA",
  "SHIRT",
  "OTHER",
]);

export const tailorOrderStateEnum = pgEnum("tailor_order_state", [
  "PENDING",
  "CONFIRMED",
  "IN_STITCHING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
]);

export const sellerTypeEnum = pgEnum("seller_type", ["RETAILER", "TAILOR", "INDIVIDUAL"]);

export const dispositionStatusEnum = pgEnum("disposition_status", [
  "ACTIVE",
  "SOLD",
  "DONATED",
  "BARTERED",
  "CANCELLED",
]);

export const swapCircleRoleEnum = pgEnum("swap_circle_role", ["OWNER", "MEMBER"]);

export const swapListingStatusEnum = pgEnum("swap_listing_status", [
  "LISTED",
  "BORROWED",
  "RETURNED",
  "CANCELLED",
]);

export const householdRoleEnum = pgEnum("household_role", ["OWNER", "MEMBER"]);

export const closetProfileKindEnum = pgEnum("closet_profile_kind", [
  "SELF",
  "PARTNER",
  "KID",
  "OTHER",
]);

export const emiPlanStatusEnum = pgEnum("emi_plan_status", [
  "ACTIVE",
  "PAID",
  "DEFAULTED",
]);

export const cashbackClaimStatusEnum = pgEnum("cashback_claim_status", [
  "UNCLAIMED",
  "CLAIMED",
  "EXPIRED",
]);
