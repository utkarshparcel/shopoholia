import { randomUUID } from "node:crypto";
import { streakRewardForDay, AFFILIATE_CASHBACK_COINS } from "@worn/shared";
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
  const cashbackEvents = new Map<string, { id: string; userId: string; listingId: string; platform: string; clickId: string; coinsEarned: number; status: string; createdAt: Date }>();
  const iapReceiptsByEventId = new Map<string, { userId: string; coinsGranted: number }>();

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

    async findUserByGoogleSub(googleSub) {
      for (const user of users.values()) {
        if (user.googleSub === googleSub) return user;
      }
      return null;
    },

    async findUserByEmail(email) {
      const normalized = email.toLowerCase();
      for (const user of users.values()) {
        if (user.email?.toLowerCase() === normalized) return user;
      }
      return null;
    },

    async createUser(phone) {
      const existingId = usersByPhone.get(phone);
      if (existingId) {
        const existing = users.get(existingId)!;
        if (!existing.referralCode) {
          const code = generateReferralCode(existing.id);
          const updated = { ...existing, referralCode: code, updatedAt: now() };
          users.set(existingId, updated);
          return { user: updated, isNew: false };
        }
        return { user: existing, isNew: false };
      }

      const user: UserRecord = {
        id: randomUUID(),
        phone,
        email: null,
        googleSub: null,
        displayName: null,
        avatarStatus: "NONE",
        coinBalanceCache: 0,
        consentFlags: {},
        pushToken: null,
        referralCode: null,
        referredBy: null,
        streakCount: 0,
        lastStreakClaimAt: null,
        styleProfile: null,
        createdAt: now(),
        updatedAt: now(),
      };

      const code = generateReferralCode(user.id);
      user.referralCode = code;

      users.set(user.id, user);
      usersByPhone.set(phone, user.id);
      return { user, isNew: true };
    },

    async findOrCreateGoogleUser({ googleSub, email, displayName }) {
      const byGoogle = await this.findUserByGoogleSub(googleSub);
      if (byGoogle) {
        if (!byGoogle.referralCode) {
          const code = generateReferralCode(byGoogle.id);
          const updated = { ...byGoogle, referralCode: code, updatedAt: now() };
          users.set(byGoogle.id, updated);
          return { user: updated, isNew: false };
        }
        return { user: byGoogle, isNew: false };
      }

      const byEmail = await this.findUserByEmail(email);
      if (byEmail) {
        const linked = {
          ...byEmail,
          googleSub,
          email: email.toLowerCase(),
          displayName: displayName ?? byEmail.displayName,
          updatedAt: now(),
        };
        if (!linked.referralCode) linked.referralCode = generateReferralCode(linked.id);
        users.set(byEmail.id, linked);
        return { user: linked, isNew: false };
      }

      const user: UserRecord = {
        id: randomUUID(),
        phone: null,
        email: email.toLowerCase(),
        googleSub,
        displayName: displayName ?? null,
        avatarStatus: "NONE",
        coinBalanceCache: 0,
        consentFlags: {},
        pushToken: null,
        referralCode: null,
        referredBy: null,
        streakCount: 0,
        lastStreakClaimAt: null,
        styleProfile: null,
        createdAt: now(),
        updatedAt: now(),
      };
      user.referralCode = generateReferralCode(user.id);
      users.set(user.id, user);
      return { user, isNew: true };
    },

    async findUserByReferralCode(code) {
      for (const user of users.values()) {
        if (user.referralCode === code) return user;
      }
      return null;
    },

    async applyReferralCode(userId, referralCode) {
      const user = users.get(userId);
      if (!user || user.referredBy) return null;
      const referrer = await this.findUserByReferralCode(referralCode);
      if (!referrer || referrer.id === userId) return null;
      const updated = { ...user, referredBy: referrer.id, updatedAt: now() };
      users.set(userId, updated);
      return updated;
    },

    async countReferrals(referrerId) {
      let count = 0;
      for (const user of users.values()) {
        if (user.referredBy === referrerId) count++;
      }
      return count;
    },

    async claimStreak(userId) {
      const user = users.get(userId);
      if (!user) throw new Error(`User not found: ${userId}`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const last = user.lastStreakClaimAt ? new Date(user.lastStreakClaimAt) : null;
      if (last) {
        last.setHours(0, 0, 0, 0);
        const diffDays = Math.round((today.getTime() - last.getTime()) / 86_400_000);
        if (diffDays === 0) {
          return { streakCount: user.streakCount, coinsGranted: 0, balanceAfter: user.coinBalanceCache };
        }
      }
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const isConsecutive = last && yesterday.getTime() === last.getTime();
      const newStreak = isConsecutive ? user.streakCount + 1 : 1;
      const coinsGranted = streakRewardForDay(newStreak);
      const { balanceAfter } = await this.grantCoins({
        userId,
        delta: coinsGranted,
        type: "EARN_STREAK",
        refType: "streak",
        refId: `day-${newStreak}`,
      });
      const updated = { ...user, streakCount: newStreak, lastStreakClaimAt: today, coinBalanceCache: balanceAfter, updatedAt: now() };
      users.set(userId, updated);
      return { streakCount: newStreak, coinsGranted, balanceAfter };
    },

    async getStreakStatus(userId) {
      const user = users.get(userId);
      if (!user) return { streakCount: 0, lastClaimedAt: null, todayClaimed: false };
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const last = user.lastStreakClaimAt ? new Date(user.lastStreakClaimAt) : null;
      if (last) last.setHours(0, 0, 0, 0);
      const todayClaimed = last !== null && last.getTime() === today.getTime();
      return { streakCount: user.streakCount, lastClaimedAt: user.lastStreakClaimAt, todayClaimed };
    },

    async saveStyleProfile(userId, profile) {
      const user = users.get(userId);
      if (!user) return;
      users.set(userId, { ...user, styleProfile: profile, updatedAt: now() });
    },

    async recordCashbackEvent(input) {
      cashbackEvents.set(input.clickId, {
        id: randomUUID(),
        userId: input.userId,
        listingId: input.listingId,
        platform: input.platform,
        clickId: input.clickId,
        coinsEarned: 0,
        status: "PENDING",
        createdAt: now(),
      });
    },

    async listCashbackEvents(userId) {
      return Array.from(cashbackEvents.values())
        .filter((e) => e.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async confirmCashback(clickId, status) {
      const event = cashbackEvents.get(clickId);
      if (!event || event.status === "CONFIRMED" || event.status === "REJECTED") return;
      if (status === "CONFIRMED") {
        await this.grantCoins({
          userId: event.userId,
          delta: AFFILIATE_CASHBACK_COINS,
          type: "EARN_CASHBACK",
          refType: "cashback",
          refId: clickId,
        });
        event.coinsEarned = AFFILIATE_CASHBACK_COINS;
        event.status = "CONFIRMED";
      } else {
        event.status = "REJECTED";
      }
      cashbackEvents.set(clickId, event);
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

    async findCoinSpendByRef(userId, refType, refId) {
      for (let i = ledger.length - 1; i >= 0; i--) {
        const entry = ledger[i]!;
        if (
          entry.userId === userId &&
          entry.type === "SPEND_UNLOCK" &&
          entry.refType === refType &&
          entry.refId === refId
        ) {
          return entry;
        }
      }
      return null;
    },

    async countReferralCoinsEarned(referrerId) {
      return ledger
        .filter((entry) => entry.userId === referrerId && entry.type === "EARN_REFERRAL")
        .reduce((sum, entry) => sum + entry.delta, 0);
    },

    async findIapReceipt(eventId) {
      return iapReceiptsByEventId.get(eventId) ?? null;
    },

    async recordIapReceipt(input) {
      iapReceiptsByEventId.set(input.eventId, {
        userId: input.userId,
        coinsGranted: input.coinsGranted,
      });
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

    async clearCatalog() {
      listings.clear();
      variants.clear();
      variantsByListing.clear();
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
        realPrice: input.realPrice ?? null,
        productImageKeys: input.productImageKeys,
        houseModelRenderKey: input.houseModelRenderKey,
        affiliateUrl:
          input.affiliateUrl ?? `https://affiliate.worn.example/items/${listingId}`,
        affiliateLinks: input.affiliateLinks ?? null,
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

    async recordRevealRating(input) {
      const order = orders.get(input.orderId);
      if (!order) return;
      orders.set(input.orderId, {
        ...order,
        stateEta: { ...order.stateEta, rating: input.rating } as any,
        updatedAt: now(),
      });
    },

    async findVariantsByIds(ids) {
      if (ids.length === 0) return [];
      const result: ListingVariantRecord[] = [];
      for (const id of ids) {
        const v = variants.get(id);
        if (v) result.push(v);
      }
      return result;
    },

    async findListingsByIds(ids) {
      if (ids.length === 0) return [];
      const result: ListingRecord[] = [];
      for (const id of ids) {
        const l = listings.get(id);
        if (l) result.push(l);
      }
      return result;
    },

    async findSellersByIds(ids) {
      if (ids.length === 0) return [];
      const result: SellerRecord[] = [];
      for (const id of ids) {
        const s = sellers.get(id);
        if (s) result.push(s);
      }
      return result;
    },

    async loadDataForVariantIds(listingIds) {
      const variantMap = new Map();
      const listingMap = new Map();
      const sellerMap = new Map();

      if (listingIds.length === 0) return { variantMap, listingMap, sellerMap };

      const variants = await this.findVariantsByIds(listingIds);
      const listings = await this.findListingsByIds(listingIds);
      const sellers = await this.findSellersByIds(listingIds);

      for (const variant of variants) {
        variantMap.set(variant.id, variant);
        const listing = listings.find((l) => l.id === variant.listingId);
        if (listing) {
          listingMap.set(listing.id, listing);
          if (listing.sellerId) {
            const seller = sellers.find((s) => s.id === listing.sellerId);
            if (seller) {
              sellerMap.set(seller.id, seller);
            }
          }
        }
      }

      return { variantMap, listingMap, sellerMap };
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
