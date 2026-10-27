import type {
  DeliveryTier,
  OrderState,
  RenderScenario,
  RenderStatus,
  StateEta,
  UserPrefs,
  UserPrefsPatch,
} from "@worn/shared";

export type AvatarStatus = "NONE" | "PROCESSING" | "READY" | "FAILED";

export type UserRecord = {
  id: string;
  phone: string | null;
  email: string | null;
  googleSub: string | null;
  displayName: string | null;
  avatarStatus: AvatarStatus;
  coinBalanceCache: number;
  consentFlags: Record<string, unknown>;
  /** Settings; read-only here. Write with `patchUserPrefs` (updateUser ignores it). */
  prefs: UserPrefs;
  /** IANA name, default Asia/Kolkata. */
  timeZone: string;
  pushToken: string | null;
  referralCode: string | null;
  referredBy: string | null;
  streakCount: number;
  lastStreakClaimAt: Date | null;
  styleProfile: { tags: string[]; answers: Record<string, string> } | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AvatarRecord = {
  id: string;
  userId: string;
  referenceImageKey: string | null;
  sourceUploadKeys: string[];
  bodyMeta: Record<string, unknown>;
  status: AvatarStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CoinLedgerRecord = {
  id: string;
  userId: string;
  delta: number;
  type: string;
  refType: string | null;
  refId: string | null;
  balanceAfter: number;
  createdAt: Date;
};

export type OtpRecord = {
  phone: string;
  /** Opaque to the repository: the OTP service stores an HMAC of the code here. */
  code: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  createdAt: Date;
};

/** At most `max` codes per phone in any `windowMs`. */
export type OtpSendLimit = { max: number; windowMs: number };

export type SaveOtpResult = { saved: true } | { saved: false; retryAt: Date };

export type RefreshTokenRecord = {
  token: string;
  userId: string;
  expiresAt: Date;
};

export type OauthStateRecord = {
  nonce: string;
  userId: string;
  sourceId: string;
  expiresAt: Date;
};

export type EntitlementGrantRecord = {
  entitlementId: string;
  productId: string;
  expiresAt: Date | null;
  isTrial: boolean;
  source: "app_store" | "play_store" | "upi" | "dev";
  /** When the source event happened; a grant is only replaced by a newer or equal event. */
  eventAt: Date;
  /** The store's id for the subscription: App Store original transaction id, or Play purchase token. */
  storeRef?: string | null;
};

/** A store subscription behind a user's grants, for re-checking it with the store. */
export type StoreSubscriptionRef = {
  userId: string;
  productId: string;
  storeRef: string;
};

export type PaymentIntentStatus = "created" | "pending" | "paid" | "failed";

export type PaymentIntentRecord = {
  id: string;
  userId: string;
  provider: "razorpay_upi" | "stub" | "revenuecat";
  productId: string;
  amountMinor: number;
  currency: string;
  upiIntentUrl: string | null;
  status: PaymentIntentStatus;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePaymentIntentInput = Pick<
  PaymentIntentRecord,
  "userId" | "provider" | "productId" | "amountMinor" | "currency" | "upiIntentUrl" | "providerOrderId"
> & { id?: string };

export type GrantCoinsInput = {
  userId: string;
  delta: number;
  type: string;
  refType?: string;
  refId?: string;
};

export type CoinPurchaseStore = "app_store" | "play_store";

/** A store transaction that a verifier or a store notification vouched for. */
export type CoinPurchaseInput = {
  userId: string;
  store: CoinPurchaseStore;
  /** The store's transaction id (iOS transaction id, Play order id): the credit-once key with `store`. */
  transactionId: string;
  /** Store product id. */
  productId: string;
  /** Coins for the product from COIN_PACKS; never an amount from the client. */
  coins: number;
  environment: "production" | "sandbox" | "xcode" | "simulated";
  source: "validate" | "notification";
  rawPayload?: Record<string, unknown>;
};

export type CoinPurchaseRecord = {
  id: string;
  userId: string;
  store: CoinPurchaseStore;
  transactionId: string;
  productId: string;
  coinsGranted: number;
  environment: string | null;
  source: string | null;
  refundedAt: Date | null;
  refundedCoins: number;
  /** Coins the refund couldn't take back because the user had spent them. */
  refundShortfall: number;
  createdAt: Date;
};

export type CreditCoinPurchaseResult =
  | { status: "granted" | "already_granted"; purchase: CoinPurchaseRecord; balanceAfter: number }
  | { status: "other_user"; purchase: CoinPurchaseRecord };

export type RefundCoinPurchaseInput = {
  store: CoinPurchaseStore;
  transactionId: string;
  /** With `productId`: remembers a refund that arrives before the grant, so the grant is refused later. */
  userId?: string;
  productId?: string;
  source: "notification";
  rawPayload?: Record<string, unknown>;
};

export type RefundCoinPurchaseResult =
  | {
      status: "refunded";
      purchase: CoinPurchaseRecord;
      debited: number;
      shortfall: number;
      balanceAfter: number;
    }
  | { status: "already_refunded" | "refunded_before_grant"; purchase: CoinPurchaseRecord }
  /** No grant to take back and no user to remember the refund for. */
  | { status: "unknown" };

export type ListingStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export type SellerStatus = "ACTIVE" | "SUSPENDED";

export type SellerRecord = {
  id: string;
  userId: string;
  shopName: string;
  status: SellerStatus;
  sellerType?: "RETAILER" | "TAILOR" | "INDIVIDUAL";
  createdAt: Date;
  updatedAt: Date;
};

export type AffiliateLinkRecord = {
  url: string;
  label: string;
  platform: "flipkart" | "amazon" | "myntra" | "ajio" | "nykaa" | "other";
};

export type ListingRecord = {
  id: string;
  sellerId: string | null;
  title: string;
  category: string;
  tags: string[];
  coinPrice: number;
  realPrice: string | null;
  productImageKeys: string[];
  houseModelRenderKey: string;
  affiliateUrl: string | null;
  affiliateLinks: AffiliateLinkRecord[] | null;
  status: ListingStatus;
  sortOrder: number;
  createdAt: Date;
};

export type ListingVariantRecord = {
  id: string;
  listingId: string;
  size: string;
  color: string;
  garmentImageKey: string;
};

export type TryonPreviewStatus = "READY" | "PROCESSING";

export type TryonPreviewRecord = {
  id: string;
  userId: string;
  listingVariantId: string | null;
  wardrobeItemId?: string | null;
  imageKey: string | null;
  status: TryonPreviewStatus;
  provider: string;
  costMicros: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CartRecord = {
  id: string;
  userId: string;
  createdAt: Date;
};

export type CartItemRecord = {
  id: string;
  cartId: string;
  listingVariantId: string;
  coinPriceSnapshot: number;
  quantity: number;
  createdAt: Date;
};

export type OrderRecord = {
  id: string;
  userId: string;
  tier: DeliveryTier;
  state: OrderState;
  coinTotal: number;
  placedAt: Date;
  stateEta: StateEta;
  revealReadyAt: Date | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OrderItemRecord = {
  id: string;
  orderId: string;
  listingVariantId: string;
  coinPriceSnapshot: number;
  quantity: number;
  createdAt: Date;
};

export type RenderRecord = {
  id: string;
  orderItemId: string;
  scenario: RenderScenario;
  imageKey: string | null;
  isFree: boolean;
  unlocked: boolean;
  provider: string;
  status: RenderStatus;
  costMicros: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PushEventPayload = {
  deepLink: string;
  screen: string;
  orderId?: string;
  [key: string]: unknown;
};

export type ConsentGrantRecord = {
  id: string;
  userId: string;
  scope: "EMAIL" | "SMS" | "FINANCIAL" | "LIKENESS" | "CONCIERGE";
  grantedAt: Date;
  revokedAt: Date | null;
  source: string;
  meta: Record<string, unknown> | null;
};

export type IngestionSourceRecord = {
  id: string;
  kind: "EMAIL" | "SMS" | "RECEIPT";
  provider: string;
  consentGrantId: string;
  status: "IDLE" | "SYNCING" | "PAUSED" | "ERROR";
  cursor: string | null;
  lastSyncAt: Date | null;
  encryptedToken: { data: string } | null;
  meta: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type IngestionDocumentRecord = {
  id: string;
  kind: "EMAIL" | "SMS" | "RECEIPT";
  rawKey: string;
  parsedJson: Record<string, unknown>;
  matchedPurchaseId: string | null;
  status: "RECEIVED" | "PARSED" | "MATCHED" | "UNMATCHED" | "ERROR";
  createdAt: Date;
  updatedAt: Date;
};

export type MoneyAccountRecord = {
  id: string;
  userId: string;
  kind:
    | "CASH"
    | "STORE_CREDIT"
    | "GIFT_CARD"
    | "LOYALTY_POINTS"
    | "PROMO_CREDIT";
  merchant: string;
  currency: string;
  balanceCacheMinor: number;
  expiresAt: Date | null;
  status: "ACTIVE" | "FROZEN" | "CLOSED";
  createdAt: Date;
  updatedAt: Date;
};

export type MoneyLedgerRecord = {
  id: string;
  accountId: string;
  userId: string;
  delta: number;
  type:
    | "DEPOSIT"
    | "WITHDRAW"
    | "SPEND"
    | "REFUND"
    | "TRANSFER_IN"
    | "TRANSFER_OUT"
    | "PURCHASE_REWARD";
  refType: string | null;
  refId: string | null;
  balanceAfter: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ReceiptRecord = {
  id: string;
  userId: string;
  imageKey: string;
  merchant: string;
  purchasedAt: Date;
  totalMinor: number;
  ocrJson: Record<string, unknown>;
  purchaseId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WarrantyRecord = {
  id: string;
  userId: string;
  receiptId: string | null;
  itemTitle: string;
  provider: string;
  coverageUntil: Date;
  claimContact: string | null;
  category: string | null;
  state: "ACTIVE" | "CLAIMED" | "EXPIRED";
  createdAt: Date;
  updatedAt: Date;
};

export type PackageDeliveryStatus =
  | "ORDERED"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED";

export type MerchantPurchaseRecord = {
  id: string;
  userId: string;
  source: "EMAIL" | "SMS" | "MANUAL" | "RECEIPT";
  merchant: string;
  /** External / Play order id when seeded from checkout bridge. */
  orderRef: string | null;
  purchasedAt: Date;
  currency: string;
  totalMinor: number;
  status: "PENDING" | "CONFIRMED" | "REJECTED" | "DUPLICATE";
  rawDocId: string | null;
  deliveryStatus: PackageDeliveryStatus;
  etaAt: Date | null;
  trackingCode: string | null;
  /** U018 — carrier from tracking paste. */
  carrier: string | null;
  deliveredAt: Date | null;
  returnWindowDeadline: Date | null;
  exchangeWindowDeadline: Date | null;
  /** U023 — RTO address note. */
  deliveryAddressNote: string | null;
  /** U024 — delivery/damage proof object keys. */
  deliveryProofKeys: string[];
  /** U030 — household member assigned to this package. */
  assigneeUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MerchantPurchaseItemRecord = {
  id: string;
  purchaseId: string;
  title: string;
  category: string | null;
  brand: string | null;
  priceMinor: number;
  imageKey: string | null;
  qty: number;
  duplicateWardrobeItemId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateReceiptInput = {
  userId: string;
  imageKey: string;
  merchant: string;
  purchasedAt: Date;
  totalMinor: number;
  ocrJson: Record<string, unknown>;
  purchaseId?: string | null;
};

export type CreateWarrantyInput = {
  userId: string;
  receiptId?: string | null;
  itemTitle: string;
  provider: string;
  coverageUntil: Date;
  claimContact?: string | null;
  category?: string | null;
};

export type MerchantPurchaseItemInput = {
  title: string;
  category?: string | null;
  brand?: string | null;
  priceMinor: number;
  qty?: number;
  imageKey?: string | null;
  duplicateWardrobeItemId?: string | null;
};

export type CreateMerchantPurchaseInput = {
  userId: string;
  source: "EMAIL" | "SMS" | "MANUAL" | "RECEIPT";
  merchant: string;
  orderRef?: string | null;
  purchasedAt: Date;
  currency: string;
  totalMinor: number;
  deliveryStatus?: PackageDeliveryStatus;
  etaAt?: Date | null;
  trackingCode?: string | null;
  returnWindowDeadline?: Date | null;
  exchangeWindowDeadline?: Date | null;
  items: MerchantPurchaseItemInput[];
};

export type GrantConsentInput = {
  userId: string;
  scope: ConsentGrantRecord["scope"];
  source: string;
  meta?: Record<string, unknown> | null;
};

export type CreateIngestionSourceInput = {
  userId: string;
  kind: IngestionSourceRecord["kind"];
  provider: string;
  consentGrantId: string;
};

export type CreateIngestionDocumentInput = {
  userId: string;
  kind: IngestionDocumentRecord["kind"];
  rawKey: string;
  parsedJson: Record<string, unknown>;
};

export type PushEventRecord = {
  id: string;
  userId: string;
  orderId: string | null;
  eventType: string;
  dedupeKey: string;
  title: string;
  body: string;
  payload: PushEventPayload;
  status: "QUEUED" | "SENT" | "FAILED";
  /** Expo push ticket id, set once Expo accepted the message. */
  expoTicketId: string | null;
  createdAt: Date;
};

export type RecordPushEventInput = Omit<PushEventRecord, "id" | "createdAt" | "expoTicketId">;

export type ListListingsInput = {
  cursor?: string;
  limit: number;
  sellerId?: string;
  /** Exact category name. */
  category?: string;
  /**
   * Words or phrases describing the viewer's style. When given, listings whose title,
   * category or tags contain one (as whole words, ignoring case) come first, then the
   * rest; both groups keep the catalog order. See listing-feed.ts for the cursors.
   */
  styleKeywords?: string[];
};

export type ListingCategoryCount = {
  category: string;
  count: number;
};

export type CreateSellerListingInput = {
  sellerId: string;
  title: string;
  category: string;
  tags: string[];
  coinPrice: number;
  realPrice?: string | null;
  productImageKeys: string[];
  houseModelRenderKey: string;
  affiliateUrl: string | null;
  affiliateLinks?: AffiliateLinkRecord[] | null;
  variant: {
    size: string;
    color: string;
    garmentImageKey: string;
  };
};

export type ListListingsResult = {
  items: ListingRecord[];
  nextCursor: string | null;
};

export type ListCoinTransactionsInput = {
  userId: string;
  cursor?: string;
  limit: number;
};

export type ListCoinTransactionsResult = {
  transactions: CoinLedgerRecord[];
  nextCursor: string | null;
};

export type CreateOrderInput = {
  userId: string;
  tier: DeliveryTier;
  coinTotal: number;
  stateEta: StateEta;
  idempotencyKey?: string;
  items: Array<{
    listingVariantId: string;
    coinPriceSnapshot: number;
    quantity: number;
  }>;
};

export type PlaceOrderResult = {
  order: OrderRecord;
  items: OrderItemRecord[];
  /** False when the idempotency key matched an existing order (nothing was charged). */
  created: boolean;
};

export type RushOrderInput = {
  userId: string;
  orderId: string;
  costCoins: number;
  /** The state the new schedule was worked out from. */
  from: OrderState;
  /** The order's full new schedule. */
  stateEta: StateEta;
};

export type RushOrderResult = {
  order: OrderRecord;
  balanceAfter: number;
};

export interface Repositories {
  findUserByPhone(phone: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  findUserByGoogleSub(googleSub: string): Promise<UserRecord | null>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserByReferralCode(code: string): Promise<UserRecord | null>;
  createUser(phone: string): Promise<{ user: UserRecord; isNew: boolean }>;
  findOrCreateGoogleUser(input: {
    googleSub: string;
    email: string;
    displayName?: string | null;
  }): Promise<{ user: UserRecord; isNew: boolean }>;
  updateUser(id: string, patch: Partial<UserRecord>): Promise<UserRecord>;
  /** Writes only `users.time_zone`; returns it, or null when the user doesn't exist. Validate first. */
  setUserTimeZone(userId: string, timeZone: string): Promise<string | null>;
  /** `users.prefs`, or null when the user doesn't exist. */
  getUserPrefs(userId: string): Promise<UserPrefs | null>;
  /**
   * One atomic update: keys with a value replace that key, keys set to null are deleted, and
   * other keys are untouched, so concurrent patches to different keys both survive. Returns the
   * new prefs, or null when the user doesn't exist.
   */
  patchUserPrefs(userId: string, patch: UserPrefsPatch): Promise<UserPrefs | null>;
  applyReferralCode(userId: string, referralCode: string): Promise<UserRecord | null>;
  countReferrals(referrerId: string): Promise<number>;

  claimStreak(userId: string): Promise<{ streakCount: number; coinsGranted: number; balanceAfter: number }>;
  getStreakStatus(userId: string): Promise<{ streakCount: number; lastClaimedAt: Date | null; todayClaimed: boolean }>;

  saveStyleProfile(userId: string, profile: { tags: string[]; answers: Record<string, string> }): Promise<void>;

  /** Idempotent; a repeat save keeps the original save time. The listing must exist. */
  saveLookbookItem(userId: string, listingId: string): Promise<void>;
  /** Idempotent; removing a listing that isn't saved does nothing. */
  removeLookbookItem(userId: string, listingId: string): Promise<void>;
  /** Every listing the user has saved, whatever its status, most recently saved first. */
  listLookbookListings(userId: string): Promise<ListingRecord[]>;

  recordCashbackEvent(input: {
    userId: string;
    listingId: string | null;
    platform: string;
    clickId: string;
  }): Promise<void>;
  listCashbackEvents(userId: string): Promise<Array<{ id: string; listingId: string | null; platform: string; coinsEarned: number; status: string; createdAt: Date }>>;
  confirmCashback(clickId: string, status: "CONFIRMED" | "REJECTED"): Promise<void>;

  findAvatarByUserId(userId: string): Promise<AvatarRecord | null>;
  upsertAvatar(
    data: Omit<AvatarRecord, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ): Promise<AvatarRecord>;
  deleteAvatarByUserId(userId: string): Promise<void>;

  getCoinBalance(userId: string): Promise<number>;
  grantCoins(input: GrantCoinsInput): Promise<{ balanceAfter: number }>;
  spendCoins(input: GrantCoinsInput): Promise<{ balanceAfter: number }>;
  listCoinTransactions(input: ListCoinTransactionsInput): Promise<ListCoinTransactionsResult>;
  findCoinSpendByRef(
    userId: string,
    refType: string,
    refId: string,
  ): Promise<CoinLedgerRecord | null>;
  countReferralCoinsEarned(referrerId: string): Promise<number>;
  findIapReceipt(eventId: string): Promise<{ userId: string; coinsGranted: number } | null>;
  recordIapReceipt(input: {
    eventId: string;
    userId: string;
    productId: string;
    coinsGranted: number;
    rawPayload?: Record<string, unknown>;
  }): Promise<void>;
  /**
   * Credits a verified store purchase at most once per (store, transactionId): the purchase row
   * (unique on that pair) and its IAP_PURCHASE ledger entry are written in one transaction. A repeat
   * for the same user is "already_granted" with the original row; for another user, "other_user".
   */
  creditCoinPurchase(input: CoinPurchaseInput): Promise<CreditCoinPurchaseResult>;
  /**
   * Takes back a refunded purchase's coins once, never below a zero balance; what the user already
   * spent is stored as the row's `refundShortfall`. A refund before any grant leaves a refunded row
   * with 0 coins (when `userId` and `productId` are given), so a later credit grants nothing.
   */
  refundCoinPurchase(input: RefundCoinPurchaseInput): Promise<RefundCoinPurchaseResult>;
  findCoinPurchase(store: CoinPurchaseStore, transactionId: string): Promise<CoinPurchaseRecord | null>;
  listEntitlementGrants(userId: string): Promise<EntitlementGrantRecord[]>;
  /**
   * Upserts grants by (entitlementId, productId, source); a stored grant from a newer event is kept.
   * With `eventId`, the call is a no-op returning `{ applied: false }` when that provider
   * event was applied before (webhook retries).
   */
  applyEntitlementGrants(
    userId: string,
    grants: EntitlementGrantRecord[],
    eventId?: string,
  ): Promise<{ applied: boolean }>;
  /** One row per (user, product, storeRef) of `source` grants with a storeRef that expire after `expiresAfter` (or never). */
  listStoreSubscriptionGrants(
    source: "app_store" | "play_store",
    expiresAfter: Date,
  ): Promise<StoreSubscriptionRef[]>;
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentRecord>;
  findPaymentIntent(id: string): Promise<PaymentIntentRecord | null>;
  findPaymentIntentByProviderOrderId(providerOrderId: string): Promise<PaymentIntentRecord | null>;
  /** created → pending (the client says it tried to pay). Other statuses are left alone. */
  markPaymentIntentPending(id: string): Promise<PaymentIntentRecord | null>;
  /**
   * Marks a verified payment, once: a paid intent keeps its first payment id and `paidAt`.
   * Returns the intent as stored afterwards, or null when there is no such intent.
   */
  markPaymentIntentPaid(
    id: string,
    providerPaymentId: string,
    paidAt: Date,
  ): Promise<PaymentIntentRecord | null>;
  /** Marks a failed payment unless the intent is already paid. */
  markPaymentIntentFailed(id: string): Promise<PaymentIntentRecord | null>;
  findOrderByIdempotencyKey(key: string): Promise<OrderRecord | null>;

  /**
   * Stores a new code for `phone`. With `limit`, stores nothing and returns when the next
   * send is allowed if the phone already had `limit.max` codes in the window; concurrent
   * sends for one phone are serialized, so they can't overshoot the limit.
   */
  saveOtp(
    phone: string,
    code: string,
    expiresAt: Date,
    limit?: OtpSendLimit,
  ): Promise<SaveOtpResult>;
  /**
   * Checks `code` against the phone's latest code and counts the guess. True at most once,
   * while that code is unexpired and has had fewer than `maxAttempts` guesses.
   */
  consumeOtp(phone: string, code: string, maxAttempts?: number): Promise<boolean>;

  saveRefreshToken(record: RefreshTokenRecord): Promise<void>;
  findRefreshToken(token: string): Promise<RefreshTokenRecord | null>;
  /** Deletes and returns an unexpired token in one step, so a token can be redeemed only once. */
  consumeRefreshToken(token: string): Promise<RefreshTokenRecord | null>;
  deleteRefreshToken(token: string): Promise<void>;
  saveOauthState(record: OauthStateRecord): Promise<void>;
  /** Deletes and returns an unexpired state in one step, so each state works once. */
  consumeOauthState(nonce: string): Promise<OauthStateRecord | null>;

  seedListings(
    listings: ListingRecord[],
    variants: ListingVariantRecord[],
  ): Promise<void>;
  /** Wipe catalog listings/variants (and cascaded cart/tryon rows). Dev/reseed only. */
  clearCatalog(): Promise<void>;
  listListings(input: ListListingsInput): Promise<ListListingsResult>;
  /** Categories of ACTIVE listings with their counts, largest first (ties by name). */
  listListingCategories(): Promise<ListingCategoryCount[]>;
  findListingById(id: string): Promise<ListingRecord | null>;
  findVariantsByListingId(listingId: string): Promise<ListingVariantRecord[]>;
  findVariantById(id: string): Promise<ListingVariantRecord | null>;

  registerSeller(userId: string, shopName: string, sellerType?: SellerRecord["sellerType"]): Promise<SellerRecord>;
  findSellerByUserId(userId: string): Promise<SellerRecord | null>;
  findSellerById(id: string): Promise<SellerRecord | null>;
  listSellersByType(sellerType: NonNullable<SellerRecord["sellerType"]>): Promise<SellerRecord[]>;
  ensureDefaultTailorSeller(shopName: string): Promise<SellerRecord>;
  createSellerListing(
    input: CreateSellerListingInput,
  ): Promise<{ listing: ListingRecord; variant: ListingVariantRecord }>;

  findTryonPreview(
    userId: string,
    listingVariantId: string,
  ): Promise<TryonPreviewRecord | null>;
  findWardrobeTryonPreview(
    userId: string,
    wardrobeItemId: string,
  ): Promise<TryonPreviewRecord | null>;
  upsertTryonPreview(
    data: Omit<TryonPreviewRecord, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ): Promise<TryonPreviewRecord>;

  getOrCreateCart(userId: string): Promise<CartRecord>;
  getCartItems(cartId: string): Promise<CartItemRecord[]>;
  clearCart(cartId: string): Promise<void>;
  addCartItem(input: {
    cartId: string;
    listingVariantId: string;
    coinPriceSnapshot: number;
    quantity: number;
  }): Promise<CartItemRecord>;
  removeCartItem(cartId: string, listingVariantId: string): Promise<void>;

  createOrder(input: CreateOrderInput): Promise<{ order: OrderRecord; items: OrderItemRecord[] }>;
  /**
   * Checkout: creates the order and debits `coinTotal` (SPEND_ORDER) as one atomic step.
   * Throws InsufficientCoinsError without creating anything when the balance is too low.
   * Replaying the same user's idempotency key returns the existing order with `created: false`.
   */
  placeOrder(input: CreateOrderInput): Promise<PlaceOrderResult>;
  /**
   * Rush to Express: debits `costCoins` (SPEND_RUSH, ref "order"/orderId) and switches the
   * order to EXPRESS with `stateEta`, as one atomic step under the user's coin lock. Applies
   * only while the user's order is still in `from` and not already EXPRESS, so a repeat can't
   * charge twice; returns null, changing nothing, otherwise.
   * Throws InsufficientCoinsError, changing nothing, when the balance can't cover the cost.
   */
  rushOrderToExpress(input: RushOrderInput): Promise<RushOrderResult | null>;
  findOrderById(id: string): Promise<OrderRecord | null>;
  listOrdersByUserId(userId: string): Promise<OrderRecord[]>;
  listOrdersByStates(states: readonly OrderState[]): Promise<OrderRecord[]>;
  /**
   * With `options.from`, only updates while the order is still in that state and returns
   * null otherwise, so two concurrent callers can't both apply the same transition.
   */
  updateOrderState(
    orderId: string,
    state: OrderState,
    patch?: Partial<Pick<OrderRecord, "stateEta" | "revealReadyAt">>,
    options?: { from?: OrderState },
  ): Promise<OrderRecord | null>

  listOrderItemsByOrderId(orderId: string): Promise<OrderItemRecord[]>;
  findOrderItemById(id: string): Promise<OrderItemRecord | null>;

  createRenders(
    rows: Array<Omit<RenderRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }>,
  ): Promise<RenderRecord[]>;
  findRenderById(id: string): Promise<RenderRecord | null>;
  findRendersByIds(ids: string[]): Promise<RenderRecord[]>;
  findRendersByOrderId(orderId: string): Promise<RenderRecord[]>;
  /** Unlocked renders still QUEUED or RUNNING (free ones, and paid ones already unlocked). */
  listPendingRenders(): Promise<Array<{ render: RenderRecord; orderId: string }>>;
  updateRender(
    id: string,
    patch: Partial<Pick<RenderRecord, "imageKey" | "unlocked" | "provider" | "status" | "costMicros">>,
  ): Promise<RenderRecord | null>

  findVariantsByIds(ids: string[]): Promise<ListingVariantRecord[]>;
  findListingsByIds(ids: string[]): Promise<ListingRecord[]>;
  findSellersByIds(ids: string[]): Promise<SellerRecord[]>;
  loadDataForVariantIds(
    listingIds: string[],
  ): Promise<{
    variantMap: Map<string, ListingVariantRecord>;
    listingMap: Map<string, ListingRecord>;
    sellerMap: Map<string, SellerRecord>;
  }>;

  recordRevealRating(input: {
    orderId: string;
    userId: string;
    rating: string;
  }): Promise<void>

  recordPushEvent(input: RecordPushEventInput): Promise<PushEventRecord>;
  /**
   * recordPushEvent that also says whether this call inserted the row. A repeat of the same
   * dedupe key returns the existing row with `created: false`, so only one caller sends it.
   */
  recordPushEventIfNew(
    input: RecordPushEventInput,
  ): Promise<{ event: PushEventRecord; created: boolean }>;
  listPushEvents(userId?: string): Promise<PushEventRecord[]>;
  updatePushEvent(
    id: string,
    patch: Partial<Pick<PushEventRecord, "status" | "expoTicketId">>,
  ): Promise<PushEventRecord | null>;
  /** Saves the device's Expo push token for the user and takes it off any other user. */
  setPushToken(userId: string, token: string): Promise<UserRecord | null>;
  /** Clears the user's push token; with `onlyIf`, only while the saved token still equals it. */
  clearPushToken(userId: string, onlyIf?: string): Promise<void>;
  /** Mark a queued push as SENT/FAILED after Expo delivery (optional ticket id). */
  updatePushEventStatus?(
    id: string,
    status: "SENT" | "FAILED",
    expoTicketId?: string | null,
  ): Promise<void>;

  // --- Universe P0: consent / vault ---
  findActiveConsent(
    userId: string,
    scope: ConsentGrantRecord["scope"],
  ): Promise<ConsentGrantRecord | null>;
  grantConsent(input: GrantConsentInput): Promise<ConsentGrantRecord>;
  revokeConsent(
    userId: string,
    scope: ConsentGrantRecord["scope"],
  ): Promise<void>;
  listActiveConsents(userId: string): Promise<ConsentGrantRecord[]>;
  /** Hard-delete all P0 user data (cascade) and the user row. */
  deleteAllUserData(userId: string): Promise<void>;

  // --- Universe P0: ingestion ---
  listIngestionSources(userId: string): Promise<IngestionSourceRecord[]>;
  createIngestionSource(
    input: CreateIngestionSourceInput,
  ): Promise<IngestionSourceRecord>;
  createIngestionDocument(
    input: CreateIngestionDocumentInput,
  ): Promise<IngestionDocumentRecord>;

  // --- Universe P0: vault export / hard delete ---
  /** All ledger entries for a user (across every account). */
  listMoneyLedgerByUser(userId: string): Promise<MoneyLedgerRecord[]>;
  /** Merchant purchases attributed to the user via their receipts. */
  listMerchantPurchasesByUser(userId: string): Promise<MerchantPurchaseRecord[]>;
  deleteReceiptsByUser(userId: string): Promise<void>;
  deleteWarrantiesByUser(userId: string): Promise<void>;
  deleteMerchantPurchasesByUser(userId: string): Promise<void>;

  // --- Universe P0: ingestion (extended B2/B4/B5) ---
  getIngestionSourceById(id: string): Promise<IngestionSourceRecord | null>;
  updateIngestionSourceToken(
    id: string,
    encryptedToken: { data: string } | null,
  ): Promise<void>;
  updateIngestionSourceCursor(id: string, cursor: string): Promise<void>;
  getIngestionDocumentById(id: string): Promise<IngestionDocumentRecord | null>;
  updateIngestionDocumentStatus(
    id: string,
    status: IngestionDocumentRecord["status"],
    matchedPurchaseId?: string | null,
  ): Promise<void>;
  /** Merge/overwrite parsedJson for a document (human correction path). */
  updateIngestionDocumentParsedJson(
    id: string,
    parsedJson: Record<string, unknown>,
  ): Promise<IngestionDocumentRecord | null>;
  /** Patch source status / meta (pause, muted merchants). */
  updateIngestionSource(
    id: string,
    patch: {
      status?: IngestionSourceRecord["status"];
      meta?: Record<string, unknown> | null;
    },
  ): Promise<IngestionSourceRecord | null>;
  /**
   * Consent-center disconnect: clear OAuth token and mark source ERROR so
   * workers stop syncing. Row is retained for audit / metrics.
   */
  disconnectIngestionSource(id: string): Promise<IngestionSourceRecord | null>;
  /** Patch linked merchant purchase fields after a document correction / merge. */
  updateMerchantPurchase(
    id: string,
    patch: Partial<
      Pick<
        MerchantPurchaseRecord,
        | "merchant"
        | "totalMinor"
        | "currency"
        | "status"
        | "deliveryStatus"
        | "etaAt"
        | "trackingCode"
        | "carrier"
        | "deliveredAt"
        | "returnWindowDeadline"
        | "exchangeWindowDeadline"
        | "deliveryAddressNote"
        | "deliveryProofKeys"
        | "assigneeUserId"
      >
    >,
  ): Promise<MerchantPurchaseRecord | null>;
  /** Replace all items for a purchase (used by document correction). */
  replaceMerchantPurchaseItems(
    purchaseId: string,
    items: MerchantPurchaseItemInput[],
  ): Promise<MerchantPurchaseItemRecord[]>;
  /**
   * Move line items to another purchase, preserving item ids (wardrobe/returns
   * refs stay valid). Used by N48 merge/split.
   */
  moveMerchantPurchaseItems(
    itemIds: string[],
    toPurchaseId: string,
  ): Promise<MerchantPurchaseItemRecord[]>;
  /**
   * Repoint ingestion docs, receipts, and return_requests from one purchase
   * to another (merge survivor).
   */
  repointMerchantPurchaseRefs(
    fromPurchaseId: string,
    toPurchaseId: string,
  ): Promise<void>;
  /**
   * Retention purge: delete raw blob metadata while keeping the row + status
   * so metrics still count the document. Clears `rawKey` and strips PII from
   * `parsedJson` (preserves `__userId` when present). Does not flip status to ERROR.
   */
  purgeIngestionDocumentRaw(id: string): Promise<void>;

  // --- Universe P0: money / credits (read) ---
  listMoneyAccounts(
    userId: string,
    opts?: { kind?: MoneyAccountRecord["kind"] },
  ): Promise<MoneyAccountRecord[]>;
  /** Cross-user scan used by money reconciliation (admin + worker-expiry). */
  listAllMoneyAccounts(): Promise<MoneyAccountRecord[]>;
  listMoneyLedger(
    accountId: string,
    userId: string,
  ): Promise<MoneyLedgerRecord[]>;
  /** Heal denormalized balance_cache_minor from ledger truth. */
  fixMoneyAccountCache(
    accountId: string,
    userId: string,
    correctBalance: number,
  ): Promise<void>;

  // --- Universe P1.1: gift-card / store-credit vault (write) ---
  createMoneyAccount(input: {
    userId: string;
    kind: MoneyAccountRecord["kind"];
    merchant: string;
    currency: string;
    balanceCacheMinor: number;
    expiresAt: Date | null;
    status: MoneyAccountRecord["status"];
  }): Promise<MoneyAccountRecord>;
  findMoneyAccount(
    id: string,
    userId: string,
  ): Promise<MoneyAccountRecord | null>;
  /**
   * Patch money account fields (status, expiresAt, merchant). Used by credit
   * merge (close source) and expiry handling.
   */
  updateMoneyAccount(
    id: string,
    userId: string,
    patch: {
      status?: MoneyAccountRecord["status"];
      expiresAt?: Date | null;
      merchant?: string;
    },
  ): Promise<MoneyAccountRecord | null>;
  /**
   * Delete a zero-balance account with no ledger rows (race loser cleanup on
   * idempotent credit.add). No-op / returns false if unsafe to delete.
   */
  deleteOrphanMoneyAccount(id: string, userId: string): Promise<boolean>;
  /**
   * Delete every zero-balance, ledger-empty money account for a user.
   * Returns how many shells were removed (concurrent credit-add GC).
   */
  purgeOrphanMoneyAccounts(userId: string): Promise<number>;
  /** Returns the latest ledger row matching (userId, refId, type), if any. */
  findMoneyLedgerByRef(
    userId: string,
    refId: string,
    type: MoneyLedgerRecord["type"],
  ): Promise<MoneyLedgerRecord | null>;
  /** Serialized, double-spend-safe money ledger write (via @worn/db). */
  postMoneyLedger(input: {
    accountId: string;
    userId: string;
    delta: number;
    type: MoneyLedgerRecord["type"];
    refType?: string;
    refId?: string;
  }): Promise<{ balanceAfter: number }>;

  // --- Universe P1.2: receipts & warranties ---
  createReceipt(input: CreateReceiptInput): Promise<ReceiptRecord>;
  getReceipt(id: string, userId: string): Promise<ReceiptRecord | null>;
  listReceipts(userId: string): Promise<ReceiptRecord[]>;
  updateReceipt(
    id: string,
    userId: string,
    patch: {
      merchant?: string;
      purchasedAt?: Date;
      totalMinor?: number;
      ocrJson?: Record<string, unknown>;
    },
  ): Promise<ReceiptRecord | null>;
  updateReceiptPurchaseId(
    id: string,
    userId: string,
    purchaseId: string | null,
  ): Promise<void>;
  /** Writes a merchant_purchases row + merchant_purchase_items so prices
   * land in the purchase ledger (powers Waste Tracker + Accountant). */
  createMerchantPurchase(
    input: CreateMerchantPurchaseInput,
  ): Promise<{ purchase: MerchantPurchaseRecord; items: MerchantPurchaseItemRecord[] }>;
  /** Idempotency for Play→Closet bridge (orderRef = Play order id). */
  findMerchantPurchaseByOrderRef(
    userId: string,
    orderRef: string,
  ): Promise<MerchantPurchaseRecord | null>;
  createWarranty(input: CreateWarrantyInput): Promise<WarrantyRecord>;
  listWarranties(userId: string): Promise<WarrantyRecord[]>;
  findWarranty(id: string, userId: string): Promise<WarrantyRecord | null>;
  claimWarranty(
    id: string,
    userId: string,
  ): Promise<WarrantyRecord | null>;
  /** W028 — undo claim → ACTIVE again. */
  unclaimWarranty(
    id: string,
    userId: string,
  ): Promise<WarrantyRecord | null>;
  listMerchantPurchases(userId: string): Promise<MerchantPurchaseRecord[]>;
  listMerchantPurchaseItems(
    purchaseId: string,
  ): Promise<MerchantPurchaseItemRecord[]>;
  /** Batch fetch items for many purchases in one call (fixes N+1). */
  listMerchantPurchaseItemsByPurchaseIds(
    purchaseIds: string[],
  ): Promise<Map<string, MerchantPurchaseItemRecord[]>>;

  // --- Universe P2: wardrobe / outfits / wear / waste ---
  listWardrobeItems(userId: string): Promise<WardrobeItemRecord[]>;
  findWardrobeItem(id: string, userId: string): Promise<WardrobeItemRecord | null>;
  createWardrobeItem(input: CreateWardrobeItemInput): Promise<WardrobeItemRecord>;
  updateWardrobeItem(
    id: string,
    userId: string,
    patch: UpdateWardrobeItemInput,
  ): Promise<WardrobeItemRecord | null>;
  deleteWardrobeItem(id: string, userId: string): Promise<boolean>;
  createOutfit(input: CreateOutfitInput): Promise<OutfitRecord>;
  findOutfitById(id: string, userId: string): Promise<OutfitRecord | null>;
  getTodayOutfit(userId: string): Promise<OutfitRecord | null>;
  /** Outfit planned for a specific YYYY-MM-DD calendar day. */
  getOutfitForDate(userId: string, plannedFor: string): Promise<OutfitRecord | null>;
  /** Replace (or create) the outfit slotted for a calendar day. */
  upsertOutfitForDate(input: CreateOutfitInput & { plannedFor: string }): Promise<OutfitRecord>;
  updateOutfit(
    id: string,
    userId: string,
    patch: { itemIds?: string[]; occasion?: OutfitRecord["occasion"]; weatherCtx?: Record<string, unknown> | null },
  ): Promise<OutfitRecord | null>;
  listOutfits(userId: string): Promise<OutfitRecord[]>;
  listOutfitsInRange(userId: string, fromDate: string, toDate: string): Promise<OutfitRecord[]>;
  createWearLog(input: CreateWearLogInput): Promise<WearLogRecord>;
  listWearLogs(userId: string): Promise<WearLogRecord[]>;
  /** U031 — undo wear within window; decrements metrics for affected items. */
  deleteWearLog(id: string, userId: string): Promise<WearLogRecord | null>;
  findWearLog(id: string, userId: string): Promise<WearLogRecord | null>;
  getItemMetrics(userId: string): Promise<ItemMetricRecord[]>;
  findItemMetric(userId: string, wardrobeItemId: string): Promise<ItemMetricRecord | null>;
  upsertItemMetric(input: {
    userId: string;
    wardrobeItemId: string;
    wearCount: number;
    lastWornAt: Date | null;
    costPerWearMinor: number | null;
    status: ItemMetricRecord["status"];
    targetCpwMinor?: number | null;
  }): Promise<ItemMetricRecord>;
  /** Set or clear a cost-per-wear goal on an item metric (creates metric row if needed). */
  setItemCpwGoal(input: {
    userId: string;
    wardrobeItemId: string;
    targetCpwMinor: number | null;
  }): Promise<ItemMetricRecord>;
    createDispositionListing(input: {
     userId: string;
     wardrobeItemId: string;
     mode: string;
     priceMinor?: number | null;
     sellerId?: string | null;
   }): Promise<DispositionListingRecord>;
    listDispositionListings(userId: string): Promise<DispositionListingRecord[]>;

  // --- Universe P3: accountant ---
  listBudgets(userId: string): Promise<BudgetRecord[]>;
  createBudget(input: { userId: string; category: BudgetRecord["category"]; period: BudgetRecord["period"]; limitMinor: number }): Promise<BudgetRecord>;
  findBudget(id: string, userId: string): Promise<BudgetRecord | null>;
  getSpendRollups(userId: string): Promise<SpendRollupRecord[]>;
  upsertSpendRollup(input: { userId: string; period: string; category: string; totalMinor: number }): Promise<SpendRollupRecord>;

  // --- Universe P3: returns ---
  listReturnRequests(userId: string): Promise<ReturnRecord[]>;
  findReturnRequest(id: string, userId: string): Promise<ReturnRecord | null>;
  createReturnRequest(input: {
    userId: string;
    purchaseId?: string | null;
    purchaseItemId?: string | null;
    windowDeadline: Date;
    exchangeDeadline?: Date | null;
    method?: string | null;
    reason?: ReturnRecord["reason"];
    orderedSize?: string | null;
    preferredSize?: string | null;
  }): Promise<ReturnRecord>;
  updateReturnRequest(
    id: string,
    patch: Partial<
      Pick<
        ReturnRecord,
        | "state"
        | "refundMinor"
        | "method"
        | "tracking"
        | "exchangeDeadline"
        | "windowDeadline"
        | "pickupSlotAt"
        | "reason"
        | "orderedSize"
        | "preferredSize"
        | "chaseSnoozeUntil"
        | "chaseEscalated"
        | "invoiceRequestedAt"
        | "invoiceReceiptId"
        | "labelImageKey"
        | "labelUsedAt"
      >
    >,
  ): Promise<ReturnRecord | null>;
  listReturnEvents(returnRequestId: string): Promise<ReturnEventRecord[]>;
  createReturnEvent(input: {
    returnRequestId: string;
    fromState: string | null;
    toState: string;
    actor?: string | null;
  }): Promise<ReturnEventRecord>;

  // --- Merchant purchases lookup for returns ---
  findMerchantPurchaseById(id: string): Promise<MerchantPurchaseRecord | null>;
  findMerchantPurchaseItemById(id: string): Promise<MerchantPurchaseItemRecord | null>;
  updateMerchantPurchaseDelivery(
    id: string,
    userId: string,
    patch: Partial<
      Pick<
        MerchantPurchaseRecord,
        | "deliveryStatus"
        | "etaAt"
        | "trackingCode"
        | "carrier"
        | "deliveredAt"
        | "returnWindowDeadline"
        | "exchangeWindowDeadline"
        | "deliveryAddressNote"
        | "deliveryProofKeys"
        | "assigneeUserId"
      >
    >,
  ): Promise<MerchantPurchaseRecord | null>;
  updateMerchantPurchaseItemDuplicate(
    id: string,
    duplicateWardrobeItemId: string | null,
  ): Promise<MerchantPurchaseItemRecord | null>;

  // --- Universe P4: gift ---
  listRecipients(userId: string): Promise<RecipientRecord[]>;
  findRecipient(id: string, userId: string): Promise<RecipientRecord | null>;
  createRecipient(input: CreateRecipientInput): Promise<RecipientRecord>;
  findRecipientProfile(recipientId: string): Promise<RecipientProfileRecord | null>;
  upsertRecipientProfile(input: UpsertRecipientProfileInput): Promise<RecipientProfileRecord>;
  listGiftOrders(userId: string): Promise<GiftOrderRecord[]>;
  createGiftOrder(input: CreateGiftOrderInput): Promise<GiftOrderRecord>;
  findGiftOrder(id: string, userId: string): Promise<GiftOrderRecord | null>;
  findGiftOrderById(id: string): Promise<GiftOrderRecord | null>;
  createGroupGiftContribution(input: CreateGroupGiftContributionInput): Promise<GroupGiftContributionRecord>;
  listGroupGiftContributions(giftOrderId: string): Promise<GroupGiftContributionRecord[]>;
  sumGroupGiftContributions(giftOrderId: string): Promise<number>;

  // --- Universe P4: fit ---
  listMeasurementProfiles(userId: string): Promise<MeasurementProfileRecord[]>;
  findMeasurementProfile(id: string, userId: string): Promise<MeasurementProfileRecord | null>;
  createMeasurementProfile(input: CreateMeasurementInput): Promise<MeasurementProfileRecord>;
  listCustomizationTemplates(region?: string): Promise<CustomizationTemplateRecord[]>;
  findCustomizationTemplate(id: string): Promise<CustomizationTemplateRecord | null>;
  seedCustomizationTemplates(): Promise<void>;
  createTailoringOrder(input: CreateTailoringOrderInput): Promise<TailoringOrderRecord>;
  findTailoringOrder(id: string, userId: string): Promise<TailoringOrderRecord | null>;
  listTailoringOrders(userId: string): Promise<TailoringOrderRecord[]>;
  updateTailoringOrderState(id: string, state: TailoringOrderRecord["state"]): Promise<TailoringOrderRecord | null>;
  updateTailoringOrderFabric(
    id: string,
    userId: string,
    patch: { fabricRef?: string | null; fabricPhotoKeys?: string[] },
  ): Promise<TailoringOrderRecord | null>;
  createTailoringReview(input: CreateTailoringReviewInput): Promise<TailoringReviewRecord>;
  listTailoringReviews(sellerId: string): Promise<TailoringReviewRecord[]>;

  // --- Universe P4: disposition (extended) ---
  findDispositionListing(id: string, userId: string): Promise<DispositionListingRecord | null>;
  updateDispositionListing(id: string, patch: Partial<Pick<DispositionListingRecord, "status" | "priceMinor">>): Promise<DispositionListingRecord | null>;

  // --- N37: invite-only swap circle ---
  createSwapCircle(input: { name: string; ownerId: string; inviteCode: string }): Promise<SwapCircleRecord>;
  findSwapCircleById(id: string): Promise<SwapCircleRecord | null>;
  findSwapCircleByInviteCode(inviteCode: string): Promise<SwapCircleRecord | null>;
  listSwapCirclesForUser(userId: string): Promise<SwapCircleRecord[]>;
  addSwapCircleMember(input: {
    circleId: string;
    userId: string;
    role: SwapCircleMemberRecord["role"];
  }): Promise<SwapCircleMemberRecord>;
  findSwapCircleMember(circleId: string, userId: string): Promise<SwapCircleMemberRecord | null>;
  listSwapCircleMembers(circleId: string): Promise<SwapCircleMemberRecord[]>;
  createSwapListing(input: {
    circleId: string;
    ownerUserId: string;
    wardrobeItemId: string;
    dispositionListingId?: string | null;
  }): Promise<SwapListingRecord>;
  findSwapListing(id: string, circleId: string): Promise<SwapListingRecord | null>;
  listSwapListings(circleId: string): Promise<SwapListingRecord[]>;
  updateSwapListing(
    id: string,
    patch: Partial<Pick<SwapListingRecord, "status" | "borrowerUserId" | "dispositionListingId">>,
  ): Promise<SwapListingRecord | null>;

  // --- N26: household / shared closet ---
  createHousehold(input: {
    name: string;
    ownerId: string;
    inviteCode: string;
  }): Promise<HouseholdRecord>;
  findHouseholdById(id: string): Promise<HouseholdRecord | null>;
  findHouseholdByInviteCode(inviteCode: string): Promise<HouseholdRecord | null>;
  listHouseholdsForUser(userId: string): Promise<HouseholdRecord[]>;
  addHouseholdMember(input: {
    householdId: string;
    userId: string;
    role: HouseholdMemberRecord["role"];
  }): Promise<HouseholdMemberRecord>;
  findHouseholdMember(
    householdId: string,
    userId: string,
  ): Promise<HouseholdMemberRecord | null>;
  listHouseholdMembers(householdId: string): Promise<HouseholdMemberRecord[]>;
  /** U015 — shared vault ACL settings (view-only default). */
  getHouseholdVaultSettings(
    householdId: string,
    userId: string,
  ): Promise<HouseholdVaultSettingsRecord>;
  upsertHouseholdVaultSettings(input: {
    householdId: string;
    userId: string;
    vaultAccess?: "VIEW" | "SPEND";
    spendCapMinor?: number | null;
    spentMinor?: number;
  }): Promise<HouseholdVaultSettingsRecord>;
  listHouseholdVaultSettings(
    householdId: string,
  ): Promise<HouseholdVaultSettingsRecord[]>;
  /** Find wardrobe item by id only (for household ACL; authz checked by caller). */
  findWardrobeItemById(id: string): Promise<WardrobeItemRecord | null>;
  /** Update wardrobe item by id only (household partner laundry). */
  updateWardrobeItemById(
    id: string,
    patch: UpdateWardrobeItemInput,
  ): Promise<WardrobeItemRecord | null>;

  // --- N27: closet profiles ---
  createClosetProfile(input: {
    ownerUserId: string;
    name: string;
    kind: ClosetProfileRecord["kind"];
    householdId?: string | null;
  }): Promise<ClosetProfileRecord>;
  findClosetProfile(id: string): Promise<ClosetProfileRecord | null>;
  listClosetProfiles(ownerUserId: string): Promise<ClosetProfileRecord[]>;
  updateClosetProfile(
    id: string,
    ownerUserId: string,
    patch: Partial<Pick<ClosetProfileRecord, "name" | "kind" | "householdId">>,
  ): Promise<ClosetProfileRecord | null>;
  deleteClosetProfile(id: string, ownerUserId: string): Promise<boolean>;

  // --- N12 / N13 / N14: recover money long-tail ---
  createBrandPriceWatch(input: {
    userId: string;
    brand: string;
    watchedPriceMinor: number;
    thresholdPct?: number;
  }): Promise<BrandPriceWatchRecord>;
  listBrandPriceWatches(userId: string): Promise<BrandPriceWatchRecord[]>;
  findBrandPriceWatch(id: string, userId: string): Promise<BrandPriceWatchRecord | null>;
  updateBrandPriceWatch(
    id: string,
    userId: string,
    patch: Partial<
      Pick<
        BrandPriceWatchRecord,
        "lastSeenPriceMinor" | "active" | "thresholdPct" | "watchedPriceMinor"
      >
    >,
  ): Promise<BrandPriceWatchRecord | null>;

  createEmiPlan(input: {
    userId: string;
    provider: string;
    merchant?: string | null;
    principalMinor: number;
    remainingMinor: number;
    installmentMinor: number;
    nextDueOn: string;
    currency?: string;
  }): Promise<EmiPlanRecord>;
  listEmiPlans(
    userId: string,
    opts?: { status?: EmiPlanRecord["status"] },
  ): Promise<EmiPlanRecord[]>;
  findEmiPlan(id: string, userId: string): Promise<EmiPlanRecord | null>;
  updateEmiPlan(
    id: string,
    userId: string,
    patch: Partial<Pick<EmiPlanRecord, "remainingMinor" | "nextDueOn" | "status">>,
  ): Promise<EmiPlanRecord | null>;

  createCashbackClaim(input: {
    userId: string;
    source: string;
    merchant?: string | null;
    amountMinor: number;
    currency?: string;
    expiresAt?: Date | null;
    notes?: string | null;
  }): Promise<CashbackClaimRecord>;
  listCashbackClaims(
    userId: string,
    opts?: { status?: CashbackClaimRecord["status"] },
  ): Promise<CashbackClaimRecord[]>;
  findCashbackClaim(id: string, userId: string): Promise<CashbackClaimRecord | null>;
  claimCashbackClaim(id: string, userId: string): Promise<CashbackClaimRecord | null>;

  // --- Cross-cutting: ingestion metrics (B3 coverage) ---
  listIngestionDocuments(): Promise<IngestionDocumentRecord[]>;

  // --- Vault export helpers (per-user full graph) ---
  listIngestionDocumentsByUser(userId: string): Promise<IngestionDocumentRecord[]>;
  listOrderItemsByUser(userId: string): Promise<OrderItemRecord[]>;
  listCartsByUser(userId: string): Promise<CartRecord[]>;
  listCartItemsByUser(userId: string): Promise<CartItemRecord[]>;
  listSellersByUser(userId: string): Promise<SellerRecord[]>;
  listListingsByUser(userId: string): Promise<ListingRecord[]>;
  listListingVariantsByUser(userId: string): Promise<ListingVariantRecord[]>;
  listAvatarsByUser(userId: string): Promise<AvatarRecord[]>;
  listRendersByUser(userId: string): Promise<RenderRecord[]>;
  listTryonPreviewsByUser(userId: string): Promise<TryonPreviewRecord[]>;
  listCoinLedgerByUser(userId: string): Promise<CoinLedgerRecord[]>;
  listIapReceiptsByUser(userId: string): Promise<Array<{ id: string; userId: string; productId: string; coinsGranted: number; createdAt: Date }>>;
  listRecipientProfilesByUser(userId: string): Promise<RecipientProfileRecord[]>;
  listReturnEventsByUser(userId: string): Promise<ReturnEventRecord[]>;

  // --- N21 repair & alteration log ---
  createRepairLog(input: {
    userId: string;
    wardrobeItemId: string;
    costMinor: number;
    repairedOn: string;
    kind?: RepairLogRecord["kind"];
    note?: string | null;
    tailorOrderId?: string | null;
  }): Promise<RepairLogRecord>;
  listRepairLogs(userId: string): Promise<RepairLogRecord[]>;
  listRepairLogsByItem(wardrobeItemId: string, userId: string): Promise<RepairLogRecord[]>;
}

export type WardrobeItemRecord = {
  id: string;
  userId: string;
  source: "MANUAL" | "RECEIPT" | "EMAIL" | "SMS";
  category: string;
  colors: string[];
  brand: string | null;
  costMinor: number;
  imageKeys: string[];
  garmentImageKey: string | null;
  purchaseItemId: string | null;
  laundryStatus: "CLEAN" | "DIRTY" | "IN_LAUNDRY";
  closetStatus: "ACTIVE" | "STORED";
  tags: string[];
  careRules: Record<string, unknown> | null;
  dryCleanTicket: string | null;
  dryCleanPickupOn: string | null;
  /** N25 — borrower name while lent; null when home. */
  lentTo: string | null;
  /** N25 — expected return YYYY-MM-DD. */
  lentDueOn: string | null;
  /** N27 — closet profile id; null = unscoped. */
  profileId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateWardrobeItemInput = {
  userId: string;
  source?: WardrobeItemRecord["source"];
  category: string;
  colors?: string[];
  brand?: string | null;
  costMinor?: number;
  imageKeys?: string[];
  garmentImageKey?: string | null;
  purchaseItemId?: string | null;
  laundryStatus?: WardrobeItemRecord["laundryStatus"];
  closetStatus?: WardrobeItemRecord["closetStatus"];
  tags?: string[];
  careRules?: Record<string, unknown> | null;
  dryCleanTicket?: string | null;
  dryCleanPickupOn?: string | null;
  lentTo?: string | null;
  lentDueOn?: string | null;
  profileId?: string | null;
};

export type UpdateWardrobeItemInput = {
  category?: string;
  colors?: string[];
  brand?: string | null;
  costMinor?: number;
  imageKeys?: string[];
  garmentImageKey?: string | null;
  laundryStatus?: WardrobeItemRecord["laundryStatus"];
  closetStatus?: WardrobeItemRecord["closetStatus"];
  tags?: string[];
  careRules?: Record<string, unknown> | null;
  dryCleanTicket?: string | null;
  dryCleanPickupOn?: string | null;
  lentTo?: string | null;
  lentDueOn?: string | null;
  profileId?: string | null;
};

export type OutfitRecord = {
  id: string;
  userId: string;
  itemIds: string[];
  occasion: "CASUAL" | "WORK" | "FORMAL" | "PARTY" | "SPORT" | "TRAVEL" | null;
  weatherCtx: Record<string, unknown> | null;
  /** YYYY-MM-DD calendar slot; null = unscheduled. */
  plannedFor: string | null;
  generatedAt: Date;
  styleProfileSnapshot: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateOutfitInput = {
  userId: string;
  itemIds: string[];
  occasion?: OutfitRecord["occasion"];
  weatherCtx?: Record<string, unknown> | null;
  styleProfileSnapshot?: Record<string, unknown> | null;
  plannedFor?: string | null;
};

export type WearLogRecord = {
  id: string;
  userId: string;
  wardrobeItemId: string | null;
  outfitId: string | null;
  wornOn: Date;
  imageKey: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateWearLogInput = {
  userId: string;
  wardrobeItemId?: string | null;
  outfitId?: string | null;
  wornOn?: Date;
  imageKey?: string | null;
};

export type ItemMetricRecord = {
  id: string;
  userId: string;
  wardrobeItemId: string;
  wearCount: number;
  lastWornAt: Date | null;
  costPerWearMinor: number | null;
  /** Target cost-per-wear in minor units; null when unset (N41-CPW-GOALS). */
  targetCpwMinor: number | null;
  status: "ACTIVE" | "DORMANT" | "DEAD";
  createdAt: Date;
  updatedAt: Date;
};

export type DispositionListingRecord = {
  id: string;
  userId: string;
  wardrobeItemId: string;
  mode: "SELL" | "DONATE" | "BARTER";
  priceMinor: number | null;
  status: "ACTIVE" | "SOLD" | "DONATED" | "BARTERED" | "CANCELLED";
  sellerId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SwapCircleRecord = {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SwapCircleMemberRecord = {
  id: string;
  circleId: string;
  userId: string;
  role: "OWNER" | "MEMBER";
  createdAt: Date;
  updatedAt: Date;
};

export type SwapListingRecord = {
  id: string;
  circleId: string;
  ownerUserId: string;
  wardrobeItemId: string;
  dispositionListingId: string | null;
  status: "LISTED" | "BORROWED" | "RETURNED" | "CANCELLED";
  borrowerUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type HouseholdRecord = {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  createdAt: Date;
  updatedAt: Date;
};

export type HouseholdMemberRecord = {
  id: string;
  householdId: string;
  userId: string;
  role: "OWNER" | "MEMBER";
  createdAt: Date;
  updatedAt: Date;
};

/** U015 — per-member shared vault ACL + spend tracking. */
export type HouseholdVaultSettingsRecord = {
  householdId: string;
  userId: string;
  vaultAccess: "VIEW" | "SPEND";
  spendCapMinor: number | null;
  spentMinor: number;
  updatedAt: Date;
};

export type ClosetProfileRecord = {
  id: string;
  ownerUserId: string;
  householdId: string | null;
  name: string;
  kind: "SELF" | "PARTNER" | "KID" | "OTHER";
  createdAt: Date;
  updatedAt: Date;
};

export type RecipientRecord = {
  id: string;
  userId: string;
  name: string;
  relationship: "FAMILY" | "FRIEND" | "PARTNER" | "COLLEAGUE" | "OTHER";
  region: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RecipientProfileRecord = {
  id: string;
  recipientId: string;
  sizes: Record<string, string>;
  tasteTags: string[];
  wishlist: WishlistRefRecord[];
  importantDates: Array<{ occasion: string; date: string; label?: string }>;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WishlistRefRecord = {
  listingId?: string | null;
  title: string;
  url?: string | null;
  note?: string | null;
};

export type CreateRecipientInput = {
  userId: string;
  name: string;
  relationship?: RecipientRecord["relationship"];
  region?: string;
  profile?: {
    sizes?: Record<string, string>;
    tasteTags?: string[];
    wishlist?: WishlistRefRecord[];
    importantDates?: Array<{ occasion: string; date: string; label?: string }>;
    notes?: string | null;
  };
};

export type UpsertRecipientProfileInput = {
  recipientId: string;
  sizes?: Record<string, string>;
  tasteTags?: string[];
  wishlist?: WishlistRefRecord[];
  importantDates?: Array<{ occasion: string; date: string; label?: string }>;
  notes?: string | null;
};

export type GiftOrderRecord = {
  id: string;
  userId: string;
  recipientId: string;
  listingId: string | null;
  occasion: "BIRTHDAY" | "ANNIVERSARY" | "FESTIVAL" | "HOUSEWARMING" | "GRADUATION" | "OTHER" | null;
  status: "PLANNED" | "ORDERED" | "DELIVERED" | "CANCELLED";
  affiliateLink: string | null;
  wrapMessage: string | null;
  groupTargetMinor: number | null;
  groupCurrency: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateGiftOrderInput = {
  userId: string;
  recipientId: string;
  listingId?: string | null;
  occasion?: GiftOrderRecord["occasion"];
  affiliateLink?: string | null;
  wrapMessage?: string | null;
  groupTargetMinor?: number | null;
  groupCurrency?: string | null;
};

export type GroupGiftContributionRecord = {
  id: string;
  giftOrderId: string;
  contributorUserId: string | null;
  contributorName: string | null;
  amountMinor: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateGroupGiftContributionInput = {
  giftOrderId: string;
  contributorUserId?: string | null;
  contributorName?: string | null;
  amountMinor: number;
  note?: string | null;
};

export type MeasurementProfileRecord = {
  id: string;
  userId: string;
  region: string;
  unit: "CM" | "IN";
  points: Record<string, number>;
  changeNote?: string | null;
  previousId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateMeasurementInput = {
  userId: string;
  region?: string;
  unit?: "CM" | "IN";
  points: Record<string, number>;
  changeNote?: string | null;
  previousId?: string | null;
};

export type CustomizationTemplateRecord = {
  id: string;
  region: string;
  garmentType: "BLOUSE" | "KURTI" | "SUIT" | "SAREE" | "LEHENGA" | "SHIRT" | "OTHER";
  name: string;
  optionsSchema: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type TailoringOrderRecord = {
  id: string;
  userId: string;
  templateId: string | null;
  measurementProfileId: string | null;
  selections: Record<string, string>;
  fabricRef: string | null;
  fabricPhotoKeys: string[];
  tailorSellerId: string | null;
  measurementSnapshot: Record<string, unknown> | null;
  state: "PENDING" | "CONFIRMED" | "IN_STITCHING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
  expectedPickupOn?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateTailoringOrderInput = {
  userId: string;
  templateId: string;
  measurementProfileId?: string | null;
  selections: Record<string, string>;
  fabricRef?: string | null;
  fabricPhotoKeys?: string[];
  tailorSellerId?: string | null;
  measurementSnapshot?: Record<string, unknown> | null;
  expectedPickupOn?: string | null;
};

export type TailoringReviewRecord = {
  id: string;
  sellerId: string;
  userId: string;
  orderId: string | null;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateTailoringReviewInput = {
  sellerId: string;
  userId: string;
  orderId?: string | null;
  rating: number;
  comment?: string | null;
};

export type BudgetRecord = {
  id: string;
  userId: string;
  category: "APPAREL" | "FOOTWEAR" | "ACCESSORIES" | "BEAUTY" | "GENERAL";
  period: "MONTHLY" | "QUARTERLY";
  limitMinor: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SpendRollupRecord = {
  id: string;
  userId: string;
  period: string;
  category: string;
  totalMinor: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ReturnRecord = {
  id: string;
  userId: string;
  purchaseId: string | null;
  purchaseItemId: string | null;
  windowDeadline: Date;
  exchangeDeadline: Date | null;
  state:
    | "REQUESTED"
    | "INITIATED"
    | "PICKUP_SCHEDULED"
    | "CONFIRMED"
    | "REFUNDED"
    | "EXPIRED"
    | "CANCELLED";
  refundMinor: number | null;
  method: string | null;
  tracking: string | null;
  pickupSlotAt: Date | null;
  /** N17 — size outcome for brand size map. */
  reason:
    | "TOO_SMALL"
    | "TOO_BIG"
    | "SIZE_TOO_SMALL"
    | "SIZE_TOO_BIG"
    | "WRONG_ITEM"
    | "QUALITY"
    | "OTHER"
    | null;
  orderedSize: string | null;
  preferredSize: string | null;
  /** U020 — snooze chase checklist until. */
  chaseSnoozeUntil: Date | null;
  /** U020 — escalate overdue refund chase for ops. */
  chaseEscalated: boolean;
  /** U026 — GST invoice requested at. */
  invoiceRequestedAt: Date | null;
  /** U026 — linked receipt when invoice arrives. */
  invoiceReceiptId: string | null;
  /** U029 — return label image key. */
  labelImageKey: string | null;
  /** U029 — when label marked used. */
  labelUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ReturnEventRecord = {
  id: string;
  returnRequestId: string;
  fromState: string | null;
  toState: string;
  actor: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RepairLogRecord = {
  id: string;
  userId: string;
  wardrobeItemId: string;
  costMinor: number;
  repairedOn: string;
  kind: "REPAIR" | "ALTERATION" | "HEM" | "ZIP" | "OTHER";
  note: string | null;
  tailorOrderId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** N12 — brand price watch for affiliate catalog drops. */
export type BrandPriceWatchRecord = {
  id: string;
  userId: string;
  brand: string;
  watchedPriceMinor: number;
  thresholdPct: number;
  lastSeenPriceMinor: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** N13 — BNPL / EMI installment plan. */
export type EmiPlanRecord = {
  id: string;
  userId: string;
  provider: string;
  merchant: string | null;
  principalMinor: number;
  remainingMinor: number;
  installmentMinor: number;
  nextDueOn: string;
  currency: string;
  status: "ACTIVE" | "PAID" | "DEFAULTED";
  createdAt: Date;
  updatedAt: Date;
};

/** N14 — manual cashback / reward claim (≠ affiliate cashback_events). */
export type CashbackClaimRecord = {
  id: string;
  userId: string;
  source: string;
  merchant: string | null;
  amountMinor: number;
  currency: string;
  expiresAt: Date | null;
  status: "UNCLAIMED" | "CLAIMED" | "EXPIRED";
  notes: string | null;
  claimedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
