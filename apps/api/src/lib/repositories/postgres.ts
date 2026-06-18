import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  avatars,
  cartItems,
  carts,
  coinLedger,
  createDb,
  listingVariants,
  listings,
  orderItems,
  orders,
  pushEvents,
  renders,
  sellers,
  tryonPreviews,
  users,
  type Db,
} from "@worn/db";
import type {
  AvatarRecord,
  AvatarStatus,
  CartItemRecord,
  CartRecord,
  CoinLedgerRecord,
  CreateOrderInput,
  CreateSellerListingInput,
  GrantCoinsInput,
  ListingRecord,
  ListingStatus,
  ListingVariantRecord,
  ListCoinTransactionsResult,
  ListListingsResult,
  OrderItemRecord,
  OrderRecord,
  OtpRecord,
  PushEventPayload,
  PushEventRecord,
  RefreshTokenRecord,
  RenderRecord,
  Repositories,
  SellerRecord,
  SellerStatus,
  TryonPreviewRecord,
  TryonPreviewStatus,
  UserRecord,
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

function now() {
  return new Date();
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    phone: row.phone,
    displayName: row.displayName,
    avatarStatus: row.avatarStatus as AvatarStatus,
    coinBalanceCache: row.coinBalanceCache,
    consentFlags: row.consentFlags,
    pushToken: row.pushToken,
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
    productImageKeys: row.productImageKeys,
    houseModelRenderKey: row.houseModelRenderKey ?? "",
    affiliateUrl: row.affiliateUrl,
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
    listingVariantId: row.listingVariantId,
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
    createdAt: row.createdAt,
  };
}

function encodeListingCursor(listing: Pick<ListingRecord, "sortOrder" | "id">): string {
  return `${listing.sortOrder}:${listing.id}`;
}

function decodeListingCursor(cursor: string): { sortOrder: number; id: string } | null {
  const separator = cursor.indexOf(":");
  if (separator === -1) return null;

  const sortOrder = Number(cursor.slice(0, separator));
  const id = cursor.slice(separator + 1);
  if (!Number.isFinite(sortOrder) || !id) return null;

  return { sortOrder, id };
}

export function createPostgresRepositories(db: Db): Repositories {
  const otps = new Map<string, OtpRecord>();
  const refreshTokens = new Map<string, RefreshTokenRecord>();

  const repos: Repositories = {
    async findUserByPhone(phone) {
      const [row] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
      return row ? mapUser(row) : null;
    },

    async findUserById(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row ? mapUser(row) : null;
    },

    async createUser(phone) {
      const existing = await repos.findUserByPhone(phone);
      if (existing) {
        return { user: existing, isNew: false };
      }

      const [row] = await db
        .insert(users)
        .values({
          phone,
          displayName: null,
          avatarStatus: "NONE",
          coinBalanceCache: 0,
          consentFlags: {},
          pushToken: null,
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
          displayName: patch.displayName ?? existing.displayName,
          avatarStatus: patch.avatarStatus ?? existing.avatarStatus,
          coinBalanceCache: patch.coinBalanceCache ?? existing.coinBalanceCache,
          consentFlags: patch.consentFlags ?? existing.consentFlags,
          pushToken: patch.pushToken ?? existing.pushToken,
          updatedAt: now(),
        })
        .where(eq(users.id, id))
        .returning();

      return mapUser(row!);
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
        const [user] = await tx
          .select()
          .from(users)
          .where(eq(users.id, input.userId))
          .for("update");

        if (!user) throw new Error(`User not found: ${input.userId}`);

        const [latest] = await tx
          .select({ balanceAfter: coinLedger.balanceAfter })
          .from(coinLedger)
          .where(eq(coinLedger.userId, input.userId))
          .orderBy(desc(coinLedger.createdAt))
          .limit(1);

        const current = latest?.balanceAfter ?? user.coinBalanceCache;
        const balanceAfter = current + input.delta;
        if (balanceAfter < 0) throw new Error("Insufficient coin balance");

        await tx.insert(coinLedger).values({
          userId: input.userId,
          delta: input.delta,
          type: input.type as typeof coinLedger.$inferInsert.type,
          refType: input.refType ?? null,
          refId: input.refId ?? null,
          balanceAfter,
        });

        await tx
          .update(users)
          .set({ coinBalanceCache: balanceAfter, updatedAt: now() })
          .where(eq(users.id, input.userId));

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
      if (seedListings.length === 0) return;

      await db.insert(listings).values(
        seedListings.map((listing) => ({
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

      if (seedVariants.length > 0) {
        await db.insert(listingVariants).values(
          seedVariants.map((variant) => ({
            id: variant.id,
            listingId: variant.listingId,
            size: variant.size,
            color: variant.color,
            garmentImageKey: variant.garmentImageKey,
          })),
        );
      }
    },

    async listListings({ cursor, limit, sellerId }): Promise<ListListingsResult> {
      const conditions = [eq(listings.status, "ACTIVE")];

      if (sellerId) {
        conditions.push(eq(listings.sellerId, sellerId));
      }

      if (cursor) {
        const decoded = decodeListingCursor(cursor);
        if (decoded) {
          conditions.push(
            sql`(${listings.sortOrder} > ${decoded.sortOrder} OR (${listings.sortOrder} = ${decoded.sortOrder} AND ${listings.id} > ${decoded.id}))`,
          );
        }
      }

      const rows = await db
        .select()
        .from(listings)
        .where(and(...conditions))
        .orderBy(asc(listings.sortOrder), asc(listings.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit).map(mapListing);
      const nextCursor =
        hasMore && items.length > 0
          ? encodeListingCursor(items[items.length - 1]!)
          : null;

      return { items, nextCursor };
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

    async registerSeller(userId, shopName) {
      const existing = await repos.findSellerByUserId(userId);
      if (existing) return existing;

      const [row] = await db
        .insert(sellers)
        .values({
          userId,
          shopName,
          status: "ACTIVE",
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

    async upsertTryonPreview(data) {
      const timestamp = now();
      const [row] = await db
        .insert(tryonPreviews)
        .values({
          id: data.id,
          userId: data.userId,
          listingVariantId: data.listingVariantId,
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
      const timestamp = now();

      return db.transaction(async (tx) => {
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

        const itemRows = await tx
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

    async updateOrderState(orderId, state, patch) {
      const [existing] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!existing) return null;

      const [row] = await db
        .update(orders)
        .set({
          state,
          stateEta: patch?.stateEta ?? existing.stateEta,
          revealReadyAt:
            patch?.revealReadyAt !== undefined ? patch.revealReadyAt : existing.revealReadyAt,
          updatedAt: now(),
        })
        .where(eq(orders.id, orderId))
        .returning();

      return mapOrder(row!);
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

    async recordPushEvent(input) {
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
        .returning();

      return mapPushEvent(row!);
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
  };

  return repos;
}

export function createPostgresRepositoriesFromUrl(connectionString: string): Repositories {
  return createPostgresRepositories(createDb(connectionString));
}
