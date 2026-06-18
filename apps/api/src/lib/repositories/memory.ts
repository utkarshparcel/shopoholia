import { randomUUID } from "node:crypto";
import type {
  AvatarRecord,
  CartItemRecord,
  CartRecord,
  CoinLedgerRecord,
  CreateOrderInput,
  CreateSellerListingInput,
  GrantCoinsInput,
  ListingRecord,
  ListingVariantRecord,
  ListCoinTransactionsInput,
  ListListingsInput,
  OrderItemRecord,
  OrderRecord,
  OtpRecord,
  PushEventRecord,
  RefreshTokenRecord,
  RenderRecord,
  Repositories,
  SellerRecord,
  TryonPreviewRecord,
  UserRecord,
} from "./types.js";

function now() {
  return new Date();
}

function appendLedger(
  ledger: CoinLedgerRecord[],
  input: GrantCoinsInput,
  balanceAfter: number,
) {
  const entry: CoinLedgerRecord = {
    id: randomUUID(),
    userId: input.userId,
    delta: input.delta,
    type: input.type,
    refType: input.refType ?? null,
    refId: input.refId ?? null,
    balanceAfter,
    createdAt: now(),
  };
  ledger.push(entry);
  return entry;
}

export function createMemoryRepositories(): Repositories {
  const users = new Map<string, UserRecord>();
  const usersByPhone = new Map<string, string>();
  const avatars = new Map<string, AvatarRecord>();
  const avatarsByUser = new Map<string, string>();
  const ledger: CoinLedgerRecord[] = [];
  const coinLocks = new Map<string, Promise<void>>();
  const otps = new Map<string, OtpRecord>();
  const refreshTokens = new Map<string, RefreshTokenRecord>();
  const listings = new Map<string, ListingRecord>();
  const sellers = new Map<string, SellerRecord>();
  const sellersByUser = new Map<string, string>();
  const variants = new Map<string, ListingVariantRecord>();
  const variantsByListing = new Map<string, string[]>();
  const tryonPreviews = new Map<string, TryonPreviewRecord>();
  const tryonPreviewKey = (userId: string, variantId: string) => `${userId}:${variantId}`;
  const cartsByUser = new Map<string, string>();
  const carts = new Map<string, CartRecord>();
  const cartItems = new Map<string, CartItemRecord>();
  const cartItemsByCart = new Map<string, string[]>();
  const orders = new Map<string, OrderRecord>();
  const ordersByUser = new Map<string, string[]>();
  const ordersByIdempotency = new Map<string, string>();
  const orderItems = new Map<string, OrderItemRecord>();
  const orderItemsByOrder = new Map<string, string[]>();
  const renders = new Map<string, RenderRecord>();
  const rendersByOrderItem = new Map<string, string[]>();
  const pushEvents: PushEventRecord[] = [];

  async function withCoinLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const previous = coinLocks.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    coinLocks.set(userId, previous.then(() => current));
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  return {
    async findUserByPhone(phone) {
      const id = usersByPhone.get(phone);
      return id ? (users.get(id) ?? null) : null;
    },

    async findUserById(id) {
      return users.get(id) ?? null;
    },

    async createUser(phone) {
      const existingId = usersByPhone.get(phone);
      if (existingId) {
        return { user: users.get(existingId)!, isNew: false };
      }

      const user: UserRecord = {
        id: randomUUID(),
        phone,
        displayName: null,
        avatarStatus: "NONE",
        coinBalanceCache: 0,
        consentFlags: {},
        pushToken: null,
        createdAt: now(),
        updatedAt: now(),
      };

      users.set(user.id, user);
      usersByPhone.set(phone, user.id);
      return { user, isNew: true };
    },

    async updateUser(id, patch) {
      const user = users.get(id);
      if (!user) throw new Error(`User not found: ${id}`);
      const updated = { ...user, ...patch, updatedAt: now() };
      users.set(id, updated);
      return updated;
    },

    async findAvatarByUserId(userId) {
      const id = avatarsByUser.get(userId);
      return id ? (avatars.get(id) ?? null) : null;
    },

    async upsertAvatar(data) {
      const existingId = avatarsByUser.get(data.userId);
      const timestamp = now();

      if (existingId) {
        const existing = avatars.get(existingId)!;
        const updated: AvatarRecord = {
          ...existing,
          ...data,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: timestamp,
        };
        avatars.set(existing.id, updated);
        return updated;
      }

      const avatar: AvatarRecord = {
        id: data.id ?? randomUUID(),
        userId: data.userId,
        referenceImageKey: data.referenceImageKey,
        sourceUploadKeys: data.sourceUploadKeys,
        bodyMeta: data.bodyMeta,
        status: data.status,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      avatars.set(avatar.id, avatar);
      avatarsByUser.set(data.userId, avatar.id);
      return avatar;
    },

    async deleteAvatarByUserId(userId) {
      const id = avatarsByUser.get(userId);
      if (!id) return;
      avatars.delete(id);
      avatarsByUser.delete(userId);
      await this.updateUser(userId, { avatarStatus: "NONE" });
    },

    async getCoinBalance(userId) {
      const entries = ledger
        .filter((e) => e.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (entries[0]) return entries[0].balanceAfter;
      return users.get(userId)?.coinBalanceCache ?? 0;
    },

    async grantCoins(input) {
      return withCoinLock(input.userId, async () => {
        const current = await this.getCoinBalance(input.userId);
        const balanceAfter = current + input.delta;
        if (balanceAfter < 0) throw new Error("Insufficient coin balance");

        appendLedger(ledger, input, balanceAfter);
        await this.updateUser(input.userId, { coinBalanceCache: balanceAfter });
        return { balanceAfter };
      });
    },

    async spendCoins(input) {
      return this.grantCoins({ ...input, delta: -Math.abs(input.delta) });
    },

    async listCoinTransactions({ userId, cursor, limit }: ListCoinTransactionsInput) {
      const all = ledger
        .filter((e) => e.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      let start = 0;
      if (cursor) {
        const idx = all.findIndex((e) => e.id === cursor);
        start = idx >= 0 ? idx + 1 : 0;
      }

      const slice = all.slice(start, start + limit);
      const nextCursor =
        start + limit < all.length ? (slice[slice.length - 1]?.id ?? null) : null;

      return { transactions: slice, nextCursor };
    },

    async findOrderByIdempotencyKey(key) {
      const id = ordersByIdempotency.get(key);
      return id ? (orders.get(id) ?? null) : null;
    },

    async saveOtp(phone, code, expiresAt) {
      otps.set(phone, { phone, code, expiresAt });
    },

    async consumeOtp(phone, code) {
      const record = otps.get(phone);
      if (!record) return false;
      if (record.expiresAt < now()) {
        otps.delete(phone);
        return false;
      }
      if (record.code !== code) return false;
      otps.delete(phone);
      return true;
    },

    async saveRefreshToken(record) {
      refreshTokens.set(record.token, record);
    },

    async findRefreshToken(token) {
      const record = refreshTokens.get(token);
      if (!record) return null;
      if (record.expiresAt < now()) {
        refreshTokens.delete(token);
        return null;
      }
      return record;
    },

    async deleteRefreshToken(token) {
      refreshTokens.delete(token);
    },

    async seedListings(seedListings, seedVariants) {
      for (const listing of seedListings) {
        listings.set(listing.id, listing);
      }
      for (const variant of seedVariants) {
        variants.set(variant.id, variant);
        const existing = variantsByListing.get(variant.listingId) ?? [];
        existing.push(variant.id);
        variantsByListing.set(variant.listingId, existing);
      }
    },

    async listListings({ cursor, limit, sellerId }: ListListingsInput) {
      const all = [...listings.values()]
        .filter((l) => l.status === "ACTIVE")
        .filter((l) => (sellerId ? l.sellerId === sellerId : true))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

      let start = 0;
      if (cursor) {
        const idx = all.findIndex((l) => l.id === cursor);
        start = idx >= 0 ? idx + 1 : 0;
      }

      const slice = all.slice(start, start + limit);
      const nextCursor =
        start + limit < all.length ? (slice[slice.length - 1]?.id ?? null) : null;

      return { items: slice, nextCursor };
    },

    async findListingById(id) {
      return listings.get(id) ?? null;
    },

    async findVariantsByListingId(listingId) {
      const ids = variantsByListing.get(listingId) ?? [];
      return ids.map((id) => variants.get(id)!).filter(Boolean);
    },

    async findVariantById(id) {
      return variants.get(id) ?? null;
    },

    async registerSeller(userId, shopName) {
      const existingId = sellersByUser.get(userId);
      if (existingId) {
        return sellers.get(existingId)!;
      }

      const timestamp = now();
      const seller: SellerRecord = {
        id: randomUUID(),
        userId,
        shopName,
        status: "ACTIVE",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      sellers.set(seller.id, seller);
      sellersByUser.set(userId, seller.id);
      return seller;
    },

    async findSellerByUserId(userId) {
      const id = sellersByUser.get(userId);
      return id ? (sellers.get(id) ?? null) : null;
    },

    async findSellerById(id) {
      return sellers.get(id) ?? null;
    },

    async createSellerListing(input: CreateSellerListingInput) {
      const timestamp = now();
      const listingId = randomUUID();
      const variantId = randomUUID();
      const maxSort = [...listings.values()].reduce(
        (max, row) => Math.max(max, row.sortOrder),
        -1,
      );

      const listing: ListingRecord = {
        id: listingId,
        sellerId: input.sellerId,
        title: input.title,
        category: input.category,
        tags: input.tags,
        coinPrice: input.coinPrice,
        productImageKeys: input.productImageKeys,
        houseModelRenderKey: input.houseModelRenderKey,
        affiliateUrl:
          input.affiliateUrl ?? `https://affiliate.worn.example/items/${listingId}`,
        status: "ACTIVE",
        sortOrder: maxSort + 1,
        createdAt: timestamp,
      };

      const variant: ListingVariantRecord = {
        id: variantId,
        listingId,
        size: input.variant.size,
        color: input.variant.color,
        garmentImageKey: input.variant.garmentImageKey,
      };

      listings.set(listingId, listing);
      variants.set(variantId, variant);
      const existing = variantsByListing.get(listingId) ?? [];
      variantsByListing.set(listingId, [...existing, variantId]);

      return { listing, variant };
    },

    async findTryonPreview(userId, listingVariantId) {
      return tryonPreviews.get(tryonPreviewKey(userId, listingVariantId)) ?? null;
    },

    async upsertTryonPreview(data) {
      const key = tryonPreviewKey(data.userId, data.listingVariantId);
      const existing = tryonPreviews.get(key);
      const timestamp = now();
      const record: TryonPreviewRecord = {
        id: data.id ?? existing?.id ?? randomUUID(),
        userId: data.userId,
        listingVariantId: data.listingVariantId,
        imageKey: data.imageKey,
        status: data.status,
        provider: data.provider,
        costMicros: data.costMicros,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      tryonPreviews.set(key, record);
      return record;
    },

    async getOrCreateCart(userId) {
      const existingId = cartsByUser.get(userId);
      if (existingId) {
        return carts.get(existingId)!;
      }
      const cart: CartRecord = {
        id: randomUUID(),
        userId,
        createdAt: now(),
      };
      carts.set(cart.id, cart);
      cartsByUser.set(userId, cart.id);
      cartItemsByCart.set(cart.id, []);
      return cart;
    },

    async getCartItems(cartId) {
      const ids = cartItemsByCart.get(cartId) ?? [];
      return ids.map((id) => cartItems.get(id)!).filter(Boolean);
    },

    async clearCart(cartId) {
      const ids = cartItemsByCart.get(cartId) ?? [];
      for (const id of ids) {
        cartItems.delete(id);
      }
      cartItemsByCart.set(cartId, []);
    },

    async addCartItem({ cartId, listingVariantId, coinPriceSnapshot, quantity }) {
      const ids = cartItemsByCart.get(cartId) ?? [];
      const existing = ids
        .map((id) => cartItems.get(id)!)
        .find((item) => item.listingVariantId === listingVariantId);

      if (existing) {
        const updated: CartItemRecord = {
          ...existing,
          quantity: Math.min(10, existing.quantity + quantity),
        };
        cartItems.set(existing.id, updated);
        return updated;
      }

      const item: CartItemRecord = {
        id: randomUUID(),
        cartId,
        listingVariantId,
        coinPriceSnapshot,
        quantity,
        createdAt: now(),
      };
      cartItems.set(item.id, item);
      cartItemsByCart.set(cartId, [...ids, item.id]);
      return item;
    },

    async removeCartItem(cartId, listingVariantId) {
      const ids = cartItemsByCart.get(cartId) ?? [];
      const remaining: string[] = [];
      for (const id of ids) {
        const item = cartItems.get(id);
        if (!item) continue;
        if (item.listingVariantId === listingVariantId) {
          cartItems.delete(id);
        } else {
          remaining.push(id);
        }
      }
      cartItemsByCart.set(cartId, remaining);
    },

    async createOrder(input: CreateOrderInput) {
      const timestamp = now();
      const order: OrderRecord = {
        id: randomUUID(),
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
      };

      orders.set(order.id, order);
      const userOrders = ordersByUser.get(input.userId) ?? [];
      ordersByUser.set(input.userId, [order.id, ...userOrders]);
      if (input.idempotencyKey) {
        ordersByIdempotency.set(input.idempotencyKey, order.id);
      }

      const items: OrderItemRecord[] = [];
      const itemIds: string[] = [];
      for (const row of input.items) {
        const item: OrderItemRecord = {
          id: randomUUID(),
          orderId: order.id,
          listingVariantId: row.listingVariantId,
          coinPriceSnapshot: row.coinPriceSnapshot,
          quantity: row.quantity,
          createdAt: timestamp,
        };
        orderItems.set(item.id, item);
        itemIds.push(item.id);
        items.push(item);
      }
      orderItemsByOrder.set(order.id, itemIds);

      return { order, items };
    },

    async findOrderById(id) {
      return orders.get(id) ?? null;
    },

    async listOrdersByUserId(userId) {
      const ids = ordersByUser.get(userId) ?? [];
      return ids
        .map((id) => orders.get(id)!)
        .filter(Boolean)
        .sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());
    },

    async updateOrderState(orderId, state, patch) {
      const order = orders.get(orderId);
      if (!order) return null;
      const updated: OrderRecord = {
        ...order,
        ...patch,
        state,
        updatedAt: now(),
      };
      orders.set(orderId, updated);
      return updated;
    },

    async listOrderItemsByOrderId(orderId) {
      const ids = orderItemsByOrder.get(orderId) ?? [];
      return ids.map((id) => orderItems.get(id)!).filter(Boolean);
    },

    async findOrderItemById(id) {
      return orderItems.get(id) ?? null;
    },

    async createRenders(rows) {
      const timestamp = now();
      const created: RenderRecord[] = [];
      for (const row of rows) {
        const record: RenderRecord = {
          id: row.id ?? randomUUID(),
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
        };
        renders.set(record.id, record);
        const itemRenders = rendersByOrderItem.get(record.orderItemId) ?? [];
        rendersByOrderItem.set(record.orderItemId, [...itemRenders, record.id]);
        created.push(record);
      }
      return created;
    },

    async findRenderById(id) {
      return renders.get(id) ?? null;
    },

    async findRendersByIds(ids) {
      return ids.map((id) => renders.get(id)!).filter(Boolean);
    },

    async findRendersByOrderId(orderId) {
      const items = await this.listOrderItemsByOrderId(orderId);
      const all: RenderRecord[] = [];
      for (const item of items) {
        const ids = rendersByOrderItem.get(item.id) ?? [];
        for (const id of ids) {
          const render = renders.get(id);
          if (render) all.push(render);
        }
      }
      return all.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },

    async updateRender(id, patch) {
      const existing = renders.get(id);
      if (!existing) return null;
      const updated: RenderRecord = { ...existing, ...patch, updatedAt: now() };
      renders.set(id, updated);
      return updated;
    },

    async recordPushEvent(input) {
      const event: PushEventRecord = {
        id: randomUUID(),
        ...input,
        createdAt: now(),
      };
      pushEvents.push(event);
      return event;
    },

    async listPushEvents(userId) {
      if (!userId) return [...pushEvents];
      return pushEvents.filter((e) => e.userId === userId);
    },
  };
}
