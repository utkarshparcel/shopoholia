import type { DeliveryTier, OrderState, RenderScenario, RenderStatus, StateEta } from "@worn/shared";

export type AvatarStatus = "NONE" | "PROCESSING" | "READY" | "FAILED";

export type UserRecord = {
  id: string;
  phone: string;
  displayName: string | null;
  avatarStatus: AvatarStatus;
  coinBalanceCache: number;
  consentFlags: Record<string, boolean>;
  pushToken: string | null;
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

export type ListingRecord = {
  id: string;
  sellerId: string | null;
  title: string;
  category: string;
  tags: string[];
  coinPrice: number;
  productImageKeys: string[];
  houseModelRenderKey: string;
  affiliateUrl: string | null;
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
  createdAt: Date;
};

export type ListListingsInput = {
  cursor?: string;
  limit: number;
  sellerId?: string;
};

export type CreateSellerListingInput = {
  sellerId: string;
  title: string;
  category: string;
  tags: string[];
  coinPrice: number;
  productImageKeys: string[];
  houseModelRenderKey: string;
  affiliateUrl: string | null;
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

export interface Repositories {
  findUserByPhone(phone: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  createUser(phone: string): Promise<{ user: UserRecord; isNew: boolean }>;
  updateUser(id: string, patch: Partial<UserRecord>): Promise<UserRecord>;

  findAvatarByUserId(userId: string): Promise<AvatarRecord | null>;
  upsertAvatar(
    data: Omit<AvatarRecord, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ): Promise<AvatarRecord>;
  deleteAvatarByUserId(userId: string): Promise<void>;

  getCoinBalance(userId: string): Promise<number>;
  grantCoins(input: GrantCoinsInput): Promise<{ balanceAfter: number }>;
  spendCoins(input: GrantCoinsInput): Promise<{ balanceAfter: number }>;
  listCoinTransactions(input: ListCoinTransactionsInput): Promise<ListCoinTransactionsResult>;
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
  listListings(input: ListListingsInput): Promise<ListListingsResult>;
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
  findOrderById(id: string): Promise<OrderRecord | null>;
  listOrdersByUserId(userId: string): Promise<OrderRecord[]>;
  updateOrderState(
    orderId: string,
    state: OrderState,
    patch?: Partial<Pick<OrderRecord, "stateEta" | "revealReadyAt">>,
  ): Promise<OrderRecord | null>;

  listOrderItemsByOrderId(orderId: string): Promise<OrderItemRecord[]>;
  findOrderItemById(id: string): Promise<OrderItemRecord | null>;

  createRenders(
    rows: Array<Omit<RenderRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }>,
  ): Promise<RenderRecord[]>;
  findRenderById(id: string): Promise<RenderRecord | null>;
  findRendersByIds(ids: string[]): Promise<RenderRecord[]>;
  findRendersByOrderId(orderId: string): Promise<RenderRecord[]>;
  updateRender(
    id: string,
    patch: Partial<Pick<RenderRecord, "imageKey" | "unlocked" | "provider" | "status" | "costMicros">>,
  ): Promise<RenderRecord | null>;

  recordPushEvent(
    input: Omit<PushEventRecord, "id" | "createdAt">,
  ): Promise<PushEventRecord>;
  listPushEvents(userId?: string): Promise<PushEventRecord[]>;
}
