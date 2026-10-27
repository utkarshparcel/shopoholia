import {
  auditLog,
  avatars,
  brandPriceWatches,
  budgets,
  cartItems,
  carts,
  cashbackClaims,
  cashbackEvents,
  closetProfiles,
  coinLedger,
  consentGrants,
  consentRecords,
  dispositionListings,
  emiPlans,
  giftOrders,
  groupGiftContributions,
  householdMembers,
  households,
  householdVaultSettings,
  iapReceipts,
  ingestionDocuments,
  ingestionSources,
  interviewKits,
  itemMetrics,
  listings,
  listingVariants,
  lookbookItems,
  measurementProfiles,
  merchantPurchaseItems,
  merchantPurchases,
  moneyAccounts,
  moneyLedger,
  orderItems,
  orders,
  outfits,
  privacyRequests,
  pushEvents,
  receipts,
  recipientProfiles,
  recipients,
  renders,
  repairLogs,
  returnEvents,
  returnRequests,
  sellers,
  socialPolls,
  socialPollVotes,
  spendRollups,
  swapCircleMembers,
  swapCircles,
  swapListings,
  tailoringOrders,
  tailoringReviews,
  tryonPreviews,
  users,
  wardrobeItems,
  warranties,
  wearChallenges,
  wearLog,
} from "@worn/db";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

/**
 * Every table that holds a user's rows, for the vault export (and the erasure check). A table
 * is either owned (rows where `owner` = the user id) or a child of a listed table (rows whose
 * `fk` points at one of the parent's rows). `user-data-tables.test.ts` fails when a table in
 * the schema is in neither this list nor EXEMPT_TABLES, so a new user table can't be missed.
 */
export type UserTableSpec =
  | { table: PgTable; owner: AnyPgColumn; omit?: string[] }
  | { table: PgTable; parent: PgTable; fk: AnyPgColumn; omit?: string[] };

export const USER_DATA_TABLES: UserTableSpec[] = [
  { table: users, owner: users.id },
  { table: avatars, owner: avatars.userId },
  { table: lookbookItems, owner: lookbookItems.userId },
  { table: cashbackEvents, owner: cashbackEvents.userId },
  { table: carts, owner: carts.userId },
  { table: cartItems, parent: carts, fk: cartItems.cartId },
  { table: coinLedger, owner: coinLedger.userId },
  { table: iapReceipts, owner: iapReceipts.userId },
  { table: orders, owner: orders.userId },
  { table: orderItems, parent: orders, fk: orderItems.orderId },
  { table: renders, parent: orderItems, fk: renders.orderItemId },
  { table: pushEvents, owner: pushEvents.userId },
  { table: sellers, owner: sellers.userId },
  { table: listings, parent: sellers, fk: listings.sellerId },
  { table: listingVariants, parent: listings, fk: listingVariants.listingId },
  { table: tryonPreviews, owner: tryonPreviews.userId },
  { table: consentGrants, owner: consentGrants.userId },
  { table: consentRecords, owner: consentRecords.userId, omit: ["subjectRef"] },
  { table: auditLog, owner: auditLog.userId, omit: ["subjectRef"] },
  { table: privacyRequests, owner: privacyRequests.userId, omit: ["subjectRef", "storageKeys"] },
  // The OAuth token is a credential, not the user's content.
  { table: ingestionSources, owner: ingestionSources.userId, omit: ["encryptedToken"] },
  { table: ingestionDocuments, owner: ingestionDocuments.userId },
  { table: moneyAccounts, owner: moneyAccounts.userId },
  { table: moneyLedger, owner: moneyLedger.userId },
  { table: merchantPurchases, owner: merchantPurchases.userId },
  { table: merchantPurchaseItems, parent: merchantPurchases, fk: merchantPurchaseItems.purchaseId },
  { table: receipts, owner: receipts.userId },
  { table: warranties, owner: warranties.userId },
  { table: wardrobeItems, owner: wardrobeItems.userId },
  { table: outfits, owner: outfits.userId },
  { table: wearLog, owner: wearLog.userId },
  { table: itemMetrics, owner: itemMetrics.userId },
  { table: repairLogs, owner: repairLogs.userId },
  { table: dispositionListings, owner: dispositionListings.userId },
  { table: budgets, owner: budgets.userId },
  { table: spendRollups, owner: spendRollups.userId },
  { table: returnRequests, owner: returnRequests.userId },
  { table: returnEvents, parent: returnRequests, fk: returnEvents.returnRequestId },
  { table: recipients, owner: recipients.userId },
  { table: recipientProfiles, parent: recipients, fk: recipientProfiles.recipientId },
  { table: giftOrders, owner: giftOrders.userId },
  { table: groupGiftContributions, owner: groupGiftContributions.contributorUserId },
  { table: measurementProfiles, owner: measurementProfiles.userId },
  { table: tailoringOrders, owner: tailoringOrders.userId },
  { table: tailoringReviews, owner: tailoringReviews.userId },
  { table: swapCircles, owner: swapCircles.ownerId },
  { table: swapCircleMembers, owner: swapCircleMembers.userId },
  { table: swapListings, owner: swapListings.ownerUserId },
  { table: closetProfiles, owner: closetProfiles.ownerUserId },
  { table: households, owner: households.ownerId },
  { table: householdMembers, owner: householdMembers.userId },
  { table: householdVaultSettings, owner: householdVaultSettings.userId },
  { table: interviewKits, owner: interviewKits.userId },
  { table: wearChallenges, owner: wearChallenges.userId },
  { table: socialPolls, owner: socialPolls.userId, omit: ["tokenHash"] },
  // Votes are friends' anonymous answers on the user's polls; the voter hash is theirs.
  { table: socialPollVotes, parent: socialPolls, fk: socialPollVotes.pollId, omit: ["voterHash"] },
  { table: brandPriceWatches, owner: brandPriceWatches.userId },
  { table: emiPlans, owner: emiPlans.userId },
  { table: cashbackClaims, owner: cashbackClaims.userId },
];

/** Tables left out of the export, with the reason. */
export const EXEMPT_TABLES: Record<string, string> = {
  refresh_tokens: "session secrets; revoked with the account, not user content",
  customization_templates: "shared catalog of tailoring templates; no user column",
};

/**
 * User columns that are not an owner column: the row belongs to someone else and only points at
 * this user. Erasure clears them (ON DELETE SET NULL); they are not exported as this user's rows.
 */
export const SECONDARY_USER_COLUMNS: Record<string, string> = {
  "merchant_purchases.assignee_user_id": "household member a parcel is assigned to",
  "swap_listings.borrower_user_id": "borrower of another member's item",
  "users.referred_by": "referrer of another user",
  "disposition_listings.seller_id": "marketplace seller row, owned through sellers",
  "tailoring_orders.tailor_seller_id": "tailor's seller row",
  "tailoring_reviews.seller_id": "reviewed tailor's seller row",
};

/**
 * Owned tables whose user FK is RESTRICT/NO ACTION or missing, so `deleteAllUserData` deletes
 * them by hand before the user row. Every other owned table goes by ON DELETE CASCADE.
 */
export const ERASED_EXPLICITLY = new Set([
  "coin_ledger",
  "consent_grants",
  "iap_receipts",
  "money_accounts",
  "money_ledger",
  "orders",
  "sellers",
  "receipts",
  "warranties",
]);

/** Kept on erasure with `user_id` nulled (append-only proof, keyed by subject_ref). */
export const KEPT_ON_ERASURE = new Set(["consent_records", "audit_log", "privacy_requests"]);

/**
 * Rows the user wrote into someone else's record: kept on erasure for that record, with these
 * columns cleared and the user FK nulled (ON DELETE SET NULL).
 */
export const ANONYMISED_ON_ERASURE: Record<string, string[]> = {
  group_gift_contributions: ["contributor_name", "note"],
};
