import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { getTableConfig, type AnyPgColumn, type PgTable } from "drizzle-orm/pg-core";
import { streakRewardForDay, AFFILIATE_CASHBACK_COINS, normalizeWishlist, buildRichOptions, splitUserPrefsPatch, compareCashbackClaimsByDeadline, checkHouseholdVaultSpendCap } from "@worn/shared";
import { missingRegionPacks } from "../region-packs.js";
import {
  avatars,
  budgets,
  cartItems,
  carts,
  cashbackEvents,
  cashbackClaims,
  brandPriceWatches,
  emiPlans,
  entitlementEvents,
  entitlementGrants,
  coinLedger,
  consentGrants,
  consentRecords,
  auditLog,
  privacyRequests,
  createDb,
  customizationTemplates,
  dispositionListings,
  giftOrders,
  groupGiftContributions,
  iapReceipts,
  ingestionDocuments,
  ingestionSources,
  itemMetrics,
  listingVariants,
  listings,
  lookbookItems,
  measurementProfiles,
  merchantPurchaseItems,
  merchantPurchases,
  moneyAccounts,
  moneyLedger,
  orderItems,
  orders,
  outfits,
  postLedgerEntry,
  deleteOrphanMoneyAccount as deleteOrphanMoneyAccountQuery,
  purgeOrphanMoneyAccounts as purgeOrphanMoneyAccountsQuery,
  createAccountWithLedgerEntry,
  setAccountBalance,
  mergeAccountInto,
  reconcileAccountCache,
  pushEvents,
  oauthStates,
  otpCodes,
  paymentIntents,
  refreshTokens,
  receipts,
  recipientProfiles,
  recipients,
  renders,
  returnEvents,
  returnRequests,
  sellers,
  spendRollups,
  swapCircleMembers,
  swapCircles,
  swapListings,
  households,
  householdMembers,
  householdVaultSettings,
  wearChallenges,
  interviewKits,
  socialPolls,
  socialPollVotes,
  closetProfiles,
  tailoringOrders,
  tailoringReviews,
  tryonPreviews,
  users,
  warranties,
  wardrobeItems,
  wearLog,
  repairLogs,
  type Db,
} from "@worn/db";
import { InsufficientCoinsError } from "./errors.js";
import { subjectRefFor } from "../privacy-hmac.js";
import { USER_DATA_TABLES, type UserTableSpec } from "./user-data-tables.js";
import { keysetAfter, keysetCreatedAtText, keysetOrderBy, toPage } from "../paging.js";
import { OPEN_RETURN_STATES, ReturnStateConflictError, returnStatesInto } from "../returns/state-machine.js";
import {
  PurchaseMergeSplitError,
  assertItemsSplitable,
  assertMergePlan,
  sumItemsMinor,
} from "../purchase-merge-split.js";
import {
  LISTING_WORD_SEPARATOR,
  decodeListingCursor,
  encodeListingCursor,
  normalizeStyleKeywords,
} from "./listing-feed.js";
import type {
  AffiliateLinkRecord,
  AvatarRecord,
  AvatarStatus,
  CartItemRecord,
  CartRecord,
  CoinLedgerRecord,
  CreateMerchantPurchaseInput,
  CreateOrderInput,
  CreateSellerListingInput,
  GrantCoinsInput,
  ListingRecord,
  ListingStatus,
  ListingVariantRecord,
  ListCoinTransactionsResult,
  ListListingsResult,
  CoinPurchaseRecord,
  EntitlementGrantRecord,
  OrderItemRecord,
  OrderRecord,
  PaymentIntentRecord,
  PushEventPayload,
  PushEventRecord,
  RenderRecord,
  Repositories,
  RushOrderInput,
  SellerRecord,
  SellerStatus,
  TryonPreviewRecord,
  TryonPreviewStatus,
  UserRecord,

  ConsentGrantRecord,
  ConsentHistoryRecord,
  AuditLogRecord,
  PrivacyRequestRecord,
  InterviewKitRecord,
  SocialPollRecord,
  DispositionListingRecord,
  IngestionDocumentRecord,
  IngestionSourceRecord,
  ItemMetricRecord,
  MeasurementProfileRecord,
  MerchantPurchaseItemRecord,
  MerchantPurchaseRecord,
  MoneyAccountRecord,
  MoneyLedgerRecord,
  OutfitRecord,
  ReceiptRecord,
  SwapCircleMemberRecord,
  SwapCircleRecord,
  SwapListingRecord,
  HouseholdMemberRecord,
  HouseholdRecord,
  HouseholdVaultSettingsRecord,
  ClosetProfileRecord,
  WardrobeItemRecord,
  WarrantyRecord,
  WearLogRecord,
  EmiPlanRecord,
  CashbackClaimRecord,
  RepairLogRecord,
  ReturnRecord,
  TailoringOrderRecord,
} from "./types.js";

type UserRow = typeof users.$inferSelect;
type AvatarRow = typeof avatars.$inferSelect;
type CoinLedgerRow = typeof coinLedger.$inferSelect;
type ListingRow = typeof listings.$inferSelect;
type ListingVariantRow = typeof listingVariants.$inferSelect;
type SellerRow = typeof sellers.$inferSelect;
type TryonPreviewRow = typeof tryonPreviews.$inferSelect;
type CartRow = typeof carts.$inferSelect;
type CartItemRow = typeof cartItems.$inferSelect;
type OrderRow = typeof orders.$inferSelect;
type OrderItemRow = typeof orderItems.$inferSelect;
type RenderRow = typeof renders.$inferSelect;
type PushEventRow = typeof pushEvents.$inferSelect;
type PaymentIntentRow = typeof paymentIntents.$inferSelect;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function now() {
  return new Date();
}

/** Refresh tokens are stored hashed, so a database leak doesn't hand out live sessions. */
function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toPaymentIntentRecord(row: PaymentIntentRow): PaymentIntentRecord {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider as PaymentIntentRecord["provider"],
    productId: row.productId,
    amountMinor: row.amountMinor,
    currency: row.currency,
    upiIntentUrl: row.upiIntentUrl,
    status: row.status as PaymentIntentRecord["status"],
    providerOrderId: row.providerOrderId,
    providerPaymentId: row.providerPaymentId,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type IapReceiptRow = typeof iapReceipts.$inferSelect;

function toCoinPurchaseRecord(row: IapReceiptRow): CoinPurchaseRecord {
  return {
    id: row.id,
    userId: row.userId,
    store: row.store as CoinPurchaseRecord["store"],
    transactionId: row.storeTransactionId ?? "",
    productId: row.productId,
    coinsGranted: row.coinsGranted,
    environment: row.environment,
    source: row.source,
    refundedAt: row.refundedAt,
    refundedCoins: row.refundedCoins,
    refundShortfall: row.refundShortfall,
    createdAt: row.createdAt,
  };
}

function coinPurchaseKey(store: string, transactionId: string) {
  return and(eq(iapReceipts.store, store), eq(iapReceipts.storeTransactionId, transactionId));
}

/** Locks the user's row for the rest of the transaction and returns their coin balance. */
async function lockedCoinBalance(tx: Tx, userId: string): Promise<number> {
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
  if (!user) throw new Error(`User not found: ${userId}`);

  const [latest] = await tx
    .select({ balanceAfter: coinLedger.balanceAfter })
    .from(coinLedger)
    .where(eq(coinLedger.userId, userId))
    .orderBy(desc(coinLedger.createdAt))
    .limit(1);

  return latest?.balanceAfter ?? user.coinBalanceCache;
}

/** Appends a ledger entry and updates the balance cache. Call after lockedCoinBalance. */
async function appendCoinLedger(tx: Tx, input: GrantCoinsInput, balanceAfter: number) {
  await tx.insert(coinLedger).values({
    userId: input.userId,
    delta: input.delta,
    type: input.type as typeof coinLedger.$inferInsert.type,
    refType: input.refType ?? null,
    refId: input.refId ?? null,
    balanceAfter,
    // Time of the insert (taken after the row lock) rather than now(), which is the
    // transaction start: that keeps "latest entry" in the order balances were applied.
    createdAt: sql`clock_timestamp()`,
  });

  await tx
    .update(users)
    .set({ coinBalanceCache: balanceAfter, updatedAt: now() })
    .where(eq(users.id, input.userId));
}

async function insertOrderWithItems(tx: Tx, input: CreateOrderInput) {
  const timestamp = now();
  const [orderRow] = await tx
    .insert(orders)
    .values({
      userId: input.userId,
      tier: input.tier,
      state: "PROCESSING",
      coinTotal: input.coinTotal,
      placedAt: timestamp,
      stateEta: input.stateEta,
      revealReadyAt: null,
      idempotencyKey: input.idempotencyKey ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning();

  const itemRows =
    input.items.length === 0
      ? []
      : await tx
          .insert(orderItems)
          .values(
            input.items.map((item) => ({
              orderId: orderRow!.id,
              listingVariantId: item.listingVariantId,
              coinPriceSnapshot: item.coinPriceSnapshot,
              quantity: item.quantity,
              createdAt: timestamp,
            })),
          )
          .returning();

  return {
    order: mapOrder(orderRow!),
    items: itemRows.map(mapOrderItem),
  };
}

/**
 * Inserts a purchase and its lines. #38: a repeat (user, orderRef) inserts nothing and gets the
 * existing purchase and its lines back with `created: false` (also when it races another insert).
 */
async function insertMerchantPurchaseWithItems(tx: Tx, input: CreateMerchantPurchaseInput) {
  const [purchaseRow] = await tx
    .insert(merchantPurchases)
    .values({
      id: randomUUID(),
      userId: input.userId,
      source: input.source,
      merchant: input.merchant,
      orderRef: input.orderRef ?? null,
      purchasedAt: input.purchasedAt,
      currency: input.currency,
      totalMinor: input.totalMinor,
      status: "CONFIRMED",
      deliveryStatus: input.deliveryStatus ?? "ORDERED",
      etaAt: input.etaAt ?? null,
      trackingCode: input.trackingCode ?? null,
      returnWindowDeadline: input.returnWindowDeadline ?? null,
      exchangeWindowDeadline: input.exchangeWindowDeadline ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (!purchaseRow) {
    if (input.orderRef == null) throw new Error("merchant purchase insert conflicted without an orderRef");
    const [existing] = await tx
      .select()
      .from(merchantPurchases)
      .where(and(eq(merchantPurchases.userId, input.userId), eq(merchantPurchases.orderRef, input.orderRef)))
      .limit(1);
    if (!existing) throw new Error("merchant purchase orderRef conflict but no row found");
    const existingItems = await tx
      .select()
      .from(merchantPurchaseItems)
      .where(eq(merchantPurchaseItems.purchaseId, existing.id))
      .orderBy(desc(merchantPurchaseItems.createdAt));
    return {
      purchase: mapMerchantPurchase(existing),
      items: existingItems.map(mapMerchantPurchaseItem),
      created: false,
    };
  }
  const itemRows =
    input.items.length === 0
      ? []
      : await tx
          .insert(merchantPurchaseItems)
          .values(
            input.items.map((item) => ({
              id: randomUUID(),
              purchaseId: purchaseRow.id,
              title: item.title,
              category: item.category ?? null,
              brand: item.brand ?? null,
              priceMinor: item.priceMinor,
              imageKey: item.imageKey ?? null,
              qty: item.qty ?? 1,
              duplicateWardrobeItemId: item.duplicateWardrobeItemId ?? null,
            })),
          )
          .returning();
  return {
    purchase: mapMerchantPurchase(purchaseRow),
    items: itemRows.map(mapMerchantPurchaseItem),
    created: true,
  };
}

/**
 * #12: inserts an ACTIVE disposition listing, or returns the item's existing ACTIVE one
 * (disposition_listings_active_item_uidx) with `created: false`.
 */
async function openDispositionListingTx(
  tx: Tx,
  input: {
    userId: string;
    wardrobeItemId: string;
    mode: DispositionListingRecord["mode"];
    priceMinor?: number | null;
    sellerId?: string | null;
  },
) {
  const [row] = await tx
    .insert(dispositionListings)
    .values({
      id: randomUUID(),
      userId: input.userId,
      wardrobeItemId: input.wardrobeItemId,
      mode: input.mode,
      priceMinor: input.priceMinor ?? null,
      status: "ACTIVE",
      sellerId: input.sellerId ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return { listing: mapDispositionListing(row), created: true };
  const [existing] = await tx
    .select()
    .from(dispositionListings)
    .where(and(
      eq(dispositionListings.wardrobeItemId, input.wardrobeItemId),
      eq(dispositionListings.userId, input.userId),
      eq(dispositionListings.status, "ACTIVE"),
    ))
    .limit(1);
  if (!existing) throw new Error("disposition listing insert conflicted but no ACTIVE listing found");
  return { listing: mapDispositionListing(existing), created: false };
}

/** Repoints ingestion docs, receipts and return requests from one purchase to another. */
async function repointPurchaseRefs(tx: Tx, fromPurchaseId: string, toPurchaseId: string) {
  await tx
    .update(ingestionDocuments)
    .set({ matchedPurchaseId: toPurchaseId, updatedAt: now() })
    .where(eq(ingestionDocuments.matchedPurchaseId, fromPurchaseId));
  await tx
    .update(receipts)
    .set({ purchaseId: toPurchaseId, updatedAt: now() })
    .where(eq(receipts.purchaseId, fromPurchaseId));
  await tx
    .update(returnRequests)
    .set({ purchaseId: toPurchaseId, updatedAt: now() })
    .where(eq(returnRequests.purchaseId, fromPurchaseId));
}

function generateReferralCode(userId: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  let code = "";
  let n = Math.abs(hash);
  for (let i = 0; i < 6; i++) {
    code += chars[n % chars.length]!;
    n = Math.floor(n / chars.length);
  }
  return code;
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    phone: row.phone ?? null,
    email: row.email ?? null,
    googleSub: row.googleSub ?? null,
    displayName: row.displayName,
    avatarStatus: row.avatarStatus as AvatarStatus,
    coinBalanceCache: row.coinBalanceCache,
    consentFlags: row.consentFlags,
    prefs: row.prefs ?? {},
    timeZone: row.timeZone,
    pushToken: row.pushToken,
    referralCode: row.referralCode ?? null,
    referredBy: row.referredBy ?? null,
    streakCount: row.streakCount ?? 0,
    lastStreakClaimAt: row.lastStreakClaimAt ?? null,
    styleProfile: row.styleProfile ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAvatar(row: AvatarRow): AvatarRecord {
  return {
    id: row.id,
    userId: row.userId,
    referenceImageKey: row.referenceImageKey,
    sourceUploadKeys: row.sourceUploadKeys,
    bodyMeta: row.bodyMeta,
    status: row.status as AvatarStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCoinLedger(row: CoinLedgerRow): CoinLedgerRecord {
  return {
    id: row.id,
    userId: row.userId,
    delta: row.delta,
    type: row.type,
    refType: row.refType,
    refId: row.refId,
    balanceAfter: row.balanceAfter,
    createdAt: row.createdAt,
  };
}

function mapListing(row: ListingRow): ListingRecord {
  return {
    id: row.id,
    sellerId: row.sellerId,
    title: row.title,
    category: row.category,
    tags: row.tags,
    coinPrice: row.coinPrice,
    realPrice: row.realPrice ?? null,
    productImageKeys: row.productImageKeys,
    houseModelRenderKey: row.houseModelRenderKey ?? "",
    affiliateUrl: row.affiliateUrl,
    affiliateLinks: row.affiliateLinks as AffiliateLinkRecord[] | null ?? null,
    status: row.status as ListingStatus,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

function mapListingVariant(row: ListingVariantRow): ListingVariantRecord {
  return {
    id: row.id,
    listingId: row.listingId,
    size: row.size,
    color: row.color,
    garmentImageKey: row.garmentImageKey,
  };
}

function mapSeller(row: SellerRow): SellerRecord {
  return {
    id: row.id,
    userId: row.userId,
    shopName: row.shopName,
    status: row.status as SellerStatus,
    sellerType: (row.sellerType ?? "RETAILER") as SellerRecord["sellerType"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTailoringOrder(row: typeof tailoringOrders.$inferSelect): TailoringOrderRecord {
  return {
    id: row.id,
    userId: row.userId,
    templateId: row.templateId ?? null,
    measurementProfileId: row.measurementProfileId ?? null,
    selections: (row.selections ?? {}) as Record<string, string>,
    fabricRef: row.fabricRef ?? null,
    fabricPhotoKeys: (row.fabricPhotoKeys as string[] | null) ?? [],
    tailorSellerId: row.tailorSellerId ?? null,
    measurementSnapshot: (row.measurementSnapshot as Record<string, unknown> | null) ?? null,
    state: row.state,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function deriveTryonStatus(imageKey: string | null): TryonPreviewStatus {
  return imageKey ? "READY" : "PROCESSING";
}

function mapTryonPreview(row: TryonPreviewRow): TryonPreviewRecord {
  return {
    id: row.id,
    userId: row.userId,
    listingVariantId: row.listingVariantId ?? null,
    wardrobeItemId: row.wardrobeItemId ?? null,
    imageKey: row.imageKey,
    status: deriveTryonStatus(row.imageKey),
    provider: row.provider,
    costMicros: row.costMicros,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCart(row: CartRow): CartRecord {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
  };
}

function mapCartItem(row: CartItemRow): CartItemRecord {
  return {
    id: row.id,
    cartId: row.cartId,
    listingVariantId: row.listingVariantId,
    coinPriceSnapshot: row.coinPriceSnapshot,
    quantity: row.quantity,
    createdAt: row.createdAt,
  };
}

function mapOrder(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    userId: row.userId,
    tier: row.tier,
    state: row.state,
    coinTotal: row.coinTotal,
    placedAt: row.placedAt ?? row.createdAt,
    stateEta: row.stateEta,
    revealReadyAt: row.revealReadyAt,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapOrderItem(row: OrderItemRow): OrderItemRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    listingVariantId: row.listingVariantId,
    coinPriceSnapshot: row.coinPriceSnapshot,
    quantity: row.quantity,
    createdAt: row.createdAt,
  };
}

function mapRender(row: RenderRow): RenderRecord {
  return {
    id: row.id,
    orderItemId: row.orderItemId,
    scenario: row.scenario,
    imageKey: row.imageKey,
    isFree: row.isFree,
    unlocked: row.unlocked,
    provider: row.provider,
    status: row.status,
    costMicros: row.costMicros,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPushEvent(row: PushEventRow): PushEventRecord {
  return {
    id: row.id,
    userId: row.userId,
    orderId: row.orderId,
    eventType: row.eventType,
    dedupeKey: row.dedupeKey,
    title: row.title,
    body: row.body,
    payload: row.payload as PushEventPayload,
    status: row.status,
    expoTicketId: row.expoTicketId ?? null,
    createdAt: row.createdAt,
  };
}

/**
 * SQL twin of matchesStyleKeywords: the listing's title, category and tags as padded
 * lowercase words (non-ASCII-alphanumerics become spaces first, under "C" so the
 * result is the same in any locale), tested against " keyword " patterns.
 */
function styleMatchSql(keywords: string[]) {
  const words = sql`' ' || lower(regexp_replace((${listings.title} || ' ' || ${listings.category} || ' ' || array_to_string(${listings.tags}, ' ')) COLLATE "C", ${LISTING_WORD_SEPARATOR}, ' ', 'g')) || ' '`;
  const patterns = keywords.map((keyword) => sql`${`% ${keyword} %`}`);
  return sql<boolean>`coalesce(${words} LIKE ANY (ARRAY[${sql.join(patterns, sql`, `)}]::text[]), false)`;
}


type ConsentGrantRow = typeof consentGrants.$inferSelect;
type IngestionSourceRow = typeof ingestionSources.$inferSelect;
type IngestionDocumentRow = typeof ingestionDocuments.$inferSelect;
type MoneyAccountRow = typeof moneyAccounts.$inferSelect;
type MoneyLedgerRow = typeof moneyLedger.$inferSelect;
type ReceiptRow = typeof receipts.$inferSelect;
type WarrantyRow = typeof warranties.$inferSelect;
type MerchantPurchaseRow = typeof merchantPurchases.$inferSelect;
type MerchantPurchaseItemRow = typeof merchantPurchaseItems.$inferSelect;
type WardrobeItemRow = typeof wardrobeItems.$inferSelect;
type OutfitRow = typeof outfits.$inferSelect;
type WearLogRow = typeof wearLog.$inferSelect;
type ItemMetricRow = typeof itemMetrics.$inferSelect;
type DispositionListingRow = typeof dispositionListings.$inferSelect;

function mapConsentGrant(row: ConsentGrantRow): ConsentGrantRecord {
  return {
    id: row.id,
    userId: row.userId,
    scope: row.scope as ConsentGrantRecord["scope"],
    grantedAt: row.grantedAt,
    revokedAt: row.revokedAt ?? null,
    source: row.source,
    meta: (row.meta ?? null) as Record<string, unknown> | null,
    noticeVersion: row.noticeVersion ?? null,
  };
}

type ConsentRecordRow = typeof consentRecords.$inferSelect;
type PrivacyRequestRow = typeof privacyRequests.$inferSelect;
type InterviewKitRow = typeof interviewKits.$inferSelect;
type SocialPollRow = typeof socialPolls.$inferSelect;
type HouseholdVaultSettingsRow = typeof householdVaultSettings.$inferSelect;

function mapConsentRecord(row: ConsentRecordRow): ConsentHistoryRecord {
  return {
    id: row.id,
    userId: row.userId ?? null,
    subjectRef: row.subjectRef,
    scope: row.scope as ConsentGrantRecord["scope"],
    action: row.action,
    noticeVersion: row.noticeVersion ?? null,
    source: row.source,
    grantId: row.grantId ?? null,
    createdAt: row.createdAt,
  };
}

function mapPrivacyRequest(row: PrivacyRequestRow): PrivacyRequestRecord {
  return {
    id: row.id,
    userId: row.userId ?? null,
    subjectRef: row.subjectRef,
    kind: row.kind,
    status: row.status,
    storageKeys: row.storageKeys ?? [],
    steps: row.steps ?? {},
    resultKey: row.resultKey ?? null,
    attempts: row.attempts,
    error: row.error ?? null,
    requestedAt: row.requestedAt,
    completedAt: row.completedAt ?? null,
    updatedAt: row.updatedAt,
  };
}

function mapInterviewKit(row: InterviewKitRow): InterviewKitRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    kind: row.kind,
    itemIds: row.itemIds ?? [],
    eventAt: row.eventAt,
    occasion: row.occasion ?? null,
    remindAt: row.remindAt ?? null,
    reminderScheduled: row.reminderScheduled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSocialPoll(row: SocialPollRow): SocialPollRecord {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    tokenHash: row.tokenHash,
    itemLabel: row.itemLabel ?? null,
    returnRequestId: row.returnRequestId ?? null,
    options: row.options ?? [],
    plannedFor: row.plannedFor ?? null,
    winnerAppliedAt: row.winnerAppliedAt ?? null,
    expiresAt: row.expiresAt,
    closedAt: row.closedAt ?? null,
    createdAt: row.createdAt,
  };
}

function mapHouseholdVaultSettings(row: HouseholdVaultSettingsRow): HouseholdVaultSettingsRecord {
  return {
    householdId: row.householdId,
    userId: row.userId,
    vaultAccess: row.vaultAccess,
    spendCapMinor: row.spendCapMinor ?? null,
    spentMinor: row.spentMinor,
    updatedAt: row.updatedAt,
  };
}

/** Storage keys we own (not external URLs), deduplicated. */
function ownStorageKeys(values: Array<string | null | undefined>): string[] {
  const keys = new Set<string>();
  for (const v of values) {
    if (typeof v !== "string") continue;
    const key = v.trim();
    if (!key || /^[a-z][a-z0-9+.-]*:\/\//i.test(key) || key.startsWith("data:")) continue;
    keys.add(key);
  }
  return [...keys];
}

const SOURCE_DISCONNECTED_META = (disconnectedAt: string) => ({
  disconnectedAt,
  lastError: "Disconnected — reconnect to resume sync",
  lastErrorAt: disconnectedAt,
  errorCode: "DISCONNECTED",
});

function mapIngestionSource(row: IngestionSourceRow): IngestionSourceRecord {
  return {
    id: row.id,
    userId: row.userId ?? null,
    kind: row.kind as IngestionSourceRecord["kind"],
    provider: row.provider,
    consentGrantId: row.consentGrantId,
    status: row.status as IngestionSourceRecord["status"],
    cursor: row.cursor ?? null,
    lastSyncAt: row.lastSyncAt ?? null,
    encryptedToken: (row.encryptedToken ?? null) as { data: string } | null,
    meta: (row.meta ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapIngestionDocument(row: IngestionDocumentRow): IngestionDocumentRecord {
  return {
    id: row.id,
    userId: row.userId ?? null,
    kind: row.kind as IngestionDocumentRecord["kind"],
    rawKey: row.rawKey,
    parsedJson: (row.parsedJson ?? {}) as Record<string, unknown>,
    matchedPurchaseId: row.matchedPurchaseId ?? null,
    status: row.status as IngestionDocumentRecord["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMoneyAccount(row: MoneyAccountRow): MoneyAccountRecord {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind as MoneyAccountRecord["kind"],
    merchant: row.merchant,
    currency: row.currency,
    balanceCacheMinor: row.balanceCacheMinor,
    expiresAt: row.expiresAt ?? null,
    status: row.status as MoneyAccountRecord["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMoneyLedger(row: MoneyLedgerRow): MoneyLedgerRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    userId: row.userId,
    delta: row.delta,
    type: row.type as MoneyLedgerRecord["type"],
    refType: row.refType ?? null,
    refId: row.refId ?? null,
    balanceAfter: row.balanceAfter,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapReceipt(row: ReceiptRow): ReceiptRecord {
  return {
    id: row.id,
    userId: row.userId,
    imageKey: row.imageKey,
    merchant: row.merchant,
    purchasedAt: row.purchasedAt,
    totalMinor: row.totalMinor,
    ocrJson: (row.ocrJson ?? {}) as Record<string, unknown>,
    purchaseId: row.purchaseId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapWarranty(row: WarrantyRow): WarrantyRecord {
  return {
    id: row.id,
    userId: row.userId,
    receiptId: row.receiptId ?? null,
    itemTitle: row.itemTitle,
    provider: row.provider,
    coverageUntil: row.coverageUntil,
    claimContact: row.claimContact ?? null,
    category: row.category ?? null,
    state: row.state as WarrantyRecord["state"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMerchantPurchase(row: MerchantPurchaseRow): MerchantPurchaseRecord {
  const proofRaw = (row as { deliveryProofKeys?: string | null }).deliveryProofKeys;
  let deliveryProofKeys: string[] = [];
  if (proofRaw) {
    try {
      const parsed = JSON.parse(proofRaw) as unknown;
      if (Array.isArray(parsed)) deliveryProofKeys = parsed.filter((k) => typeof k === "string");
    } catch {
      deliveryProofKeys = [];
    }
  }
  return {
    id: row.id,
    userId: row.userId,
    source: row.source as MerchantPurchaseRecord["source"],
    merchant: row.merchant,
    orderRef: row.orderRef ?? null,
    purchasedAt: row.purchasedAt,
    currency: row.currency,
    totalMinor: row.totalMinor,
    status: row.status as MerchantPurchaseRecord["status"],
    rawDocId: row.rawDocId ?? null,
    deliveryStatus: (row.deliveryStatus ?? "ORDERED") as MerchantPurchaseRecord["deliveryStatus"],
    etaAt: row.etaAt ?? null,
    trackingCode: row.trackingCode ?? null,
    carrier: (row as { carrier?: string | null }).carrier ?? null,
    deliveredAt: row.deliveredAt ?? null,
    returnWindowDeadline: row.returnWindowDeadline ?? null,
    exchangeWindowDeadline: row.exchangeWindowDeadline ?? null,
    deliveryAddressNote: (row as { deliveryAddressNote?: string | null }).deliveryAddressNote ?? null,
    deliveryProofKeys,
    assigneeUserId: (row as { assigneeUserId?: string | null }).assigneeUserId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMerchantPurchaseItem(row: MerchantPurchaseItemRow): MerchantPurchaseItemRecord {
  return {
    id: row.id,
    purchaseId: row.purchaseId,
    title: row.title,
    category: row.category ?? null,
    brand: row.brand ?? null,
    priceMinor: row.priceMinor,
    imageKey: row.imageKey ?? null,
    qty: row.qty,
    duplicateWardrobeItemId: row.duplicateWardrobeItemId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapReturnRequest(row: typeof returnRequests.$inferSelect): ReturnRecord {
  return {
    id: row.id,
    userId: row.userId,
    purchaseId: row.purchaseId ?? null,
    purchaseItemId: row.purchaseItemId ?? null,
    windowDeadline: row.windowDeadline,
    exchangeDeadline: row.exchangeDeadline ?? null,
    state: row.state as ReturnRecord["state"],
    refundMinor: row.refundMinor ?? null,
    method: row.method ?? null,
    tracking: row.tracking ?? null,
    pickupSlotAt: row.pickupSlotAt ?? null,
    reason: (row.reason ?? null) as ReturnRecord["reason"],
    orderedSize: row.orderedSize ?? null,
    preferredSize: row.preferredSize ?? null,
    chaseSnoozeUntil: (row as { chaseSnoozeUntil?: Date | null }).chaseSnoozeUntil ?? null,
    chaseEscalated: Boolean((row as { chaseEscalated?: number | null }).chaseEscalated),
    invoiceRequestedAt: (row as { invoiceRequestedAt?: Date | null }).invoiceRequestedAt ?? null,
    invoiceReceiptId: (row as { invoiceReceiptId?: string | null }).invoiceReceiptId ?? null,
    labelImageKey: (row as { labelImageKey?: string | null }).labelImageKey ?? null,
    labelUsedAt: (row as { labelUsedAt?: Date | null }).labelUsedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEmiPlan(row: typeof emiPlans.$inferSelect): EmiPlanRecord {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    merchant: row.merchant ?? null,
    principalMinor: row.principalMinor,
    remainingMinor: row.remainingMinor,
    installmentMinor: row.installmentMinor,
    nextDueOn: String(row.nextDueOn),
    currency: row.currency,
    status: row.status as EmiPlanRecord["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRepairLog(row: typeof repairLogs.$inferSelect): RepairLogRecord {
  return {
    id: row.id,
    userId: row.userId,
    wardrobeItemId: row.wardrobeItemId,
    costMinor: row.costMinor,
    repairedOn:
      typeof row.repairedOn === "string"
        ? row.repairedOn
        : (row.repairedOn as Date).toISOString().slice(0, 10),
    kind: (row.kind ?? "REPAIR") as RepairLogRecord["kind"],
    note: row.note ?? null,
    tailorOrderId: row.tailorOrderId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapWardrobeItem(row: WardrobeItemRow): WardrobeItemRecord {
  return {
    id: row.id,
    userId: row.userId,
    source: row.source as WardrobeItemRecord["source"],
    category: row.category,
    colors: (row.colors ?? []) as string[],
    brand: row.brand ?? null,
    costMinor: row.costMinor,
    imageKeys: (row.imageKeys ?? []) as string[],
    garmentImageKey: row.garmentImageKey ?? null,
    purchaseItemId: row.purchaseItemId ?? null,
    laundryStatus: (row.laundryStatus ?? "CLEAN") as WardrobeItemRecord["laundryStatus"],
    closetStatus: ((row as { closetStatus?: string }).closetStatus ?? "ACTIVE") as WardrobeItemRecord["closetStatus"],
    tags: ((row as { tags?: string[] | null }).tags ?? []) as string[],
    careRules: ((row as { careRules?: Record<string, unknown> | null }).careRules ?? null) as Record<
      string,
      unknown
    > | null,
    dryCleanTicket: ((row as { dryCleanTicket?: string | null }).dryCleanTicket ?? null) as string | null,
    dryCleanPickupOn: ((row as { dryCleanPickupOn?: string | null }).dryCleanPickupOn ?? null) as
      | string
      | null,
    lentTo: ((row as { lentTo?: string | null }).lentTo ?? null) as string | null,
    lentDueOn: ((row as { lentDueOn?: string | null }).lentDueOn ?? null) as string | null,
    profileId: ((row as { profileId?: string | null }).profileId ?? null) as string | null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapOutfit(row: OutfitRow): OutfitRecord {
  return {
    id: row.id,
    userId: row.userId,
    itemIds: (row.itemIds ?? []) as string[],
    occasion: row.occasion as OutfitRecord["occasion"],
    weatherCtx: (row.weatherCtx ?? null) as Record<string, unknown> | null,
    plannedFor: (row.plannedFor as string | null) ?? null,
    generatedAt: row.generatedAt,
    styleProfileSnapshot: (row.styleProfileSnapshot ?? null) as Record<
      string,
      unknown
    > | null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapWearLog(row: WearLogRow): WearLogRecord {
  return {
    id: row.id,
    userId: row.userId,
    wardrobeItemId: row.wardrobeItemId ?? null,
    outfitId: row.outfitId ?? null,
    wornOn: row.wornOn,
    imageKey: row.imageKey ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapItemMetric(row: ItemMetricRow): ItemMetricRecord {
  return {
    id: row.id,
    userId: row.userId,
    wardrobeItemId: row.wardrobeItemId,
    wearCount: row.wearCount,
    lastWornAt: row.lastWornAt ?? null,
    costPerWearMinor: row.costPerWearMinor ?? null,
    targetCpwMinor: row.targetCpwMinor ?? null,
    status: row.status as ItemMetricRecord["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapDispositionListing(row: DispositionListingRow): DispositionListingRecord {
  return {
    id: row.id,
    userId: row.userId,
    wardrobeItemId: row.wardrobeItemId,
    mode: row.mode as DispositionListingRecord["mode"],
    priceMinor: row.priceMinor ?? null,
    status: row.status as DispositionListingRecord["status"],
    sellerId: row.sellerId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createPostgresRepositories(db: Db): Repositories {
  const repos: Repositories = {
    async findUserByPhone(phone) {
      const [row] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
      return row ? mapUser(row) : null;
    },

    async findUserById(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row ? mapUser(row) : null;
    },

    async findUserByGoogleSub(googleSub) {
      const [row] = await db.select().from(users).where(eq(users.googleSub, googleSub)).limit(1);
      return row ? mapUser(row) : null;
    },

    async findUserByEmail(email) {
      const [row] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
      return row ? mapUser(row) : null;
    },

    async createUser(phone) {
      const existing = await repos.findUserByPhone(phone);
      if (existing) {
        if (!existing.referralCode) {
          const code = generateReferralCode(existing.id);
          const updated = await repos.updateUser(existing.id, { referralCode: code });
          return { user: updated, isNew: false };
        }
        return { user: existing, isNew: false };
      }

      const userId = randomUUID();
      const referralCode = generateReferralCode(userId);

      const [row] = await db
        .insert(users)
        .values({
          id: userId,
          phone,
          email: null,
          googleSub: null,
          displayName: null,
          avatarStatus: "NONE",
          coinBalanceCache: 0,
          consentFlags: {},
          pushToken: null,
          referralCode,
        })
        .returning();

      return { user: mapUser(row!), isNew: true };
    },

    async findOrCreateGoogleUser({ googleSub, email, displayName }) {
      const existingGoogle = await repos.findUserByGoogleSub(googleSub);
      if (existingGoogle) {
        if (!existingGoogle.referralCode) {
          const code = generateReferralCode(existingGoogle.id);
          const updated = await repos.updateUser(existingGoogle.id, { referralCode: code });
          return { user: updated, isNew: false };
        }
        return { user: existingGoogle, isNew: false };
      }

      const existingEmail = await repos.findUserByEmail(email);
      if (existingEmail) {
        const updated = await repos.updateUser(existingEmail.id, {
          googleSub,
          email: email.toLowerCase(),
          displayName: displayName ?? existingEmail.displayName,
          referralCode: existingEmail.referralCode ?? generateReferralCode(existingEmail.id),
        });
        return { user: updated, isNew: false };
      }

      const userId = randomUUID();
      const referralCode = generateReferralCode(userId);
      const [row] = await db
        .insert(users)
        .values({
          id: userId,
          phone: null,
          email: email.toLowerCase(),
          googleSub,
          displayName: displayName ?? null,
          avatarStatus: "NONE",
          coinBalanceCache: 0,
          consentFlags: {},
          pushToken: null,
          referralCode,
        })
        .returning();

      return { user: mapUser(row!), isNew: true };
    },

    async updateUser(id, patch) {
      const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!existing) throw new Error(`User not found: ${id}`);

      const [row] = await db
        .update(users)
        .set({
          phone: patch.phone !== undefined ? patch.phone : existing.phone,
          email: patch.email !== undefined ? patch.email : existing.email,
          googleSub: patch.googleSub !== undefined ? patch.googleSub : existing.googleSub,
          displayName: patch.displayName ?? existing.displayName,
          avatarStatus: patch.avatarStatus ?? existing.avatarStatus,
          coinBalanceCache: patch.coinBalanceCache ?? existing.coinBalanceCache,
          consentFlags: patch.consentFlags ?? existing.consentFlags,
          // Only when given, so an unrelated update never writes back a stale time zone.
          ...(patch.timeZone !== undefined ? { timeZone: patch.timeZone } : {}),
          pushToken: patch.pushToken ?? existing.pushToken,
          referralCode: patch.referralCode ?? existing.referralCode,
          referredBy: patch.referredBy ?? existing.referredBy,
          streakCount: patch.streakCount ?? existing.streakCount,
          lastStreakClaimAt: patch.lastStreakClaimAt ?? existing.lastStreakClaimAt,
          styleProfile: patch.styleProfile ?? existing.styleProfile,
          updatedAt: now(),
        })
        .where(eq(users.id, id))
        .returning();

      return mapUser(row!);
    },

    async setUserTimeZone(userId, timeZone) {
      const [row] = await db
        .update(users)
        .set({ timeZone, updatedAt: now() })
        .where(eq(users.id, userId))
        .returning({ timeZone: users.timeZone });
      return row?.timeZone ?? null;
    },

    async getUserPrefs(userId) {
      const [row] = await db
        .select({ prefs: users.prefs })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return row ? (row.prefs ?? {}) : null;
    },

    async patchUserPrefs(userId, patch) {
      const { set, deleteKeys } = splitUserPrefsPatch(patch);
      // One statement, so concurrent patches to different keys can't lose each other's writes.
      const [row] = await db
        .update(users)
        .set({
          prefs: sql`(${users.prefs} || ${JSON.stringify(set)}::jsonb) - array(select jsonb_array_elements_text(${JSON.stringify(deleteKeys)}::jsonb))`,
          updatedAt: now(),
        })
        .where(eq(users.id, userId))
        .returning({ prefs: users.prefs });
      return row ? (row.prefs ?? {}) : null;
    },

    async findUserByReferralCode(code) {
      const [row] = await db.select().from(users).where(eq(users.referralCode, code)).limit(1);
      return row ? mapUser(row) : null;
    },

    async applyReferralCode(userId, referralCode) {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || user.referredBy) return null;
      const [referrer] = await db.select().from(users).where(eq(users.referralCode, referralCode)).limit(1);
      if (!referrer || referrer.id === userId) return null;
      const [row] = await db
        .update(users)
        .set({ referredBy: referrer.id, updatedAt: now() })
        .where(eq(users.id, userId))
        .returning();
      return mapUser(row!);
    },

    async countReferrals(referrerId) {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.referredBy, referrerId));
      return result?.count ?? 0;
    },

    async claimStreak(userId) {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) throw new Error(`User not found: ${userId}`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const last = user.lastStreakClaimAt ? new Date(user.lastStreakClaimAt) : null;
      if (last) {
        last.setHours(0, 0, 0, 0);
        if (last.getTime() === today.getTime()) {
          return { streakCount: user.streakCount ?? 0, coinsGranted: 0, balanceAfter: user.coinBalanceCache };
        }
      }
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const isConsecutive = last && last.getTime() === yesterday.getTime();
      const newStreak = isConsecutive ? (user.streakCount ?? 0) + 1 : 1;
      const coinsGranted = streakRewardForDay(newStreak);
      const { balanceAfter } = await repos.grantCoins({
        userId,
        delta: coinsGranted,
        type: "EARN_STREAK",
        refType: "streak",
        refId: `day-${newStreak}`,
      });
      await db
        .update(users)
        .set({ streakCount: newStreak, lastStreakClaimAt: today, coinBalanceCache: balanceAfter, updatedAt: now() })
        .where(eq(users.id, userId));
      return { streakCount: newStreak, coinsGranted, balanceAfter };
    },

    async getStreakStatus(userId) {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return { streakCount: 0, lastClaimedAt: null, todayClaimed: false };
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const last = user.lastStreakClaimAt ? new Date(user.lastStreakClaimAt) : null;
      if (last) last.setHours(0, 0, 0, 0);
      const todayClaimed = last !== null && last.getTime() === today.getTime();
      return { streakCount: user.streakCount ?? 0, lastClaimedAt: user.lastStreakClaimAt ?? null, todayClaimed };
    },

    async saveStyleProfile(userId, profile) {
      await db
        .update(users)
        .set({ styleProfile: profile, updatedAt: now() })
        .where(eq(users.id, userId));
    },

    async saveLookbookItem(userId, listingId) {
      await db.insert(lookbookItems).values({ userId, listingId }).onConflictDoNothing();
    },

    async removeLookbookItem(userId, listingId) {
      await db
        .delete(lookbookItems)
        .where(and(eq(lookbookItems.userId, userId), eq(lookbookItems.listingId, listingId)));
    },

    async listLookbookListings(userId) {
      const rows = await db
        .select({ listing: listings })
        .from(lookbookItems)
        .innerJoin(listings, eq(lookbookItems.listingId, listings.id))
        .where(eq(lookbookItems.userId, userId))
        .orderBy(desc(lookbookItems.createdAt), asc(lookbookItems.listingId));
      return rows.map((row) => mapListing(row.listing));
    },

    async recordCashbackEvent(input) {
      await db.insert(cashbackEvents).values({
        id: randomUUID(),
        userId: input.userId,
        listingId: input.listingId,
        platform: input.platform,
        clickId: input.clickId,
        coinsEarned: 0,
        status: "PENDING",
      }).onConflictDoNothing();
    },

    async listCashbackEvents(userId) {
      const rows = await db
        .select()
        .from(cashbackEvents)
        .where(eq(cashbackEvents.userId, userId))
        .orderBy(desc(cashbackEvents.createdAt));
      return rows.map((r) => ({
        id: r.id,
        listingId: r.listingId,
        platform: r.platform,
        coinsEarned: r.coinsEarned,
        status: r.status,
        createdAt: r.createdAt,
      }));
    },

    async confirmCashback(clickId, status) {
      const [event] = await db
        .select()
        .from(cashbackEvents)
        .where(eq(cashbackEvents.clickId, clickId))
        .limit(1);
      if (!event || event.status === "CONFIRMED" || event.status === "REJECTED") return;

      if (status === "CONFIRMED") {
        await repos.grantCoins({
          userId: event.userId,
          delta: AFFILIATE_CASHBACK_COINS,
          type: "EARN_CASHBACK",
          refType: "cashback",
          refId: clickId,
        });
        await db
          .update(cashbackEvents)
          .set({ status: "CONFIRMED", coinsEarned: AFFILIATE_CASHBACK_COINS })
          .where(eq(cashbackEvents.clickId, clickId));
      } else {
        await db
          .update(cashbackEvents)
          .set({ status: "REJECTED" })
          .where(eq(cashbackEvents.clickId, clickId));
      }
    },

    async findAvatarByUserId(userId) {
      const [row] = await db.select().from(avatars).where(eq(avatars.userId, userId)).limit(1);
      return row ? mapAvatar(row) : null;
    },

    async upsertAvatar(data) {
      const timestamp = now();
      const [row] = await db
        .insert(avatars)
        .values({
          id: data.id,
          userId: data.userId,
          referenceImageKey: data.referenceImageKey,
          sourceUploadKeys: data.sourceUploadKeys,
          bodyMeta: data.bodyMeta,
          status: data.status,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: avatars.userId,
          set: {
            referenceImageKey: data.referenceImageKey,
            sourceUploadKeys: data.sourceUploadKeys,
            bodyMeta: data.bodyMeta,
            status: data.status,
            updatedAt: timestamp,
          },
        })
        .returning();

      return mapAvatar(row!);
    },

    async deleteAvatarByUserId(userId) {
      await db.delete(avatars).where(eq(avatars.userId, userId));
      await repos.updateUser(userId, { avatarStatus: "NONE" });
    },

    async getCoinBalance(userId) {
      const [latest] = await db
        .select({ balanceAfter: coinLedger.balanceAfter })
        .from(coinLedger)
        .where(eq(coinLedger.userId, userId))
        .orderBy(desc(coinLedger.createdAt))
        .limit(1);

      if (latest) return latest.balanceAfter;

      const [user] = await db
        .select({ coinBalanceCache: users.coinBalanceCache })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return user?.coinBalanceCache ?? 0;
    },

    async grantCoins(input: GrantCoinsInput) {
      return db.transaction(async (tx) => {
        const balanceAfter = (await lockedCoinBalance(tx, input.userId)) + input.delta;
        if (balanceAfter < 0) throw new InsufficientCoinsError();

        await appendCoinLedger(tx, input, balanceAfter);
        return { balanceAfter };
      });
    },

    async spendCoins(input) {
      return repos.grantCoins({ ...input, delta: -Math.abs(input.delta) });
    },

    async listCoinTransactions({ userId, cursor, limit }): Promise<ListCoinTransactionsResult> {
      const conditions = [eq(coinLedger.userId, userId)];

      if (cursor) {
        const [cursorRow] = await db
          .select()
          .from(coinLedger)
          .where(eq(coinLedger.id, cursor))
          .limit(1);

        if (cursorRow) {
          conditions.push(
            sql`(${coinLedger.createdAt} < ${cursorRow.createdAt} OR (${coinLedger.createdAt} = ${cursorRow.createdAt} AND ${coinLedger.id} < ${cursorRow.id}))`,
          );
        }
      }

      const rows = await db
        .select()
        .from(coinLedger)
        .where(and(...conditions))
        .orderBy(desc(coinLedger.createdAt), desc(coinLedger.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const slice = rows.slice(0, limit).map(mapCoinLedger);
      const nextCursor =
        hasMore && slice.length > 0 ? (slice[slice.length - 1]?.id ?? null) : null;

      return { transactions: slice, nextCursor };
    },

    async findOrderByIdempotencyKey(key) {
      const [row] = await db
        .select()
        .from(orders)
        .where(eq(orders.idempotencyKey, key))
        .limit(1);

      return row ? mapOrder(row) : null;
    },

    async findCoinSpendByRef(userId, refType, refId) {
      const [row] = await db
        .select()
        .from(coinLedger)
        .where(
          and(
            eq(coinLedger.userId, userId),
            eq(coinLedger.type, "SPEND_UNLOCK"),
            eq(coinLedger.refType, refType),
            eq(coinLedger.refId, refId),
          ),
        )
        .orderBy(desc(coinLedger.createdAt))
        .limit(1);

      return row ? mapCoinLedger(row) : null;
    },

    async countReferralCoinsEarned(referrerId) {
      const [result] = await db
        .select({ total: sql<number>`coalesce(sum(${coinLedger.delta}), 0)::int` })
        .from(coinLedger)
        .where(and(eq(coinLedger.userId, referrerId), eq(coinLedger.type, "EARN_REFERRAL")));

      return result?.total ?? 0;
    },

    async findIapReceipt(eventId) {
      const [row] = await db
        .select({
          userId: iapReceipts.userId,
          coinsGranted: iapReceipts.coinsGranted,
        })
        .from(iapReceipts)
        .where(eq(iapReceipts.revenuecatEventId, eventId))
        .limit(1);

      return row ?? null;
    },

    async recordIapReceipt(input) {
      await db.insert(iapReceipts).values({
        revenuecatEventId: input.eventId,
        userId: input.userId,
        productId: input.productId,
        coinsGranted: input.coinsGranted,
        rawPayload: input.rawPayload ?? {},
      });
    },

    async creditCoinPurchase(input) {
      return db.transaction(async (tx) => {
        // The user's row first, as every coin write does; then claim the transaction id. A second
        // claim of the same id waits on the unique index until the first commits, then finds its row.
        const balance = await lockedCoinBalance(tx, input.userId);
        const [inserted] = await tx
          .insert(iapReceipts)
          .values({
            revenuecatEventId: `${input.store}:${input.transactionId}`,
            userId: input.userId,
            productId: input.productId,
            coinsGranted: input.coins,
            rawPayload: input.rawPayload ?? {},
            store: input.store,
            storeTransactionId: input.transactionId,
            environment: input.environment,
            source: input.source,
          })
          .onConflictDoNothing()
          .returning();
        if (inserted) {
          const balanceAfter = balance + input.coins;
          await appendCoinLedger(
            tx,
            {
              userId: input.userId,
              delta: input.coins,
              type: "IAP_PURCHASE",
              refType: "iap",
              refId: inserted.id,
            },
            balanceAfter,
          );
          return { status: "granted" as const, purchase: toCoinPurchaseRecord(inserted), balanceAfter };
        }

        const [existing] = await tx
          .select()
          .from(iapReceipts)
          .where(coinPurchaseKey(input.store, input.transactionId))
          .limit(1);
        if (!existing) throw new Error(`iap receipt conflict without a row: ${input.store}:${input.transactionId}`);
        const purchase = toCoinPurchaseRecord(existing);
        if (existing.userId !== input.userId) return { status: "other_user" as const, purchase };
        return { status: "already_granted" as const, purchase, balanceAfter: balance };
      });
    },

    async refundCoinPurchase(input) {
      return db.transaction(async (tx) => {
        const key = coinPurchaseKey(input.store, input.transactionId);
        let [row] = await tx.select().from(iapReceipts).where(key).limit(1);
        if (!row) {
          if (!input.userId || !input.productId) return { status: "unknown" as const };
          // Remember the refund so a grant that arrives later credits nothing.
          await lockedCoinBalance(tx, input.userId);
          const [tombstone] = await tx
            .insert(iapReceipts)
            .values({
              revenuecatEventId: `${input.store}:${input.transactionId}`,
              userId: input.userId,
              productId: input.productId,
              coinsGranted: 0,
              rawPayload: { refund: input.rawPayload ?? {} },
              store: input.store,
              storeTransactionId: input.transactionId,
              source: input.source,
              refundedAt: now(),
            })
            .onConflictDoNothing()
            .returning();
          if (tombstone) {
            return { status: "refunded_before_grant" as const, purchase: toCoinPurchaseRecord(tombstone) };
          }
          // A grant committed in the meantime: take it back below.
          [row] = await tx.select().from(iapReceipts).where(key).limit(1);
          if (!row) throw new Error(`iap receipt conflict without a row: ${input.store}:${input.transactionId}`);
        }

        const balance = await lockedCoinBalance(tx, row.userId);
        const [locked] = await tx
          .select()
          .from(iapReceipts)
          .where(eq(iapReceipts.id, row.id))
          .for("update");
        if (locked!.refundedAt) {
          return { status: "already_refunded" as const, purchase: toCoinPurchaseRecord(locked!) };
        }
        const debited = Math.min(locked!.coinsGranted, Math.max(balance, 0));
        const shortfall = locked!.coinsGranted - debited;
        const balanceAfter = balance - debited;
        if (debited > 0) {
          await appendCoinLedger(
            tx,
            {
              userId: locked!.userId,
              delta: -debited,
              type: "REFUND",
              refType: "iap_refund",
              refId: locked!.id,
            },
            balanceAfter,
          );
        }
        const [updated] = await tx
          .update(iapReceipts)
          .set({
            refundedAt: now(),
            refundedCoins: debited,
            refundShortfall: shortfall,
            rawPayload: { ...locked!.rawPayload, refund: input.rawPayload ?? {} },
            updatedAt: now(),
          })
          .where(eq(iapReceipts.id, locked!.id))
          .returning();
        return {
          status: "refunded" as const,
          purchase: toCoinPurchaseRecord(updated!),
          debited,
          shortfall,
          balanceAfter,
        };
      });
    },

    async findCoinPurchase(store, transactionId) {
      const [row] = await db
        .select()
        .from(iapReceipts)
        .where(coinPurchaseKey(store, transactionId))
        .limit(1);
      return row ? toCoinPurchaseRecord(row) : null;
    },

    async listEntitlementGrants(userId) {
      const rows = await db
        .select()
        .from(entitlementGrants)
        .where(eq(entitlementGrants.userId, userId))
        .orderBy(asc(entitlementGrants.productId), asc(entitlementGrants.entitlementId));
      return rows.map(
        (row): EntitlementGrantRecord => ({
          entitlementId: row.entitlementId,
          productId: row.productId,
          expiresAt: row.expiresAt,
          isTrial: row.isTrial,
          source: row.source as EntitlementGrantRecord["source"],
          eventAt: row.eventAt,
          storeRef: row.storeRef,
        }),
      );
    },

    async applyEntitlementGrants(userId, grants, eventId) {
      return db.transaction(async (tx) => {
        if (eventId) {
          const inserted = await tx
            .insert(entitlementEvents)
            .values({ eventId, userId })
            .onConflictDoNothing()
            .returning({ eventId: entitlementEvents.eventId });
          if (inserted.length === 0) return { applied: false };
        }
        if (grants.length > 0) {
          await tx
            .insert(entitlementGrants)
            .values(grants.map((grant) => ({ ...grant, userId, updatedAt: now() })))
            .onConflictDoUpdate({
              target: [
                entitlementGrants.userId,
                entitlementGrants.entitlementId,
                entitlementGrants.productId,
                entitlementGrants.source,
              ],
              set: {
                expiresAt: sql`excluded.expires_at`,
                isTrial: sql`excluded.is_trial`,
                eventAt: sql`excluded.event_at`,
                storeRef: sql`coalesce(excluded.store_ref, ${entitlementGrants.storeRef})`,
                updatedAt: sql`excluded.updated_at`,
              },
              // A late-arriving older event never overwrites a newer grant.
              setWhere: sql`${entitlementGrants.eventAt} <= excluded.event_at`,
            });
        }
        return { applied: true };
      });
    },

    async listStoreSubscriptionGrants(source, expiresAfter) {
      return db
        .selectDistinct({
          userId: entitlementGrants.userId,
          productId: entitlementGrants.productId,
          storeRef: sql<string>`${entitlementGrants.storeRef}`,
        })
        .from(entitlementGrants)
        .where(
          and(
            eq(entitlementGrants.source, source),
            sql`${entitlementGrants.storeRef} is not null`,
            or(isNull(entitlementGrants.expiresAt), gt(entitlementGrants.expiresAt, expiresAfter)),
          ),
        )
        .orderBy(asc(entitlementGrants.userId), asc(entitlementGrants.productId));
    },

    async createPaymentIntent(input) {
      const [row] = await db
        .insert(paymentIntents)
        .values({ ...input, status: "created" })
        .returning();
      return toPaymentIntentRecord(row!);
    },

    async findPaymentIntent(id) {
      if (!UUID_PATTERN.test(id)) return null;
      const [row] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, id)).limit(1);
      return row ? toPaymentIntentRecord(row) : null;
    },

    async findPaymentIntentByProviderOrderId(providerOrderId) {
      const [row] = await db
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.providerOrderId, providerOrderId))
        .limit(1);
      return row ? toPaymentIntentRecord(row) : null;
    },

    async markPaymentIntentPending(id) {
      if (!UUID_PATTERN.test(id)) return null;
      const [row] = await db
        .update(paymentIntents)
        .set({ status: "pending", updatedAt: now() })
        .where(and(eq(paymentIntents.id, id), eq(paymentIntents.status, "created")))
        .returning();
      return row ? toPaymentIntentRecord(row) : repos.findPaymentIntent(id);
    },

    async markPaymentIntentPaid(id, providerPaymentId, paidAt) {
      if (!UUID_PATTERN.test(id)) return null;
      const [row] = await db
        .update(paymentIntents)
        .set({ status: "paid", providerPaymentId, paidAt, updatedAt: now() })
        .where(and(eq(paymentIntents.id, id), ne(paymentIntents.status, "paid")))
        .returning();
      return row ? toPaymentIntentRecord(row) : repos.findPaymentIntent(id);
    },

    async markPaymentIntentFailed(id) {
      if (!UUID_PATTERN.test(id)) return null;
      const [row] = await db
        .update(paymentIntents)
        .set({ status: "failed", updatedAt: now() })
        .where(and(eq(paymentIntents.id, id), ne(paymentIntents.status, "paid")))
        .returning();
      return row ? toPaymentIntentRecord(row) : repos.findPaymentIntent(id);
    },

    async saveOtp(phone, code, expiresAt, limit) {
      return db.transaction(async (tx) => {
        // Serializes sends per phone so concurrent requests can't overshoot the limit.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`otp:${phone}`}))`);
        const sentAt = now();
        if (limit) {
          const windowStart = new Date(sentAt.getTime() - limit.windowMs);
          const recent = await tx
            .select({ createdAt: otpCodes.createdAt })
            .from(otpCodes)
            .where(and(eq(otpCodes.phone, phone), gt(otpCodes.createdAt, windowStart)))
            .orderBy(desc(otpCodes.createdAt))
            .limit(limit.max);
          if (recent.length >= limit.max) {
            const oldest = recent[recent.length - 1]!.createdAt;
            return { saved: false as const, retryAt: new Date(oldest.getTime() + limit.windowMs) };
          }
        }
        await tx.insert(otpCodes).values({ phone, codeHash: code, expiresAt, createdAt: sentAt });
        // Rows outside the send window that can no longer be used are only clutter.
        const keepAfter = new Date(sentAt.getTime() - (limit?.windowMs ?? 0));
        await tx
          .delete(otpCodes)
          .where(
            and(
              eq(otpCodes.phone, phone),
              lt(otpCodes.createdAt, keepAfter),
              lt(otpCodes.expiresAt, sentAt),
            ),
          );
        return { saved: true as const };
      });
    },

    async consumeOtp(phone, code, maxAttempts = 5) {
      // One statement: counts the guess and consumes the latest code only if it matches,
      // so concurrent guesses can't exceed `maxAttempts` or redeem a code twice.
      const [row] = await db
        .update(otpCodes)
        .set({
          attempts: sql`${otpCodes.attempts} + 1`,
          consumedAt: sql`case when ${otpCodes.codeHash} = ${code} then now() else null end`,
        })
        .where(
          and(
            eq(
              otpCodes.id,
              sql`(select ${otpCodes.id} from ${otpCodes} where ${otpCodes.phone} = ${phone} order by ${otpCodes.createdAt} desc limit 1)`,
            ),
            isNull(otpCodes.consumedAt),
            gt(otpCodes.expiresAt, now()),
            lt(otpCodes.attempts, maxAttempts),
          ),
        )
        .returning({ consumedAt: otpCodes.consumedAt });
      return Boolean(row?.consumedAt);
    },

    async saveRefreshToken(record) {
      await db.insert(refreshTokens).values({
        tokenHash: hashRefreshToken(record.token),
        userId: record.userId,
        expiresAt: record.expiresAt,
      });
      // Clear out this user's expired tokens so the table doesn't grow forever.
      await db
        .delete(refreshTokens)
        .where(and(eq(refreshTokens.userId, record.userId), lt(refreshTokens.expiresAt, now())));
    },

    async findRefreshToken(token) {
      const tokenHash = hashRefreshToken(token);
      const [row] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1);
      if (!row) return null;
      if (row.expiresAt < now()) {
        await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
        return null;
      }
      return { token, userId: row.userId, expiresAt: row.expiresAt };
    },

    async consumeRefreshToken(token) {
      const [row] = await db
        .delete(refreshTokens)
        .where(eq(refreshTokens.tokenHash, hashRefreshToken(token)))
        .returning();
      if (!row || row.expiresAt < now()) return null;
      return { token, userId: row.userId, expiresAt: row.expiresAt };
    },

    async deleteRefreshToken(token) {
      await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, hashRefreshToken(token)));
    },

    async saveOauthState(record) {
      await db.insert(oauthStates).values(record);
      await db
        .delete(oauthStates)
        .where(and(eq(oauthStates.userId, record.userId), lt(oauthStates.expiresAt, now())));
    },

    async consumeOauthState(nonce) {
      const [row] = await db.delete(oauthStates).where(eq(oauthStates.nonce, nonce)).returning();
      if (!row || row.expiresAt < now()) return null;
      return { nonce: row.nonce, userId: row.userId, sourceId: row.sourceId, expiresAt: row.expiresAt };
    },

    async seedListings(seedListings, seedVariants) {
      if (seedListings.length === 0) return;

      const batchSize = 500;
      for (let i = 0; i < seedListings.length; i += batchSize) {
        const listingBatch = seedListings.slice(i, i + batchSize);
        await db.insert(listings).values(
          listingBatch.map((listing) => ({
            id: listing.id,
            sellerId: listing.sellerId,
            title: listing.title,
            category: listing.category,
            tags: listing.tags,
            coinPrice: listing.coinPrice,
            productImageKeys: listing.productImageKeys,
            houseModelRenderKey: listing.houseModelRenderKey,
            affiliateUrl: listing.affiliateUrl,
            status: listing.status,
            sortOrder: listing.sortOrder,
            createdAt: listing.createdAt,
          })),
        );
      }

      if (seedVariants.length > 0) {
        for (let i = 0; i < seedVariants.length; i += batchSize) {
          const variantBatch = seedVariants.slice(i, i + batchSize);
          await db.insert(listingVariants).values(
            variantBatch.map((variant) => ({
              id: variant.id,
              listingId: variant.listingId,
              size: variant.size,
              color: variant.color,
              garmentImageKey: variant.garmentImageKey,
            })),
          );
        }
      }
    },

    async clearCatalog() {
      // CASCADE clears cart_items / tryon_previews that reference variants.
      await db.execute(sql`TRUNCATE listing_variants, listings CASCADE`);
    },

    async listListings({
      cursor,
      limit,
      sellerId,
      category,
      styleKeywords,
    }): Promise<ListListingsResult> {
      const conditions = [eq(listings.status, "ACTIVE")];

      if (sellerId) {
        conditions.push(eq(listings.sellerId, sellerId));
      }

      if (category) {
        conditions.push(eq(listings.category, category));
      }

      const keywords = normalizeStyleKeywords(styleKeywords ?? []);
      const decoded = cursor ? decodeListingCursor(cursor) : null;
      // Catalog-order cursors keep paging in catalog order (see listing-feed.ts).
      const matched =
        keywords.length > 0 && decoded?.matched !== null ? styleMatchSql(keywords) : null;

      if (decoded) {
        const afterPosition = sql`(${listings.sortOrder} > ${decoded.sortOrder} OR (${listings.sortOrder} = ${decoded.sortOrder} AND ${listings.id} > ${decoded.id}))`;
        if (!matched) {
          conditions.push(afterPosition);
        } else if (decoded.matched) {
          // Every non-matching listing comes after all the matching ones.
          conditions.push(sql`(NOT ${matched} OR ${afterPosition})`);
        } else {
          conditions.push(sql`(NOT ${matched} AND ${afterPosition})`);
        }
      }

      const rows = await db
        .select({ listing: listings, matched: (matched ?? sql<boolean>`false`).as("style_match") })
        .from(listings)
        .where(and(...conditions))
        .orderBy(
          ...(matched ? [desc(sql.identifier("style_match"))] : []),
          asc(listings.sortOrder),
          asc(listings.id),
        )
        .limit(limit + 1);

      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      const nextCursor =
        rows.length > limit && last
          ? encodeListingCursor(last.listing, matched ? last.matched : null)
          : null;

      return { items: page.map((row) => mapListing(row.listing)), nextCursor };
    },

    async listListingCategories() {
      const count = sql<number>`cast(count(*) as integer)`;
      return db
        .select({ category: listings.category, count })
        .from(listings)
        .where(eq(listings.status, "ACTIVE"))
        .groupBy(listings.category)
        .orderBy(desc(count), sql`${listings.category} COLLATE "C"`);
    },

    async findListingById(id) {
      const [row] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
      return row ? mapListing(row) : null;
    },

    async findVariantsByListingId(listingId) {
      const rows = await db
        .select()
        .from(listingVariants)
        .where(eq(listingVariants.listingId, listingId));

      return rows.map(mapListingVariant);
    },

    async findVariantById(id) {
      const [row] = await db
        .select()
        .from(listingVariants)
        .where(eq(listingVariants.id, id))
        .limit(1);

      return row ? mapListingVariant(row) : null;
    },

    async registerSeller(userId, shopName, sellerType) {
      const existing = await repos.findSellerByUserId(userId);
      if (existing) return existing;

      const [row] = await db
        .insert(sellers)
        .values({
          userId,
          shopName,
          status: "ACTIVE",
          sellerType: sellerType ?? "RETAILER",
        })
        .returning();

      return mapSeller(row!);
    },

    async findSellerByUserId(userId) {
      const [row] = await db.select().from(sellers).where(eq(sellers.userId, userId)).limit(1);
      return row ? mapSeller(row) : null;
    },

    async findSellerById(id) {
      const [row] = await db.select().from(sellers).where(eq(sellers.id, id)).limit(1);
      return row ? mapSeller(row) : null;
    },

    async listSellersByType(sellerType) {
      const rows = await db.select().from(sellers).where(eq(sellers.sellerType, sellerType));
      return rows.map(mapSeller);
    },

    async ensureDefaultTailorSeller(shopName) {
      const existing = await repos.listSellersByType("TAILOR");
      const match = existing.find((s) => s.shopName === shopName) ?? existing[0];
      if (match) return match;

      const systemPhone = "+19990000000";
      let user = await repos.findUserByPhone(systemPhone);
      if (!user) {
        ({ user } = await repos.createUser(systemPhone));
        await repos.updateUser(user.id, { displayName: shopName });
      }
      return repos.registerSeller(user.id, shopName, "TAILOR");
    },

    async findVariantsByIds(ids) {
      if (ids.length === 0) return [];
      const rows = await db.select().from(listingVariants).where(inArray(listingVariants.id, ids));
      return rows.map(mapListingVariant);
    },

    async findListingsByIds(ids) {
      if (ids.length === 0) return [];
      const rows = await db.select().from(listings).where(inArray(listings.id, ids));
      return rows.map(mapListing);
    },

    async findSellersByIds(ids) {
      if (ids.length === 0) return [];
      const rows = await db.select().from(sellers).where(inArray(sellers.id, ids));
      return rows.map(mapSeller);
    },

    async loadDataForVariantIds(listingIds) {
      const variantMap = new Map<string, ListingVariantRecord>();
      const listingMap = new Map<string, ListingRecord>();
      const sellerMap = new Map<string, SellerRecord>();

      if (listingIds.length === 0) return { variantMap, listingMap, sellerMap };

      const variantRows = await db.select().from(listingVariants).where(inArray(listingVariants.listingId, listingIds));
      const listingRows = await db.select().from(listings).where(inArray(listings.id, listingIds));
      const sellerIds = Array.from(
        new Set(
          listingRows
            .map((l) => l.sellerId)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const sellerRows = sellerIds.length > 0 ? await db.select().from(sellers).where(inArray(sellers.id, sellerIds)) : [];

      for (const v of variantRows) variantMap.set(v.id, mapListingVariant(v));
      for (const l of listingRows) listingMap.set(l.id, mapListing(l));
      for (const s of sellerRows) sellerMap.set(s.id, mapSeller(s));

      return { variantMap, listingMap, sellerMap };
    },

    async createSellerListing(input: CreateSellerListingInput) {
      return db.transaction(async (tx) => {
        const [maxRow] = await tx
          .select({ max: sql<number>`coalesce(max(${listings.sortOrder}), -1)` })
          .from(listings);

        const listingId = randomUUID();
        const variantId = randomUUID();
        const timestamp = now();
        const sortOrder = (maxRow?.max ?? -1) + 1;
        const affiliateUrl =
          input.affiliateUrl ?? `https://affiliate.worn.example/items/${listingId}`;

        const [listingRow] = await tx
          .insert(listings)
          .values({
            id: listingId,
            sellerId: input.sellerId,
            title: input.title,
            category: input.category,
            tags: input.tags,
            coinPrice: input.coinPrice,
            productImageKeys: input.productImageKeys,
            houseModelRenderKey: input.houseModelRenderKey,
            affiliateUrl,
            status: "ACTIVE",
            sortOrder,
            createdAt: timestamp,
          })
          .returning();

        const [variantRow] = await tx
          .insert(listingVariants)
          .values({
            id: variantId,
            listingId,
            size: input.variant.size,
            color: input.variant.color,
            garmentImageKey: input.variant.garmentImageKey,
          })
          .returning();

        return {
          listing: mapListing(listingRow!),
          variant: mapListingVariant(variantRow!),
        };
      });
    },

    async findTryonPreview(userId, listingVariantId) {
      const [row] = await db
        .select()
        .from(tryonPreviews)
        .where(
          and(
            eq(tryonPreviews.userId, userId),
            eq(tryonPreviews.listingVariantId, listingVariantId),
          ),
        )
        .limit(1);

      return row ? mapTryonPreview(row) : null;
    },

    async findWardrobeTryonPreview(userId, wardrobeItemId) {
      const [row] = await db
        .select()
        .from(tryonPreviews)
        .where(
          and(
            eq(tryonPreviews.userId, userId),
            eq(tryonPreviews.wardrobeItemId, wardrobeItemId),
          ),
        )
        .limit(1);

      return row ? mapTryonPreview(row) : null;
    },

    async upsertTryonPreview(data) {
      const timestamp = now();
      if (data.wardrobeItemId) {
        const [row] = await db
          .insert(tryonPreviews)
          .values({
            id: data.id,
            userId: data.userId,
            listingVariantId: data.listingVariantId ?? null,
            wardrobeItemId: data.wardrobeItemId,
            imageKey: data.imageKey,
            provider: data.provider,
            costMicros: data.costMicros,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .onConflictDoUpdate({
            target: [tryonPreviews.userId, tryonPreviews.wardrobeItemId],
            set: {
              imageKey: data.imageKey,
              provider: data.provider,
              costMicros: data.costMicros,
              updatedAt: timestamp,
            },
          })
          .returning();
        return mapTryonPreview(row!);
      }

      const [row] = await db
        .insert(tryonPreviews)
        .values({
          id: data.id,
          userId: data.userId,
          listingVariantId: data.listingVariantId!,
          wardrobeItemId: null,
          imageKey: data.imageKey,
          provider: data.provider,
          costMicros: data.costMicros,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: [tryonPreviews.userId, tryonPreviews.listingVariantId],
          set: {
            imageKey: data.imageKey,
            provider: data.provider,
            costMicros: data.costMicros,
            updatedAt: timestamp,
          },
        })
        .returning();

      return mapTryonPreview(row!);
    },

    async getOrCreateCart(userId) {
      const [existing] = await db.select().from(carts).where(eq(carts.userId, userId)).limit(1);
      if (existing) return mapCart(existing);

      const [created] = await db.insert(carts).values({ userId }).returning();
      return mapCart(created!);
    },

    async getCartItems(cartId) {
      const rows = await db.select().from(cartItems).where(eq(cartItems.cartId, cartId));
      return rows.map(mapCartItem);
    },

    async clearCart(cartId) {
      await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
    },

    async addCartItem({ cartId, listingVariantId, coinPriceSnapshot, quantity }) {
      const [existing] = await db
        .select()
        .from(cartItems)
        .where(
          and(
            eq(cartItems.cartId, cartId),
            eq(cartItems.listingVariantId, listingVariantId),
          ),
        )
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(cartItems)
          .set({
            quantity: Math.min(10, existing.quantity + quantity),
            updatedAt: now(),
          })
          .where(eq(cartItems.id, existing.id))
          .returning();

        return mapCartItem(updated!);
      }

      const [created] = await db
        .insert(cartItems)
        .values({
          cartId,
          listingVariantId,
          coinPriceSnapshot,
          quantity,
        })
        .returning();

      return mapCartItem(created!);
    },

    async removeCartItem(cartId, listingVariantId) {
      await db
        .delete(cartItems)
        .where(
          and(
            eq(cartItems.cartId, cartId),
            eq(cartItems.listingVariantId, listingVariantId),
          ),
        );
    },

    async createOrder(input: CreateOrderInput) {
      return db.transaction((tx) => insertOrderWithItems(tx, input));
    },

    async placeOrder(input: CreateOrderInput) {
      return db.transaction(async (tx) => {
        // Holding the user's row lock serializes this with other checkouts and coin spends.
        const balance = await lockedCoinBalance(tx, input.userId);

        if (input.idempotencyKey) {
          const [existing] = await tx
            .select()
            .from(orders)
            .where(eq(orders.idempotencyKey, input.idempotencyKey))
            .limit(1);

          if (existing) {
            if (existing.userId !== input.userId) {
              throw new Error("Idempotency key already used by another order");
            }
            const itemRows = await tx
              .select()
              .from(orderItems)
              .where(eq(orderItems.orderId, existing.id));
            return {
              order: mapOrder(existing),
              items: itemRows.map(mapOrderItem),
              created: false,
            };
          }
        }

        const balanceAfter = balance - input.coinTotal;
        if (balanceAfter < 0) throw new InsufficientCoinsError();

        const { order, items } = await insertOrderWithItems(tx, input);
        await appendCoinLedger(
          tx,
          {
            userId: input.userId,
            delta: -input.coinTotal,
            type: "SPEND_ORDER",
            refType: "order",
            refId: order.id,
          },
          balanceAfter,
        );

        return { order, items, created: true };
      });
    },

    async rushOrderToExpress(input: RushOrderInput) {
      return db.transaction(async (tx) => {
        // The user's row lock serializes this with their other coin spends, including a
        // second rush; the order's row lock holds off delivery steps until we commit.
        const balance = await lockedCoinBalance(tx, input.userId);
        const [current] = await tx
          .select()
          .from(orders)
          .where(and(eq(orders.id, input.orderId), eq(orders.userId, input.userId)))
          .for("update");
        if (!current || current.state !== input.from || current.tier === "EXPRESS") {
          return null;
        }

        const balanceAfter = balance - input.costCoins;
        if (balanceAfter < 0) throw new InsufficientCoinsError();

        const [row] = await tx
          .update(orders)
          .set({ tier: "EXPRESS", stateEta: input.stateEta, updatedAt: now() })
          .where(eq(orders.id, input.orderId))
          .returning();
        await appendCoinLedger(
          tx,
          {
            userId: input.userId,
            delta: -input.costCoins,
            type: "SPEND_RUSH",
            refType: "order",
            refId: input.orderId,
          },
          balanceAfter,
        );

        return { order: mapOrder(row!), balanceAfter };
      });
    },

    async findOrderById(id) {
      const [row] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      return row ? mapOrder(row) : null;
    },

    async listOrdersByUserId(userId) {
      const rows = await db
        .select()
        .from(orders)
        .where(eq(orders.userId, userId))
        .orderBy(desc(orders.placedAt));

      return rows.map(mapOrder);
    },

    async listOrdersByStates(states) {
      if (states.length === 0) return [];
      const rows = await db
        .select()
        .from(orders)
        .where(inArray(orders.state, [...states]))
        .orderBy(asc(orders.placedAt));

      return rows.map(mapOrder);
    },

    async updateOrderState(orderId, state, patch, options) {
      const [row] = await db
        .update(orders)
        .set({
          state,
          ...(patch?.stateEta ? { stateEta: patch.stateEta } : {}),
          ...(patch?.revealReadyAt !== undefined ? { revealReadyAt: patch.revealReadyAt } : {}),
          updatedAt: now(),
        })
        .where(
          and(eq(orders.id, orderId), options?.from ? eq(orders.state, options.from) : undefined),
        )
        .returning();

      return row ? mapOrder(row) : null;
    },

    async listOrderItemsByOrderId(orderId) {
      const rows = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      return rows.map(mapOrderItem);
    },

    async findOrderItemById(id) {
      const [row] = await db.select().from(orderItems).where(eq(orderItems.id, id)).limit(1);
      return row ? mapOrderItem(row) : null;
    },

    async createRenders(rows) {
      const timestamp = now();
      const inserted = await db
        .insert(renders)
        .values(
          rows.map((row) => ({
            id: row.id,
            orderItemId: row.orderItemId,
            scenario: row.scenario,
            imageKey: row.imageKey,
            isFree: row.isFree,
            unlocked: row.unlocked,
            provider: row.provider,
            status: row.status,
            costMicros: row.costMicros,
            createdAt: timestamp,
            updatedAt: timestamp,
          })),
        )
        .returning();

      return inserted.map(mapRender);
    },

    async findRenderById(id) {
      const [row] = await db.select().from(renders).where(eq(renders.id, id)).limit(1);
      return row ? mapRender(row) : null;
    },

    async findRendersByIds(ids) {
      if (ids.length === 0) return [];

      const rows = await db.select().from(renders).where(inArray(renders.id, ids));
      return rows.map(mapRender);
    },

    async findRendersByOrderId(orderId) {
      const items = await repos.listOrderItemsByOrderId(orderId);
      if (items.length === 0) return [];

      const itemIds = items.map((item) => item.id);
      const rows = await db
        .select()
        .from(renders)
        .where(inArray(renders.orderItemId, itemIds))
        .orderBy(asc(renders.createdAt));

      return rows.map(mapRender);
    },

    async listPendingRenders() {
      const rows = await db
        .select({ render: renders, orderId: orderItems.orderId })
        .from(renders)
        .innerJoin(orderItems, eq(renders.orderItemId, orderItems.id))
        .where(and(eq(renders.unlocked, true), inArray(renders.status, ["QUEUED", "RUNNING"])));

      return rows.map((row) => ({ render: mapRender(row.render), orderId: row.orderId }));
    },

    async updateRender(id, patch) {
      const [existing] = await db.select().from(renders).where(eq(renders.id, id)).limit(1);
      if (!existing) return null;

      const [row] = await db
        .update(renders)
        .set({
          imageKey: patch.imageKey !== undefined ? patch.imageKey : existing.imageKey,
          unlocked: patch.unlocked !== undefined ? patch.unlocked : existing.unlocked,
          provider: patch.provider !== undefined ? patch.provider : existing.provider,
          status: patch.status !== undefined ? patch.status : existing.status,
          costMicros: patch.costMicros !== undefined ? patch.costMicros : existing.costMicros,
          updatedAt: now(),
        })
        .where(eq(renders.id, id))
        .returning();

      return mapRender(row!);
    },

    async recordRevealRating(input) {
      const [existing] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, input.orderId))
        .limit(1);
      if (!existing) return;
      await db
        .update(orders)
        .set({
          stateEta: { ...existing.stateEta, rating: input.rating } as OrderRecord["stateEta"],
          updatedAt: now(),
        })
        .where(eq(orders.id, input.orderId));
    },

    async recordPushEvent(input) {
      return (await repos.recordPushEventIfNew(input)).event;
    },

    async recordPushEventIfNew(input) {
      const [row] = await db
        .insert(pushEvents)
        .values({
          userId: input.userId,
          orderId: input.orderId,
          eventType: input.eventType,
          dedupeKey: input.dedupeKey,
          title: input.title,
          body: input.body,
          payload: input.payload,
          status: input.status,
        })
        .onConflictDoNothing({ target: pushEvents.dedupeKey })
        .returning();
      if (row) return { event: mapPushEvent(row), created: true };

      // Already recorded under this dedupe key: a repeat is a no-op, not an error.
      const [existing] = await db
        .select()
        .from(pushEvents)
        .where(eq(pushEvents.dedupeKey, input.dedupeKey))
        .limit(1);
      return { event: mapPushEvent(existing!), created: false };
    },

    async listPushEvents(userId) {
      const rows = userId
        ? await db
            .select()
            .from(pushEvents)
            .where(eq(pushEvents.userId, userId))
            .orderBy(desc(pushEvents.createdAt))
        : await db.select().from(pushEvents).orderBy(desc(pushEvents.createdAt));

      return rows.map(mapPushEvent);
    },

    async updatePushEvent(id, patch) {
      const [row] = await db
        .update(pushEvents)
        .set({ ...patch, updatedAt: now() })
        .where(eq(pushEvents.id, id))
        .returning();
      return row ? mapPushEvent(row) : null;
    },

    async setPushToken(userId, token) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(users)
          .set({ pushToken: token, updatedAt: now() })
          .where(eq(users.id, userId))
          .returning();
        if (!row) return null;

        // A device's token belongs to whoever signed in on it last.
        await tx
          .update(users)
          .set({ pushToken: null, updatedAt: now() })
          .where(and(eq(users.pushToken, token), ne(users.id, userId)));
        return mapUser(row);
      });
    },

    async clearPushToken(userId, onlyIf) {
      await db
        .update(users)
        .set({ pushToken: null, updatedAt: now() })
        .where(
          onlyIf === undefined
            ? eq(users.id, userId)
            : and(eq(users.id, userId), eq(users.pushToken, onlyIf)),
        );
    },
    async updatePushEventStatus(id, status, expoTicketId) {
      await db
        .update(pushEvents)
        .set({
          status,
          ...(expoTicketId !== undefined ? { expoTicketId: expoTicketId ?? null } : {}),
        })
        .where(eq(pushEvents.id, id));
    },

    async findActiveConsent(userId, scope) {
        const [row] = await db
            .select()
            .from(consentGrants)
            .where(and(eq(consentGrants.userId, userId), eq(consentGrants.scope, scope), isNull(consentGrants.revokedAt)))
            .limit(1);
        return row ? mapConsentGrant(row) : null;
    },
    async grantConsent(input) {
      const active = and(
        eq(consentGrants.userId, input.userId),
        eq(consentGrants.scope, input.scope),
        isNull(consentGrants.revokedAt),
      );
      return db.transaction(async (tx) => {
        // The partial unique index allows one active grant per scope. A concurrent grant makes
        // the insert a no-op and the read returns the winner's row; if that row was revoked in
        // between, the next insert succeeds.
        for (let attempt = 0; attempt < 3; attempt++) {
          const [inserted] = await tx
            .insert(consentGrants)
            .values({
              id: randomUUID(),
              userId: input.userId,
              scope: input.scope,
              source: input.source,
              meta: input.meta ?? null,
              noticeVersion: input.noticeVersion ?? null,
            })
            .onConflictDoNothing({
              target: [consentGrants.userId, consentGrants.scope],
              where: isNull(consentGrants.revokedAt),
            })
            .returning();
          if (!inserted) {
            const [existing] = await tx.select().from(consentGrants).where(active).limit(1);
            if (existing) return mapConsentGrant(existing);
            continue;
          }
          await tx.insert(consentRecords).values({
            userId: input.userId,
            subjectRef: subjectRefFor(input.userId),
            scope: input.scope,
            action: "GRANT",
            noticeVersion: input.noticeVersion ?? null,
            source: input.source,
            grantId: inserted.id,
          });
          await tx
            .update(users)
            .set({
              consentFlags: sql`${users.consentFlags} || ${JSON.stringify({ [input.scope]: true })}::jsonb`,
              updatedAt: now(),
            })
            .where(eq(users.id, input.userId));
          return mapConsentGrant(inserted);
        }
        throw new Error(`grantConsent: no stable active ${input.scope} grant after 3 attempts`);
      });
    },
    async revokeConsent(userId, scope) {
      await db.transaction(async (tx) => {
        const closed = await tx
          .update(consentGrants)
          .set({ revokedAt: now() })
          .where(and(eq(consentGrants.userId, userId), eq(consentGrants.scope, scope), isNull(consentGrants.revokedAt)))
          .returning({ id: consentGrants.id, source: consentGrants.source });
        if (closed.length > 0) {
          await tx.insert(consentRecords).values(
            closed.map((g) => ({
              userId,
              subjectRef: subjectRefFor(userId),
              scope,
              action: "WITHDRAW" as const,
              noticeVersion: null,
              source: g.source,
              grantId: g.id,
            })),
          );
        }
        await tx
          .update(users)
          .set({
            consentFlags: sql`${users.consentFlags} || ${JSON.stringify({ [scope]: false })}::jsonb`,
            updatedAt: now(),
          })
          .where(eq(users.id, userId));
      });
    },
    async listConsentRecords(userId, limit = 200) {
      const rows = await db
        .select()
        .from(consentRecords)
        .where(eq(consentRecords.userId, userId))
        .orderBy(desc(consentRecords.createdAt), desc(consentRecords.id))
        .limit(Math.min(Math.max(limit, 1), 1000));
      return rows.map(mapConsentRecord);
    },
    async listActiveConsents(userId) {
        const rows = await db
            .select()
            .from(consentGrants)
            .where(and(eq(consentGrants.userId, userId), isNull(consentGrants.revokedAt)))
            .orderBy(desc(consentGrants.grantedAt));
        return rows.map(mapConsentGrant);
    },
    async deleteAllUserData(userId) {
      await db.transaction(async (tx) => {
        // Collect linkage ids before deletes
        const purchases = await tx
          .select({ id: merchantPurchases.id, rawDocId: merchantPurchases.rawDocId })
          .from(merchantPurchases)
          .where(eq(merchantPurchases.userId, userId));
        const purchaseIds = purchases.map((p) => p.id);
        const rawDocIds = purchases
          .map((p) => p.rawDocId)
          .filter((id): id is string => Boolean(id));

        const sellerRows = await tx
          .select({ id: sellers.id })
          .from(sellers)
          .where(eq(sellers.userId, userId));
        const sellerIds = sellerRows.map((s) => s.id);

        const listingRows =
          sellerIds.length > 0
            ? await tx
                .select({ id: listings.id })
                .from(listings)
                .where(inArray(listings.sellerId, sellerIds))
            : [];
        const listingIds = listingRows.map((l) => l.id);

        const orderRows = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.userId, userId));
        const orderIds = orderRows.map((o) => o.id);

        const orderItemRows =
          orderIds.length > 0
            ? await tx
                .select({ id: orderItems.id })
                .from(orderItems)
                .where(inArray(orderItems.orderId, orderIds))
            : [];
        const orderItemIds = orderItemRows.map((i) => i.id);

        const cartRows = await tx
          .select({ id: carts.id })
          .from(carts)
          .where(eq(carts.userId, userId));
        const cartIds = cartRows.map((c) => c.id);

        const recipientRows = await tx
          .select({ id: recipients.id })
          .from(recipients)
          .where(eq(recipients.userId, userId));
        const recipientIds = recipientRows.map((r) => r.id);

        const returnRows = await tx
          .select({ id: returnRequests.id })
          .from(returnRequests)
          .where(eq(returnRequests.userId, userId));
        const returnIds = returnRows.map((r) => r.id);

        const grantRows = await tx
          .select({ id: consentGrants.id })
          .from(consentGrants)
          .where(eq(consentGrants.userId, userId));
        const grantIds = grantRows.map((g) => g.id);

        // 1. return events & requests
        if (returnIds.length > 0) {
          await tx.delete(returnEvents).where(inArray(returnEvents.returnRequestId, returnIds));
        }
        await tx.delete(returnRequests).where(eq(returnRequests.userId, userId));

        // 2. gift & recipients
        await tx.delete(giftOrders).where(eq(giftOrders.userId, userId));
        // The user's contributions to other people's gifts stay for that total; the name and
        // note go now and the contributor id with the user row (ON DELETE SET NULL).
        await tx
          .update(groupGiftContributions)
          .set({ contributorName: null, note: null, updatedAt: now() })
          .where(eq(groupGiftContributions.contributorUserId, userId));
        if (recipientIds.length > 0) {
          await tx
            .delete(recipientProfiles)
            .where(inArray(recipientProfiles.recipientId, recipientIds));
        }
        await tx.delete(recipients).where(eq(recipients.userId, userId));

        // 3. fit
        await tx.delete(tailoringOrders).where(eq(tailoringOrders.userId, userId));
        await tx.delete(measurementProfiles).where(eq(measurementProfiles.userId, userId));

        // 4. wardrobe / outfits / wear / metrics / disposition / swap
        await tx.delete(swapListings).where(eq(swapListings.ownerUserId, userId));
        await tx.delete(swapCircleMembers).where(eq(swapCircleMembers.userId, userId));
        await tx.delete(swapCircles).where(eq(swapCircles.ownerId, userId));
        await tx.delete(dispositionListings).where(eq(dispositionListings.userId, userId));
        await tx.delete(itemMetrics).where(eq(itemMetrics.userId, userId));
        await tx.delete(wearLog).where(eq(wearLog.userId, userId));
        await tx.delete(repairLogs).where(eq(repairLogs.userId, userId));
        await tx.delete(outfits).where(eq(outfits.userId, userId));
        await tx.delete(wardrobeItems).where(eq(wardrobeItems.userId, userId));

        // 5. push, cashback, coins, iap, tryon
        await tx.delete(pushEvents).where(eq(pushEvents.userId, userId));
        await tx.delete(cashbackEvents).where(eq(cashbackEvents.userId, userId));
        await tx.delete(iapReceipts).where(eq(iapReceipts.userId, userId));
        await tx.delete(coinLedger).where(eq(coinLedger.userId, userId));
        await tx.delete(tryonPreviews).where(eq(tryonPreviews.userId, userId));

        // 6. renders -> orderItems -> orders
        if (orderItemIds.length > 0) {
          await tx.delete(renders).where(inArray(renders.orderItemId, orderItemIds));
          await tx.delete(orderItems).where(inArray(orderItems.id, orderItemIds));
        }
        if (orderIds.length > 0) {
          await tx.delete(orders).where(inArray(orders.id, orderIds));
        }

        // 7. carts
        if (cartIds.length > 0) {
          await tx.delete(cartItems).where(inArray(cartItems.cartId, cartIds));
          await tx.delete(carts).where(inArray(carts.id, cartIds));
        }

        // 8. sellers / listings / variants
        if (listingIds.length > 0) {
          await tx
            .delete(listingVariants)
            .where(inArray(listingVariants.listingId, listingIds));
          await tx.delete(listings).where(inArray(listings.id, listingIds));
        }
        if (sellerIds.length > 0) {
          await tx.delete(sellers).where(inArray(sellers.id, sellerIds));
        }

        // 9. avatars
        await tx.delete(avatars).where(eq(avatars.userId, userId));

        // 10. ingestion documents (by purchase linkage + parsedJson __userId)
        if (purchaseIds.length > 0) {
          await tx
            .delete(ingestionDocuments)
            .where(inArray(ingestionDocuments.matchedPurchaseId, purchaseIds));
        }
        if (rawDocIds.length > 0) {
          await tx
            .delete(ingestionDocuments)
            .where(inArray(ingestionDocuments.id, rawDocIds));
        }
        await tx
          .delete(ingestionDocuments)
          .where(sql`${ingestionDocuments.parsedJson}->>'__userId' = ${userId}`);

        // 11. merchant purchase items + purchases (by userId)
        if (purchaseIds.length > 0) {
          await tx
            .delete(merchantPurchaseItems)
            .where(inArray(merchantPurchaseItems.purchaseId, purchaseIds));
        }
        await tx.delete(merchantPurchases).where(eq(merchantPurchases.userId, userId));

        // 12. warranties & receipts
        await tx.delete(warranties).where(eq(warranties.userId, userId));
        await tx.delete(receipts).where(eq(receipts.userId, userId));

        // 13. money (ledger before accounts — accountId FK restrict)
        await tx.delete(moneyLedger).where(eq(moneyLedger.userId, userId));
        await tx.delete(moneyAccounts).where(eq(moneyAccounts.userId, userId));

        // 14. ingestion sources BEFORE consent grants
        await tx.delete(ingestionDocuments).where(eq(ingestionDocuments.userId, userId));
        await tx.delete(ingestionSources).where(eq(ingestionSources.userId, userId));
        if (grantIds.length > 0) {
          await tx
            .delete(ingestionSources)
            .where(inArray(ingestionSources.consentGrantId, grantIds));
        }
        // Consent history is append-only: close the open grants as withdrawals first. The
        // records keep subject_ref; their user_id goes NULL with the user row (ON DELETE SET NULL).
        const openGrants = await tx
          .select({ id: consentGrants.id, scope: consentGrants.scope, source: consentGrants.source })
          .from(consentGrants)
          .where(and(eq(consentGrants.userId, userId), isNull(consentGrants.revokedAt)));
        if (openGrants.length > 0) {
          await tx.insert(consentRecords).values(
            openGrants.map((g) => ({
              userId,
              subjectRef: subjectRefFor(userId),
              scope: g.scope,
              action: "WITHDRAW" as const,
              noticeVersion: null,
              source: "erasure",
              grantId: g.id,
            })),
          );
        }
        await tx.delete(consentGrants).where(eq(consentGrants.userId, userId));
        // Audit rows outlive the user (no FK), pseudonymised by subject_ref.
        await tx.update(auditLog).set({ userId: null }).where(eq(auditLog.userId, userId));
        await tx
          .update(privacyRequests)
          .set({ userId: null })
          .where(and(eq(privacyRequests.userId, userId), eq(privacyRequests.kind, "EXPORT")));

        // 15. budgets, spend rollups
        await tx.delete(budgets).where(eq(budgets.userId, userId));
        await tx.delete(spendRollups).where(eq(spendRollups.userId, userId));

        // 16. finally user
        // Refresh tokens and lookbook items go with the user (ON DELETE CASCADE).
        await tx.delete(users).where(eq(users.id, userId));
      });
    },
    async listUserStorageKeys(userId) {
      const userOrders = db.select({ id: orders.id }).from(orders).where(eq(orders.userId, userId));
      const userItems = db.select({ id: orderItems.id }).from(orderItems).where(inArray(orderItems.orderId, userOrders));
      const userPurchases = db
        .select({ id: merchantPurchases.id })
        .from(merchantPurchases)
        .where(eq(merchantPurchases.userId, userId));
      const userSellers = db.select({ id: sellers.id }).from(sellers).where(eq(sellers.userId, userId));
      const userListings = db.select({ id: listings.id }).from(listings).where(inArray(listings.sellerId, userSellers));
      const [
        avatarRows,
        wardrobeRows,
        wearRows,
        receiptRows,
        previewRows,
        renderRows,
        returnRows,
        purchaseItemRows,
        purchaseRows,
        tailoringRows,
        docRows,
        listingRows,
        variantRows,
        exportRows,
      ] = await Promise.all([
        db.select({ a: avatars.referenceImageKey, b: avatars.sourceUploadKeys }).from(avatars).where(eq(avatars.userId, userId)),
        db.select({ a: wardrobeItems.garmentImageKey, b: wardrobeItems.imageKeys }).from(wardrobeItems).where(eq(wardrobeItems.userId, userId)),
        db.select({ a: wearLog.imageKey }).from(wearLog).where(eq(wearLog.userId, userId)),
        db.select({ a: receipts.imageKey }).from(receipts).where(eq(receipts.userId, userId)),
        db.select({ a: tryonPreviews.imageKey }).from(tryonPreviews).where(eq(tryonPreviews.userId, userId)),
        db.select({ a: renders.imageKey }).from(renders).where(inArray(renders.orderItemId, userItems)),
        db.select({ a: returnRequests.labelImageKey }).from(returnRequests).where(eq(returnRequests.userId, userId)),
        db.select({ a: merchantPurchaseItems.imageKey }).from(merchantPurchaseItems).where(inArray(merchantPurchaseItems.purchaseId, userPurchases)),
        db.select({ a: merchantPurchases.deliveryProofKeys }).from(merchantPurchases).where(eq(merchantPurchases.userId, userId)),
        db.select({ b: tailoringOrders.fabricPhotoKeys }).from(tailoringOrders).where(eq(tailoringOrders.userId, userId)),
        db
          .select({ a: ingestionDocuments.rawKey })
          .from(ingestionDocuments)
          .where(
            and(
              ne(ingestionDocuments.rawKey, ""),
              sql`(${ingestionDocuments.userId} = ${userId} OR (${ingestionDocuments.userId} IS NULL AND (${ingestionDocuments.parsedJson}->>'__userId' = ${userId} OR ${ingestionDocuments.matchedPurchaseId} IN ${userPurchases})))`,
            ),
          ),
        db.select({ a: listings.houseModelRenderKey, b: listings.productImageKeys }).from(listings).where(inArray(listings.sellerId, userSellers)),
        db.select({ a: listingVariants.garmentImageKey }).from(listingVariants).where(inArray(listingVariants.listingId, userListings)),
        db.select({ a: privacyRequests.resultKey }).from(privacyRequests).where(eq(privacyRequests.userId, userId)),
      ]);
      const values: Array<string | null | undefined> = [];
      const push = (a?: string | null, b?: string[] | null) => {
        values.push(a);
        if (Array.isArray(b)) values.push(...b);
      };
      for (const r of avatarRows) push(r.a, r.b);
      for (const r of wardrobeRows) push(r.a, r.b);
      for (const rows of [wearRows, receiptRows, previewRows, renderRows, returnRows, purchaseItemRows, docRows, variantRows, exportRows]) {
        for (const r of rows) push(r.a);
      }
      for (const r of purchaseRows) {
        if (!r.a) continue;
        try {
          const parsed: unknown = JSON.parse(r.a);
          if (Array.isArray(parsed)) push(null, parsed.filter((k): k is string => typeof k === "string"));
        } catch {
          push(r.a);
        }
      }
      for (const r of tailoringRows) push(null, r.b);
      for (const r of listingRows) push(r.a, r.b);
      return ownStorageKeys(values);
    },
    async exportUserTables(userId, maxRowsPerTable = 10_000) {
      const cap = Math.min(Math.max(maxRowsPerTable, 1), 50_000);
      const nameOf = (t: PgTable) => getTableConfig(t).name;
      const specByTable = new Map(USER_DATA_TABLES.map((s) => [s.table, s] as const));
      // Rows of a spec's table that belong to the user, as an SQL condition (children nest).
      const condition = (spec: UserTableSpec): SQL => {
        if ("owner" in spec) return eq(spec.owner, userId);
        const parent = specByTable.get(spec.parent);
        if (!parent) throw new Error(`user-data-tables: parent of ${nameOf(spec.table)} is not listed`);
        const parentId = (spec.parent as unknown as Record<string, AnyPgColumn>).id!;
        return inArray(spec.fk, db.select({ id: parentId }).from(spec.parent).where(condition(parent)));
      };
      const tables: Record<string, Array<Record<string, unknown>>> = {};
      const truncated: string[] = [];
      // A few tables at a time keeps the pool free for other requests.
      for (let i = 0; i < USER_DATA_TABLES.length; i += 4) {
        await Promise.all(
          USER_DATA_TABLES.slice(i, i + 4).map(async (spec) => {
            const name = nameOf(spec.table);
            const rows = (await db
              .select()
              .from(spec.table)
              .where(condition(spec))
              .limit(cap + 1)) as Array<Record<string, unknown>>;
            if (rows.length > cap) {
              rows.length = cap;
              truncated.push(name);
            }
            const omit = new Set(spec.omit ?? []);
            tables[name] = omit.size
              ? rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !omit.has(k))))
              : rows;
          }),
        );
      }
      return { tables, truncated: truncated.sort() };
    },
    async appendAuditRecords(rows) {
      if (rows.length === 0) return;
      await db.insert(auditLog).values(
        rows.map((r) => ({
          userId: r.userId,
          subjectRef: r.userId ? subjectRefFor(r.userId) : null,
          event: r.event,
          meta: r.meta,
          at: r.at,
        })),
      );
    },
    async listAuditRecordsByUser(userId, opts) {
      const conditions = [eq(auditLog.userId, userId)];
      if (opts.before) conditions.push(lt(auditLog.at, opts.before));
      const rows = await db
        .select()
        .from(auditLog)
        .where(and(...conditions))
        .orderBy(desc(auditLog.at), desc(auditLog.id))
        .limit(Math.min(Math.max(opts.limit, 1), 500));
      return rows.map(
        (r) =>
          ({
            id: r.id,
            userId: r.userId ?? null,
            event: r.event,
            meta: r.meta ?? {},
            at: r.at,
          }) satisfies AuditLogRecord,
      );
    },
    async purgeAuditRecordsBefore(cutoff, limit) {
      const doomed = db
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(lt(auditLog.at, cutoff))
        .orderBy(asc(auditLog.at))
        .limit(Math.min(Math.max(limit, 1), 10_000));
      const deleted = await db
        .delete(auditLog)
        .where(inArray(auditLog.id, doomed))
        .returning({ id: auditLog.id });
      return deleted.length;
    },
    async createPrivacyRequest(input) {
      const open = and(
        eq(privacyRequests.subjectRef, input.subjectRef),
        eq(privacyRequests.kind, input.kind),
        inArray(privacyRequests.status, ["PENDING", "RUNNING"]),
      );
      for (let attempt = 0; attempt < 3; attempt++) {
        const [inserted] = await db
          .insert(privacyRequests)
          .values({ userId: input.userId, subjectRef: input.subjectRef, kind: input.kind })
          .onConflictDoNothing({
            target: [privacyRequests.subjectRef, privacyRequests.kind],
            where: sql`${privacyRequests.status} IN ('PENDING', 'RUNNING')`,
          })
          .returning();
        if (inserted) return { request: mapPrivacyRequest(inserted), created: true };
        const [existing] = await db.select().from(privacyRequests).where(open).limit(1);
        if (existing) return { request: mapPrivacyRequest(existing), created: false };
      }
      throw new Error("createPrivacyRequest: open request kept changing");
    },
    async getPrivacyRequest(id) {
      const [row] = await db.select().from(privacyRequests).where(eq(privacyRequests.id, id)).limit(1);
      return row ? mapPrivacyRequest(row) : null;
    },
    async updatePrivacyRequest(id, patch) {
      const [row] = await db
        .update(privacyRequests)
        .set({ ...patch, updatedAt: now() })
        .where(eq(privacyRequests.id, id))
        .returning();
      return row ? mapPrivacyRequest(row) : null;
    },
    async listExpiredPrivacyExports(cutoff, limit) {
      const rows = await db
        .select()
        .from(privacyRequests)
        .where(
          and(
            eq(privacyRequests.kind, "EXPORT"),
            eq(privacyRequests.status, "DONE"),
            sql`${privacyRequests.resultKey} IS NOT NULL`,
            lt(privacyRequests.completedAt, cutoff),
          ),
        )
        .orderBy(asc(privacyRequests.completedAt))
        .limit(Math.min(Math.max(limit, 1), 1000));
      return rows.map(mapPrivacyRequest);
    },
    async listIngestionSources(userId) {
        // user_id is the owner; rows from before the column resolve through their consent grant.
        const rows = await db
            .select()
            .from(ingestionSources)
            .where(sql`(${ingestionSources.userId} = ${userId} OR (${ingestionSources.userId} IS NULL AND ${ingestionSources.consentGrantId} IN ${db
            .select({ id: consentGrants.id })
            .from(consentGrants)
            .where(eq(consentGrants.userId, userId))}))`)
            .orderBy(desc(ingestionSources.createdAt));
        return rows.map(mapIngestionSource);
    },
    async createIngestionSource(input) {
        const timestamp = now();
        const [row] = await db
            .insert(ingestionSources)
            .values({
            id: randomUUID(),
            userId: input.userId,
            kind: input.kind,
            provider: input.provider,
            consentGrantId: input.consentGrantId,
            status: "IDLE",
            cursor: null,
            lastSyncAt: null,
            encryptedToken: null,
            meta: null,
            createdAt: timestamp,
            updatedAt: timestamp,
        })
            .returning();
        return mapIngestionSource(row);
    },
    async createIngestionDocument(input) {
      const [row] = await db
        .insert(ingestionDocuments)
        .values({
        id: randomUUID(),
        userId: input.userId,
        kind: input.kind,
        rawKey: input.rawKey,
        parsedJson: input.parsedJson,
            matchedPurchaseId: null,
            status: "RECEIVED",
        })
            .returning();
        return mapIngestionDocument(row);
    },
    async getIngestionSourceById(id) {
        const [row] = await db
            .select()
            .from(ingestionSources)
            .where(eq(ingestionSources.id, id))
            .limit(1);
        return row ? mapIngestionSource(row) : null;
    },
    async updateIngestionSourceToken(id, encryptedToken) {
        await db
            .update(ingestionSources)
            .set({ encryptedToken, updatedAt: now() })
            .where(eq(ingestionSources.id, id));
    },
    async updateIngestionSourceCursor(id, cursor) {
        await db
            .update(ingestionSources)
            .set({ cursor, lastSyncAt: now(), updatedAt: now() })
            .where(eq(ingestionSources.id, id));
    },
    async getIngestionDocumentById(id) {
        const [row] = await db
            .select()
            .from(ingestionDocuments)
            .where(eq(ingestionDocuments.id, id))
            .limit(1);
        return row ? mapIngestionDocument(row) : null;
    },
    async updateIngestionDocumentStatus(id, status, matchedPurchaseId) {
        await db
            .update(ingestionDocuments)
            .set({
            status,
            matchedPurchaseId: matchedPurchaseId ?? null,
            updatedAt: now(),
        })
            .where(eq(ingestionDocuments.id, id));
    },
    async updateIngestionDocumentParsedJson(id, parsedJson) {
        const [row] = await db
            .update(ingestionDocuments)
            .set({ parsedJson, updatedAt: now() })
            .where(eq(ingestionDocuments.id, id))
            .returning();
        return row ? mapIngestionDocument(row) : null;
    },
    async updateIngestionSource(id, patch) {
        const updates: Record<string, unknown> = { updatedAt: now() };
        if (patch.status !== undefined) updates.status = patch.status;
        if (patch.meta !== undefined) updates.meta = patch.meta;
        const [row] = await db
            .update(ingestionSources)
            .set(updates)
            .where(eq(ingestionSources.id, id))
            .returning();
        return row ? mapIngestionSource(row) : null;
    },
    async disconnectIngestionSource(id) {
        // One statement: a concurrent meta patch (mute rules) is merged, not overwritten.
        const disconnectedAt = now().toISOString();
        const [row] = await db
            .update(ingestionSources)
            .set({
                status: "ERROR",
                encryptedToken: null,
                meta: sql`coalesce(${ingestionSources.meta}, '{}'::jsonb) || ${JSON.stringify(SOURCE_DISCONNECTED_META(disconnectedAt))}::jsonb`,
                updatedAt: now(),
            })
            .where(eq(ingestionSources.id, id))
            .returning();
        return row ? mapIngestionSource(row) : null;
    },
    async disconnectIngestionSourcesByKind(userId, kind) {
      return db.transaction(async (tx) => {
        const owned = sql`(${ingestionSources.userId} = ${userId} OR (${ingestionSources.userId} IS NULL AND ${ingestionSources.consentGrantId} IN ${tx
          .select({ id: consentGrants.id })
          .from(consentGrants)
          .where(eq(consentGrants.userId, userId))}))`;
        // Lock first so the tokens returned are the ones this call cleared.
        const locked = await tx
          .select({ id: ingestionSources.id, encryptedToken: ingestionSources.encryptedToken })
          .from(ingestionSources)
          .where(and(eq(ingestionSources.kind, kind), owned))
          .for("update");
        if (locked.length === 0) return [];
        const disconnectedAt = now().toISOString();
        await tx
          .update(ingestionSources)
          .set({
            status: "ERROR",
            encryptedToken: null,
            meta: sql`coalesce(${ingestionSources.meta}, '{}'::jsonb) || ${JSON.stringify(SOURCE_DISCONNECTED_META(disconnectedAt))}::jsonb`,
            updatedAt: now(),
          })
          .where(inArray(ingestionSources.id, locked.map((s) => s.id)));
        return locked.map((s) => ({
          id: s.id,
          encryptedToken: (s.encryptedToken ?? null) as { data: string } | null,
        }));
      });
    },
    async updateMerchantPurchase(id, patch) {
        const updates: Record<string, unknown> = { updatedAt: now() };
        if (patch.merchant !== undefined) updates.merchant = patch.merchant;
        if (patch.totalMinor !== undefined) updates.totalMinor = patch.totalMinor;
        if (patch.currency !== undefined) updates.currency = patch.currency;
        if (patch.status !== undefined) updates.status = patch.status;
        if (patch.deliveryStatus !== undefined) updates.deliveryStatus = patch.deliveryStatus;
        if (patch.etaAt !== undefined) updates.etaAt = patch.etaAt;
        if (patch.trackingCode !== undefined) updates.trackingCode = patch.trackingCode;
        if (patch.carrier !== undefined) updates.carrier = patch.carrier;
        if (patch.deliveredAt !== undefined) updates.deliveredAt = patch.deliveredAt;
        if (patch.returnWindowDeadline !== undefined) updates.returnWindowDeadline = patch.returnWindowDeadline;
        if (patch.exchangeWindowDeadline !== undefined) updates.exchangeWindowDeadline = patch.exchangeWindowDeadline;
        if (patch.deliveryAddressNote !== undefined) updates.deliveryAddressNote = patch.deliveryAddressNote;
        if (patch.deliveryProofKeys !== undefined) {
          updates.deliveryProofKeys = JSON.stringify(patch.deliveryProofKeys);
        }
        if (patch.assigneeUserId !== undefined) updates.assigneeUserId = patch.assigneeUserId;
        const [row] = await db
            .update(merchantPurchases)
            .set(updates)
            .where(eq(merchantPurchases.id, id))
            .returning();
        return row ? mapMerchantPurchase(row) : null;
    },
    async replaceMerchantPurchaseItems(purchaseId, items) {
        // One transaction: a failed insert must not leave the purchase with no lines.
        return db.transaction(async (tx) => {
        await tx
            .delete(merchantPurchaseItems)
            .where(eq(merchantPurchaseItems.purchaseId, purchaseId));
        if (items.length === 0) return [];
        const rows = await tx
            .insert(merchantPurchaseItems)
            .values(
                items.map((item) => ({
                    id: randomUUID(),
                    purchaseId,
                    title: item.title,
                    category: item.category ?? null,
                    brand: item.brand ?? null,
                    priceMinor: item.priceMinor,
                    imageKey: item.imageKey ?? null,
                    qty: item.qty ?? 1,
                    duplicateWardrobeItemId: item.duplicateWardrobeItemId ?? null,
                })),
            )
            .returning();
        return rows.map(mapMerchantPurchaseItem);
        });
    },
    async moveMerchantPurchaseItems(itemIds, toPurchaseId) {
        if (itemIds.length === 0) return [];
        const rows = await db
            .update(merchantPurchaseItems)
            .set({ purchaseId: toPurchaseId, updatedAt: now() })
            .where(inArray(merchantPurchaseItems.id, itemIds))
            .returning();
        return rows.map(mapMerchantPurchaseItem);
    },
    async repointMerchantPurchaseRefs(fromPurchaseId, toPurchaseId) {
        await db.transaction((tx) => repointPurchaseRefs(tx, fromPurchaseId, toPurchaseId));
    },
    async mergeMerchantPurchases(userId, targetPurchaseId, sourcePurchaseId) {
        return db.transaction(async (tx) => {
            // Lock both in id order so two merges of the same pair cannot deadlock.
            const locked = await tx
                .select()
                .from(merchantPurchases)
                .where(and(
                    inArray(merchantPurchases.id, [targetPurchaseId, sourcePurchaseId]),
                    eq(merchantPurchases.userId, userId),
                ))
                .orderBy(asc(merchantPurchases.id))
                .for("update");
            const targetRow = locked.find((r) => r.id === targetPurchaseId);
            const sourceRow = locked.find((r) => r.id === sourcePurchaseId);
            if (!targetRow || !sourceRow) {
                throw new PurchaseMergeSplitError("NOT_FOUND", "Purchase not found");
            }
            const target = mapMerchantPurchase(targetRow);
            const source = mapMerchantPurchase(sourceRow);
            const [{ n }] = await tx
                .select({ n: sql<number>`count(*)::int` })
                .from(merchantPurchaseItems)
                .where(eq(merchantPurchaseItems.purchaseId, source.id));
            assertMergePlan(target, source, n, userId);
            await tx
                .update(merchantPurchaseItems)
                .set({ purchaseId: target.id, updatedAt: now() })
                .where(eq(merchantPurchaseItems.purchaseId, source.id));
            // Throws 23505 (return_requests_open_line_uidx) when both have an open return for the
            // same line; the whole merge rolls back.
            await repointPurchaseRefs(tx, source.id, target.id);
            const itemRows = await tx
                .select()
                .from(merchantPurchaseItems)
                .where(eq(merchantPurchaseItems.purchaseId, target.id))
                .orderBy(desc(merchantPurchaseItems.createdAt));
            const items = itemRows.map(mapMerchantPurchaseItem);
            const [purchaseRow] = await tx
                .update(merchantPurchases)
                .set({ totalMinor: sumItemsMinor(items), updatedAt: now() })
                .where(eq(merchantPurchases.id, target.id))
                .returning();
            await tx
                .update(merchantPurchases)
                .set({ status: "DUPLICATE", totalMinor: 0, updatedAt: now() })
                .where(eq(merchantPurchases.id, source.id));
            return { purchase: mapMerchantPurchase(purchaseRow), items };
        });
    },
    async splitMerchantPurchase(userId, input) {
        return db.transaction(async (tx) => {
            const [row] = await tx
                .select()
                .from(merchantPurchases)
                .where(and(eq(merchantPurchases.id, input.purchaseId), eq(merchantPurchases.userId, userId)))
                .for("update");
            if (!row) throw new PurchaseMergeSplitError("NOT_FOUND", "Purchase not found");
            const purchase = mapMerchantPurchase(row);
            const itemRows = await tx
                .select()
                .from(merchantPurchaseItems)
                .where(eq(merchantPurchaseItems.purchaseId, purchase.id))
                .orderBy(desc(merchantPurchaseItems.createdAt));
            const items = itemRows.map(mapMerchantPurchaseItem);
            const moving = assertItemsSplitable(purchase, items, input.itemIds, userId);
            const movingIds = new Set(moving.map((m) => m.id));
            const remaining = items.filter((it) => !movingIds.has(it.id));
            const [splitRow] = await tx
                .insert(merchantPurchases)
                .values({
                    id: randomUUID(),
                    userId,
                    source: purchase.source,
                    merchant: input.merchant?.trim() || purchase.merchant,
                    orderRef: null,
                    purchasedAt: purchase.purchasedAt,
                    currency: purchase.currency,
                    totalMinor: sumItemsMinor(moving),
                    status: "CONFIRMED",
                    deliveryStatus: purchase.deliveryStatus,
                    etaAt: purchase.etaAt,
                    trackingCode: null,
                    returnWindowDeadline: purchase.returnWindowDeadline,
                    exchangeWindowDeadline: purchase.exchangeWindowDeadline,
                })
                .returning();
            const movedRows = await tx
                .update(merchantPurchaseItems)
                .set({ purchaseId: splitRow.id, updatedAt: now() })
                .where(and(
                    inArray(merchantPurchaseItems.id, [...movingIds]),
                    eq(merchantPurchaseItems.purchaseId, purchase.id),
                ))
                .returning();
            const [originalRow] = await tx
                .update(merchantPurchases)
                .set({ totalMinor: sumItemsMinor(remaining), updatedAt: now() })
                .where(eq(merchantPurchases.id, purchase.id))
                .returning();
            return {
                original: { purchase: mapMerchantPurchase(originalRow), items: remaining },
                split: {
                    purchase: mapMerchantPurchase(splitRow),
                    items: movedRows
                        .map(mapMerchantPurchaseItem)
                        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
                },
            };
        });
    },
    async purgeIngestionDocumentRaw(id) {
        // One statement; a legacy owner in parsed_json moves to user_id before the body goes.
        await db
            .update(ingestionDocuments)
            .set({
                userId: sql`coalesce(${ingestionDocuments.userId}, (select ${users.id} from ${users} where ${users.id}::text = ${ingestionDocuments.parsedJson}->>'__userId'))`,
                rawKey: "",
                parsedJson: { purged: true, purgedAt: now().toISOString() },
                updatedAt: now(),
            })
            .where(eq(ingestionDocuments.id, id));
    },
    async listIngestionDocumentsForRetention(kind, cutoff, limit) {
        return db
            .select({
                id: ingestionDocuments.id,
                kind: ingestionDocuments.kind,
                rawKey: ingestionDocuments.rawKey,
                status: ingestionDocuments.status,
                createdAt: ingestionDocuments.createdAt,
            })
            .from(ingestionDocuments)
            .where(and(eq(ingestionDocuments.kind, kind), ne(ingestionDocuments.rawKey, ""), lt(ingestionDocuments.createdAt, cutoff)))
            .orderBy(asc(ingestionDocuments.createdAt))
            .limit(Math.min(Math.max(limit, 1), 1000));
    },
    async listIngestionDocuments() {
        const rows = await db
            .select()
            .from(ingestionDocuments)
            .orderBy(desc(ingestionDocuments.createdAt));
        return rows.map(mapIngestionDocument);
    },
    async listMoneyAccounts(userId, opts) {
        const conditions = [eq(moneyAccounts.userId, userId)];
        if (opts?.kind) {
            conditions.push(eq(moneyAccounts.kind, opts.kind));
        }
        const rows = await db
            .select()
            .from(moneyAccounts)
            .where(and(...conditions))
            .orderBy(desc(moneyAccounts.createdAt));
        return rows.map(mapMoneyAccount);
    },
    async listMoneyAccountsByUsers(userIds) {
        if (userIds.length === 0) return [];
        const rows = await db
            .select()
            .from(moneyAccounts)
            .where(inArray(moneyAccounts.userId, [...userIds]))
            .orderBy(desc(moneyAccounts.createdAt));
        return rows.map(mapMoneyAccount);
    },
    async listAllMoneyAccounts(opts) {
        if (!opts) {
            const rows = await db
                .select()
                .from(moneyAccounts)
                .orderBy(desc(moneyAccounts.createdAt));
            return rows.map(mapMoneyAccount);
        }
        const limit = Math.min(Math.max(opts.limit ?? 500, 1), 1000);
        const rows = await db
            .select()
            .from(moneyAccounts)
            .where(opts.afterId ? sql`${moneyAccounts.id} > ${opts.afterId}` : undefined)
            .orderBy(asc(moneyAccounts.id))
            .limit(limit);
        return rows.map(mapMoneyAccount);
    },
    async fixMoneyAccountCache(accountId, userId, _correctBalance) {
        const result = await reconcileAccountCache(db, accountId, userId, { fix: true });
        if (!result) {
            throw new Error("Money account not found");
        }
    },
    async reconcileMoneyAccount(accountId, userId, opts) {
        return reconcileAccountCache(db, accountId, userId, opts);
    },
    async listMoneyLedger(accountId, userId) {
        const rows = await db
            .select()
            .from(moneyLedger)
            .where(and(eq(moneyLedger.userId, userId), eq(moneyLedger.accountId, accountId)))
            .orderBy(desc(moneyLedger.createdAt));
        return rows.map(mapMoneyLedger);
    },
    async listMoneyLedgerPage(accountId, userId, page) {
        const rows = await db
            .select({ row: moneyLedger, createdAtText: keysetCreatedAtText(moneyLedger.createdAt) })
            .from(moneyLedger)
            .where(
                and(
                    eq(moneyLedger.userId, userId),
                    eq(moneyLedger.accountId, accountId),
                    keysetAfter(moneyLedger.createdAt, moneyLedger.id, page.after),
                ),
            )
            .orderBy(...keysetOrderBy(moneyLedger.createdAt, moneyLedger.id))
            .limit(page.limit + 1);
        return toPage(
            rows,
            page.limit,
            (r) => ({ createdAt: r.createdAtText, id: r.row.id }),
            (r) => mapMoneyLedger(r.row),
        );
    },
    async listMoneyLedgerByUser(userId) {
        const rows = await db
            .select()
            .from(moneyLedger)
            .where(eq(moneyLedger.userId, userId))
            .orderBy(desc(moneyLedger.createdAt));
        return rows.map(mapMoneyLedger);
    },
    async listMerchantPurchasesByUser(userId) {
      const rows = await db
        .select()
        .from(merchantPurchases)
        .where(eq(merchantPurchases.userId, userId))
        .orderBy(desc(merchantPurchases.createdAt));
      return rows.map(mapMerchantPurchase);
    },
    async deleteReceiptsByUser(userId) {
        await db.delete(receipts).where(eq(receipts.userId, userId));
    },
    async deleteWarrantiesByUser(userId) {
        await db.delete(warranties).where(eq(warranties.userId, userId));
    },
    async deleteMerchantPurchasesByUser(userId) {
      // Items and purchases go together, or neither does.
      await db.transaction(async (tx) => {
        const rows = await tx
          .select({ id: merchantPurchases.id })
          .from(merchantPurchases)
          .where(eq(merchantPurchases.userId, userId));
        const ids = rows.map((r) => r.id);
        if (ids.length === 0) return;
        await tx
          .delete(merchantPurchaseItems)
          .where(inArray(merchantPurchaseItems.purchaseId, ids));
        await tx.delete(merchantPurchases).where(eq(merchantPurchases.userId, userId));
      });
    },
    async createMoneyAccount(input) {
        const [row] = await db
            .insert(moneyAccounts)
            .values({
            id: randomUUID(),
            userId: input.userId,
            kind: input.kind,
            merchant: input.merchant,
            currency: input.currency,
            balanceCacheMinor: input.balanceCacheMinor,
            expiresAt: input.expiresAt,
            status: input.status,
        })
            .returning();
        return mapMoneyAccount(row);
    },
    async findMoneyAccount(id, userId) {
        const [row] = await db
            .select()
            .from(moneyAccounts)
            .where(and(eq(moneyAccounts.id, id), eq(moneyAccounts.userId, userId)))
            .limit(1);
        return row ? mapMoneyAccount(row) : null;
    },
    async updateMoneyAccount(id, userId, patch) {
        const set: Record<string, unknown> = { updatedAt: now() };
        if (patch.status !== undefined) set.status = patch.status;
        if (patch.expiresAt !== undefined) set.expiresAt = patch.expiresAt;
        if (patch.merchant !== undefined) set.merchant = patch.merchant;
        const [row] = await db
            .update(moneyAccounts)
            .set(set)
            .where(and(eq(moneyAccounts.id, id), eq(moneyAccounts.userId, userId)))
            .returning();
        return row ? mapMoneyAccount(row) : null;
    },
    async deleteOrphanMoneyAccount(id, userId) {
        return deleteOrphanMoneyAccountQuery(db, id, userId);
    },
    async purgeOrphanMoneyAccounts(userId) {
        return purgeOrphanMoneyAccountsQuery(db, userId);
    },
    async findMoneyLedgerByRef(userId, refId, type) {
        const [row] = await db
            .select()
            .from(moneyLedger)
            .where(and(eq(moneyLedger.userId, userId), eq(moneyLedger.refId, refId), eq(moneyLedger.type, type)))
            .orderBy(desc(moneyLedger.createdAt))
            .limit(1);
        return row ? mapMoneyLedger(row) : null;
    },
    async listMoneyLedgerByRefs(userId, refIds, type) {
        if (refIds.length === 0) return [];
        const rows = await db
            .select()
            .from(moneyLedger)
            .where(and(eq(moneyLedger.userId, userId), inArray(moneyLedger.refId, refIds), eq(moneyLedger.type, type)));
        return rows.map(mapMoneyLedger);
    },
    async postMoneyLedger(input) {
        return postLedgerEntry(db, {
            accountId: input.accountId,
            userId: input.userId,
            delta: input.delta,
            type: input.type,
            refType: input.refType,
            refId: input.refId,
        });
    },
    async createMoneyAccountWithEntry(input) {
        const { account, created } = await createAccountWithLedgerEntry(db, input);
        return { account: mapMoneyAccount(account), created };
    },
    async setMoneyAccountBalance(input) {
        return setAccountBalance(db, input);
    },
    async mergeMoneyAccounts(input) {
        const { target, transferredMinor, alreadyApplied } = await mergeAccountInto(db, input);
        return { account: mapMoneyAccount(target), transferredMinor, alreadyApplied };
    },
    // --- Universe P1.2: receipts & warranties ---
    async createReceipt(input) {
        const [row] = await db
            .insert(receipts)
            .values({
            id: randomUUID(),
            userId: input.userId,
            imageKey: input.imageKey,
            merchant: input.merchant,
            purchasedAt: input.purchasedAt,
            totalMinor: input.totalMinor,
            ocrJson: input.ocrJson,
            purchaseId: input.purchaseId ?? null,
        })
            .returning();
        return mapReceipt(row);
    },
    async getReceipt(id, userId) {
        const [row] = await db
            .select()
            .from(receipts)
            .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
            .limit(1);
        return row ? mapReceipt(row) : null;
    },
    async listReceipts(userId) {
        const rows = await db
            .select()
            .from(receipts)
            .where(eq(receipts.userId, userId))
            .orderBy(desc(receipts.createdAt));
        return rows.map(mapReceipt);
    },
    async updateReceipt(id, userId, patch) {
        const [row] = await db
            .update(receipts)
            .set({
                ...(patch.merchant !== undefined ? { merchant: patch.merchant } : {}),
                ...(patch.purchasedAt !== undefined ? { purchasedAt: patch.purchasedAt } : {}),
                ...(patch.totalMinor !== undefined ? { totalMinor: patch.totalMinor } : {}),
                ...(patch.ocrJson !== undefined ? { ocrJson: patch.ocrJson } : {}),
                updatedAt: now(),
            })
            .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
            .returning();
        return row ? mapReceipt(row) : null;
    },
    async updateReceiptPurchaseId(id, userId, purchaseId) {
        await db
            .update(receipts)
            .set({ purchaseId, updatedAt: now() })
            .where(and(eq(receipts.id, id), eq(receipts.userId, userId)));
    },
    async createMerchantPurchase(input) {
        // One transaction: a purchase never lands without its lines.
        return db.transaction((tx) => insertMerchantPurchaseWithItems(tx, input));
    },
    async confirmReceiptPurchase(input) {
        return db.transaction(async (tx) => {
            // The receipt lock serialises double taps: the second waits, then sees the link.
            const [receipt] = await tx
                .select()
                .from(receipts)
                .where(and(eq(receipts.id, input.receiptId), eq(receipts.userId, input.userId)))
                .for("update");
            if (!receipt) return null;
            if (receipt.purchaseId) {
                const [linked] = await tx
                    .select()
                    .from(merchantPurchases)
                    .where(eq(merchantPurchases.id, receipt.purchaseId))
                    .limit(1);
                if (linked) return { purchase: mapMerchantPurchase(linked), warranties: [], created: false };
            }
            const { purchase } = await insertMerchantPurchaseWithItems(tx, input.purchase);
            const warrantyRows =
                input.warranties.length === 0
                    ? []
                    : await tx
                        .insert(warranties)
                        .values(input.warranties.map((w) => ({
                        id: randomUUID(),
                        userId: w.userId,
                        receiptId: w.receiptId ?? null,
                        itemTitle: w.itemTitle,
                        provider: w.provider,
                        coverageUntil: w.coverageUntil,
                        claimContact: w.claimContact ?? null,
                        category: w.category ?? null,
                        state: "ACTIVE" as const,
                    })))
                        .returning();
            await tx
                .update(receipts)
                .set({ purchaseId: purchase.id, updatedAt: now() })
                .where(eq(receipts.id, receipt.id));
            return { purchase, warranties: warrantyRows.map(mapWarranty), created: true };
        });
    },
    async findMerchantPurchaseByOrderRef(userId, orderRef) {
      const [row] = await db
        .select()
        .from(merchantPurchases)
        .where(and(eq(merchantPurchases.userId, userId), eq(merchantPurchases.orderRef, orderRef)))
        .limit(1);
      return row ? mapMerchantPurchase(row) : null;
    },
    async createWarranty(input) {
        const [row] = await db
            .insert(warranties)
            .values({
            id: randomUUID(),
            userId: input.userId,
            receiptId: input.receiptId ?? null,
            itemTitle: input.itemTitle,
            provider: input.provider,
            coverageUntil: input.coverageUntil,
            claimContact: input.claimContact ?? null,
            category: input.category ?? null,
            state: "ACTIVE",
        })
            .returning();
        return mapWarranty(row);
    },
    async listWarranties(userId) {
        const rows = await db
            .select()
            .from(warranties)
            .where(eq(warranties.userId, userId))
            .orderBy(desc(warranties.coverageUntil));
        return rows.map(mapWarranty);
    },
    async findWarranty(id, userId) {
        const [row] = await db
            .select()
            .from(warranties)
            .where(and(eq(warranties.id, id), eq(warranties.userId, userId)))
            .limit(1);
        return row ? mapWarranty(row) : null;
    },
    async claimWarranty(id, userId) {
        const [row] = await db
            .update(warranties)
            .set({ state: "CLAIMED", updatedAt: now() })
            .where(and(eq(warranties.id, id), eq(warranties.userId, userId)))
            .returning();
        return row ? mapWarranty(row) : null;
    },
    async unclaimWarranty(id, userId) {
        const [row] = await db
            .update(warranties)
            .set({ state: "ACTIVE", updatedAt: now() })
            .where(
              and(
                eq(warranties.id, id),
                eq(warranties.userId, userId),
                eq(warranties.state, "CLAIMED"),
              ),
            )
            .returning();
        if (row) return mapWarranty(row);
        return this.findWarranty(id, userId);
    },
    async listMerchantPurchases(userId, opts = {}) {
      const statuses = opts.deliveryStatuses;
      const rows = await db
        .select()
        .from(merchantPurchases)
        .where(
          and(
            eq(merchantPurchases.userId, userId),
            statuses ? inArray(merchantPurchases.deliveryStatus, [...statuses]) : undefined,
          ),
        )
        .orderBy(desc(merchantPurchases.createdAt));
        return rows.map(mapMerchantPurchase);
    },
    async listMerchantPurchaseItems(purchaseId) {
        const rows = await db
            .select()
            .from(merchantPurchaseItems)
            .where(eq(merchantPurchaseItems.purchaseId, purchaseId))
            .orderBy(desc(merchantPurchaseItems.createdAt));
        return rows.map(mapMerchantPurchaseItem);
    },
    async listWardrobeItems(userId) {
        const rows = await db.select().from(wardrobeItems).where(eq(wardrobeItems.userId, userId)).orderBy(desc(wardrobeItems.createdAt));
        return rows.map(mapWardrobeItem);
    },
    async findWardrobeItem(id, userId) {
        const [row] = await db.select().from(wardrobeItems).where(and(eq(wardrobeItems.id, id), eq(wardrobeItems.userId, userId))).limit(1);
        return row ? mapWardrobeItem(row) : null;
    },
    async createWardrobeItem(input) {
        const [row] = await db.insert(wardrobeItems).values({
            id: randomUUID(),
            userId: input.userId,
            source: input.source ?? "MANUAL",
            category: input.category,
            colors: input.colors ?? [],
            brand: input.brand ?? null,
            costMinor: input.costMinor ?? 0,
            imageKeys: input.imageKeys ?? [],
            garmentImageKey: input.garmentImageKey ?? null,
            purchaseItemId: input.purchaseItemId ?? null,
            laundryStatus: input.laundryStatus ?? "CLEAN",
            closetStatus: input.closetStatus ?? "ACTIVE",
            tags: input.tags ?? [],
            careRules: input.careRules ?? null,
            dryCleanTicket: input.dryCleanTicket ?? null,
            dryCleanPickupOn: input.dryCleanPickupOn ?? null,
            lentTo: input.lentTo ?? null,
            lentDueOn: input.lentDueOn ?? null,
            profileId: input.profileId ?? null,
        }).returning();
        // ensure metrics row exists
        await db.insert(itemMetrics).values({
            id: randomUUID(),
            userId: input.userId,
            wardrobeItemId: row.id,
            wearCount: 0,
            lastWornAt: null,
            costPerWearMinor: input.costMinor && input.costMinor > 0 ? input.costMinor : null,
            status: "ACTIVE",
        }).onConflictDoNothing();
        return mapWardrobeItem(row);
    },
    async updateWardrobeItem(id, userId, patch) {
        const updates: Record<string, unknown> = { updatedAt: now() };
        if (patch.category !== undefined) updates.category = patch.category;
        if (patch.colors !== undefined) updates.colors = patch.colors;
        if (patch.brand !== undefined) updates.brand = patch.brand;
        if (patch.costMinor !== undefined) updates.costMinor = patch.costMinor;
        if (patch.imageKeys !== undefined) updates.imageKeys = patch.imageKeys;
        if (patch.garmentImageKey !== undefined) updates.garmentImageKey = patch.garmentImageKey;
        if (patch.laundryStatus !== undefined) updates.laundryStatus = patch.laundryStatus;
        if (patch.closetStatus !== undefined) updates.closetStatus = patch.closetStatus;
        if (patch.tags !== undefined) updates.tags = patch.tags;
        if (patch.careRules !== undefined) updates.careRules = patch.careRules;
        if (patch.dryCleanTicket !== undefined) updates.dryCleanTicket = patch.dryCleanTicket;
        if (patch.dryCleanPickupOn !== undefined) updates.dryCleanPickupOn = patch.dryCleanPickupOn;
        if (patch.lentTo !== undefined) updates.lentTo = patch.lentTo;
        if (patch.lentDueOn !== undefined) updates.lentDueOn = patch.lentDueOn;
        if (patch.profileId !== undefined) updates.profileId = patch.profileId;
        const [row] = await db
            .update(wardrobeItems)
            .set(updates)
            .where(and(eq(wardrobeItems.id, id), eq(wardrobeItems.userId, userId)))
            .returning();
        return row ? mapWardrobeItem(row) : null;
    },
    async deleteWardrobeItem(id, userId) {
        const deleted = await db
            .delete(wardrobeItems)
            .where(and(eq(wardrobeItems.id, id), eq(wardrobeItems.userId, userId)))
            .returning({ id: wardrobeItems.id });
        return deleted.length > 0;
    },
    async createOutfit(input) {
        const [row] = await db.insert(outfits).values({
            id: randomUUID(),
            userId: input.userId,
            itemIds: input.itemIds,
            occasion: input.occasion ?? null,
            weatherCtx: input.weatherCtx ?? null,
            plannedFor: input.plannedFor ?? null,
            generatedAt: new Date(),
            styleProfileSnapshot: input.styleProfileSnapshot ?? null,
        }).returning();
        return mapOutfit(row);
    },
    async findOutfitById(id, userId) {
        const [row] = await db.select().from(outfits).where(and(eq(outfits.id, id), eq(outfits.userId, userId))).limit(1);
        return row ? mapOutfit(row) : null;
    },
    async getTodayOutfit(userId) {
        const today = new Date().toISOString().slice(0, 10);
        const [planned] = await db
            .select()
            .from(outfits)
            .where(and(eq(outfits.userId, userId), eq(outfits.plannedFor, today)))
            .limit(1);
        if (planned) return mapOutfit(planned);
        const [row] = await db.select().from(outfits).where(eq(outfits.userId, userId)).orderBy(desc(outfits.generatedAt)).limit(1);
        return row ? mapOutfit(row) : null;
    },
    async getOutfitForDate(userId, plannedFor) {
        const [row] = await db
            .select()
            .from(outfits)
            .where(and(eq(outfits.userId, userId), eq(outfits.plannedFor, plannedFor)))
            .limit(1);
        return row ? mapOutfit(row) : null;
    },
    async upsertOutfitForDate(input) {
        const existing = await repos.getOutfitForDate(input.userId, input.plannedFor);
        if (existing) {
            const [row] = await db
                .update(outfits)
                .set({
                    itemIds: input.itemIds,
                    occasion: input.occasion ?? null,
                    weatherCtx: input.weatherCtx ?? null,
                    styleProfileSnapshot: input.styleProfileSnapshot ?? null,
                    generatedAt: new Date(),
                    updatedAt: now(),
                })
                .where(eq(outfits.id, existing.id))
                .returning();
            return mapOutfit(row);
        }
        return repos.createOutfit({ ...input, plannedFor: input.plannedFor });
    },
    async updateOutfit(id, userId, patch) {
        const updates: Record<string, unknown> = { updatedAt: now() };
        if (patch.itemIds !== undefined) updates.itemIds = patch.itemIds;
        if (patch.occasion !== undefined) updates.occasion = patch.occasion;
        if (patch.weatherCtx !== undefined) updates.weatherCtx = patch.weatherCtx;
        const [row] = await db
            .update(outfits)
            .set(updates)
            .where(and(eq(outfits.id, id), eq(outfits.userId, userId)))
            .returning();
        return row ? mapOutfit(row) : null;
    },
    async listOutfits(userId) {
        const rows = await db.select().from(outfits).where(eq(outfits.userId, userId)).orderBy(desc(outfits.generatedAt));
        return rows.map(mapOutfit);
    },
    async listOutfitsInRange(userId, fromDate, toDate) {
        const rows = await db
            .select()
            .from(outfits)
            .where(
                and(
                    eq(outfits.userId, userId),
                    gte(outfits.plannedFor, fromDate),
                    lte(outfits.plannedFor, toDate),
                ),
            )
            .orderBy(outfits.plannedFor);
        return rows.map(mapOutfit);
    },
    async createWearLog(input) {
        const [row] = await db.insert(wearLog).values({
            id: randomUUID(),
            userId: input.userId,
            wardrobeItemId: input.wardrobeItemId ?? null,
            outfitId: input.outfitId ?? null,
            wornOn: input.wornOn ?? new Date(),
            imageKey: input.imageKey ?? null,
        }).returning();
        // Update metrics for involved items
        const itemIds = [];
        if (input.wardrobeItemId)
            itemIds.push(input.wardrobeItemId);
        if (input.outfitId) {
            const outfit = await repos.findOutfitById(input.outfitId, input.userId);
            if (outfit)
                itemIds.push(...outfit.itemIds);
        }
        for (const wid of [...new Set(itemIds)]) {
            const [existingMetric] = await db.select().from(itemMetrics).where(and(eq(itemMetrics.userId, input.userId), eq(itemMetrics.wardrobeItemId, wid))).limit(1);
            const [item] = await db.select().from(wardrobeItems).where(eq(wardrobeItems.id, wid)).limit(1);
            if (!item)
                continue;
            const prevCount = existingMetric?.wearCount ?? 0;
            const newCount = prevCount + 1;
            const costPerWear = item.costMinor > 0 ? Math.round(item.costMinor / newCount) : null;
            // status logic: DEAD if not worn in 90d prior? here freshly worn so ACTIVE, dormant/dead assessed elsewhere
            const status: ItemMetricRecord["status"] = "ACTIVE";
            if (existingMetric) {
                await db.update(itemMetrics).set({ wearCount: newCount, lastWornAt: row.wornOn, costPerWearMinor: costPerWear, status, updatedAt: now() }).where(eq(itemMetrics.id, existingMetric.id));
            }
            else {
                await db.insert(itemMetrics).values({
                    id: randomUUID(),
                    userId: input.userId,
                    wardrobeItemId: wid,
                    wearCount: newCount,
                    lastWornAt: row.wornOn,
                    costPerWearMinor: costPerWear,
                    status,
                });
            }
        }
        return mapWearLog(row);
    },
    async listWearLogs(userId) {
        const rows = await db.select().from(wearLog).where(eq(wearLog.userId, userId)).orderBy(desc(wearLog.wornOn));
        return rows.map(mapWearLog);
    },
    async findWearLog(id, userId) {
        const [row] = await db
          .select()
          .from(wearLog)
          .where(and(eq(wearLog.id, id), eq(wearLog.userId, userId)))
          .limit(1);
        return row ? mapWearLog(row) : null;
    },
    async deleteWearLog(id, userId) {
        const existing = await repos.findWearLog(id, userId);
        if (!existing) return null;
        const itemIds: string[] = [];
        if (existing.wardrobeItemId) itemIds.push(existing.wardrobeItemId);
        if (existing.outfitId) {
            const outfit = await repos.findOutfitById(existing.outfitId, userId);
            if (outfit) itemIds.push(...outfit.itemIds);
        }
        await db.delete(wearLog).where(and(eq(wearLog.id, id), eq(wearLog.userId, userId)));
        for (const wid of [...new Set(itemIds)]) {
            const [metric] = await db
              .select()
              .from(itemMetrics)
              .where(and(eq(itemMetrics.userId, userId), eq(itemMetrics.wardrobeItemId, wid)))
              .limit(1);
            if (!metric) continue;
            const [item] = await db.select().from(wardrobeItems).where(eq(wardrobeItems.id, wid)).limit(1);
            const newCount = Math.max(0, (metric.wearCount ?? 0) - 1);
            const costPerWear =
              item && item.costMinor > 0 && newCount > 0
                ? Math.round(item.costMinor / newCount)
                : null;
            await db
              .update(itemMetrics)
              .set({
                wearCount: newCount,
                costPerWearMinor: costPerWear,
                lastWornAt: newCount === 0 ? null : metric.lastWornAt,
                updatedAt: now(),
              })
              .where(eq(itemMetrics.id, metric.id));
        }
        return existing;
    },
    async getItemMetrics(userId) {
        // Refresh statuses based on lastWornAt before returning
        const rows = await db.select().from(itemMetrics).where(eq(itemMetrics.userId, userId));
        const nowDate = new Date();
        for (const r of rows) {
            let computed = r.status;
            if (!r.lastWornAt) {
                const ageDays = (nowDate.getTime() - r.createdAt.getTime()) / 86_400_000;
                if (ageDays > 90)
                    computed = "DEAD";
                else if (ageDays > 30)
                    computed = "DORMANT";
                else
                    computed = "ACTIVE";
            }
            else {
                const daysSince = (nowDate.getTime() - r.lastWornAt.getTime()) / 86_400_000;
                if (daysSince > 90)
                    computed = "DEAD";
                else if (daysSince > 60)
                    computed = "DORMANT";
                else
                    computed = "ACTIVE";
            }
            if (computed !== r.status) {
                await db.update(itemMetrics).set({ status: computed, updatedAt: now() }).where(eq(itemMetrics.id, r.id));
                r.status = computed;
            }
        }
        const refreshed = await db.select().from(itemMetrics).where(eq(itemMetrics.userId, userId)).orderBy(desc(itemMetrics.updatedAt));
        return refreshed.map(mapItemMetric);
    },
    async findItemMetric(userId, wardrobeItemId) {
        const [row] = await db.select().from(itemMetrics).where(and(eq(itemMetrics.userId, userId), eq(itemMetrics.wardrobeItemId, wardrobeItemId))).limit(1);
        return row ? mapItemMetric(row) : null;
    },
    async upsertItemMetric(input) {
        const [existing] = await db.select().from(itemMetrics).where(and(eq(itemMetrics.userId, input.userId), eq(itemMetrics.wardrobeItemId, input.wardrobeItemId))).limit(1);
        if (existing) {
            const [row] = await db.update(itemMetrics).set({
                wearCount: input.wearCount,
                lastWornAt: input.lastWornAt,
                costPerWearMinor: input.costPerWearMinor,
                status: input.status,
                ...(input.targetCpwMinor !== undefined ? { targetCpwMinor: input.targetCpwMinor } : {}),
                updatedAt: now(),
            }).where(eq(itemMetrics.id, existing.id)).returning();
            return mapItemMetric(row);
        }
        const [row] = await db.insert(itemMetrics).values({
            id: randomUUID(),
            userId: input.userId,
            wardrobeItemId: input.wardrobeItemId,
            wearCount: input.wearCount,
            lastWornAt: input.lastWornAt,
            costPerWearMinor: input.costPerWearMinor,
            targetCpwMinor: input.targetCpwMinor ?? null,
            status: input.status,
        }).returning();
        return mapItemMetric(row);
    },
    async setItemCpwGoal(input) {
        const [existing] = await db.select().from(itemMetrics).where(and(eq(itemMetrics.userId, input.userId), eq(itemMetrics.wardrobeItemId, input.wardrobeItemId))).limit(1);
        if (existing) {
            const [row] = await db.update(itemMetrics).set({
                targetCpwMinor: input.targetCpwMinor,
                updatedAt: now(),
            }).where(eq(itemMetrics.id, existing.id)).returning();
            return mapItemMetric(row);
        }
        const [item] = await db.select().from(wardrobeItems).where(eq(wardrobeItems.id, input.wardrobeItemId)).limit(1);
        const costMinor = item?.costMinor ?? 0;
        const [row] = await db.insert(itemMetrics).values({
            id: randomUUID(),
            userId: input.userId,
            wardrobeItemId: input.wardrobeItemId,
            wearCount: 0,
            lastWornAt: null,
            costPerWearMinor: costMinor > 0 ? costMinor : null,
            targetCpwMinor: input.targetCpwMinor,
            status: "ACTIVE",
        }).returning();
        return mapItemMetric(row);
    },
    async createDispositionListing(input) {
        const { listing } = await db.transaction((tx) => openDispositionListingTx(tx, {
            ...input,
            mode: input.mode as DispositionListingRecord["mode"],
        }));
        return listing;
    },
    async openDispositionListing(input) {
        return db.transaction((tx) => openDispositionListingTx(tx, input));
    },
    async listDispositionListings(userId) {
        const rows = await db.select().from(dispositionListings).where(eq(dispositionListings.userId, userId)).orderBy(desc(dispositionListings.createdAt));
        return rows.map(mapDispositionListing);
    },
    async listBudgets(userId) {
        const rows = await db.select().from(budgets).where(eq(budgets.userId, userId)).orderBy(desc(budgets.createdAt));
        return rows.map((r) => ({ id: r.id, userId: r.userId, category: r.category, period: r.period, limitMinor: r.limitMinor, createdAt: r.createdAt, updatedAt: r.updatedAt }));
    },
    async createBudget(input) {
        const [row] = await db.insert(budgets).values({ id: randomUUID(), userId: input.userId, category: input.category, period: input.period, limitMinor: input.limitMinor }).returning();
        return { id: row.id, userId: row.userId, category: row.category, period: row.period, limitMinor: row.limitMinor, createdAt: row.createdAt, updatedAt: row.updatedAt };
    },
    async findBudget(id, userId) {
        const [row] = await db.select().from(budgets).where(and(eq(budgets.id, id), eq(budgets.userId, userId))).limit(1);
        if (!row)
            return null;
        return { id: row.id, userId: row.userId, category: row.category, period: row.period, limitMinor: row.limitMinor, createdAt: row.createdAt, updatedAt: row.updatedAt };
    },
    async getSpendRollups(userId) {
        const rows = await db.select().from(spendRollups).where(eq(spendRollups.userId, userId)).orderBy(desc(spendRollups.updatedAt));
        return rows.map((r) => ({ id: r.id, userId: r.userId, period: r.period, category: r.category, totalMinor: r.totalMinor, createdAt: r.createdAt, updatedAt: r.updatedAt }));
    },
    async upsertSpendRollup(input) {
        // #54: one row per (user, period, category) — spend_rollups_user_period_category_uidx.
        const [row] = await db.insert(spendRollups).values({ id: randomUUID(), userId: input.userId, period: input.period, category: input.category, totalMinor: input.totalMinor }).onConflictDoUpdate({ target: [spendRollups.userId, spendRollups.period, spendRollups.category], set: { totalMinor: input.totalMinor, updatedAt: now() } }).returning();
        return { id: row.id, userId: row.userId, period: row.period, category: row.category, totalMinor: row.totalMinor, createdAt: row.createdAt, updatedAt: row.updatedAt };
    },
    async listReturnRequests(userId) {
        const rows = await db.select().from(returnRequests).where(eq(returnRequests.userId, userId)).orderBy(desc(returnRequests.createdAt));
        return rows.map(mapReturnRequest);
    },
    async findReturnRequest(id, userId) {
        const [row] = await db.select().from(returnRequests).where(and(eq(returnRequests.id, id), eq(returnRequests.userId, userId))).limit(1);
        if (!row)
            return null;
        return mapReturnRequest(row);
    },
    async createReturnRequest(input) {
        return (await this.openReturnRequest(input)).request;
    },
    async openReturnRequest(input) {
        const purchaseId = input.purchaseId ?? null;
        const purchaseItemId = input.purchaseItemId ?? null;
        return db.transaction(async (tx) => {
            const [row] = await tx.insert(returnRequests).values({
              id: randomUUID(),
              userId: input.userId,
              purchaseId,
              purchaseItemId,
              windowDeadline: input.windowDeadline,
              exchangeDeadline: input.exchangeDeadline ?? null,
              state: input.state ?? "REQUESTED",
              refundMinor: null,
              method: input.method ?? null,
              reason: input.reason ?? null,
              orderedSize: input.orderedSize ?? null,
              preferredSize: input.preferredSize ?? null,
            }).onConflictDoNothing().returning();
            if (!row) {
                // return_requests_open_line_uidx: this line already has an open return.
                const [open] = await tx.select().from(returnRequests).where(and(
                    eq(returnRequests.userId, input.userId),
                    sql`${returnRequests.purchaseId} IS NOT DISTINCT FROM ${purchaseId}::uuid`,
                    sql`${returnRequests.purchaseItemId} IS NOT DISTINCT FROM ${purchaseItemId}::uuid`,
                    inArray(returnRequests.state, OPEN_RETURN_STATES),
                )).limit(1);
                if (!open) throw new Error("Return request insert lost: the open return was closed meanwhile");
                return { request: mapReturnRequest(open), created: false };
            }
            const events: Array<typeof returnEvents.$inferInsert> = [{ id: randomUUID(), returnRequestId: row.id, fromState: null, toState: "REQUESTED", actor: "user" }];
            if (row.state === "INITIATED") {
                events.push({ id: randomUUID(), returnRequestId: row.id, fromState: "REQUESTED", toState: "INITIATED", actor: "user" });
            }
            await tx.insert(returnEvents).values(events);
            return { request: mapReturnRequest(row), created: true };
        });
    },
    async expireOverdueReturnRequests(userId, at) {
        return db.transaction(async (tx) => {
            const due = await tx.select({ id: returnRequests.id, state: returnRequests.state }).from(returnRequests).where(and(
                eq(returnRequests.userId, userId),
                lt(returnRequests.windowDeadline, at),
                inArray(returnRequests.state, returnStatesInto("EXPIRED")),
            )).for("update");
            if (due.length === 0) return [];
            const rows = await tx.update(returnRequests).set({ state: "EXPIRED", updatedAt: now() }).where(inArray(returnRequests.id, due.map((d) => d.id))).returning();
            await tx.insert(returnEvents).values(due.map((d) => ({ id: randomUUID(), returnRequestId: d.id, fromState: d.state, toState: "EXPIRED", actor: "system.expire" })));
            return rows.map(mapReturnRequest);
        });
    },
    async updateReturnRequest(id, patch, opts = {}) {
        return db.transaction(async (tx) => {
            const [existing] = await tx.select().from(returnRequests).where(opts.userId ? and(eq(returnRequests.id, id), eq(returnRequests.userId, opts.userId)) : eq(returnRequests.id, id)).for("update");
            if (!existing)
                return null;
            if (opts.fromStates && !opts.fromStates.includes(existing.state)) {
                throw new ReturnStateConflictError(existing.state);
            }
            const prev = existing.state;
            const { chaseEscalated, ...rest } = patch;
            const set: Partial<typeof returnRequests.$inferInsert> = { updatedAt: now() };
            for (const [k, v] of Object.entries(rest)) {
                if (v !== undefined) (set as Record<string, unknown>)[k] = v;
            }
            if (chaseEscalated !== undefined) set.chaseEscalated = chaseEscalated ? 1 : 0;
            const [row] = await tx.update(returnRequests).set(set).where(eq(returnRequests.id, id)).returning();
            if (patch.state && patch.state !== prev) {
                await tx.insert(returnEvents).values({ id: randomUUID(), returnRequestId: id, fromState: prev, toState: patch.state, actor: opts.actor ?? "user" });
            } else if (opts.noteActor) {
                await tx.insert(returnEvents).values({ id: randomUUID(), returnRequestId: id, fromState: prev, toState: prev, actor: opts.noteActor });
            }
            return mapReturnRequest(row);
        });
    },
    async listReturnEvents(returnRequestId) {
        const rows = await db.select().from(returnEvents).where(eq(returnEvents.returnRequestId, returnRequestId)).orderBy(desc(returnEvents.createdAt));
        return rows.map((r) => ({ id: r.id, returnRequestId: r.returnRequestId, fromState: r.fromState ?? null, toState: r.toState, actor: r.actor ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt }));
    },
    async createReturnEvent(input) {
        const [row] = await db.insert(returnEvents).values({ id: randomUUID(), returnRequestId: input.returnRequestId, fromState: input.fromState, toState: input.toState, actor: input.actor ?? null }).returning();
        return { id: row.id, returnRequestId: row.returnRequestId, fromState: row.fromState ?? null, toState: row.toState, actor: row.actor ?? null, createdAt: row.createdAt, updatedAt: row.updatedAt };
    },
    async findMerchantPurchaseById(id) {
      const [row] = await db.select().from(merchantPurchases).where(eq(merchantPurchases.id, id)).limit(1);
      return row ? mapMerchantPurchase(row) : null;
    },
    async findMerchantPurchaseItemById(id) {
      const [row] = await db.select().from(merchantPurchaseItems).where(eq(merchantPurchaseItems.id, id)).limit(1);
      return row ? mapMerchantPurchaseItem(row) : null;
    },
    async listMerchantPurchasesByIds(userId, ids) {
      if (ids.length === 0) return [];
      const rows = await db.select().from(merchantPurchases).where(and(eq(merchantPurchases.userId, userId), inArray(merchantPurchases.id, ids)));
      return rows.map(mapMerchantPurchase);
    },
    async listMerchantPurchaseItemsByIds(userId, ids) {
      if (ids.length === 0) return [];
      const rows = await db
        .select({ item: merchantPurchaseItems })
        .from(merchantPurchaseItems)
        .innerJoin(merchantPurchases, eq(merchantPurchases.id, merchantPurchaseItems.purchaseId))
        .where(and(eq(merchantPurchases.userId, userId), inArray(merchantPurchaseItems.id, ids)));
      return rows.map((r) => mapMerchantPurchaseItem(r.item));
    },
    async updateMerchantPurchaseDelivery(id, userId, patch) {
      const [existing] = await db
        .select()
        .from(merchantPurchases)
        .where(and(eq(merchantPurchases.id, id), eq(merchantPurchases.userId, userId)))
        .limit(1);
      if (!existing) return null;
      const [row] = await db
        .update(merchantPurchases)
        .set({
          ...(patch.deliveryStatus !== undefined ? { deliveryStatus: patch.deliveryStatus } : {}),
          ...(patch.etaAt !== undefined ? { etaAt: patch.etaAt } : {}),
          ...(patch.trackingCode !== undefined ? { trackingCode: patch.trackingCode } : {}),
          ...(patch.carrier !== undefined ? { carrier: patch.carrier } : {}),
          ...(patch.deliveredAt !== undefined ? { deliveredAt: patch.deliveredAt } : {}),
          ...(patch.returnWindowDeadline !== undefined
            ? { returnWindowDeadline: patch.returnWindowDeadline }
            : {}),
          ...(patch.exchangeWindowDeadline !== undefined
            ? { exchangeWindowDeadline: patch.exchangeWindowDeadline }
            : {}),
          ...(patch.deliveryAddressNote !== undefined
            ? { deliveryAddressNote: patch.deliveryAddressNote }
            : {}),
          ...(patch.deliveryProofKeys !== undefined
            ? { deliveryProofKeys: JSON.stringify(patch.deliveryProofKeys) }
            : {}),
          updatedAt: now(),
        })
        .where(eq(merchantPurchases.id, id))
        .returning();
      return row ? mapMerchantPurchase(row) : null;
    },
    async updateMerchantPurchaseItemDuplicate(id, duplicateWardrobeItemId) {
      const [row] = await db
        .update(merchantPurchaseItems)
        .set({ duplicateWardrobeItemId, updatedAt: now() })
        .where(eq(merchantPurchaseItems.id, id))
        .returning();
      return row ? mapMerchantPurchaseItem(row) : null;
    },
    // --- P4 gift ---
    async listRecipients(userId) {
        const rows = await db.select().from(recipients).where(eq(recipients.userId, userId)).orderBy(desc(recipients.createdAt));
        return rows.map((r) => ({ id: r.id, userId: r.userId, name: r.name, relationship: r.relationship, region: r.region, createdAt: r.createdAt, updatedAt: r.updatedAt }));
    },
    async findRecipient(id, userId) {
        const [row] = await db.select().from(recipients).where(and(eq(recipients.id, id), eq(recipients.userId, userId))).limit(1);
        if (!row)
            return null;
        return { id: row.id, userId: row.userId, name: row.name, relationship: row.relationship, region: row.region, createdAt: row.createdAt, updatedAt: row.updatedAt };
    },
    async createRecipient(input) {
        const wishlist = normalizeWishlist(input.profile?.wishlist ?? []);
        // The recipient and its profile commit together.
        return db.transaction(async (tx) => {
        const [row] = await tx.insert(recipients).values({ id: randomUUID(), userId: input.userId, name: input.name, relationship: (input.relationship ?? "OTHER"), region: input.region ?? "IN" }).returning();
        if (input.profile) {
            await tx.insert(recipientProfiles).values({
                id: randomUUID(),
                recipientId: row.id,
                sizes: (input.profile.sizes ?? {}),
                tasteTags: input.profile.tasteTags ?? [],
                wishlist,
                importantDates: (input.profile.importantDates ?? []),
                notes: input.profile.notes ?? null,
            });
        }
        else {
            await tx.insert(recipientProfiles).values({ id: randomUUID(), recipientId: row.id, sizes: {}, tasteTags: [], wishlist: [], importantDates: [], notes: null });
        }
        return { id: row.id, userId: row.userId, name: row.name, relationship: row.relationship, region: row.region, createdAt: row.createdAt, updatedAt: row.updatedAt };
        });
    },
    async findRecipientProfile(recipientId) {
        const [row] = await db.select().from(recipientProfiles).where(eq(recipientProfiles.recipientId, recipientId)).limit(1);
        if (!row)
            return null;
        return { id: row.id, recipientId: row.recipientId, sizes: (row.sizes ?? {}), tasteTags: (row.tasteTags ?? []), wishlist: normalizeWishlist(row.wishlist ?? []), importantDates: (row.importantDates ?? []), notes: row.notes ?? null, createdAt: row.createdAt, updatedAt: row.updatedAt };
    },
    async listRecipientProfiles(recipientIds) {
        if (recipientIds.length === 0)
            return [];
        const rows = await db.select().from(recipientProfiles).where(inArray(recipientProfiles.recipientId, [...recipientIds]));
        return rows.map((row) => ({ id: row.id, recipientId: row.recipientId, sizes: (row.sizes ?? {}), tasteTags: (row.tasteTags ?? []), wishlist: normalizeWishlist(row.wishlist ?? []), importantDates: (row.importantDates ?? []), notes: row.notes ?? null, createdAt: row.createdAt, updatedAt: row.updatedAt }));
    },
    async upsertRecipientProfile(input) {
        // One profile per recipient (unique recipient_id): insert, or patch only the given fields.
        const set: Partial<typeof recipientProfiles.$inferInsert> = { updatedAt: now() };
        if (input.sizes != null) set.sizes = input.sizes;
        if (input.tasteTags != null) set.tasteTags = input.tasteTags;
        if (input.wishlist !== undefined) set.wishlist = normalizeWishlist(input.wishlist);
        if (input.importantDates != null) set.importantDates = input.importantDates;
        if (input.notes !== undefined) set.notes = input.notes;
        const [row] = await db.insert(recipientProfiles).values({ id: randomUUID(), recipientId: input.recipientId, sizes: (input.sizes ?? {}), tasteTags: input.tasteTags ?? [], wishlist: normalizeWishlist(input.wishlist ?? []), importantDates: (input.importantDates ?? []), notes: input.notes ?? null }).onConflictDoUpdate({ target: recipientProfiles.recipientId, set }).returning();
        return { id: row.id, recipientId: row.recipientId, sizes: (row.sizes ?? {}), tasteTags: (row.tasteTags ?? []), wishlist: normalizeWishlist(row.wishlist ?? []), importantDates: (row.importantDates ?? []), notes: row.notes ?? null, createdAt: row.createdAt, updatedAt: row.updatedAt };
    },
    async listGiftOrders(userId) {
        const rows = await db.select().from(giftOrders).where(eq(giftOrders.userId, userId)).orderBy(desc(giftOrders.createdAt));
        return rows.map((r) => ({
          id: r.id,
          userId: r.userId,
          recipientId: r.recipientId,
          listingId: r.listingId ?? null,
          occasion: r.occasion,
          status: r.status,
          affiliateLink: r.affiliateLink ?? null,
          wrapMessage: r.wrapMessage ?? null,
          groupTargetMinor: r.groupTargetMinor ?? null,
          groupCurrency: r.groupCurrency ?? null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }));
    },
    async createGiftOrder(input) {
        const [row] = await db.insert(giftOrders).values({
          id: randomUUID(),
          userId: input.userId,
          recipientId: input.recipientId,
          listingId: input.listingId ?? null,
          occasion: (input.occasion ?? null),
          status: "ORDERED",
          affiliateLink: input.affiliateLink ?? null,
          wrapMessage: input.wrapMessage ?? null,
          groupTargetMinor: input.groupTargetMinor ?? null,
          groupCurrency:
            input.groupTargetMinor != null
              ? (input.groupCurrency ?? "INR")
              : (input.groupCurrency ?? null),
        }).returning();
        return {
          id: row.id,
          userId: row.userId,
          recipientId: row.recipientId,
          listingId: row.listingId ?? null,
          occasion: row.occasion,
          status: row.status,
          affiliateLink: row.affiliateLink ?? null,
          wrapMessage: row.wrapMessage ?? null,
          groupTargetMinor: row.groupTargetMinor ?? null,
          groupCurrency: row.groupCurrency ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
    },
    async findGiftOrder(id, userId) {
        const [row] = await db.select().from(giftOrders).where(and(eq(giftOrders.id, id), eq(giftOrders.userId, userId))).limit(1);
        if (!row)
            return null;
        return {
          id: row.id,
          userId: row.userId,
          recipientId: row.recipientId,
          listingId: row.listingId ?? null,
          occasion: row.occasion,
          status: row.status,
          affiliateLink: row.affiliateLink ?? null,
          wrapMessage: row.wrapMessage ?? null,
          groupTargetMinor: row.groupTargetMinor ?? null,
          groupCurrency: row.groupCurrency ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
    },
    async findGiftOrderById(id) {
        const [row] = await db.select().from(giftOrders).where(eq(giftOrders.id, id)).limit(1);
        if (!row) return null;
        return {
          id: row.id,
          userId: row.userId,
          recipientId: row.recipientId,
          listingId: row.listingId ?? null,
          occasion: row.occasion,
          status: row.status,
          affiliateLink: row.affiliateLink ?? null,
          wrapMessage: row.wrapMessage ?? null,
          groupTargetMinor: row.groupTargetMinor ?? null,
          groupCurrency: row.groupCurrency ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
    },
    async createGroupGiftContribution(input) {
        const key = input.idempotencyKey ?? null;
        // A retried tap with the same key hits the (gift_order_id, idempotency_key) unique index and returns the first row.
        let [row] = await db.insert(groupGiftContributions).values({
          id: randomUUID(),
          giftOrderId: input.giftOrderId,
          contributorUserId: input.contributorUserId ?? null,
          contributorName: input.contributorName ?? null,
          amountMinor: input.amountMinor,
          note: input.note ?? null,
          idempotencyKey: key,
        }).onConflictDoNothing({
          target: [groupGiftContributions.giftOrderId, groupGiftContributions.idempotencyKey],
          where: sql`${groupGiftContributions.idempotencyKey} IS NOT NULL`,
        }).returning();
        const created = row !== undefined;
        if (!row && key) {
            [row] = await db.select().from(groupGiftContributions).where(and(eq(groupGiftContributions.giftOrderId, input.giftOrderId), eq(groupGiftContributions.idempotencyKey, key))).limit(1);
        }
        if (!row)
            throw new Error("group gift contribution insert lost");
        return { created, contribution: {
          id: row.id,
          giftOrderId: row.giftOrderId,
          contributorUserId: row.contributorUserId ?? null,
          contributorName: row.contributorName ?? null,
          amountMinor: row.amountMinor,
          note: row.note ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        } };
    },
    async listGroupGiftContributions(giftOrderId) {
        const rows = await db
          .select()
          .from(groupGiftContributions)
          .where(eq(groupGiftContributions.giftOrderId, giftOrderId))
          .orderBy(desc(groupGiftContributions.createdAt));
        return rows.map((row) => ({
          id: row.id,
          giftOrderId: row.giftOrderId,
          contributorUserId: row.contributorUserId ?? null,
          contributorName: row.contributorName ?? null,
          amountMinor: row.amountMinor,
          note: row.note ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
    },
    async sumGroupGiftContributions(giftOrderId) {
        const rows = await db
          .select()
          .from(groupGiftContributions)
          .where(eq(groupGiftContributions.giftOrderId, giftOrderId));
        return rows.reduce((sum, row) => sum + row.amountMinor, 0);
    },
    async sumGroupGiftContributionsByOrders(giftOrderIds) {
        const sums = new Map<string, number>(giftOrderIds.map((id) => [id, 0]));
        if (giftOrderIds.length === 0)
            return sums;
        const rows = await db
          .select({ giftOrderId: groupGiftContributions.giftOrderId, total: sql<string>`coalesce(sum(${groupGiftContributions.amountMinor}), 0)` })
          .from(groupGiftContributions)
          .where(inArray(groupGiftContributions.giftOrderId, [...giftOrderIds]))
          .groupBy(groupGiftContributions.giftOrderId);
        for (const row of rows)
            sums.set(row.giftOrderId, Number(row.total));
        return sums;
    },
    // --- P4 fit ---
    async listMeasurementProfiles(userId) {
        const rows = await db.select().from(measurementProfiles).where(eq(measurementProfiles.userId, userId)).orderBy(desc(measurementProfiles.createdAt));
        return rows.map((r) => ({
          id: r.id,
          userId: r.userId,
          region: r.region,
          unit: r.unit as MeasurementProfileRecord["unit"],
          points: (r.points ?? {}) as Record<string, number>,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }));
    },
    async findMeasurementProfile(id, userId) {
        const [row] = await db.select().from(measurementProfiles).where(and(eq(measurementProfiles.id, id), eq(measurementProfiles.userId, userId))).limit(1);
        if (!row)
            return null;
        return {
          id: row.id,
          userId: row.userId,
          region: row.region,
          unit: row.unit as MeasurementProfileRecord["unit"],
          points: (row.points ?? {}) as Record<string, number>,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
    },
    async createMeasurementProfile(input) {
        const [row] = await db.insert(measurementProfiles).values({ id: randomUUID(), userId: input.userId, region: input.region ?? "IN", unit: (input.unit ?? "CM"), points: input.points }).returning();
        return {
          id: row.id,
          userId: row.userId,
          region: row.region,
          unit: row.unit as MeasurementProfileRecord["unit"],
          points: (row.points ?? {}) as Record<string, number>,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
    },
    async listCustomizationTemplates(region) {
        const rows = region ? await db.select().from(customizationTemplates).where(eq(customizationTemplates.region, region)).orderBy(desc(customizationTemplates.createdAt)) : await db.select().from(customizationTemplates).orderBy(desc(customizationTemplates.createdAt));
        return rows.map((r) => ({ id: r.id, region: r.region, garmentType: r.garmentType, name: r.name, optionsSchema: (r.optionsSchema ?? {}), createdAt: r.createdAt, updatedAt: r.updatedAt }));
    },
    async findCustomizationTemplate(id) {
        const [row] = await db.select().from(customizationTemplates).where(eq(customizationTemplates.id, id)).limit(1);
        if (!row)
            return null;
        return { id: row.id, region: row.region, garmentType: row.garmentType, name: row.name, optionsSchema: (row.optionsSchema ?? {}), createdAt: row.createdAt, updatedAt: row.updatedAt };
    },
    async seedCustomizationTemplates() {
        const existing = await db.select({ region: customizationTemplates.region, name: customizationTemplates.name }).from(customizationTemplates);
        const toAdd = missingRegionPacks(existing);
        if (toAdd.length === 0) return;
        await db.insert(customizationTemplates).values(
          toAdd.map((pack) => ({
            id: randomUUID(),
            region: pack.region,
            garmentType: pack.garmentType,
            name: pack.name,
            optionsSchema: buildRichOptions(pack.optionsSchema) as Record<string, unknown>,
          })),
        );
    },
    async createTailoringOrder(input) {
        let snapshot = input.measurementSnapshot ?? null;
        if (!snapshot && input.measurementProfileId) {
            const [mp] = await db.select().from(measurementProfiles).where(eq(measurementProfiles.id, input.measurementProfileId)).limit(1);
            if (mp)
                snapshot = (mp.points ?? null);
        }
        const [row] = await db.insert(tailoringOrders).values({
          id: randomUUID(),
          userId: input.userId,
          templateId: input.templateId,
          measurementProfileId: input.measurementProfileId ?? null,
          selections: input.selections,
          fabricRef: input.fabricRef ?? null,
          fabricPhotoKeys: input.fabricPhotoKeys ?? [],
          tailorSellerId: input.tailorSellerId ?? null,
          measurementSnapshot: snapshot,
          state: "PENDING",
        }).returning();
        return mapTailoringOrder(row);
    },
    async findTailoringOrder(id, userId) {
        const [row] = await db.select().from(tailoringOrders).where(and(eq(tailoringOrders.id, id), eq(tailoringOrders.userId, userId))).limit(1);
        if (!row) return null;
        return mapTailoringOrder(row);
    },
    async listTailoringOrders(userId) {
        const rows = await db.select().from(tailoringOrders).where(eq(tailoringOrders.userId, userId)).orderBy(desc(tailoringOrders.createdAt));
        return rows.map(mapTailoringOrder);
    },
    async updateTailoringOrderState(id, state) {
        // A DELIVERED or CANCELLED order never moves again (the job ladder and mark-received race).
        const [row] = await db.update(tailoringOrders).set({ state: state, updatedAt: now() }).where(and(eq(tailoringOrders.id, id), or(eq(tailoringOrders.state, state), sql`${tailoringOrders.state} NOT IN ('DELIVERED', 'CANCELLED')`))).returning();
        if (!row) return null;
        return mapTailoringOrder(row);
    },
    async updateTailoringOrderFabric(id, userId, patch) {
        const [existing] = await db.select().from(tailoringOrders).where(and(eq(tailoringOrders.id, id), eq(tailoringOrders.userId, userId))).limit(1);
        if (!existing) return null;
        const [row] = await db.update(tailoringOrders).set({
          fabricRef: patch.fabricRef !== undefined ? patch.fabricRef : existing.fabricRef,
          fabricPhotoKeys: patch.fabricPhotoKeys ?? existing.fabricPhotoKeys ?? [],
          updatedAt: now(),
        }).where(eq(tailoringOrders.id, id)).returning();
        if (!row) return null;
        return mapTailoringOrder(row);
    },
    async createTailoringReview(input) {
        const [row] = await db.insert(tailoringReviews).values({
          id: randomUUID(),
          sellerId: input.sellerId,
          userId: input.userId,
          orderId: input.orderId ?? null,
          rating: input.rating,
          comment: input.comment ?? null,
        }).returning();
        return {
          id: row.id,
          sellerId: row.sellerId,
          userId: row.userId,
          orderId: row.orderId ?? null,
          rating: row.rating,
          comment: row.comment ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
    },
    async listTailoringReviews(sellerId) {
        const rows = await db.select().from(tailoringReviews).where(eq(tailoringReviews.sellerId, sellerId)).orderBy(desc(tailoringReviews.createdAt));
        return rows.map((r) => ({
          id: r.id,
          sellerId: r.sellerId,
          userId: r.userId,
          orderId: r.orderId ?? null,
          rating: r.rating,
          comment: r.comment ?? null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }));
    },
    async findDispositionListing(id, userId) {
        const [row] = await db.select().from(dispositionListings).where(and(eq(dispositionListings.id, id), eq(dispositionListings.userId, userId))).limit(1);
        return row ? mapDispositionListing(row) : null;
    },
    async updateDispositionListing(id, patch, opts = {}) {
        // One conditional UPDATE: with fromStatuses, a listing that moved on is not overwritten.
        const set: Partial<typeof dispositionListings.$inferInsert> = { updatedAt: now() };
        if (patch.status !== undefined) set.status = patch.status;
        if (patch.priceMinor !== undefined) set.priceMinor = patch.priceMinor;
        const [row] = await db.update(dispositionListings).set(set).where(and(eq(dispositionListings.id, id), opts.fromStatuses ? inArray(dispositionListings.status, [...opts.fromStatuses]) : undefined)).returning();
        return row ? mapDispositionListing(row) : null;
    },
    async createSwapCircle(input) {
      const [row] = await db
        .insert(swapCircles)
        .values({
          id: randomUUID(),
          name: input.name,
          ownerId: input.ownerId,
          inviteCode: input.inviteCode,
        })
        .returning();
      return {
        id: row.id,
        name: row.name,
        ownerId: row.ownerId,
        inviteCode: row.inviteCode,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies SwapCircleRecord;
    },
    async findSwapCircleById(id) {
      const [row] = await db.select().from(swapCircles).where(eq(swapCircles.id, id)).limit(1);
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        ownerId: row.ownerId,
        inviteCode: row.inviteCode,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies SwapCircleRecord;
    },
    async findSwapCircleByInviteCode(inviteCode) {
      const [row] = await db
        .select()
        .from(swapCircles)
        .where(eq(swapCircles.inviteCode, inviteCode.toUpperCase()))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        ownerId: row.ownerId,
        inviteCode: row.inviteCode,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies SwapCircleRecord;
    },
    async listSwapCirclesForUser(userId) {
      const memberships = await db
        .select({ circleId: swapCircleMembers.circleId })
        .from(swapCircleMembers)
        .where(eq(swapCircleMembers.userId, userId));
      const ids = memberships.map((m) => m.circleId);
      if (ids.length === 0) return [];
      const rows = await db
        .select()
        .from(swapCircles)
        .where(inArray(swapCircles.id, ids))
        .orderBy(desc(swapCircles.createdAt));
      return rows.map(
        (row) =>
          ({
            id: row.id,
            name: row.name,
            ownerId: row.ownerId,
            inviteCode: row.inviteCode,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }) satisfies SwapCircleRecord,
      );
    },
    async addSwapCircleMember(input) {
      // A concurrent join of the same user is a no-op on the unique (circle_id, user_id).
      await db
        .insert(swapCircleMembers)
        .values({
          id: randomUUID(),
          circleId: input.circleId,
          userId: input.userId,
          role: input.role,
        })
        .onConflictDoNothing({ target: [swapCircleMembers.circleId, swapCircleMembers.userId] });
      const [row] = await db
        .select()
        .from(swapCircleMembers)
        .where(
          and(
            eq(swapCircleMembers.circleId, input.circleId),
            eq(swapCircleMembers.userId, input.userId),
          ),
        )
        .limit(1);
      if (!row) throw new Error("swap circle member insert lost");
      return {
        id: row.id,
        circleId: row.circleId,
        userId: row.userId,
        role: row.role as SwapCircleMemberRecord["role"],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies SwapCircleMemberRecord;
    },
    async findSwapCircleMember(circleId, userId) {
      const [row] = await db
        .select()
        .from(swapCircleMembers)
        .where(
          and(eq(swapCircleMembers.circleId, circleId), eq(swapCircleMembers.userId, userId)),
        )
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        circleId: row.circleId,
        userId: row.userId,
        role: row.role as SwapCircleMemberRecord["role"],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies SwapCircleMemberRecord;
    },
    async listSwapCircleMembers(circleId) {
      const rows = await db
        .select()
        .from(swapCircleMembers)
        .where(eq(swapCircleMembers.circleId, circleId))
        .orderBy(asc(swapCircleMembers.createdAt));
      return rows.map(
        (row) =>
          ({
            id: row.id,
            circleId: row.circleId,
            userId: row.userId,
            role: row.role as SwapCircleMemberRecord["role"],
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }) satisfies SwapCircleMemberRecord,
      );
    },
    async createSwapListing(input) {
      const [row] = await db
        .insert(swapListings)
        .values({
          id: randomUUID(),
          circleId: input.circleId,
          ownerUserId: input.ownerUserId,
          wardrobeItemId: input.wardrobeItemId,
          dispositionListingId: input.dispositionListingId ?? null,
          status: "LISTED",
          borrowerUserId: null,
        })
        .returning();
      return {
        id: row.id,
        circleId: row.circleId,
        ownerUserId: row.ownerUserId,
        wardrobeItemId: row.wardrobeItemId,
        dispositionListingId: row.dispositionListingId ?? null,
        status: row.status as SwapListingRecord["status"],
        borrowerUserId: row.borrowerUserId ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies SwapListingRecord;
    },
    async findSwapListing(id, circleId) {
      const [row] = await db
        .select()
        .from(swapListings)
        .where(and(eq(swapListings.id, id), eq(swapListings.circleId, circleId)))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        circleId: row.circleId,
        ownerUserId: row.ownerUserId,
        wardrobeItemId: row.wardrobeItemId,
        dispositionListingId: row.dispositionListingId ?? null,
        status: row.status as SwapListingRecord["status"],
        borrowerUserId: row.borrowerUserId ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies SwapListingRecord;
    },
    async listSwapListings(circleId) {
      const rows = await db
        .select()
        .from(swapListings)
        .where(eq(swapListings.circleId, circleId))
        .orderBy(desc(swapListings.createdAt));
      return rows.map(
        (row) =>
          ({
            id: row.id,
            circleId: row.circleId,
            ownerUserId: row.ownerUserId,
            wardrobeItemId: row.wardrobeItemId,
            dispositionListingId: row.dispositionListingId ?? null,
            status: row.status as SwapListingRecord["status"],
            borrowerUserId: row.borrowerUserId ?? null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }) satisfies SwapListingRecord,
      );
    },
    async updateSwapListing(id, patch, opts = {}) {
      return db.transaction(async (tx) => {
      // One conditional UPDATE: two borrowers racing for a LISTED item cannot both win.
      const set: Partial<typeof swapListings.$inferInsert> = { updatedAt: now() };
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.borrowerUserId !== undefined) set.borrowerUserId = patch.borrowerUserId;
      if (patch.dispositionListingId !== undefined) set.dispositionListingId = patch.dispositionListingId;
      const [row] = await tx
        .update(swapListings)
        .set(set)
        .where(and(
          eq(swapListings.id, id),
          opts.fromStatuses ? inArray(swapListings.status, [...opts.fromStatuses]) : undefined,
        ))
        .returning();
      if (!row) return null;
      if (opts.dispositionStatus && row.dispositionListingId) {
        await tx
          .update(dispositionListings)
          .set({ status: opts.dispositionStatus, updatedAt: now() })
          .where(and(
            eq(dispositionListings.id, row.dispositionListingId),
            eq(dispositionListings.status, "ACTIVE"),
          ));
      }
      return {
        id: row.id,
        circleId: row.circleId,
        ownerUserId: row.ownerUserId,
        wardrobeItemId: row.wardrobeItemId,
        dispositionListingId: row.dispositionListingId ?? null,
        status: row.status as SwapListingRecord["status"],
        borrowerUserId: row.borrowerUserId ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies SwapListingRecord;
      });
    },

    async createHousehold(input) {
      const [row] = await db
        .insert(households)
        .values({
          id: randomUUID(),
          name: input.name,
          ownerId: input.ownerId,
          inviteCode: input.inviteCode,
        })
        .returning();
      return {
        id: row.id,
        name: row.name,
        ownerId: row.ownerId,
        inviteCode: row.inviteCode,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies HouseholdRecord;
    },
    async findHouseholdById(id) {
      const [row] = await db.select().from(households).where(eq(households.id, id)).limit(1);
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        ownerId: row.ownerId,
        inviteCode: row.inviteCode,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies HouseholdRecord;
    },
    async findHouseholdByInviteCode(inviteCode) {
      const [row] = await db
        .select()
        .from(households)
        .where(eq(households.inviteCode, inviteCode.toUpperCase()))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        ownerId: row.ownerId,
        inviteCode: row.inviteCode,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies HouseholdRecord;
    },
    async listHouseholdsForUser(userId) {
      const memberships = await db
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.userId, userId));
      const ids = memberships.map((m) => m.householdId);
      if (ids.length === 0) return [];
      const rows = await db
        .select()
        .from(households)
        .where(inArray(households.id, ids))
        .orderBy(desc(households.createdAt));
      return rows.map(
        (row) =>
          ({
            id: row.id,
            name: row.name,
            ownerId: row.ownerId,
            inviteCode: row.inviteCode,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }) satisfies HouseholdRecord,
      );
    },
    async addHouseholdMember(input) {
      // A concurrent join of the same user is a no-op on the unique (household_id, user_id).
      await db
        .insert(householdMembers)
        .values({
          id: randomUUID(),
          householdId: input.householdId,
          userId: input.userId,
          role: input.role,
        })
        .onConflictDoNothing({ target: [householdMembers.householdId, householdMembers.userId] });
      const [row] = await db
        .select()
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, input.householdId),
            eq(householdMembers.userId, input.userId),
          ),
        )
        .limit(1);
      if (!row) throw new Error("household member insert lost");
      return {
        id: row.id,
        householdId: row.householdId,
        userId: row.userId,
        role: row.role as HouseholdMemberRecord["role"],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies HouseholdMemberRecord;
    },
    async findHouseholdMember(householdId, userId) {
      const [row] = await db
        .select()
        .from(householdMembers)
        .where(
          and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)),
        )
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        householdId: row.householdId,
        userId: row.userId,
        role: row.role as HouseholdMemberRecord["role"],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies HouseholdMemberRecord;
    },
    async listHouseholdMembers(householdId) {
      const rows = await db
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.householdId, householdId))
        .orderBy(asc(householdMembers.createdAt));
      return rows.map(
        (row) =>
          ({
            id: row.id,
            householdId: row.householdId,
            userId: row.userId,
            role: row.role as HouseholdMemberRecord["role"],
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }) satisfies HouseholdMemberRecord,
      );
    },
    async getHouseholdVaultSettings(householdId, userId) {
      const [row] = await db
        .select()
        .from(householdVaultSettings)
        .where(and(eq(householdVaultSettings.householdId, householdId), eq(householdVaultSettings.userId, userId)))
        .limit(1);
      if (row) return mapHouseholdVaultSettings(row);
      return {
        householdId,
        userId,
        vaultAccess: "VIEW",
        spendCapMinor: null,
        spentMinor: 0,
        updatedAt: now(),
      } satisfies HouseholdVaultSettingsRecord;
    },
    async upsertHouseholdVaultSettings(input) {
      // One statement: only the given fields change, so concurrent patches don't undo each other.
      const set: Record<string, unknown> = { updatedAt: now() };
      if (input.vaultAccess !== undefined) set.vaultAccess = input.vaultAccess;
      if (input.spendCapMinor !== undefined) set.spendCapMinor = input.spendCapMinor;
      if (input.spentMinor !== undefined) set.spentMinor = input.spentMinor;
      const [row] = await db
        .insert(householdVaultSettings)
        .values({
          householdId: input.householdId,
          userId: input.userId,
          vaultAccess: input.vaultAccess ?? "VIEW",
          spendCapMinor: input.spendCapMinor ?? null,
          spentMinor: input.spentMinor ?? 0,
        })
        .onConflictDoUpdate({
          target: [householdVaultSettings.householdId, householdVaultSettings.userId],
          set,
        })
        .returning();
      return mapHouseholdVaultSettings(row!);
    },
    async addHouseholdVaultSpent(householdId, userId, deltaMinor) {
      // Check and write with no await between them, so concurrent spends can't both pass the cap.
      const key = `${householdId}:${userId}`;
      const prev = householdVaultSettingsStore.get(key);
      const spent = prev?.spentMinor ?? 0;
      if (deltaMinor > 0) {
        const cap = checkHouseholdVaultSpendCap({
          isMember: true,
          vaultAccess: prev?.vaultAccess,
          spendCapMinor: prev?.spendCapMinor,
          spentMinor: spent,
          amountMinor: deltaMinor,
        });
        if (!cap.allowed) return null;
      }
      const next: HouseholdVaultSettingsRecord = {
        householdId,
        userId,
        vaultAccess: prev?.vaultAccess ?? "VIEW",
        spendCapMinor: prev?.spendCapMinor ?? null,
        spentMinor: Math.max(0, spent + deltaMinor),
        updatedAt: now(),
      };
      householdVaultSettingsStore.set(key, next);
      return next;
    },
    async listHouseholdVaultSettings(householdId) {
      const rows = await db
        .select()
        .from(householdVaultSettings)
        .where(eq(householdVaultSettings.householdId, householdId));
      return rows.map(mapHouseholdVaultSettings);
    },
    async tryReserveHouseholdVaultSpend(householdId, userId, amountMinor) {
      const [row] = await db
        .update(householdVaultSettings)
        .set({
          spentMinor: sql`${householdVaultSettings.spentMinor} + ${amountMinor}`,
          updatedAt: now(),
        })
        .where(
          and(
            eq(householdVaultSettings.householdId, householdId),
            eq(householdVaultSettings.userId, userId),
            eq(householdVaultSettings.vaultAccess, "SPEND"),
            sql`(${householdVaultSettings.spendCapMinor} IS NULL OR ${householdVaultSettings.spentMinor} + ${amountMinor} <= ${householdVaultSettings.spendCapMinor})`,
          ),
        )
        .returning();
      return row ? mapHouseholdVaultSettings(row) : null;
    },
    async releaseHouseholdVaultSpend(householdId, userId, amountMinor) {
      await db
        .update(householdVaultSettings)
        .set({
          spentMinor: sql`greatest(${householdVaultSettings.spentMinor} - ${amountMinor}, 0)`,
          updatedAt: now(),
        })
        .where(and(eq(householdVaultSettings.householdId, householdId), eq(householdVaultSettings.userId, userId)));
    },
    async startWearChallenge(userId, wardrobeItemId) {
      const inserted = await db
        .insert(wearChallenges)
        .values({ userId, wardrobeItemId })
        .onConflictDoNothing({ target: [wearChallenges.userId, wearChallenges.wardrobeItemId] })
        .returning({ id: wearChallenges.id });
      return { created: inserted.length > 0 };
    },
    async listWearChallengeItemIds(userId) {
      const rows = await db
        .select({ id: wearChallenges.wardrobeItemId })
        .from(wearChallenges)
        .where(eq(wearChallenges.userId, userId))
        .orderBy(desc(wearChallenges.startedAt))
        .limit(500);
      return rows.map((r) => r.id);
    },
    async createInterviewKit(input) {
      const [row] = await db
        .insert(interviewKits)
        .values({
          id: input.id,
          userId: input.userId,
          name: input.name,
          kind: input.kind,
          itemIds: input.itemIds,
          eventAt: input.eventAt,
          occasion: input.occasion,
          remindAt: input.remindAt,
          reminderScheduled: input.reminderScheduled,
        })
        .returning();
      return mapInterviewKit(row!);
    },
    async findInterviewKit(id, userId) {
      const [row] = await db
        .select()
        .from(interviewKits)
        .where(and(eq(interviewKits.id, id), eq(interviewKits.userId, userId)))
        .limit(1);
      return row ? mapInterviewKit(row) : null;
    },
    async listInterviewKits(userId, limit) {
      const rows = await db
        .select()
        .from(interviewKits)
        .where(eq(interviewKits.userId, userId))
        .orderBy(asc(interviewKits.eventAt), asc(interviewKits.id))
        .limit(Math.min(Math.max(limit, 1), 500));
      return rows.map(mapInterviewKit);
    },
    async updateInterviewKit(id, userId, patch) {
      const [row] = await db
        .update(interviewKits)
        .set({ ...patch, updatedAt: now() })
        .where(and(eq(interviewKits.id, id), eq(interviewKits.userId, userId)))
        .returning();
      return row ? mapInterviewKit(row) : null;
    },
    async deleteInterviewKit(id, userId) {
      const deleted = await db
        .delete(interviewKits)
        .where(and(eq(interviewKits.id, id), eq(interviewKits.userId, userId)))
        .returning({ id: interviewKits.id });
      return deleted.length > 0;
    },
    async createSocialPoll(input) {
      const [row] = await db
        .insert(socialPolls)
        .values({
          id: input.id,
          userId: input.userId,
          kind: input.kind,
          tokenHash: input.tokenHash,
          itemLabel: input.itemLabel,
          returnRequestId: input.returnRequestId,
          options: input.options,
          plannedFor: input.plannedFor,
          expiresAt: input.expiresAt,
        })
        .returning();
      return mapSocialPoll(row!);
    },
    async findSocialPollById(id) {
      const [row] = await db.select().from(socialPolls).where(eq(socialPolls.id, id)).limit(1);
      return row ? mapSocialPoll(row) : null;
    },
    async findSocialPollByTokenHash(tokenHash) {
      const [row] = await db.select().from(socialPolls).where(eq(socialPolls.tokenHash, tokenHash)).limit(1);
      return row ? mapSocialPoll(row) : null;
    },
    async castSocialPollVote(pollId, voterHash, choice) {
      const inserted = await db
        .insert(socialPollVotes)
        .values({ pollId, voterHash, choice })
        .onConflictDoNothing({ target: [socialPollVotes.pollId, socialPollVotes.voterHash] })
        .returning({ choice: socialPollVotes.choice });
      if (inserted.length > 0) return { inserted: true, choice };
      const [existing] = await db
        .select({ choice: socialPollVotes.choice })
        .from(socialPollVotes)
        .where(and(eq(socialPollVotes.pollId, pollId), eq(socialPollVotes.voterHash, voterHash)))
        .limit(1);
      return { inserted: false, choice: existing?.choice ?? choice };
    },
    async countSocialPollVotes(pollId) {
      const rows = await db
        .select({ choice: socialPollVotes.choice, n: sql<number>`count(*)::int` })
        .from(socialPollVotes)
        .where(eq(socialPollVotes.pollId, pollId))
        .groupBy(socialPollVotes.choice);
      return Object.fromEntries(rows.map((r) => [r.choice, Number(r.n)]));
    },
    async markSocialPollWinnerApplied(pollId) {
      const updated = await db
        .update(socialPolls)
        .set({ winnerAppliedAt: now(), updatedAt: now() })
        .where(and(eq(socialPolls.id, pollId), isNull(socialPolls.winnerAppliedAt)))
        .returning({ id: socialPolls.id });
      return updated.length > 0;
    },
    async findWardrobeItemById(id) {
      const [row] = await db.select().from(wardrobeItems).where(eq(wardrobeItems.id, id)).limit(1);
      return row ? mapWardrobeItem(row) : null;
    },
    async updateWardrobeItemById(id, patch) {
      const updates: Record<string, unknown> = { updatedAt: now() };
      if (patch.category !== undefined) updates.category = patch.category;
      if (patch.colors !== undefined) updates.colors = patch.colors;
      if (patch.brand !== undefined) updates.brand = patch.brand;
      if (patch.costMinor !== undefined) updates.costMinor = patch.costMinor;
      if (patch.imageKeys !== undefined) updates.imageKeys = patch.imageKeys;
      if (patch.garmentImageKey !== undefined) updates.garmentImageKey = patch.garmentImageKey;
      if (patch.laundryStatus !== undefined) updates.laundryStatus = patch.laundryStatus;
      if (patch.closetStatus !== undefined) updates.closetStatus = patch.closetStatus;
      if (patch.tags !== undefined) updates.tags = patch.tags;
      if (patch.careRules !== undefined) updates.careRules = patch.careRules;
      if (patch.dryCleanTicket !== undefined) updates.dryCleanTicket = patch.dryCleanTicket;
      if (patch.dryCleanPickupOn !== undefined) updates.dryCleanPickupOn = patch.dryCleanPickupOn;
      if (patch.lentTo !== undefined) updates.lentTo = patch.lentTo;
      if (patch.lentDueOn !== undefined) updates.lentDueOn = patch.lentDueOn;
      if (patch.profileId !== undefined) updates.profileId = patch.profileId;
      const [row] = await db
        .update(wardrobeItems)
        .set(updates)
        .where(eq(wardrobeItems.id, id))
        .returning();
      return row ? mapWardrobeItem(row) : null;
    },

    async createClosetProfile(input) {
      const [row] = await db
        .insert(closetProfiles)
        .values({
          id: randomUUID(),
          ownerUserId: input.ownerUserId,
          householdId: input.householdId ?? null,
          name: input.name,
          kind: input.kind,
        })
        .returning();
      return {
        id: row.id,
        ownerUserId: row.ownerUserId,
        householdId: row.householdId ?? null,
        name: row.name,
        kind: row.kind as ClosetProfileRecord["kind"],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies ClosetProfileRecord;
    },
    async findClosetProfile(id) {
      const [row] = await db.select().from(closetProfiles).where(eq(closetProfiles.id, id)).limit(1);
      if (!row) return null;
      return {
        id: row.id,
        ownerUserId: row.ownerUserId,
        householdId: row.householdId ?? null,
        name: row.name,
        kind: row.kind as ClosetProfileRecord["kind"],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies ClosetProfileRecord;
    },
    async listClosetProfiles(ownerUserId) {
      const rows = await db
        .select()
        .from(closetProfiles)
        .where(eq(closetProfiles.ownerUserId, ownerUserId))
        .orderBy(asc(closetProfiles.createdAt));
      return rows.map(
        (row) =>
          ({
            id: row.id,
            ownerUserId: row.ownerUserId,
            householdId: row.householdId ?? null,
            name: row.name,
            kind: row.kind as ClosetProfileRecord["kind"],
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }) satisfies ClosetProfileRecord,
      );
    },
    async updateClosetProfile(id, ownerUserId, patch) {
      const updates: Record<string, unknown> = { updatedAt: now() };
      if (patch.name !== undefined) updates.name = patch.name;
      if (patch.kind !== undefined) updates.kind = patch.kind;
      if (patch.householdId !== undefined) updates.householdId = patch.householdId;
      const [row] = await db
        .update(closetProfiles)
        .set(updates)
        .where(and(eq(closetProfiles.id, id), eq(closetProfiles.ownerUserId, ownerUserId)))
        .returning();
      if (!row) return null;
      return {
        id: row.id,
        ownerUserId: row.ownerUserId,
        householdId: row.householdId ?? null,
        name: row.name,
        kind: row.kind as ClosetProfileRecord["kind"],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies ClosetProfileRecord;
    },
    async deleteClosetProfile(id, ownerUserId) {
      await db
        .update(wardrobeItems)
        .set({ profileId: null, updatedAt: now() })
        .where(eq(wardrobeItems.profileId, id));
      const deleted = await db
        .delete(closetProfiles)
        .where(and(eq(closetProfiles.id, id), eq(closetProfiles.ownerUserId, ownerUserId)))
        .returning({ id: closetProfiles.id });
      return deleted.length > 0;
    },

    async createBrandPriceWatch(input) {
      const [row] = await db
        .insert(brandPriceWatches)
        .values({
          id: randomUUID(),
          userId: input.userId,
          brand: input.brand.trim(),
          watchedPriceMinor: input.watchedPriceMinor,
          thresholdPct: input.thresholdPct ?? 10,
          lastSeenPriceMinor: null,
          active: true,
        })
        .returning();
      return {
        id: row.id,
        userId: row.userId,
        brand: row.brand,
        watchedPriceMinor: row.watchedPriceMinor,
        thresholdPct: row.thresholdPct,
        lastSeenPriceMinor: row.lastSeenPriceMinor ?? null,
        active: row.active,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },
    async listBrandPriceWatches(userId) {
      const rows = await db
        .select()
        .from(brandPriceWatches)
        .where(eq(brandPriceWatches.userId, userId))
        .orderBy(desc(brandPriceWatches.createdAt));
      return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        brand: row.brand,
        watchedPriceMinor: row.watchedPriceMinor,
        thresholdPct: row.thresholdPct,
        lastSeenPriceMinor: row.lastSeenPriceMinor ?? null,
        active: row.active,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    },
    async findBrandPriceWatch(id, userId) {
      const [row] = await db
        .select()
        .from(brandPriceWatches)
        .where(and(eq(brandPriceWatches.id, id), eq(brandPriceWatches.userId, userId)))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        userId: row.userId,
        brand: row.brand,
        watchedPriceMinor: row.watchedPriceMinor,
        thresholdPct: row.thresholdPct,
        lastSeenPriceMinor: row.lastSeenPriceMinor ?? null,
        active: row.active,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },
    async updateBrandPriceWatch(id, userId, patch) {
      const [row] = await db
        .update(brandPriceWatches)
        .set({ ...patch, updatedAt: now() })
        .where(and(eq(brandPriceWatches.id, id), eq(brandPriceWatches.userId, userId)))
        .returning();
      if (!row) return null;
      return {
        id: row.id,
        userId: row.userId,
        brand: row.brand,
        watchedPriceMinor: row.watchedPriceMinor,
        thresholdPct: row.thresholdPct,
        lastSeenPriceMinor: row.lastSeenPriceMinor ?? null,
        active: row.active,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },

    async createEmiPlan(input) {
      const [row] = await db
        .insert(emiPlans)
        .values({
          id: randomUUID(),
          userId: input.userId,
          provider: input.provider,
          merchant: input.merchant ?? null,
          principalMinor: input.principalMinor,
          remainingMinor: input.remainingMinor,
          installmentMinor: input.installmentMinor,
          nextDueOn: input.nextDueOn,
          currency: input.currency ?? "INR",
          status: "ACTIVE",
        })
        .returning();
      return {
        id: row.id,
        userId: row.userId,
        provider: row.provider,
        merchant: row.merchant ?? null,
        principalMinor: row.principalMinor,
        remainingMinor: row.remainingMinor,
        installmentMinor: row.installmentMinor,
        nextDueOn: String(row.nextDueOn),
        currency: row.currency,
        status: row.status as EmiPlanRecord["status"],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },
    async listEmiPlans(userId, opts) {
      const rows = await db
        .select()
        .from(emiPlans)
        .where(and(eq(emiPlans.userId, userId), opts?.status ? eq(emiPlans.status, opts.status) : undefined))
        .orderBy(asc(emiPlans.nextDueOn));
      return rows
        .map((row) => ({
          id: row.id,
          userId: row.userId,
          provider: row.provider,
          merchant: row.merchant ?? null,
          principalMinor: row.principalMinor,
          remainingMinor: row.remainingMinor,
          installmentMinor: row.installmentMinor,
          nextDueOn: String(row.nextDueOn),
          currency: row.currency,
          status: row.status as EmiPlanRecord["status"],
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
    },
    async findEmiPlan(id, userId) {
      const [row] = await db
        .select()
        .from(emiPlans)
        .where(and(eq(emiPlans.id, id), eq(emiPlans.userId, userId)))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        userId: row.userId,
        provider: row.provider,
        merchant: row.merchant ?? null,
        principalMinor: row.principalMinor,
        remainingMinor: row.remainingMinor,
        installmentMinor: row.installmentMinor,
        nextDueOn: String(row.nextDueOn),
        currency: row.currency,
        status: row.status as EmiPlanRecord["status"],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },
    async updateEmiPlan(id, userId, patch) {
      const [row] = await db
        .update(emiPlans)
        .set({ ...patch, updatedAt: now() })
        .where(and(eq(emiPlans.id, id), eq(emiPlans.userId, userId)))
        .returning();
      if (!row) return null;
      return {
        id: row.id,
        userId: row.userId,
        provider: row.provider,
        merchant: row.merchant ?? null,
        principalMinor: row.principalMinor,
        remainingMinor: row.remainingMinor,
        installmentMinor: row.installmentMinor,
        nextDueOn: String(row.nextDueOn),
        currency: row.currency,
        status: row.status as EmiPlanRecord["status"],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },
    async payEmiPlan(id, userId, input) {
      const { from, to, paymentKey } = input;
      const [row] = await db
        .update(emiPlans)
        .set({ ...to, lastPaymentKey: paymentKey ?? null, updatedAt: now() })
        .where(
          and(
            eq(emiPlans.id, id),
            eq(emiPlans.userId, userId),
            eq(emiPlans.remainingMinor, from.remainingMinor),
            eq(emiPlans.nextDueOn, from.nextDueOn),
            eq(emiPlans.status, from.status),
            paymentKey
              ? or(isNull(emiPlans.lastPaymentKey), ne(emiPlans.lastPaymentKey, paymentKey))
              : undefined,
          ),
        )
        .returning();
      if (row) return { plan: mapEmiPlan(row), outcome: "APPLIED" as const };
      const [current] = await db
        .select()
        .from(emiPlans)
        .where(and(eq(emiPlans.id, id), eq(emiPlans.userId, userId)))
        .limit(1);
      if (!current) return null;
      const replay = paymentKey != null && current.lastPaymentKey === paymentKey;
      return { plan: mapEmiPlan(current), outcome: replay ? ("REPLAY" as const) : ("CONFLICT" as const) };
    },

    async createCashbackClaim(input) {
      const [row] = await db
        .insert(cashbackClaims)
        .values({
          id: randomUUID(),
          userId: input.userId,
          source: input.source,
          merchant: input.merchant ?? null,
          amountMinor: input.amountMinor,
          currency: input.currency ?? "INR",
          expiresAt: input.expiresAt ?? null,
          notes: input.notes ?? null,
          status: "UNCLAIMED",
          claimedAt: null,
        })
        .returning();
      return {
        id: row.id,
        userId: row.userId,
        source: row.source,
        merchant: row.merchant ?? null,
        amountMinor: row.amountMinor,
        currency: row.currency,
        expiresAt: row.expiresAt ?? null,
        status: row.status as CashbackClaimRecord["status"],
        notes: row.notes ?? null,
        claimedAt: row.claimedAt ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },
    async listCashbackClaims(userId, opts) {
      const rows = await db
        .select()
        .from(cashbackClaims)
        .where(
          and(
            eq(cashbackClaims.userId, userId),
            opts?.status ? eq(cashbackClaims.status, opts.status) : undefined,
          ),
        );
      return rows
        .map((row) => ({
          id: row.id,
          userId: row.userId,
          source: row.source,
          merchant: row.merchant ?? null,
          amountMinor: row.amountMinor,
          currency: row.currency,
          expiresAt: row.expiresAt ?? null,
          status: row.status as CashbackClaimRecord["status"],
          notes: row.notes ?? null,
          claimedAt: row.claimedAt ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }))
        .sort(compareCashbackClaimsByDeadline);
    },
    async findCashbackClaim(id, userId) {
      const [row] = await db
        .select()
        .from(cashbackClaims)
        .where(and(eq(cashbackClaims.id, id), eq(cashbackClaims.userId, userId)))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        userId: row.userId,
        source: row.source,
        merchant: row.merchant ?? null,
        amountMinor: row.amountMinor,
        currency: row.currency,
        expiresAt: row.expiresAt ?? null,
        status: row.status as CashbackClaimRecord["status"],
        notes: row.notes ?? null,
        claimedAt: row.claimedAt ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },
    async claimCashbackClaim(id, userId) {
      // Guarded on UNCLAIMED: an EXPIRED or already CLAIMED claim is returned as it is.
      const [row] = await db
        .update(cashbackClaims)
        .set({ status: "CLAIMED", claimedAt: now(), updatedAt: now() })
        .where(
          and(eq(cashbackClaims.id, id), eq(cashbackClaims.userId, userId), eq(cashbackClaims.status, "UNCLAIMED")),
        )
        .returning();
      if (!row) return this.findCashbackClaim(id, userId);
      return {
        id: row.id,
        userId: row.userId,
        source: row.source,
        merchant: row.merchant ?? null,
        amountMinor: row.amountMinor,
        currency: row.currency,
        expiresAt: row.expiresAt ?? null,
        status: row.status as CashbackClaimRecord["status"],
        notes: row.notes ?? null,
        claimedAt: row.claimedAt ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },

    async listMerchantPurchaseItemsByPurchaseIds(purchaseIds) {
      const map = new Map<string, MerchantPurchaseItemRecord[]>();
      for (const pid of purchaseIds) map.set(pid, []);
      if (purchaseIds.length === 0) return map;
      const rows = await db
        .select()
        .from(merchantPurchaseItems)
        .where(inArray(merchantPurchaseItems.purchaseId, purchaseIds))
        .orderBy(desc(merchantPurchaseItems.createdAt));
      for (const row of rows) {
        const list = map.get(row.purchaseId) ?? [];
        list.push(mapMerchantPurchaseItem(row));
        map.set(row.purchaseId, list);
      }
      return map;
    },

    async listIngestionDocumentsByUser(userId, opts) {
      // user_id is the owner. Rows from before the column (not yet backfilled) are found through
      // the legacy parsed_json owner or the user's purchases.
      const userPurchases = db
        .select({ id: merchantPurchases.id })
        .from(merchantPurchases)
        .where(eq(merchantPurchases.userId, userId));
      const userRawDocs = db
        .select({ id: merchantPurchases.rawDocId })
        .from(merchantPurchases)
        .where(and(eq(merchantPurchases.userId, userId), sql`${merchantPurchases.rawDocId} IS NOT NULL`));
      const owned = sql`(${ingestionDocuments.userId} = ${userId} OR (${ingestionDocuments.userId} IS NULL AND (${ingestionDocuments.parsedJson}->>'__userId' = ${userId} OR ${ingestionDocuments.matchedPurchaseId} IN ${userPurchases} OR ${ingestionDocuments.id} IN ${userRawDocs})))`;
      const rows = await db
        .select()
        .from(ingestionDocuments)
        .where(opts?.kind ? and(owned, eq(ingestionDocuments.kind, opts.kind)) : owned)
        .orderBy(desc(ingestionDocuments.createdAt), desc(ingestionDocuments.id))
        .limit(Math.min(Math.max(opts?.limit ?? 5_000, 1), 5_000));
      return rows.map(mapIngestionDocument);
    },

    async findMerchantPurchasesByIds(ids) {
      const unique = [...new Set(ids)];
      if (unique.length === 0) return [];
      const rows = await db.select().from(merchantPurchases).where(inArray(merchantPurchases.id, unique));
      return rows.map(mapMerchantPurchase);
    },

    async listOrderItemsByUser(userId) {
      const orderRows = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.userId, userId));
      const orderIds = orderRows.map((o) => o.id);
      if (orderIds.length === 0) return [];
      const rows = await db
        .select()
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds))
        .orderBy(desc(orderItems.createdAt));
      return rows.map(mapOrderItem);
    },

    async listCartsByUser(userId) {
      const rows = await db.select().from(carts).where(eq(carts.userId, userId));
      return rows.map(mapCart);
    },

    async listCartItemsByUser(userId) {
      const cartRows = await db
        .select({ id: carts.id })
        .from(carts)
        .where(eq(carts.userId, userId));
      const cartIds = cartRows.map((c) => c.id);
      if (cartIds.length === 0) return [];
      const rows = await db
        .select()
        .from(cartItems)
        .where(inArray(cartItems.cartId, cartIds))
        .orderBy(desc(cartItems.createdAt));
      return rows.map(mapCartItem);
    },

    async listSellersByUser(userId) {
      const rows = await db.select().from(sellers).where(eq(sellers.userId, userId));
      return rows.map(mapSeller);
    },

    async listListingsByUser(userId) {
      const sellerRows = await db
        .select({ id: sellers.id })
        .from(sellers)
        .where(eq(sellers.userId, userId));
      const sellerIds = sellerRows.map((s) => s.id);
      if (sellerIds.length === 0) return [];
      const rows = await db
        .select()
        .from(listings)
        .where(inArray(listings.sellerId, sellerIds))
        .orderBy(desc(listings.createdAt));
      return rows.map(mapListing);
    },

    async listListingVariantsByUser(userId) {
      const sellerRows = await db
        .select({ id: sellers.id })
        .from(sellers)
        .where(eq(sellers.userId, userId));
      const sellerIds = sellerRows.map((s) => s.id);
      if (sellerIds.length === 0) return [];
      const listingRows = await db
        .select({ id: listings.id })
        .from(listings)
        .where(inArray(listings.sellerId, sellerIds));
      const listingIds = listingRows.map((l) => l.id);
      if (listingIds.length === 0) return [];
      const rows = await db
        .select()
        .from(listingVariants)
        .where(inArray(listingVariants.listingId, listingIds));
      return rows.map(mapListingVariant);
    },

    async listAvatarsByUser(userId) {
      const rows = await db.select().from(avatars).where(eq(avatars.userId, userId));
      return rows.map(mapAvatar);
    },

    async listRendersByUser(userId) {
      const orderRows = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.userId, userId));
      const orderIds = orderRows.map((o) => o.id);
      if (orderIds.length === 0) return [];
      const itemRows = await db
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds));
      const itemIds = itemRows.map((i) => i.id);
      if (itemIds.length === 0) return [];
      const rows = await db
        .select()
        .from(renders)
        .where(inArray(renders.orderItemId, itemIds))
        .orderBy(asc(renders.createdAt));
      return rows.map(mapRender);
    },

    async listTryonPreviewsByUser(userId) {
      const rows = await db
        .select()
        .from(tryonPreviews)
        .where(eq(tryonPreviews.userId, userId))
        .orderBy(desc(tryonPreviews.createdAt));
      return rows.map(mapTryonPreview);
    },

    async listCoinLedgerByUser(userId) {
      const rows = await db
        .select()
        .from(coinLedger)
        .where(eq(coinLedger.userId, userId))
        .orderBy(desc(coinLedger.createdAt));
      return rows.map(mapCoinLedger);
    },

    async listIapReceiptsByUser(userId) {
      const rows = await db
        .select()
        .from(iapReceipts)
        .where(eq(iapReceipts.userId, userId))
        .orderBy(desc(iapReceipts.createdAt));
      return rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        productId: r.productId,
        coinsGranted: r.coinsGranted,
        createdAt: r.createdAt,
      }));
    },

    async listRecipientProfilesByUser(userId) {
      const recipientRows = await db
        .select({ id: recipients.id })
        .from(recipients)
        .where(eq(recipients.userId, userId));
      const recipientIds = recipientRows.map((r) => r.id);
      if (recipientIds.length === 0) return [];
      const rows = await db
        .select()
        .from(recipientProfiles)
        .where(inArray(recipientProfiles.recipientId, recipientIds))
        .orderBy(desc(recipientProfiles.createdAt));
      return rows.map((r) => ({
        id: r.id,
        recipientId: r.recipientId,
        sizes: (r.sizes ?? {}) as Record<string, string>,
        tasteTags: r.tasteTags ?? [],
        wishlist: normalizeWishlist(r.wishlist ?? []),
        importantDates: (r.importantDates ?? []) as Array<{
          occasion: string;
          date: string;
          label?: string;
        }>,
        notes: r.notes ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    },

    async listReturnEventsByUser(userId) {
      const returnRows = await db
        .select({ id: returnRequests.id })
        .from(returnRequests)
        .where(eq(returnRequests.userId, userId));
      const returnIds = returnRows.map((r) => r.id);
      if (returnIds.length === 0) return [];
      const rows = await db
        .select()
        .from(returnEvents)
        .where(inArray(returnEvents.returnRequestId, returnIds))
        .orderBy(desc(returnEvents.createdAt));
      return rows.map((r) => ({
        id: r.id,
        returnRequestId: r.returnRequestId,
        fromState: r.fromState ?? null,
        toState: r.toState,
        actor: r.actor ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    },

    async createRepairLog(input) {
      const [row] = await db
        .insert(repairLogs)
        .values({
          id: randomUUID(),
          userId: input.userId,
          wardrobeItemId: input.wardrobeItemId,
          costMinor: input.costMinor,
          repairedOn: input.repairedOn,
          kind: input.kind ?? "REPAIR",
          note: input.note ?? null,
          tailorOrderId: input.tailorOrderId ?? null,
        })
        .returning();
      return mapRepairLog(row);
    },
    async listRepairLogs(userId) {
      const rows = await db
        .select()
        .from(repairLogs)
        .where(eq(repairLogs.userId, userId))
        .orderBy(desc(repairLogs.createdAt));
      return rows.map(mapRepairLog);
    },
    async listRepairLogsByItem(wardrobeItemId, userId) {
      const rows = await db
        .select()
        .from(repairLogs)
        .where(and(eq(repairLogs.wardrobeItemId, wardrobeItemId), eq(repairLogs.userId, userId)))
        .orderBy(desc(repairLogs.createdAt));
      return rows.map(mapRepairLog);
    },

  };

  return repos;
}

export function createPostgresRepositoriesFromUrl(connectionString: string): Repositories {
  return createPostgresRepositories(createDb(connectionString));
}
