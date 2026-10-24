import type { DeliveryTier, OrderState, RenderScenario, RenderStatus, StateEta } from "@worn/shared";

export type AvatarStatus = "NONE" | "PROCESSING" | "READY" | "FAILED";

export type UserRecord = {
  id: string;
  phone: string | null;
  email: string | null;
  googleSub: string | null;
  displayName: string | null;
  avatarStatus: AvatarStatus;
  coinBalanceCache: number;
  consentFlags: Record<string, boolean>;
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
  code: string;
  expiresAt: Date;
};

export type RefreshTokenRecord = {
  token: string;
  userId: string;
  expiresAt: Date;
};

export type GrantCoinsInput = {
  userId: string;
  delta: number;
  type: string;
  refType?: string;
  refId?: string;
};

export type ListingStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export type SellerStatus = "ACTIVE" | "SUSPENDED";

export type SellerRecord = {
  id: string;
  userId: string;
  shopName: string;
  status: SellerStatus;
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
  listingVariantId: string;
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
  screen: "order" | "reveal";
  orderId: string;
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

  recordCashbackEvent(input: { userId: string; listingId: string; platform: string; clickId: string }): Promise<void>;
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
  findOrderByIdempotencyKey(key: string): Promise<OrderRecord | null>;

  saveOtp(phone: string, code: string, expiresAt: Date): Promise<void>;
  consumeOtp(phone: string, code: string): Promise<boolean>;

  saveRefreshToken(record: RefreshTokenRecord): Promise<void>;
  findRefreshToken(token: string): Promise<RefreshTokenRecord | null>;
  deleteRefreshToken(token: string): Promise<void>;

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

  registerSeller(userId: string, shopName: string): Promise<SellerRecord>;
  findSellerByUserId(userId: string): Promise<SellerRecord | null>;
  findSellerById(id: string): Promise<SellerRecord | null>;
  createSellerListing(
    input: CreateSellerListingInput,
  ): Promise<{ listing: ListingRecord; variant: ListingVariantRecord }>;

  findTryonPreview(
    userId: string,
    listingVariantId: string,
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
}
