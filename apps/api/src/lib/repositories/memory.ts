import { randomUUID } from "node:crypto";
import { streakRewardForDay, AFFILIATE_CASHBACK_COINS, buildRichOptions, normalizeWishlist, DEFAULT_TIME_ZONE, splitUserPrefsPatch, compareCashbackClaimsByDeadline, checkHouseholdVaultSpendCap } from "@worn/shared";
import { missingRegionPacks } from "../region-packs.js";
import { InsufficientCoinsError } from "./errors.js";
import { subjectRefFor } from "../privacy-hmac.js";
import { pageInMemory } from "../paging.js";
import { OPEN_RETURN_STATES, ReturnStateConflictError, returnStatesInto } from "../returns/state-machine.js";
import {
  PurchaseMergeSplitError,
  assertItemsSplitable,
  assertMergePlan,
  sumItemsMinor,
} from "../purchase-merge-split.js";
>>>>>>> fix-money
import {
  compareText,
  decodeListingCursor,
  encodeListingCursor,
  matchesStyleKeywords,
  normalizeStyleKeywords,
} from "./listing-feed.js";
import type {
  BudgetRecord,
  CustomizationTemplateRecord,
  DispositionListingRecord,
  GiftOrderRecord,
  GroupGiftContributionRecord,
  ItemMetricRecord,
  MeasurementProfileRecord,
  OutfitRecord,
  RecipientProfileRecord,
  RecipientRecord,
  ReturnEventRecord,
  ReturnRecord,
  RepairLogRecord,
  SpendRollupRecord,
  SwapCircleMemberRecord,
  SwapCircleRecord,
  SwapListingRecord,
  HouseholdMemberRecord,
  HouseholdRecord,
  HouseholdVaultSettingsRecord,
  ClosetProfileRecord,
  TailoringOrderRecord,
  TailoringReviewRecord,
  WardrobeItemRecord,
  WearLogRecord,
  BrandPriceWatchRecord,
  EmiPlanRecord,
  CashbackClaimRecord,
} from "./types.js";
import type {
  AvatarRecord,
  CartItemRecord,
  CartRecord,
  CoinLedgerRecord,
  ConsentGrantRecord,
  ConsentHistoryRecord,
  AuditLogRecord,
  PrivacyRequestRecord,
  InterviewKitRecord,
  SocialPollRecord,
  CreateIngestionDocumentInput,
  CreateIngestionSourceInput,
  CreateOrderInput,
  CreateSellerListingInput,
  GrantConsentInput,
  GrantCoinsInput,
  IngestionDocumentRecord,
  IngestionSourceRecord,
  ListingRecord,
  ListingVariantRecord,
  ListCoinTransactionsInput,
  ListListingsInput,
  MerchantPurchaseItemRecord,
  MerchantPurchaseRecord,
  MoneyAccountRecord,
  MoneyLedgerRecord,
  ReceiptRecord,
  WarrantyRecord,
  CoinPurchaseRecord,
  EntitlementGrantRecord,
  OauthStateRecord,
  OrderItemRecord,
  OrderRecord,
  OtpRecord,
  PaymentIntentRecord,
  PushEventRecord,
  RefreshTokenRecord,
  RenderRecord,
  Repositories,
  RushOrderInput,
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
  // userId -> (listingId -> saved at), in the order the listings were saved.
  const lookbooks = new Map<string, Map<string, Date>>();
  const ledger: CoinLedgerRecord[] = [];
  const coinLocks = new Map<string, Promise<void>>();
  const moneyLocks = new Map<string, Promise<void>>();

  async function withMoneyLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const previous = moneyLocks.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    moneyLocks.set(userId, previous.then(() => current));
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
  // phone -> codes, oldest first
  const otps = new Map<string, OtpRecord[]>();
  const refreshTokens = new Map<string, RefreshTokenRecord>();
  const oauthStates = new Map<string, OauthStateRecord>();
  const listings = new Map<string, ListingRecord>();
  const sellers = new Map<string, SellerRecord>();
  const sellersByUser = new Map<string, string>();
  const variants = new Map<string, ListingVariantRecord>();
  const variantsByListing = new Map<string, string[]>();
  const tryonPreviews = new Map<string, TryonPreviewRecord>();
  const tryonPreviewKey = (userId: string, variantId: string) => `${userId}:v:${variantId}`;
  const wardrobeTryonPreviewKey = (userId: string, wardrobeItemId: string) =>
    `${userId}:w:${wardrobeItemId}`;
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
  const cashbackEvents = new Map<string, { id: string; userId: string; listingId: string | null; platform: string; clickId: string; coinsEarned: number; status: string; createdAt: Date }>();
  const iapReceiptsByEventId = new Map<string, { userId: string; coinsGranted: number }>();
  // `${store}:${transactionId}` -> coin purchase (also listed in iapReceiptsByEventId under that key)
  const coinPurchases = new Map<string, CoinPurchaseRecord>();
  // userId -> `${entitlementId}:${productId}:${source}` -> grant
  const entitlementGrantsByUser = new Map<string, Map<string, EntitlementGrantRecord>>();
  const entitlementEventUsers = new Map<string, string>();
  const paymentIntents = new Map<string, PaymentIntentRecord>();
  const consentGrants = new Map<string, ConsentGrantRecord>();
  const consentRecordsStore: ConsentHistoryRecord[] = [];
  const auditLogStore: AuditLogRecord[] = [];
  const privacyRequestsStore = new Map<string, PrivacyRequestRecord>();
  // `${userId}:${wardrobeItemId}` -> started at
  const wearChallengesStore = new Map<string, { userId: string; wardrobeItemId: string; startedAt: Date }>();
  const interviewKitsStore = new Map<string, InterviewKitRecord>();
  const socialPollsStore = new Map<string, SocialPollRecord>();
  // pollId -> voterHash -> choice
  const socialPollVotesStore = new Map<string, Map<string, string>>();
  const ingestionSources = new Map<string, IngestionSourceRecord>();
  const ingestionDocuments = new Map<string, IngestionDocumentRecord>();
  const ingestionDocumentUser = new Map<string, string>();
  const moneyAccounts = new Map<string, MoneyAccountRecord>();
  const moneyLedger = new Map<string, MoneyLedgerRecord>();
  // (userId, refId, type) -> row: the unique ref index, so lookups don't scan.
  const moneyLedgerByRef = new Map<string, MoneyLedgerRecord>();
  const ledgerRefKey = (userId: string, refId: string, type: string) =>
    `${userId}|${refId}|${type}`;
  /** Appends one ledger row; the caller holds withMoneyLock for the user. */
  function appendMoneyLedger(
    account: MoneyAccountRecord,
    input: {
      delta: number;
      type: MoneyLedgerRecord["type"];
      refType?: string;
      refId?: string;
    },
  ): { balanceAfter: number } {
    if (input.refId && moneyLedgerByRef.has(ledgerRefKey(account.userId, input.refId, input.type))) {
      const err = new Error("Duplicate ledger entry (idempotency violation)");
      (err as unknown as { code: string }).code = "23505";
      throw err;
    }
    const balanceAfter = account.balanceCacheMinor + input.delta;
    if (balanceAfter < 0) throw new Error("Insufficient money balance");
    const entry: MoneyLedgerRecord = {
      id: randomUUID(),
      accountId: account.id,
      userId: account.userId,
      delta: input.delta,
      type: input.type,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      balanceAfter,
      createdAt: now(),
      updatedAt: now(),
    };
    moneyLedger.set(entry.id, entry);
    if (entry.refId) moneyLedgerByRef.set(ledgerRefKey(entry.userId, entry.refId, entry.type), entry);
    moneyAccounts.set(account.id, { ...account, balanceCacheMinor: balanceAfter, updatedAt: now() });
    return { balanceAfter };
  }
  function ledgerSumFor(accountId: string) {
    let sum = 0;
    let entries = 0;
    let last: MoneyLedgerRecord | null = null;
    for (const e of moneyLedger.values()) {
      if (e.accountId !== accountId) continue;
      sum += e.delta;
      entries += 1;
      last = e;
    }
    return { sum, entries, lastBalanceAfter: last?.balanceAfter ?? null };
  }
  const receiptsStore = new Map<string, ReceiptRecord>();
  /** In-flight receipt confirms: the memory twin of the receipt row lock. */
  const receiptConfirms = new Map<string, Promise<{ purchase: MerchantPurchaseRecord } | null>>();
  const warrantiesStore = new Map<string, WarrantyRecord>();
  const merchantPurchasesStore = new Map<string, MerchantPurchaseRecord>();
  const merchantPurchaseItemsStore = new Map<string, MerchantPurchaseItemRecord>();
  const merchantPurchaseItemsByPurchase = new Map<string, string[]>();
  const wardrobeItemsStore = new Map<string, WardrobeItemRecord>();
  const outfitsStore = new Map<string, OutfitRecord>();
  const wearLogsStore = new Map<string, WearLogRecord>();
  const itemMetricsStore = new Map<string, ItemMetricRecord>();
  const dispositionStore = new Map<string, DispositionListingRecord>();
  const swapCirclesStore = new Map<string, SwapCircleRecord>();
  const swapMembersStore = new Map<string, SwapCircleMemberRecord>();
  const swapListingsStore = new Map<string, SwapListingRecord>();
  const householdsStore = new Map<string, HouseholdRecord>();
  const householdMembersStore = new Map<string, HouseholdMemberRecord>();
  const householdVaultSettingsStore = new Map<string, HouseholdVaultSettingsRecord>();
  const closetProfilesStore = new Map<string, ClosetProfileRecord>();
  const brandPriceWatchesStore = new Map<string, BrandPriceWatchRecord>();
  const emiPlansStore = new Map<string, EmiPlanRecord>();
  const emiPaymentKeys = new Map<string, string>();
  const cashbackClaimsStore = new Map<string, CashbackClaimRecord>();
  const budgetsStore = new Map<string, BudgetRecord>();
  const spendRollupsStore = new Map<string, SpendRollupRecord>();
  const returnRequestsStore = new Map<string, ReturnRecord>();
  const returnEventsStore = new Map<string, ReturnEventRecord[]>();
  const returnEventsById = new Map<string, ReturnEventRecord>();
  const repairLogsStore = new Map<string, RepairLogRecord>();
  // P4
  const recipientsStore = new Map<string, RecipientRecord>();
  const recipientProfilesStore = new Map<string, RecipientProfileRecord>();
  const recipientProfileByRecipient = new Map<string, string>();
  const giftOrdersStore = new Map<string, GiftOrderRecord>();
  const groupGiftContributionsStore = new Map<string, GroupGiftContributionRecord>();
  /** `${giftOrderId}:${idempotencyKey}` -> contribution id (mirrors the PG partial unique index). */
  const groupGiftContributionKeys = new Map<string, string>();
  const measurementStore = new Map<string, MeasurementProfileRecord>();
  const templateStore = new Map<string, CustomizationTemplateRecord>();
  const tailoringOrdersStore = new Map<string, TailoringOrderRecord>();
  const tailoringReviewsStore = new Map<string, TailoringReviewRecord>();
  let defaultTailorSellerId: string | null = null;
  function ensureTemplates() {
    const existing = [...templateStore.values()].map((t) => ({ region: t.region, name: t.name }));
    const toAdd = missingRegionPacks(existing);
    for (const pack of toAdd) {
      const rec: CustomizationTemplateRecord = {
        id: randomUUID(),
        region: pack.region,
        garmentType: pack.garmentType,
        name: pack.name,
        optionsSchema: buildRichOptions(pack.optionsSchema) as Record<string, unknown>,
        createdAt: now(),
        updatedAt: now(),
      };
      templateStore.set(rec.id, rec);
    }
  }

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

  const repos: Repositories = {
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
        prefs: {},
        timeZone: DEFAULT_TIME_ZONE,
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
        prefs: {},
        timeZone: DEFAULT_TIME_ZONE,
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

    async saveLookbookItem(userId, listingId) {
      // Mirrors the foreign key in Postgres.
      if (!listings.has(listingId)) throw new Error(`Listing not found: ${listingId}`);
      const saved = lookbooks.get(userId) ?? new Map<string, Date>();
      if (!saved.has(listingId)) saved.set(listingId, now());
      lookbooks.set(userId, saved);
    },

    async removeLookbookItem(userId, listingId) {
      lookbooks.get(userId)?.delete(listingId);
    },

    async listLookbookListings(userId) {
      // Newest insertion first, so the stable sort keeps same-millisecond saves in order.
      const saved = [...(lookbooks.get(userId) ?? [])].reverse();
      saved.sort(([, a], [, b]) => b.getTime() - a.getTime());
      return saved.flatMap(([listingId]) => listings.get(listingId) ?? []);
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
      // prefs are written only through patchUserPrefs.
      const updated = { ...user, ...patch, prefs: user.prefs, updatedAt: now() };
      users.set(id, updated);
      return updated;
    },

    async setUserTimeZone(userId, timeZone) {
      const user = users.get(userId);
      if (!user) return null;
      users.set(userId, { ...user, timeZone, updatedAt: now() });
      return timeZone;
    },

    async getUserPrefs(userId) {
      return users.get(userId)?.prefs ?? null;
    },

    async patchUserPrefs(userId, patch) {
      const user = users.get(userId);
      if (!user) return null;
      const { set, deleteKeys } = splitUserPrefsPatch(patch);
      const prefs: Record<string, unknown> = { ...user.prefs, ...structuredClone(set) };
      for (const key of deleteKeys) delete prefs[key];
      users.set(userId, { ...user, prefs, updatedAt: now() });
      return prefs;
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
      // The ledger is append-only, so the user's last entry is the latest balance.
      // (Sorting by createdAt breaks ties between entries written in the same millisecond.)
      for (let i = ledger.length - 1; i >= 0; i--) {
        const entry = ledger[i]!;
        if (entry.userId === userId) return entry.balanceAfter;
      }
      return users.get(userId)?.coinBalanceCache ?? 0;
    },

    async grantCoins(input) {
      return withCoinLock(input.userId, async () => {
        const current = await this.getCoinBalance(input.userId);
        const balanceAfter = current + input.delta;
        if (balanceAfter < 0) throw new InsufficientCoinsError();

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

    async creditCoinPurchase(input) {
      if (!users.has(input.userId)) throw new Error(`User not found: ${input.userId}`);
      return withCoinLock(input.userId, async () => {
        const key = `${input.store}:${input.transactionId}`;
        // Checked and claimed with no await in between, so one transaction id is credited once.
        const existing = coinPurchases.get(key);
        if (existing) {
          if (existing.userId !== input.userId) {
            return { status: "other_user" as const, purchase: { ...existing } };
          }
          const balanceAfter = await this.getCoinBalance(input.userId);
          return { status: "already_granted" as const, purchase: { ...existing }, balanceAfter };
        }
        const purchase: CoinPurchaseRecord = {
          id: randomUUID(),
          userId: input.userId,
          store: input.store,
          transactionId: input.transactionId,
          productId: input.productId,
          coinsGranted: input.coins,
          environment: input.environment,
          source: input.source,
          refundedAt: null,
          refundedCoins: 0,
          refundShortfall: 0,
          createdAt: now(),
        };
        coinPurchases.set(key, purchase);
        iapReceiptsByEventId.set(key, { userId: input.userId, coinsGranted: input.coins });

        const balanceAfter = (await this.getCoinBalance(input.userId)) + input.coins;
        appendLedger(
          ledger,
          { userId: input.userId, delta: input.coins, type: "IAP_PURCHASE", refType: "iap", refId: purchase.id },
          balanceAfter,
        );
        await this.updateUser(input.userId, { coinBalanceCache: balanceAfter });
        return { status: "granted" as const, purchase: { ...purchase }, balanceAfter };
      });
    },

    async refundCoinPurchase(input) {
      const key = `${input.store}:${input.transactionId}`;
      for (;;) {
        const userId = coinPurchases.get(key)?.userId ?? input.userId;
        if (!userId || (!coinPurchases.has(key) && !input.productId)) return { status: "unknown" as const };
        const result = await withCoinLock(userId, async () => {
          const row = coinPurchases.get(key);
          if (!row) {
            const tombstone: CoinPurchaseRecord = {
              id: randomUUID(),
              userId,
              store: input.store,
              transactionId: input.transactionId,
              productId: input.productId!,
              coinsGranted: 0,
              environment: null,
              source: input.source,
              refundedAt: now(),
              refundedCoins: 0,
              refundShortfall: 0,
              createdAt: now(),
            };
            coinPurchases.set(key, tombstone);
            iapReceiptsByEventId.set(key, { userId, coinsGranted: 0 });
            return { status: "refunded_before_grant" as const, purchase: { ...tombstone } };
          }
          // Granted to someone else while we waited for this lock: retry under theirs.
          if (row.userId !== userId) return null;
          if (row.refundedAt) return { status: "already_refunded" as const, purchase: { ...row } };

          const balance = await this.getCoinBalance(row.userId);
          const debited = Math.min(row.coinsGranted, Math.max(balance, 0));
          const shortfall = row.coinsGranted - debited;
          const balanceAfter = balance - debited;
          if (debited > 0) {
            appendLedger(
              ledger,
              { userId: row.userId, delta: -debited, type: "REFUND", refType: "iap_refund", refId: row.id },
              balanceAfter,
            );
            await this.updateUser(row.userId, { coinBalanceCache: balanceAfter });
          }
          row.refundedAt = now();
          row.refundedCoins = debited;
          row.refundShortfall = shortfall;
          return { status: "refunded" as const, purchase: { ...row }, debited, shortfall, balanceAfter };
        });
        if (result) return result;
      }
    },

    async findCoinPurchase(store, transactionId) {
      const row = coinPurchases.get(`${store}:${transactionId}`);
      return row ? { ...row } : null;
    },

    async listEntitlementGrants(userId) {
      return [...(entitlementGrantsByUser.get(userId)?.values() ?? [])]
        .map((grant) => ({ ...grant }))
        .sort(
          (a, b) =>
            a.productId.localeCompare(b.productId) || a.entitlementId.localeCompare(b.entitlementId),
        );
    },

    async applyEntitlementGrants(userId, grants, eventId) {
      if (eventId) {
        if (entitlementEventUsers.has(eventId)) return { applied: false };
        entitlementEventUsers.set(eventId, userId);
      }
      let byKey = entitlementGrantsByUser.get(userId);
      if (!byKey) {
        byKey = new Map();
        entitlementGrantsByUser.set(userId, byKey);
      }
      for (const grant of grants) {
        const key = `${grant.entitlementId}:${grant.productId}:${grant.source}`;
        const stored = byKey.get(key);
        // A late-arriving older event never overwrites a newer grant.
        if (stored && stored.eventAt > grant.eventAt) continue;
        byKey.set(key, { ...grant, storeRef: grant.storeRef ?? stored?.storeRef ?? null });
      }
      return { applied: true };
    },

    async listStoreSubscriptionGrants(source, expiresAfter) {
      const refs = new Map<string, { userId: string; productId: string; storeRef: string }>();
      for (const [userId, byKey] of entitlementGrantsByUser) {
        for (const grant of byKey.values()) {
          if (grant.source !== source || !grant.storeRef) continue;
          if (grant.expiresAt && grant.expiresAt <= expiresAfter) continue;
          refs.set(`${userId}:${grant.productId}:${grant.storeRef}`, {
            userId,
            productId: grant.productId,
            storeRef: grant.storeRef,
          });
        }
      }
      return [...refs.values()].sort(
        (a, b) => a.userId.localeCompare(b.userId) || a.productId.localeCompare(b.productId),
      );
    },

    async createPaymentIntent(input) {
      const timestamp = now();
      const record: PaymentIntentRecord = {
        id: input.id ?? randomUUID(),
        userId: input.userId,
        provider: input.provider,
        productId: input.productId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        upiIntentUrl: input.upiIntentUrl,
        status: "created",
        providerOrderId: input.providerOrderId,
        providerPaymentId: null,
        paidAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      paymentIntents.set(record.id, record);
      return { ...record };
    },

    async findPaymentIntent(id) {
      const record = paymentIntents.get(id);
      return record ? { ...record } : null;
    },

    async findPaymentIntentByProviderOrderId(providerOrderId) {
      for (const record of paymentIntents.values()) {
        if (record.providerOrderId === providerOrderId) return { ...record };
      }
      return null;
    },

    async markPaymentIntentPending(id) {
      const record = paymentIntents.get(id);
      if (!record) return null;
      if (record.status === "created") {
        record.status = "pending";
        record.updatedAt = now();
      }
      return { ...record };
    },

    async markPaymentIntentPaid(id, providerPaymentId, paidAt) {
      const record = paymentIntents.get(id);
      if (!record) return null;
      if (record.status !== "paid") {
        for (const other of paymentIntents.values()) {
          if (other.id !== id && other.providerPaymentId === providerPaymentId) {
            throw Object.assign(new Error("duplicate provider payment id"), { code: "23505" });
          }
        }
        record.status = "paid";
        record.providerPaymentId = providerPaymentId;
        record.paidAt = paidAt;
        record.updatedAt = now();
      }
      return { ...record };
    },

    async markPaymentIntentFailed(id) {
      const record = paymentIntents.get(id);
      if (!record) return null;
      if (record.status !== "paid") {
        record.status = "failed";
        record.updatedAt = now();
      }
      return { ...record };
    },

    async saveOtp(phone, code, expiresAt, limit) {
      const sentAt = now();
      const windowStart = sentAt.getTime() - (limit?.windowMs ?? 0);
      // Codes outside the send window that can no longer be used are only clutter.
      const codes = (otps.get(phone) ?? []).filter(
        (record) => record.createdAt.getTime() >= windowStart || record.expiresAt >= sentAt,
      );
      if (limit) {
        const recent = codes.filter((record) => record.createdAt.getTime() > windowStart);
        if (recent.length >= limit.max) {
          const oldest = recent[recent.length - limit.max]!.createdAt;
          otps.set(phone, codes);
          return { saved: false, retryAt: new Date(oldest.getTime() + limit.windowMs) };
        }
      }
      codes.push({ phone, code, expiresAt, attempts: 0, consumedAt: null, createdAt: sentAt });
      otps.set(phone, codes);
      return { saved: true };
    },

    async consumeOtp(phone, code, maxAttempts = 5) {
      const record = otps.get(phone)?.at(-1);
      if (!record || record.consumedAt || record.expiresAt <= now()) return false;
      if (record.attempts >= maxAttempts) return false;
      record.attempts += 1;
      if (record.code !== code) return false;
      record.consumedAt = now();
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

    async consumeRefreshToken(token) {
      const record = refreshTokens.get(token);
      refreshTokens.delete(token);
      if (!record || record.expiresAt < now()) return null;
      return record;
    },

    async deleteRefreshToken(token) {
      refreshTokens.delete(token);
    },

    async saveOauthState(record) {
      oauthStates.set(record.nonce, { ...record });
      for (const [nonce, state] of oauthStates) {
        if (state.userId === record.userId && state.expiresAt < now()) oauthStates.delete(nonce);
      }
    },

    async consumeOauthState(nonce) {
      const record = oauthStates.get(nonce);
      oauthStates.delete(nonce);
      if (!record || record.expiresAt < now()) return null;
      return { ...record };
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
      lookbooks.clear();
    },

    async listListings({ cursor, limit, sellerId, category, styleKeywords }: ListListingsInput) {
      const keywords = normalizeStyleKeywords(styleKeywords ?? []);
      const after = cursor ? decodeListingCursor(cursor) : null;
      // Catalog-order cursors keep paging in catalog order (see listing-feed.ts).
      const ranked = keywords.length > 0 && after?.matched !== null;

      const rows = [...listings.values()]
        .filter((l) => l.status === "ACTIVE")
        .filter((l) => (sellerId ? l.sellerId === sellerId : true))
        .filter((l) => (category ? l.category === category : true))
        .map((listing) => ({ listing, matched: ranked && matchesStyleKeywords(listing, keywords) }))
        .sort(
          (a, b) =>
            Number(b.matched) - Number(a.matched) ||
            a.listing.sortOrder - b.listing.sortOrder ||
            compareText(a.listing.id, b.listing.id),
        )
        .filter(({ listing, matched }) => {
          if (!after) return true;
          const afterPosition =
            listing.sortOrder > after.sortOrder ||
            (listing.sortOrder === after.sortOrder && listing.id > after.id);
          if (!ranked) return afterPosition;
          // Every non-matching listing comes after all the matching ones.
          return after.matched ? !matched || afterPosition : !matched && afterPosition;
        });

      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      const nextCursor =
        rows.length > limit && last
          ? encodeListingCursor(last.listing, ranked ? last.matched : null)
          : null;

      return { items: page.map((row) => row.listing), nextCursor };
    },

    async listListingCategories() {
      const counts = new Map<string, number>();
      for (const listing of listings.values()) {
        if (listing.status !== "ACTIVE") continue;
        counts.set(listing.category, (counts.get(listing.category) ?? 0) + 1);
      }
      return [...counts]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count || compareText(a.category, b.category));
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

    async registerSeller(userId, shopName, sellerType) {
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
        sellerType: sellerType ?? "RETAILER",
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

    async listSellersByType(sellerType) {
      return [...sellers.values()].filter((s) => s.sellerType === sellerType);
    },

    async ensureDefaultTailorSeller(shopName) {
      if (defaultTailorSellerId) {
        const existing = sellers.get(defaultTailorSellerId);
        if (existing) return existing;
      }
      const found = [...sellers.values()].find(
        (s) => s.sellerType === "TAILOR" && s.shopName === shopName,
      );
      if (found) {
        defaultTailorSellerId = found.id;
        return found;
      }
      const timestamp = now();
      const seller: SellerRecord = {
        id: randomUUID(),
        userId: randomUUID(),
        shopName,
        status: "ACTIVE",
        sellerType: "TAILOR",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      sellers.set(seller.id, seller);
      defaultTailorSellerId = seller.id;
      return seller;
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

    async findWardrobeTryonPreview(userId, wardrobeItemId) {
      return tryonPreviews.get(wardrobeTryonPreviewKey(userId, wardrobeItemId)) ?? null;
    },

    async upsertTryonPreview(data) {
      const key = data.wardrobeItemId
        ? wardrobeTryonPreviewKey(data.userId, data.wardrobeItemId)
        : tryonPreviewKey(data.userId, data.listingVariantId!);
      const existing = tryonPreviews.get(key);
      const timestamp = now();
      const record: TryonPreviewRecord = {
        id: data.id ?? existing?.id ?? randomUUID(),
        userId: data.userId,
        listingVariantId: data.listingVariantId ?? null,
        wardrobeItemId: data.wardrobeItemId ?? null,
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

    async placeOrder(input: CreateOrderInput) {
      return withCoinLock(input.userId, async () => {
        if (input.idempotencyKey) {
          const existing = await this.findOrderByIdempotencyKey(input.idempotencyKey);
          if (existing) {
            if (existing.userId !== input.userId) {
              throw new Error("Idempotency key already used by another order");
            }
            return {
              order: existing,
              items: await this.listOrderItemsByOrderId(existing.id),
              created: false,
            };
          }
        }

        const balanceAfter = (await this.getCoinBalance(input.userId)) - input.coinTotal;
        if (balanceAfter < 0) throw new InsufficientCoinsError();

        const { order, items } = await this.createOrder(input);
        appendLedger(
          ledger,
          {
            userId: input.userId,
            delta: -input.coinTotal,
            type: "SPEND_ORDER",
            refType: "order",
            refId: order.id,
          },
          balanceAfter,
        );
        await this.updateUser(input.userId, { coinBalanceCache: balanceAfter });
        return { order, items, created: true };
      });
    },

    async rushOrderToExpress(input: RushOrderInput) {
      return withCoinLock(input.userId, async () => {
        const balance = await this.getCoinBalance(input.userId);

        // No awaits from this check until the order is written, so a delivery step
        // can't move the order on in between.
        const order = orders.get(input.orderId);
        if (
          !order ||
          order.userId !== input.userId ||
          order.state !== input.from ||
          order.tier === "EXPRESS"
        ) {
          return null;
        }

        const balanceAfter = balance - input.costCoins;
        if (balanceAfter < 0) throw new InsufficientCoinsError();

        const updated: OrderRecord = {
          ...order,
          tier: "EXPRESS",
          stateEta: input.stateEta,
          updatedAt: now(),
        };
        orders.set(order.id, updated);
        appendLedger(
          ledger,
          {
            userId: input.userId,
            delta: -input.costCoins,
            type: "SPEND_RUSH",
            refType: "order",
            refId: order.id,
          },
          balanceAfter,
        );
        await this.updateUser(input.userId, { coinBalanceCache: balanceAfter });
        return { order: updated, balanceAfter };
      });
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

    async listOrdersByStates(states) {
      return Array.from(orders.values()).filter((order) => states.includes(order.state));
    },

    async updateOrderState(orderId, state, patch, options) {
      const order = orders.get(orderId);
      if (!order) return null;
      if (options?.from && order.state !== options.from) return null;
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

    async listPendingRenders() {
      const pending: Array<{ render: RenderRecord; orderId: string }> = [];
      for (const render of renders.values()) {
        if (!render.unlocked || (render.status !== "QUEUED" && render.status !== "RUNNING")) {
          continue;
        }
        const item = orderItems.get(render.orderItemId);
        if (item) pending.push({ render, orderId: item.orderId });
      }
      return pending;
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
        stateEta: { ...order.stateEta, rating: input.rating } as OrderRecord["stateEta"],
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
      return (await this.recordPushEventIfNew(input)).event;
    },

    async recordPushEventIfNew(input) {
      // Same dedupe-key semantics as the unique index in Postgres: a repeat is a no-op.
      const existing = pushEvents.find((e) => e.dedupeKey === input.dedupeKey);
      if (existing) return { event: existing, created: false };

      const event: PushEventRecord = {
        id: randomUUID(),
        ...input,
        expoTicketId: null,
        createdAt: now(),
      };
      pushEvents.push(event);
      return { event, created: true };
    },

    async listPushEvents(userId) {
      if (!userId) return [...pushEvents];
      return pushEvents.filter((e) => e.userId === userId);
    },

    async updatePushEvent(id, patch) {
      const index = pushEvents.findIndex((e) => e.id === id);
      if (index < 0) return null;
      const updated: PushEventRecord = { ...pushEvents[index]!, ...patch };
      pushEvents[index] = updated;
      return updated;
    },

    async setPushToken(userId, token) {
      const user = users.get(userId);
      if (!user) return null;
      // A device's token belongs to whoever signed in on it last.
      for (const other of users.values()) {
        if (other.id !== userId && other.pushToken === token) {
          users.set(other.id, { ...other, pushToken: null, updatedAt: now() });
        }
      }
      const updated = { ...user, pushToken: token, updatedAt: now() };
      users.set(userId, updated);
      return updated;
    },

    async clearPushToken(userId, onlyIf) {
      const user = users.get(userId);
      if (!user?.pushToken) return;
      if (onlyIf !== undefined && user.pushToken !== onlyIf) return;
      users.set(userId, { ...user, pushToken: null, updatedAt: now() });
    },
    async updatePushEventStatus(id, status, _expoTicketId) {
      const event = pushEvents.find((e) => e.id === id);
      if (event) event.status = status;
    },

    async findActiveConsent(userId, scope) {
      for (const grant of consentGrants.values()) {
        if (grant.userId === userId && grant.scope === scope && !grant.revokedAt) {
          return grant;
        }
      }
      return null;
    },

    async grantConsent(input: GrantConsentInput) {
      for (const existing of consentGrants.values()) {
        if (existing.userId === input.userId && existing.scope === input.scope && !existing.revokedAt) {
          return existing;
        }
      }
      const grant: ConsentGrantRecord = {
        id: randomUUID(),
        userId: input.userId,
        scope: input.scope,
        grantedAt: now(),
        revokedAt: null,
        source: input.source,
        meta: input.meta ?? null,
        noticeVersion: input.noticeVersion ?? null,
      };
      consentGrants.set(grant.id, grant);
      consentRecordsStore.push({
        id: randomUUID(),
        userId: input.userId,
        subjectRef: subjectRefFor(input.userId),
        scope: input.scope,
        action: "GRANT",
        noticeVersion: input.noticeVersion ?? null,
        source: input.source,
        grantId: grant.id,
        createdAt: now(),
      });

      const user = users.get(input.userId);
      if (user) {
        const consentFlags = { ...user.consentFlags, [input.scope]: true };
        users.set(input.userId, { ...user, consentFlags, updatedAt: now() });
      }
      return grant;
    },

    async revokeConsent(userId, scope) {
      for (const [id, grant] of consentGrants) {
        if (grant.userId === userId && grant.scope === scope && !grant.revokedAt) {
          consentGrants.set(id, { ...grant, revokedAt: now() });
          consentRecordsStore.push({
            id: randomUUID(),
            userId,
            subjectRef: subjectRefFor(userId),
            scope,
            action: "WITHDRAW",
            noticeVersion: null,
            source: grant.source,
            grantId: id,
            createdAt: now(),
          });
        }
      }
      const user = users.get(userId);
      if (user) {
        const consentFlags = { ...user.consentFlags, [scope]: false };
        users.set(userId, { ...user, consentFlags, updatedAt: now() });
      }
    },

    async listActiveConsents(userId) {
      return [...consentGrants.values()]
        .filter((g) => g.userId === userId && !g.revokedAt)
        .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime());
    },

    async listConsentRecords(userId, limit = 200) {
      return consentRecordsStore
        .filter((r) => r.userId === userId)
        .reverse()
        .slice(0, Math.min(Math.max(limit, 1), 1000));
    },

    async listUserStorageKeys(userId) {
      const keys = new Set<string>();
      const add = (k: string | null | undefined) => {
        if (typeof k === "string" && k.trim() && !/^[a-z][a-z0-9+.-]*:\/\//i.test(k) && !k.startsWith("data:")) {
          keys.add(k.trim());
        }
      };
      const avatarId = avatarsByUser.get(userId);
      const avatar = avatarId ? avatars.get(avatarId) : undefined;
      if (avatar) {
        add(avatar.referenceImageKey);
        avatar.sourceUploadKeys.forEach(add);
      }
      for (const w of wardrobeItemsStore.values()) {
        if (w.userId !== userId) continue;
        add(w.garmentImageKey);
        w.imageKeys.forEach(add);
      }
      for (const w of wearLogsStore.values()) if (w.userId === userId) add(w.imageKey);
      for (const r of receiptsStore.values()) if (r.userId === userId) add(r.imageKey);
      for (const t of tryonPreviews.values()) if (t.userId === userId) add(t.imageKey);
      for (const r of returnRequestsStore.values()) if (r.userId === userId) add(r.labelImageKey);
      for (const p of merchantPurchasesStore.values()) {
        if (p.userId !== userId) continue;
        p.deliveryProofKeys.forEach(add);
        for (const iid of merchantPurchaseItemsByPurchase.get(p.id) ?? []) {
          add(merchantPurchaseItemsStore.get(iid)?.imageKey);
        }
      }
      for (const t of tailoringOrdersStore.values()) if (t.userId === userId) t.fabricPhotoKeys.forEach(add);
      for (const oid of ordersByUser.get(userId) ?? []) {
        for (const iid of orderItemsByOrder.get(oid) ?? []) {
          for (const rid of rendersByOrderItem.get(iid) ?? []) add(renders.get(rid)?.imageKey);
        }
      }
      for (const d of ingestionDocuments.values()) {
        if (d.rawKey && (d.userId ?? ingestionDocumentUser.get(d.id)) === userId) add(d.rawKey);
      }
      for (const r of privacyRequestsStore.values()) if (r.userId === userId) add(r.resultKey);
      return [...keys];
    },

    async exportUserTables(userId, maxRowsPerTable = 10_000) {
      const cap = Math.min(Math.max(maxRowsPerTable, 1), 50_000);
      const tables: Record<string, Array<Record<string, unknown>>> = {};
      const truncated: string[] = [];
      const put = (name: string, rows: object[]) => {
        if (rows.length > cap) truncated.push(name);
        tables[name] = rows.slice(0, cap).map((r) => ({ ...r }) as Record<string, unknown>);
      };
      const mine = <T extends { userId?: string | null }>(values: Iterable<T>) =>
        [...values].filter((v) => v.userId === userId);
      const user = users.get(userId);
      put("users", user ? [user] : []);
      const avatarId = avatarsByUser.get(userId);
      put("avatars", avatarId && avatars.get(avatarId) ? [avatars.get(avatarId)!] : []);
      put("coin_ledger", ledger.filter((e) => e.userId === userId));
      const orderIds = new Set(ordersByUser.get(userId) ?? []);
      put("orders", [...orderIds].map((id) => orders.get(id)).filter((o) => o !== undefined));
      const itemIds = [...orderIds].flatMap((id) => orderItemsByOrder.get(id) ?? []);
      put("order_items", itemIds.map((id) => orderItems.get(id)).filter((i) => i !== undefined));
      put(
        "renders",
        itemIds.flatMap((id) => rendersByOrderItem.get(id) ?? []).map((id) => renders.get(id)).filter((r) => r !== undefined),
      );
      put("push_events", pushEvents.filter((e) => e.userId === userId));
      put("tryon_previews", mine(tryonPreviews.values()));
      put("consent_grants", mine(consentGrants.values()));
      put(
        "consent_records",
        consentRecordsStore.filter((r) => r.userId === userId).map(({ subjectRef: _s, ...r }) => r),
      );
      put("audit_log", auditLogStore.filter((r) => r.userId === userId));
      put(
        "privacy_requests",
        [...privacyRequestsStore.values()]
          .filter((r) => r.userId === userId)
          .map(({ subjectRef: _s, storageKeys: _k, ...r }) => r),
      );
      put(
        "ingestion_sources",
        [...ingestionSources.values()]
          .filter((s) => (s.userId ?? consentGrants.get(s.consentGrantId)?.userId) === userId)
          .map(({ encryptedToken: _t, ...s }) => s),
      );
      put(
        "ingestion_documents",
        [...ingestionDocuments.values()].filter((d) => (d.userId ?? ingestionDocumentUser.get(d.id)) === userId),
      );
      put("money_accounts", mine(moneyAccounts.values()));
      put("money_ledger", mine(moneyLedger.values()));
      const purchases = mine(merchantPurchasesStore.values());
      put("merchant_purchases", purchases);
      put(
        "merchant_purchase_items",
        purchases
          .flatMap((p) => merchantPurchaseItemsByPurchase.get(p.id) ?? [])
          .map((id) => merchantPurchaseItemsStore.get(id))
          .filter((i) => i !== undefined),
      );
      put("receipts", mine(receiptsStore.values()));
      put("warranties", mine(warrantiesStore.values()));
      put("wardrobe_items", mine(wardrobeItemsStore.values()));
      put("outfits", mine(outfitsStore.values()));
      put("wear_log", mine(wearLogsStore.values()));
      put("item_metrics", mine(itemMetricsStore.values()));
      put("repair_logs", mine(repairLogsStore.values()));
      put("disposition_listings", mine(dispositionStore.values()));
      put("budgets", mine(budgetsStore.values()));
      put("spend_rollups", mine(spendRollupsStore.values()));
      const returns = mine(returnRequestsStore.values());
      put("return_requests", returns);
      put("return_events", returns.flatMap((r) => returnEventsStore.get(r.id) ?? []));
      const recipientRows = mine(recipientsStore.values());
      put("recipients", recipientRows);
      put(
        "recipient_profiles",
        recipientRows
          .map((r) => recipientProfileByRecipient.get(r.id))
          .map((id) => (id ? recipientProfilesStore.get(id) : undefined))
          .filter((p) => p !== undefined),
      );
      put("gift_orders", mine(giftOrdersStore.values()));
      put(
        "group_gift_contributions",
        [...groupGiftContributionsStore.values()].filter((c) => c.contributorUserId === userId),
      );
      put("measurement_profiles", mine(measurementStore.values()));
      put("tailoring_orders", mine(tailoringOrdersStore.values()));
      put("tailoring_reviews", mine(tailoringReviewsStore.values()));
      put("swap_circles", [...swapCirclesStore.values()].filter((c) => c.ownerId === userId));
      put("swap_circle_members", mine(swapMembersStore.values()));
      put("swap_listings", [...swapListingsStore.values()].filter((l) => l.ownerUserId === userId));
      put("closet_profiles", [...closetProfilesStore.values()].filter((p) => p.ownerUserId === userId));
      put("households", [...householdsStore.values()].filter((h) => h.ownerId === userId));
      put("household_members", mine(householdMembersStore.values()));
      put("household_vault_settings", mine(householdVaultSettingsStore.values()));
      put("interview_kits", mine(interviewKitsStore.values()));
      put("wear_challenges", mine(wearChallengesStore.values()));
      const polls = mine(socialPollsStore.values());
      put("social_polls", polls.map(({ tokenHash: _h, ...p }) => p));
      put(
        "social_poll_votes",
        polls.flatMap((p) => [...(socialPollVotesStore.get(p.id)?.values() ?? [])].map((choice) => ({ pollId: p.id, choice }))),
      );
      put("brand_price_watches", mine(brandPriceWatchesStore.values()));
      put("emi_plans", mine(emiPlansStore.values()));
      put("cashback_claims", mine(cashbackClaimsStore.values()));
      put("cashback_events", mine(cashbackEvents.values()));
      return { tables, truncated };
    },

    async appendAuditRecords(rows) {
      for (const r of rows) {
        auditLogStore.push({ id: randomUUID(), userId: r.userId, event: r.event, meta: r.meta, at: r.at });
      }
    },

    async listAuditRecordsByUser(userId, opts) {
      return auditLogStore
        .filter((r) => r.userId === userId && (!opts.before || r.at < opts.before))
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .slice(0, Math.min(Math.max(opts.limit, 1), 500));
    },

    async purgeAuditRecordsBefore(cutoff, limit) {
      let purged = 0;
      for (let i = auditLogStore.length - 1; i >= 0 && purged < limit; i--) {
        if (auditLogStore[i]!.at < cutoff) {
          auditLogStore.splice(i, 1);
          purged++;
        }
      }
      return purged;
    },

    async createPrivacyRequest(input) {
      for (const r of privacyRequestsStore.values()) {
        if (
          r.subjectRef === input.subjectRef &&
          r.kind === input.kind &&
          (r.status === "PENDING" || r.status === "RUNNING")
        ) {
          return { request: r, created: false };
        }
      }
      const request: PrivacyRequestRecord = {
        id: randomUUID(),
        userId: input.userId,
        subjectRef: input.subjectRef,
        kind: input.kind,
        status: "PENDING",
        storageKeys: [],
        steps: {},
        resultKey: null,
        attempts: 0,
        error: null,
        requestedAt: now(),
        completedAt: null,
        updatedAt: now(),
      };
      privacyRequestsStore.set(request.id, request);
      return { request, created: true };
    },

    async getPrivacyRequest(id) {
      return privacyRequestsStore.get(id) ?? null;
    },

    async updatePrivacyRequest(id, patch) {
      const prev = privacyRequestsStore.get(id);
      if (!prev) return null;
      const next = { ...prev, ...patch, updatedAt: now() };
      privacyRequestsStore.set(id, next);
      return next;
    },

    async listExpiredPrivacyExports(cutoff, limit) {
      return [...privacyRequestsStore.values()]
        .filter(
          (r) =>
            r.kind === "EXPORT" && r.status === "DONE" && r.resultKey !== null && r.completedAt !== null && r.completedAt < cutoff,
        )
        .slice(0, limit);
    },

    async deleteAllUserData(userId) {
      // Collect linkage ids before deletions (all user-owned purchases, seller -> listings, etc.)
      const purchaseIds = new Set(
        [...merchantPurchasesStore.values()]
          .filter((p) => p.userId === userId)
          .map((p) => p.id),
      );

      const sellerId = sellersByUser.get(userId);
      const listingIds = new Set<string>();
      if (sellerId) {
        for (const [id, l] of listings) {
          if (l.sellerId === sellerId) listingIds.add(id);
        }
      }

      const orderIds = new Set(ordersByUser.get(userId) ?? []);
      const orderItemIds = new Set<string>();
      for (const oid of orderIds) {
        const ids = orderItemsByOrder.get(oid) ?? [];
        for (const iid of ids) orderItemIds.add(iid);
      }

      const cartId = cartsByUser.get(userId);
      const cartItemIds = new Set<string>();
      if (cartId) {
        const ids = cartItemsByCart.get(cartId) ?? [];
        for (const id of ids) cartItemIds.add(id);
      }

      const recipientIds = new Set(
        [...recipientsStore.values()].filter((r) => r.userId === userId).map((r) => r.id),
      );

      const returnReqIds = new Set(
        [...returnRequestsStore.values()].filter((r) => r.userId === userId).map((r) => r.id),
      );

      // FK-safe order: children before parents, one transaction (synchronous block)
      // 1. return events & requests
      for (const rid of returnReqIds) {
        returnEventsStore.delete(rid);
        // also clean returnEventsById entries for this request
        for (const [eid, ev] of returnEventsById) {
          if (ev.returnRequestId === rid) returnEventsById.delete(eid);
        }
      }
      for (const [id, r] of returnRequestsStore) {
        if (r.userId === userId) returnRequestsStore.delete(id);
      }

      // 2. gift & recipients
      for (const [id, g] of giftOrdersStore) {
        if (g.userId === userId) giftOrdersStore.delete(id);
      }
      // Contributions to the user's gifts go with them (FK cascade); the user's contributions to
      // other people's gifts stay for that total, without the user's name, note or id.
      for (const [id, c] of groupGiftContributionsStore) {
        if (!giftOrdersStore.has(c.giftOrderId)) groupGiftContributionsStore.delete(id);
        else if (c.contributorUserId === userId) {
          groupGiftContributionsStore.set(id, { ...c, contributorUserId: null, contributorName: null, note: null });
        }
      }
      for (const rid of recipientIds) {
        const pid = recipientProfileByRecipient.get(rid);
        if (pid) {
          recipientProfilesStore.delete(pid);
          recipientProfileByRecipient.delete(rid);
        }
      }
      for (const [id, r] of recipientsStore) {
        if (r.userId === userId) recipientsStore.delete(id);
      }

      // 3. fit
      for (const [id, rev] of tailoringReviewsStore) {
        if (rev.userId === userId) tailoringReviewsStore.delete(id);
      }
      for (const [id, t] of tailoringOrdersStore) {
        if (t.userId === userId) tailoringOrdersStore.delete(id);
      }
      for (const [id, m] of measurementStore) {
        if (m.userId === userId) measurementStore.delete(id);
      }

      // 4. wardrobe / outfits / wear / metrics / disposition / swap
      for (const [id, d] of dispositionStore) {
        if (d.userId === userId) dispositionStore.delete(id);
      }
      for (const [id, l] of swapListingsStore) {
        if (l.ownerUserId === userId || l.borrowerUserId === userId) swapListingsStore.delete(id);
      }
      for (const [id, m] of swapMembersStore) {
        if (m.userId === userId) swapMembersStore.delete(id);
      }
      for (const [id, c] of swapCirclesStore) {
        if (c.ownerId === userId) {
          for (const [mid, m] of swapMembersStore) {
            if (m.circleId === id) swapMembersStore.delete(mid);
          }
          for (const [lid, l] of swapListingsStore) {
            if (l.circleId === id) swapListingsStore.delete(lid);
          }
          swapCirclesStore.delete(id);
        }
      }
      for (const [id, p] of closetProfilesStore) {
        if (p.ownerUserId === userId) closetProfilesStore.delete(id);
      }
      for (const [id, w] of brandPriceWatchesStore) {
        if (w.userId === userId) brandPriceWatchesStore.delete(id);
      }
      for (const [id, e] of emiPlansStore) {
        if (e.userId === userId) emiPlansStore.delete(id);
      }
      for (const [id, c] of cashbackClaimsStore) {
        if (c.userId === userId) cashbackClaimsStore.delete(id);
      }
      for (const [id, m] of householdMembersStore) {
        if (m.userId === userId) householdMembersStore.delete(id);
      }
      for (const [id, h] of householdsStore) {
        if (h.ownerId === userId) {
          for (const [mid, m] of householdMembersStore) {
            if (m.householdId === id) householdMembersStore.delete(mid);
          }
          householdsStore.delete(id);
        }
      }
      for (const [key, m] of itemMetricsStore) {
        if (m.userId === userId) itemMetricsStore.delete(key);
      }
      for (const [id, w] of wearLogsStore) {
        if (w.userId === userId) wearLogsStore.delete(id);
      }
      for (const [id, o] of outfitsStore) {
        if (o.userId === userId) outfitsStore.delete(id);
      }
      for (const [id, wi] of wardrobeItemsStore) {
        if (wi.userId === userId) wardrobeItemsStore.delete(id);
      }

      // 5. push, cashback, coins, iap
      for (let i = pushEvents.length - 1; i >= 0; i--) {
        if (pushEvents[i]!.userId === userId) pushEvents.splice(i, 1);
      }
      for (const [clickId, ev] of cashbackEvents) {
        if (ev.userId === userId) cashbackEvents.delete(clickId);
      }
      for (const [eventId, rec] of iapReceiptsByEventId) {
        if (rec.userId === userId) iapReceiptsByEventId.delete(eventId);
      }
      for (const [key, purchase] of coinPurchases) {
        if (purchase.userId === userId) coinPurchases.delete(key);
      }
      entitlementGrantsByUser.delete(userId);
      for (const [eventId, eventUserId] of entitlementEventUsers) {
        if (eventUserId === userId) entitlementEventUsers.delete(eventId);
      }
      for (const [id, intent] of paymentIntents) {
        if (intent.userId === userId) paymentIntents.delete(id);
      }
      for (let i = ledger.length - 1; i >= 0; i--) {
        if (ledger[i]!.userId === userId) ledger.splice(i, 1);
      }
      for (const [key, tp] of tryonPreviews) {
        if (tp.userId === userId) tryonPreviews.delete(key);
      }

      // 6. renders -> orderItems -> orders
      for (const iid of orderItemIds) {
        const rIds = rendersByOrderItem.get(iid) ?? [];
        for (const rid of rIds) renders.delete(rid);
        rendersByOrderItem.delete(iid);
        orderItems.delete(iid);
      }
      for (const oid of orderIds) {
        orderItemsByOrder.delete(oid);
        orders.delete(oid);
      }
      ordersByUser.delete(userId);
      // clean idempotency keys for this user's orders
      for (const [key, oid] of ordersByIdempotency) {
        if (orderIds.has(oid)) ordersByIdempotency.delete(key);
      }

      // 7. carts
      for (const cid of cartItemIds) cartItems.delete(cid);
      if (cartId) {
        cartItemsByCart.delete(cartId);
        carts.delete(cartId);
        cartsByUser.delete(userId);
      }

      // 8. sellers / listings / variants (variants cascade from listings)
      for (const lid of listingIds) {
        const vIds = variantsByListing.get(lid) ?? [];
        for (const vid of vIds) variants.delete(vid);
        variantsByListing.delete(lid);
        listings.delete(lid);
      }
      if (sellerId) {
        sellers.delete(sellerId);
        sellersByUser.delete(userId);
      }

      // 9. avatars
      const avatarId = avatarsByUser.get(userId);
      if (avatarId) {
        avatars.delete(avatarId);
        avatarsByUser.delete(userId);
      }

      // 10. ingestion documents (via user linkage)
      for (const [id, docUserId] of ingestionDocumentUser) {
        if (docUserId === userId) {
          ingestionDocuments.delete(id);
          ingestionDocumentUser.delete(id);
        }
      }
      // also catch docs linked via matchedPurchaseId / rawDocId
      for (const pid of purchaseIds) {
        for (const [id, doc] of ingestionDocuments) {
          if (doc.matchedPurchaseId === pid) {
            ingestionDocuments.delete(id);
            ingestionDocumentUser.delete(id);
          }
        }
        for (const [, p] of merchantPurchasesStore) {
          if (p.id === pid && (p as unknown as { rawDocId?: string }).rawDocId) {
            const rawId = (p as unknown as { rawDocId: string }).rawDocId;
            ingestionDocuments.delete(rawId);
            ingestionDocumentUser.delete(rawId);
          }
        }
      }

      // 11. merchant purchases & items
      for (const pid of purchaseIds) {
        const itemIds = merchantPurchaseItemsByPurchase.get(pid) ?? [];
        for (const iid of itemIds) merchantPurchaseItemsStore.delete(iid);
        merchantPurchaseItemsByPurchase.delete(pid);
        merchantPurchasesStore.delete(pid);
      }

      // 12. warranties & receipts
      for (const [id, w] of warrantiesStore) {
        if (w.userId === userId) warrantiesStore.delete(id);
      }
      for (const [id, r] of receiptsStore) {
        if (r.userId === userId) receiptsStore.delete(id);
      }

      // 13. money
      for (const [id, l] of moneyLedger) {
        if (l.userId === userId) moneyLedger.delete(id);
      }
      for (const [key, l] of moneyLedgerByRef) {
        if (l.userId === userId) moneyLedgerByRef.delete(key);
      }
      for (const [id, a] of moneyAccounts) {
        if (a.userId === userId) moneyAccounts.delete(id);
      }

      // 14. ingestion sources (must be before consent grants)
      for (const [id, d] of ingestionDocuments) {
        if (d.userId === userId) {
          ingestionDocuments.delete(id);
          ingestionDocumentUser.delete(id);
        }
      }
      for (const [id, s] of ingestionSources) {
        const grant = consentGrants.get(s.consentGrantId);
        if (s.userId === userId || grant?.userId === userId) ingestionSources.delete(id);
      }
      for (const [id, g] of consentGrants) {
        if (g.userId !== userId) continue;
        if (!g.revokedAt) {
          consentRecordsStore.push({
            id: randomUUID(),
            userId,
            subjectRef: subjectRefFor(userId),
            scope: g.scope,
            action: "WITHDRAW",
            noticeVersion: null,
            source: "erasure",
            grantId: id,
            createdAt: now(),
          });
        }
        consentGrants.delete(id);
      }
      // Consent history and audit rows stay, pseudonymised (user_id cleared, subject_ref kept).
      for (const r of consentRecordsStore) if (r.userId === userId) r.userId = null;
      for (const r of auditLogStore) if (r.userId === userId) r.userId = null;
      for (const [id, r] of privacyRequestsStore) {
        if (r.userId === userId && r.kind === "EXPORT") privacyRequestsStore.set(id, { ...r, userId: null });
      }
      for (const [key, c] of wearChallengesStore) if (c.userId === userId) wearChallengesStore.delete(key);
      for (const [id, k] of interviewKitsStore) if (k.userId === userId) interviewKitsStore.delete(id);
      for (const [id, p] of socialPollsStore) {
        if (p.userId === userId) {
          socialPollsStore.delete(id);
          socialPollVotesStore.delete(id);
        }
      }
      for (const [key, v] of householdVaultSettingsStore) {
        if (v.userId === userId) householdVaultSettingsStore.delete(key);
      }

      // 15. budgets, spend rollups
      for (const [id, b] of budgetsStore) {
        if (b.userId === userId) budgetsStore.delete(id);
      }
      for (const [id, s] of spendRollupsStore) {
        if (s.userId === userId) spendRollupsStore.delete(id);
      }
      // also handle keyed-by composite keys stored under same map with id vs composite key duplicates
      for (const [key, s] of [...spendRollupsStore]) {
        if ((s as SpendRollupRecord).userId === userId) spendRollupsStore.delete(key);
      }

      // 16. refresh tokens (session revocation on account wipe)
      for (const [token, record] of refreshTokens) {
        if (record.userId === userId) refreshTokens.delete(token);
      }
      for (const [nonce, state] of oauthStates) {
        if (state.userId === userId) oauthStates.delete(nonce);
      }

      // 17. finally user
      const user = users.get(userId);
      if (user) {
        if (user.phone) usersByPhone.delete(user.phone);
      }
      users.delete(userId);
    },

    async listIngestionSources(userId) {
      const result: IngestionSourceRecord[] = [];
      for (const source of ingestionSources.values()) {
        const owner = source.userId ?? consentGrants.get(source.consentGrantId)?.userId;
        if (owner === userId) result.push(source);
      }
      return result.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    },

    async createIngestionSource(input: CreateIngestionSourceInput) {
      const timestamp = now();
      const source: IngestionSourceRecord = {
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
      };
      ingestionSources.set(source.id, source);
      return source;
    },

    async createIngestionDocument(input: CreateIngestionDocumentInput) {
      const timestamp = now();
      const doc: IngestionDocumentRecord = {
        id: randomUUID(),
        userId: input.userId,
        kind: input.kind,
        rawKey: input.rawKey,
        parsedJson: input.parsedJson,
        matchedPurchaseId: null,
        status: "RECEIVED",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      ingestionDocuments.set(doc.id, doc);
      ingestionDocumentUser.set(doc.id, input.userId);
      return doc;
    },

    async getIngestionSourceById(id) {
      return ingestionSources.get(id) ?? null;
    },

    async updateIngestionSourceToken(id, encryptedToken) {
      const source = ingestionSources.get(id);
      if (!source) return;
      ingestionSources.set(id, { ...source, encryptedToken, updatedAt: now() });
    },

    async updateIngestionSourceCursor(id, cursor) {
      const source = ingestionSources.get(id);
      if (!source) return;
      ingestionSources.set(id, {
        ...source,
        cursor,
        lastSyncAt: now(),
        updatedAt: now(),
      });
    },

    async getIngestionDocumentById(id) {
      return ingestionDocuments.get(id) ?? null;
    },

    async updateIngestionDocumentStatus(id, status, matchedPurchaseId) {
      const doc = ingestionDocuments.get(id);
      if (!doc) return;
      ingestionDocuments.set(id, {
        ...doc,
        status,
        matchedPurchaseId: matchedPurchaseId ?? null,
        updatedAt: now(),
      });
    },

    async updateIngestionDocumentParsedJson(id, parsedJson) {
      const doc = ingestionDocuments.get(id);
      if (!doc) return null;
      const updated: IngestionDocumentRecord = {
        ...doc,
        parsedJson,
        updatedAt: now(),
      };
      ingestionDocuments.set(id, updated);
      return updated;
    },

    async updateIngestionSource(id, patch) {
      const source = ingestionSources.get(id);
      if (!source) return null;
      const updated: IngestionSourceRecord = {
        ...source,
        status: patch.status ?? source.status,
        meta: patch.meta !== undefined ? patch.meta : source.meta,
        updatedAt: now(),
      };
      ingestionSources.set(id, updated);
      return updated;
    },

    async disconnectIngestionSource(id) {
      const source = ingestionSources.get(id);
      if (!source) return null;
      const disconnectedAt = now().toISOString();
      const updated: IngestionSourceRecord = {
        ...source,
        status: "ERROR",
        encryptedToken: null,
        meta: {
          ...(source.meta ?? {}),
          disconnectedAt,
          lastError: "Disconnected — reconnect to resume sync",
          lastErrorAt: disconnectedAt,
          errorCode: "DISCONNECTED",
        },
        updatedAt: now(),
      };
      ingestionSources.set(id, updated);
      return updated;
    },
    async disconnectIngestionSourcesByKind(userId, kind) {
      const cleared: Array<{ id: string; encryptedToken: { data: string } | null }> = [];
      for (const source of ingestionSources.values()) {
        const owner = source.userId ?? consentGrants.get(source.consentGrantId)?.userId;
        if (owner !== userId || source.kind !== kind) continue;
        cleared.push({ id: source.id, encryptedToken: source.encryptedToken });
        const disconnectedAt = now().toISOString();
        ingestionSources.set(source.id, {
          ...source,
          status: "ERROR",
          encryptedToken: null,
          meta: {
            ...(source.meta ?? {}),
            disconnectedAt,
            lastError: "Disconnected — reconnect to resume sync",
            lastErrorAt: disconnectedAt,
            errorCode: "DISCONNECTED",
          },
          updatedAt: now(),
        });
      }
      return cleared;
    },
    async updateMerchantPurchase(id, patch) {
      const purchase = merchantPurchasesStore.get(id);
      if (!purchase) return null;
      const updated: MerchantPurchaseRecord = {
        ...purchase,
        merchant: patch.merchant ?? purchase.merchant,
        totalMinor: patch.totalMinor ?? purchase.totalMinor,
        currency: patch.currency ?? purchase.currency,
        status: patch.status ?? purchase.status,
        deliveryStatus: patch.deliveryStatus ?? purchase.deliveryStatus,
        etaAt: patch.etaAt !== undefined ? patch.etaAt : purchase.etaAt,
        trackingCode: patch.trackingCode !== undefined ? patch.trackingCode : purchase.trackingCode,
        carrier: patch.carrier !== undefined ? patch.carrier : purchase.carrier,
        deliveredAt: patch.deliveredAt !== undefined ? patch.deliveredAt : purchase.deliveredAt,
        returnWindowDeadline:
          patch.returnWindowDeadline !== undefined
            ? patch.returnWindowDeadline
            : purchase.returnWindowDeadline,
        exchangeWindowDeadline:
          patch.exchangeWindowDeadline !== undefined
            ? patch.exchangeWindowDeadline
            : purchase.exchangeWindowDeadline,
        deliveryAddressNote:
          patch.deliveryAddressNote !== undefined
            ? patch.deliveryAddressNote
            : purchase.deliveryAddressNote,
        deliveryProofKeys:
          patch.deliveryProofKeys !== undefined
            ? patch.deliveryProofKeys
            : purchase.deliveryProofKeys,
        assigneeUserId:
          patch.assigneeUserId !== undefined
            ? patch.assigneeUserId
            : purchase.assigneeUserId,
        updatedAt: now(),
      };
      merchantPurchasesStore.set(id, updated);
      return updated;
    },

    async replaceMerchantPurchaseItems(purchaseId, items) {
      const existingIds = merchantPurchaseItemsByPurchase.get(purchaseId) ?? [];
      for (const eid of existingIds) merchantPurchaseItemsStore.delete(eid);
      merchantPurchaseItemsByPurchase.set(purchaseId, []);
      const rows: MerchantPurchaseItemRecord[] = items.map((item) => {
        const row: MerchantPurchaseItemRecord = {
          id: randomUUID(),
          purchaseId,
          title: item.title,
          category: item.category ?? null,
          brand: item.brand ?? null,
          priceMinor: item.priceMinor,
          imageKey: item.imageKey ?? null,
          qty: item.qty ?? 1,
          duplicateWardrobeItemId: item.duplicateWardrobeItemId ?? null,
          createdAt: now(),
          updatedAt: now(),
        };
        merchantPurchaseItemsStore.set(row.id, row);
        const list = merchantPurchaseItemsByPurchase.get(purchaseId) ?? [];
        list.push(row.id);
        merchantPurchaseItemsByPurchase.set(purchaseId, list);
        return row;
      });
      return rows;
    },

    async moveMerchantPurchaseItems(itemIds, toPurchaseId) {
      const moved: MerchantPurchaseItemRecord[] = [];
      for (const itemId of itemIds) {
        const row = merchantPurchaseItemsStore.get(itemId);
        if (!row) continue;
        const fromId = row.purchaseId;
        if (fromId === toPurchaseId) {
          moved.push(row);
          continue;
        }
        const fromList = merchantPurchaseItemsByPurchase.get(fromId) ?? [];
        merchantPurchaseItemsByPurchase.set(
          fromId,
          fromList.filter((id) => id !== itemId),
        );
        const updated: MerchantPurchaseItemRecord = {
          ...row,
          purchaseId: toPurchaseId,
          updatedAt: now(),
        };
        merchantPurchaseItemsStore.set(itemId, updated);
        const toList = merchantPurchaseItemsByPurchase.get(toPurchaseId) ?? [];
        toList.push(itemId);
        merchantPurchaseItemsByPurchase.set(toPurchaseId, toList);
        moved.push(updated);
      }
      return moved;
    },

    async repointMerchantPurchaseRefs(fromPurchaseId, toPurchaseId) {
      for (const [id, doc] of ingestionDocuments) {
        if (doc.matchedPurchaseId === fromPurchaseId) {
          ingestionDocuments.set(id, {
            ...doc,
            matchedPurchaseId: toPurchaseId,
            updatedAt: now(),
          });
        }
      }
      for (const [id, receipt] of receiptsStore) {
        if (receipt.purchaseId === fromPurchaseId) {
          receiptsStore.set(id, {
            ...receipt,
            purchaseId: toPurchaseId,
            updatedAt: now(),
          });
        }
      }
      for (const [id, ret] of returnRequestsStore) {
        if (ret.purchaseId === fromPurchaseId) {
          returnRequestsStore.set(id, {
            ...ret,
            purchaseId: toPurchaseId,
            updatedAt: now(),
          });
        }
      }
    },

    async mergeMerchantPurchases(userId, targetPurchaseId, sourcePurchaseId) {
      const target = merchantPurchasesStore.get(targetPurchaseId);
      const source = merchantPurchasesStore.get(sourcePurchaseId);
      if (!target || !source || target.userId !== userId || source.userId !== userId) {
        throw new PurchaseMergeSplitError("NOT_FOUND", "Purchase not found");
      }
      const sourceItemIds = merchantPurchaseItemsByPurchase.get(source.id) ?? [];
      assertMergePlan(target, source, sourceItemIds.length, userId);
      // Mirror return_requests_open_line_uidx: refuse before writing anything (no partial merge).
      const openLines = (purchaseId: string) =>
        new Set(
          [...returnRequestsStore.values()]
            .filter((r) => r.purchaseId === purchaseId && OPEN_RETURN_STATES.includes(r.state as never))
            .map((r) => r.purchaseItemId ?? ""),
        );
      const targetLines = openLines(target.id);
      if ([...openLines(source.id)].some((line) => targetLines.has(line))) {
        throw Object.assign(new Error('duplicate key value violates unique constraint "return_requests_open_line_uidx"'), {
          code: "23505",
        });
      }
      // Mark the source before the first await, as the row locks do in Postgres: a concurrent merge
      // of the same pair (either direction) then sees DUPLICATE and gets CONFLICT.
      merchantPurchasesStore.set(source.id, { ...source, status: "DUPLICATE", totalMinor: 0, updatedAt: new Date() });
      await this.moveMerchantPurchaseItems([...sourceItemIds], target.id);
      await this.repointMerchantPurchaseRefs(source.id, target.id);
      const items = await this.listMerchantPurchaseItems(target.id);
      const purchase = await this.updateMerchantPurchase(target.id, { totalMinor: sumItemsMinor(items) });
      return { purchase: purchase!, items };
    },

    async splitMerchantPurchase(userId, input) {
      const purchase = merchantPurchasesStore.get(input.purchaseId);
      if (!purchase || purchase.userId !== userId) {
        throw new PurchaseMergeSplitError("NOT_FOUND", "Purchase not found");
      }
      const items = await this.listMerchantPurchaseItems(purchase.id);
      const moving = assertItemsSplitable(purchase, items, input.itemIds, userId);
      const remaining = items.filter((it) => !moving.some((m) => m.id === it.id));
      const { purchase: neu } = await this.createMerchantPurchase({
        userId,
        source: purchase.source,
        merchant: input.merchant?.trim() || purchase.merchant,
        orderRef: null,
        purchasedAt: purchase.purchasedAt,
        currency: purchase.currency,
        totalMinor: sumItemsMinor(moving),
        deliveryStatus: purchase.deliveryStatus,
        etaAt: purchase.etaAt,
        trackingCode: null,
        returnWindowDeadline: purchase.returnWindowDeadline,
        exchangeWindowDeadline: purchase.exchangeWindowDeadline,
        items: [],
      });
      await this.moveMerchantPurchaseItems(
        moving.map((m) => m.id),
        neu.id,
      );
      const original = await this.updateMerchantPurchase(purchase.id, { totalMinor: sumItemsMinor(remaining) });
      return {
        original: { purchase: original!, items: await this.listMerchantPurchaseItems(purchase.id) },
        split: { purchase: neu, items: await this.listMerchantPurchaseItems(neu.id) },
      };
    },

    async purgeIngestionDocumentRaw(id) {
      const doc = ingestionDocuments.get(id);
      if (!doc) return;
      const legacyOwner =
        typeof doc.parsedJson.__userId === "string" ? doc.parsedJson.__userId : undefined;
      ingestionDocuments.set(id, {
        ...doc,
        userId: doc.userId ?? legacyOwner ?? ingestionDocumentUser.get(id) ?? null,
        rawKey: "",
        parsedJson: { purged: true, purgedAt: now().toISOString() },
        updatedAt: now(),
      });
    },

    async listIngestionDocumentsForRetention(kind, cutoff, limit) {
      return [...ingestionDocuments.values()]
        .filter((d) => d.kind === kind && d.rawKey !== "" && d.createdAt < cutoff)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, Math.min(Math.max(limit, 1), 1000))
        .map(({ id, kind: k, rawKey, status, createdAt }) => ({ id, kind: k, rawKey, status, createdAt }));
    },

    async listIngestionDocuments() {
      return [...ingestionDocuments.values()].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    },

    async listMoneyAccounts(userId, opts) {
      return [...moneyAccounts.values()]
        .filter(
          (a) => a.userId === userId && (!opts?.kind || a.kind === opts.kind),
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listMoneyAccountsByUsers(userIds) {
      const ids = new Set(userIds);
      return [...moneyAccounts.values()]
        .filter((a) => ids.has(a.userId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async listAllMoneyAccounts(opts) {
      if (!opts) {
        return [...moneyAccounts.values()].sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
      }
      const limit = Math.min(Math.max(opts.limit ?? 500, 1), 1000);
      return [...moneyAccounts.values()]
        .filter((a) => !opts.afterId || a.id > opts.afterId)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, limit);
    },

    async fixMoneyAccountCache(accountId, userId, _correctBalance) {
      const result = await this.reconcileMoneyAccount(accountId, userId, { fix: true });
      if (!result) {
        throw new Error("Money account not found");
      }
    },

    async reconcileMoneyAccount(accountId, userId, opts) {
      return withMoneyLock(userId, async () => {
        const acc = moneyAccounts.get(accountId);
        if (!acc || acc.userId !== userId) return null;
        const { sum, entries, lastBalanceAfter } = ledgerSumFor(accountId);
        const fixed = opts.fix && entries > 0 && acc.balanceCacheMinor !== sum;
        if (fixed) {
          moneyAccounts.set(accountId, { ...acc, balanceCacheMinor: sum, updatedAt: now() });
        }
        return {
          cachedMinor: acc.balanceCacheMinor,
          ledgerSumMinor: sum,
          lastBalanceAfter,
          entries,
          fixed,
        };
      });
    },

    async listMoneyLedger(accountId, userId) {
      return [...moneyLedger.values()]
        .filter((l) => l.userId === userId && l.accountId === accountId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async listMoneyLedgerPage(accountId, userId, page) {
      const rows = [...moneyLedger.values()].filter(
        (l) => l.userId === userId && l.accountId === accountId,
      );
      return pageInMemory(rows, page.limit, page.after, (l) => l.createdAt, (l) => l.id);
    },

    async listMoneyLedgerByUser(userId) {
      return [...moneyLedger.values()]
        .filter((l) => l.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async listMerchantPurchasesByUser(userId) {
      return [...merchantPurchasesStore.values()]
        .filter((p) => p.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async deleteReceiptsByUser(userId) {
      for (const [id, r] of receiptsStore) {
        if (r.userId === userId) receiptsStore.delete(id);
      }
    },

    async deleteWarrantiesByUser(userId) {
      for (const [id, w] of warrantiesStore) {
        if (w.userId === userId) warrantiesStore.delete(id);
      }
    },

    async deleteMerchantPurchasesByUser(userId) {
      for (const [id, p] of merchantPurchasesStore) {
        if (p.userId === userId) merchantPurchasesStore.delete(id);
      }
    },

    async createMoneyAccount(input) {
      const account: MoneyAccountRecord = {
        id: randomUUID(),
        userId: input.userId,
        kind: input.kind,
        merchant: input.merchant,
        currency: input.currency,
        balanceCacheMinor: input.balanceCacheMinor,
        expiresAt: input.expiresAt,
        status: input.status,
        createdAt: now(),
        updatedAt: now(),
      };
      moneyAccounts.set(account.id, account);
      return account;
    },

    async findMoneyAccount(id, userId) {
      const account = moneyAccounts.get(id);
      if (!account || account.userId !== userId) return null;
      return account;
    },

    async updateMoneyAccount(id, userId, patch) {
      const account = moneyAccounts.get(id);
      if (!account || account.userId !== userId) return null;
      const updated: MoneyAccountRecord = {
        ...account,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}),
        ...(patch.merchant !== undefined ? { merchant: patch.merchant } : {}),
        updatedAt: now(),
      };
      moneyAccounts.set(id, updated);
      return updated;
    },

    async deleteOrphanMoneyAccount(id, userId) {
      const account = moneyAccounts.get(id);
      if (!account || account.userId !== userId) return false;
      if (account.balanceCacheMinor !== 0) return false;
      for (const entry of moneyLedger.values()) {
        if (entry.accountId === id) return false;
      }
      moneyAccounts.delete(id);
      return true;
    },

    async purgeOrphanMoneyAccounts(userId) {
      let removed = 0;
      for (const account of [...moneyAccounts.values()]) {
        if (account.userId !== userId) continue;
        if (await this.deleteOrphanMoneyAccount(account.id, userId)) {
          removed += 1;
        }
      }
      return removed;
    },

    async findMoneyLedgerByRef(userId, refId, type) {
      return moneyLedgerByRef.get(ledgerRefKey(userId, refId, type)) ?? null;
    },
    async listMoneyLedgerByRefs(userId, refIds, type) {
      return refIds
        .map((refId) => moneyLedgerByRef.get(ledgerRefKey(userId, refId, type)))
        .filter((l): l is MoneyLedgerRecord => Boolean(l));
    },

    async postMoneyLedger(input) {
      return withMoneyLock(input.userId, async () => {
        const account = moneyAccounts.get(input.accountId);
        if (!account) throw new Error("Money account not found");
        if (account.userId !== input.userId) {
          throw new Error("Money account does not belong to user");
        }
        return appendMoneyLedger(account, input);
      });
    },

    async createMoneyAccountWithEntry(input) {
      return withMoneyLock(input.account.userId, async () => {
        const { refId, type } = input.entry;
        const prior = refId
          ? moneyLedgerByRef.get(ledgerRefKey(input.account.userId, refId, type))
          : undefined;
        const priorAccount = prior ? moneyAccounts.get(prior.accountId) : undefined;
        if (priorAccount) return { account: priorAccount, created: false };
        if (input.entry.delta < 0) throw new Error("Insufficient money balance");
        const account: MoneyAccountRecord = {
          id: randomUUID(),
          ...input.account,
          balanceCacheMinor: 0,
          createdAt: now(),
          updatedAt: now(),
        };
        moneyAccounts.set(account.id, account);
        appendMoneyLedger(account, input.entry);
        return { account: moneyAccounts.get(account.id)!, created: true };
      });
    },

    async setMoneyAccountBalance(input) {
      if (!Number.isInteger(input.targetMinor) || input.targetMinor < 0) {
        throw new RangeError("targetMinor must be a non-negative integer");
      }
      return withMoneyLock(input.userId, async () => {
        const account = moneyAccounts.get(input.accountId);
        if (!account) throw new Error("Money account not found");
        if (account.userId !== input.userId) {
          throw new Error("Money account does not belong to user");
        }
        const previousMinor = account.balanceCacheMinor;
        const delta = input.targetMinor - previousMinor;
        if (delta === 0) {
          moneyAccounts.set(account.id, { ...account, updatedAt: now() });
          return { previousMinor, balanceAfter: previousMinor, delta: 0, posted: false };
        }
        let lastLedgerId: string | null = null;
        for (const e of moneyLedger.values()) if (e.accountId === account.id) lastLedgerId = e.id;
        const refId = input.refId({ balanceMinor: previousMinor, lastLedgerId });
        const type = delta > 0 ? "DEPOSIT" : "SPEND";
        const prior = moneyLedgerByRef.get(ledgerRefKey(input.userId, refId, type));
        if (prior) {
          if (prior.accountId !== account.id) {
            throw new Error("Money ledger ref belongs to another account");
          }
          return {
            previousMinor: prior.balanceAfter - prior.delta,
            balanceAfter: prior.balanceAfter,
            delta: prior.delta,
            posted: false,
          };
        }
        const { balanceAfter } = appendMoneyLedger(account, {
          delta,
          type,
          refType: input.refType,
          refId,
        });
        return { previousMinor, balanceAfter, delta, posted: true };
      });
    },

    async mergeMoneyAccounts(input) {
      if (input.sourceAccountId === input.targetAccountId) {
        throw new RangeError("Cannot merge an account into itself");
      }
      return withMoneyLock(input.userId, async () => {
        const source = moneyAccounts.get(input.sourceAccountId);
        const target = moneyAccounts.get(input.targetAccountId);
        if (!source || !target || source.userId !== input.userId || target.userId !== input.userId) {
          throw new Error("Money account not found");
        }
        const prior = moneyLedgerByRef.get(ledgerRefKey(input.userId, input.refId, "TRANSFER_OUT"));
        if (prior) {
          return { account: target, transferredMinor: -prior.delta, alreadyApplied: true };
        }
        if (source.status === "CLOSED" || target.status === "CLOSED") {
          throw new Error("Money account closed");
        }
        const amount = source.balanceCacheMinor;
        if (amount <= 0) throw new Error("Money account has nothing to merge");
        appendMoneyLedger(source, { delta: -amount, type: "TRANSFER_OUT", refType: input.refType, refId: input.refId });
        appendMoneyLedger(target, { delta: amount, type: "TRANSFER_IN", refType: input.refType, refId: input.refId });
        const closed = { ...moneyAccounts.get(source.id)!, status: "CLOSED" as const, updatedAt: now() };
        moneyAccounts.set(source.id, closed);
        const funded = moneyAccounts.get(target.id)!;
        const patched = { ...funded, expiresAt: input.nextExpiresAt(funded, closed), updatedAt: now() };
        moneyAccounts.set(target.id, patched);
        return { account: patched, transferredMinor: amount, alreadyApplied: false };
      });
    },

    // --- Universe P1.2: receipts & warranties ---
    async createReceipt(input) {
      const receipt: ReceiptRecord = {
        id: randomUUID(),
        userId: input.userId,
        imageKey: input.imageKey,
        merchant: input.merchant,
        purchasedAt: input.purchasedAt,
        totalMinor: input.totalMinor,
        ocrJson: input.ocrJson,
        purchaseId: input.purchaseId ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      receiptsStore.set(receipt.id, receipt);
      return receipt;
    },

    async getReceipt(id, userId) {
      const receipt = receiptsStore.get(id);
      if (!receipt || receipt.userId !== userId) return null;
      return receipt;
    },

    async listReceipts(userId) {
      return [...receiptsStore.values()]
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async updateReceipt(id, userId, patch) {
      const receipt = receiptsStore.get(id);
      if (!receipt || receipt.userId !== userId) return null;
      const updated: ReceiptRecord = {
        ...receipt,
        merchant: patch.merchant ?? receipt.merchant,
        purchasedAt: patch.purchasedAt ?? receipt.purchasedAt,
        totalMinor: patch.totalMinor ?? receipt.totalMinor,
        ocrJson: patch.ocrJson ?? receipt.ocrJson,
        updatedAt: now(),
      };
      receiptsStore.set(id, updated);
      return updated;
    },

    async updateReceiptPurchaseId(id, userId, purchaseId) {
      const receipt = receiptsStore.get(id);
      if (receipt && receipt.userId === userId) {
        receiptsStore.set(id, { ...receipt, purchaseId, updatedAt: now() });
      }
    },

    async createMerchantPurchase(input) {
      // #38: one purchase per (user, orderRef); a repeat gets the existing one and its lines.
      // Looked up synchronously so the check and the insert below cannot interleave.
      const existing =
        input.orderRef == null
          ? undefined
          : [...merchantPurchasesStore.values()].find(
              (p) => p.userId === input.userId && p.orderRef === input.orderRef,
            );
      if (existing) {
        return { purchase: existing, items: await this.listMerchantPurchaseItems(existing.id), created: false };
      }
      const purchase: MerchantPurchaseRecord = {
        id: randomUUID(),
        userId: input.userId,
        source: input.source,
        merchant: input.merchant,
        orderRef: input.orderRef ?? null,
        purchasedAt: input.purchasedAt,
        currency: input.currency,
        totalMinor: input.totalMinor,
        status: "CONFIRMED",
        rawDocId: null,
        deliveryStatus: input.deliveryStatus ?? "ORDERED",
        etaAt: input.etaAt ?? null,
        trackingCode: input.trackingCode ?? null,
        carrier: null,
        deliveredAt: null,
        returnWindowDeadline: input.returnWindowDeadline ?? null,
        exchangeWindowDeadline: input.exchangeWindowDeadline ?? null,
        deliveryAddressNote: null,
        deliveryProofKeys: [],
        assigneeUserId: null,
        createdAt: now(),
        updatedAt: now(),
      };
      merchantPurchasesStore.set(purchase.id, purchase);
      merchantPurchaseItemsByPurchase.set(purchase.id, []);

      const items: MerchantPurchaseItemRecord[] = input.items.map((item) => {
        const row: MerchantPurchaseItemRecord = {
          id: randomUUID(),
          purchaseId: purchase.id,
          title: item.title,
          category: item.category ?? null,
          brand: item.brand ?? null,
          priceMinor: item.priceMinor,
          imageKey: item.imageKey ?? null,
          qty: item.qty ?? 1,
          duplicateWardrobeItemId: item.duplicateWardrobeItemId ?? null,
          createdAt: now(),
          updatedAt: now(),
        };
        merchantPurchaseItemsStore.set(row.id, row);
        const list = merchantPurchaseItemsByPurchase.get(purchase.id) ?? [];
        list.push(row.id);
        merchantPurchaseItemsByPurchase.set(purchase.id, list);
        return row;
      });

      return { purchase, items, created: true };
    },

    async confirmReceiptPurchase(input) {
      const receipt = receiptsStore.get(input.receiptId);
      if (!receipt || receipt.userId !== input.userId) return null;
      const inflight = receiptConfirms.get(input.receiptId);
      if (inflight) {
        const done = await inflight;
        return done && { purchase: done.purchase, warranties: [], created: false };
      }
      const linked = receipt.purchaseId ? merchantPurchasesStore.get(receipt.purchaseId) : undefined;
      if (linked) return { purchase: linked, warranties: [], created: false };
      const run = (async () => {
        const { purchase } = await this.createMerchantPurchase(input.purchase);
        const warranties: WarrantyRecord[] = [];
        for (const w of input.warranties) warranties.push(await this.createWarranty(w));
        await this.updateReceiptPurchaseId(input.receiptId, input.userId, purchase.id);
        return { purchase, warranties, created: true };
      })();
      receiptConfirms.set(input.receiptId, run);
      try {
        return await run;
      } finally {
        receiptConfirms.delete(input.receiptId);
      }
    },

    async findMerchantPurchaseByOrderRef(userId, orderRef) {
      return (
        [...merchantPurchasesStore.values()].find(
          (p) => p.userId === userId && p.orderRef === orderRef,
        ) ?? null
      );
    },

    async createWarranty(input) {
      const warranty: WarrantyRecord = {
        id: randomUUID(),
        userId: input.userId,
        receiptId: input.receiptId ?? null,
        itemTitle: input.itemTitle,
        provider: input.provider,
        coverageUntil: input.coverageUntil,
        claimContact: input.claimContact ?? null,
        category: input.category ?? null,
        state: "ACTIVE",
        createdAt: now(),
        updatedAt: now(),
      };
      warrantiesStore.set(warranty.id, warranty);
      return warranty;
    },

    async listWarranties(userId) {
      return [...warrantiesStore.values()]
        .filter((w) => w.userId === userId)
        .sort(
          (a, b) => b.coverageUntil.getTime() - a.coverageUntil.getTime(),
        );
    },

    async findWarranty(id, userId) {
      const warranty = warrantiesStore.get(id);
      if (!warranty || warranty.userId !== userId) return null;
      return warranty;
    },

    async claimWarranty(id, userId) {
      const warranty = warrantiesStore.get(id);
      if (!warranty || warranty.userId !== userId) return null;
      const updated: WarrantyRecord = {
        ...warranty,
        state: "CLAIMED",
        updatedAt: now(),
      };
      warrantiesStore.set(id, updated);
      return updated;
    },

    async unclaimWarranty(id, userId) {
      const warranty = warrantiesStore.get(id);
      if (!warranty || warranty.userId !== userId) return null;
      if (warranty.state !== "CLAIMED") return warranty;
      const updated: WarrantyRecord = {
        ...warranty,
        state: "ACTIVE",
        updatedAt: now(),
      };
      warrantiesStore.set(id, updated);
      return updated;
    },

    async listMerchantPurchases(userId, opts = {}) {
      const statuses = opts.deliveryStatuses;
      return [...merchantPurchasesStore.values()]
        .filter((p) => p.userId === userId && (!statuses || statuses.includes(p.deliveryStatus)))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async listMerchantPurchaseItems(purchaseId) {
      const ids = merchantPurchaseItemsByPurchase.get(purchaseId) ?? [];
      return ids
        .map((id) => merchantPurchaseItemsStore.get(id)!)
        .filter(Boolean)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async listMerchantPurchaseItemsByPurchaseIds(purchaseIds) {
      const map = new Map<string, MerchantPurchaseItemRecord[]>();
      for (const pid of purchaseIds) {
        const ids = merchantPurchaseItemsByPurchase.get(pid) ?? [];
        const items = ids.map((id) => merchantPurchaseItemsStore.get(id)!).filter(Boolean).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        map.set(pid, items);
      }
      // ensure empty arrays for missing ids
      for (const pid of purchaseIds) if (!map.has(pid)) map.set(pid, []);
      return map;
    },

    async listWardrobeItems(userId) {
      return [...wardrobeItemsStore.values()].filter(r => r.userId === userId).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
    },
    async findWardrobeItem(id, userId) {
      const r = wardrobeItemsStore.get(id);
      if (!r || r.userId !== userId) return null;
      return r;
    },
    async createWardrobeItem(input) {
      const rec: WardrobeItemRecord = {
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
        createdAt: now(),
        updatedAt: now(),
      };
      wardrobeItemsStore.set(rec.id, rec);
      const metricKey = `${input.userId}:${rec.id}`;
      if (!itemMetricsStore.has(metricKey)) {
        const m: ItemMetricRecord = {
          id: randomUUID(),
          userId: input.userId,
          wardrobeItemId: rec.id,
          wearCount: 0,
          lastWornAt: null,
          costPerWearMinor: rec.costMinor > 0 ? rec.costMinor : null,
          targetCpwMinor: null,
          status: "ACTIVE",
          createdAt: now(),
          updatedAt: now(),
        };
        itemMetricsStore.set(metricKey, m);
      }
      return rec;
    },
    async updateWardrobeItem(id, userId, patch) {
      const existing = wardrobeItemsStore.get(id);
      if (!existing || existing.userId !== userId) return null;
      const updated: WardrobeItemRecord = {
        ...existing,
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.colors !== undefined ? { colors: patch.colors } : {}),
        ...(patch.brand !== undefined ? { brand: patch.brand } : {}),
        ...(patch.costMinor !== undefined ? { costMinor: patch.costMinor } : {}),
        ...(patch.imageKeys !== undefined ? { imageKeys: patch.imageKeys } : {}),
        ...(patch.garmentImageKey !== undefined ? { garmentImageKey: patch.garmentImageKey } : {}),
        ...(patch.laundryStatus !== undefined ? { laundryStatus: patch.laundryStatus } : {}),
        ...(patch.closetStatus !== undefined ? { closetStatus: patch.closetStatus } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        ...(patch.careRules !== undefined ? { careRules: patch.careRules } : {}),
        ...(patch.dryCleanTicket !== undefined ? { dryCleanTicket: patch.dryCleanTicket } : {}),
        ...(patch.dryCleanPickupOn !== undefined ? { dryCleanPickupOn: patch.dryCleanPickupOn } : {}),
        ...(patch.lentTo !== undefined ? { lentTo: patch.lentTo } : {}),
        ...(patch.lentDueOn !== undefined ? { lentDueOn: patch.lentDueOn } : {}),
        ...(patch.profileId !== undefined ? { profileId: patch.profileId } : {}),
        updatedAt: now(),
      };
      wardrobeItemsStore.set(id, updated);
      return updated;
    },
    async deleteWardrobeItem(id, userId) {
      const existing = wardrobeItemsStore.get(id);
      if (!existing || existing.userId !== userId) return false;
      wardrobeItemsStore.delete(id);
      itemMetricsStore.delete(`${userId}:${id}`);
      for (const [wid, w] of wearLogsStore) {
        if (w.wardrobeItemId === id) wearLogsStore.delete(wid);
      }
      return true;
    },
    async createOutfit(input) {
      const rec: OutfitRecord = {
        id: randomUUID(),
        userId: input.userId,
        itemIds: input.itemIds,
        occasion: input.occasion ?? null,
        weatherCtx: input.weatherCtx ?? null,
        plannedFor: input.plannedFor ?? null,
        generatedAt: new Date(),
        styleProfileSnapshot: input.styleProfileSnapshot ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      outfitsStore.set(rec.id, rec);
      return rec;
    },
    async findOutfitById(id, userId) {
      const r = outfitsStore.get(id);
      if (!r || r.userId !== userId) return null;
      return r;
    },
    async getTodayOutfit(userId) {
      const today = new Date().toISOString().slice(0, 10);
      const planned = [...outfitsStore.values()].find(
        (r) => r.userId === userId && r.plannedFor === today,
      );
      if (planned) return planned;
      const all = [...outfitsStore.values()].filter(r=>r.userId===userId).sort((a,b)=>b.generatedAt.getTime()-a.generatedAt.getTime());
      return all[0] ?? null;
    },
    async getOutfitForDate(userId, plannedFor) {
      return (
        [...outfitsStore.values()].find(
          (r) => r.userId === userId && r.plannedFor === plannedFor,
        ) ?? null
      );
    },
    async upsertOutfitForDate(input) {
      const existing = await repos.getOutfitForDate(input.userId, input.plannedFor);
      if (existing) {
        const updated: OutfitRecord = {
          ...existing,
          itemIds: input.itemIds,
          occasion: input.occasion ?? null,
          weatherCtx: input.weatherCtx ?? null,
          styleProfileSnapshot: input.styleProfileSnapshot ?? null,
          plannedFor: input.plannedFor,
          generatedAt: new Date(),
          updatedAt: now(),
        };
        outfitsStore.set(existing.id, updated);
        return updated;
      }
      return repos.createOutfit({ ...input, plannedFor: input.plannedFor });
    },
    async updateOutfit(id, userId, patch) {
      const existing = outfitsStore.get(id);
      if (!existing || existing.userId !== userId) return null;
      const updated: OutfitRecord = {
        ...existing,
        itemIds: patch.itemIds ?? existing.itemIds,
        occasion: patch.occasion !== undefined ? patch.occasion : existing.occasion,
        weatherCtx: patch.weatherCtx !== undefined ? patch.weatherCtx : existing.weatherCtx,
        updatedAt: now(),
      };
      outfitsStore.set(id, updated);
      return updated;
    },
    async listOutfits(userId) {
      return [...outfitsStore.values()].filter(r=>r.userId===userId).sort((a,b)=>b.generatedAt.getTime()-a.generatedAt.getTime());
    },
    async listOutfitsInRange(userId, fromDate, toDate) {
      return [...outfitsStore.values()]
        .filter(
          (r) =>
            r.userId === userId &&
            r.plannedFor != null &&
            r.plannedFor >= fromDate &&
            r.plannedFor <= toDate,
        )
        .sort((a, b) => (a.plannedFor ?? "").localeCompare(b.plannedFor ?? ""));
    },
    async createWearLog(input) {
      const rec: WearLogRecord = {
        id: randomUUID(),
        userId: input.userId,
        wardrobeItemId: input.wardrobeItemId ?? null,
        outfitId: input.outfitId ?? null,
        wornOn: input.wornOn ?? new Date(),
        imageKey: input.imageKey ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      wearLogsStore.set(rec.id, rec);
      const itemIds: string[] = [];
      if (input.wardrobeItemId) itemIds.push(input.wardrobeItemId);
      if (input.outfitId) {
        const outfit = outfitsStore.get(input.outfitId);
        if (outfit && outfit.userId === input.userId) itemIds.push(...outfit.itemIds);
      }
      for (const wid of [...new Set(itemIds)]) {
        const item = wardrobeItemsStore.get(wid);
        if (!item) continue;
        const key = `${input.userId}:${wid}`;
        const existing = itemMetricsStore.get(key);
        const prevCount = existing?.wearCount ?? 0;
        const newCount = prevCount + 1;
        const costPerWear = item.costMinor > 0 ? Math.round(item.costMinor / newCount) : null;
        const m: ItemMetricRecord = {
          id: existing?.id ?? randomUUID(),
          userId: input.userId,
          wardrobeItemId: wid,
          wearCount: newCount,
          lastWornAt: rec.wornOn,
          costPerWearMinor: costPerWear,
          targetCpwMinor: existing?.targetCpwMinor ?? null,
          status: "ACTIVE",
          createdAt: existing?.createdAt ?? now(),
          updatedAt: now(),
        };
        itemMetricsStore.set(key, m);
      }
      return rec;
    },
    async listWearLogs(userId) {
      return [...wearLogsStore.values()].filter(r=>r.userId===userId).sort((a,b)=>b.wornOn.getTime()-a.wornOn.getTime());
    },
    async findWearLog(id, userId) {
      const rec = wearLogsStore.get(id);
      if (!rec || rec.userId !== userId) return null;
      return rec;
    },
    async deleteWearLog(id, userId) {
      const rec = wearLogsStore.get(id);
      if (!rec || rec.userId !== userId) return null;
      wearLogsStore.delete(id);
      const itemIds: string[] = [];
      if (rec.wardrobeItemId) itemIds.push(rec.wardrobeItemId);
      if (rec.outfitId) {
        const outfit = outfitsStore.get(rec.outfitId);
        if (outfit && outfit.userId === userId) itemIds.push(...outfit.itemIds);
      }
      for (const wid of [...new Set(itemIds)]) {
        const key = `${userId}:${wid}`;
        const existing = itemMetricsStore.get(key);
        if (!existing) continue;
        const item = wardrobeItemsStore.get(wid);
        const newCount = Math.max(0, existing.wearCount - 1);
        const costPerWear =
          item && item.costMinor > 0 && newCount > 0
            ? Math.round(item.costMinor / newCount)
            : newCount === 0
              ? null
              : existing.costPerWearMinor;
        itemMetricsStore.set(key, {
          ...existing,
          wearCount: newCount,
          costPerWearMinor: costPerWear,
          lastWornAt: newCount === 0 ? null : existing.lastWornAt,
          updatedAt: now(),
        });
      }
      return rec;
    },
    async getItemMetrics(userId) {
      const nowDate = new Date();
      for (const [, m] of itemMetricsStore) {
        if (m.userId !== userId) continue;
        let computed: "ACTIVE"|"DORMANT"|"DEAD" = m.status;
        if (!m.lastWornAt) {
          const ageDays = (nowDate.getTime() - m.createdAt.getTime())/86_400_000;
          if (ageDays > 90) computed = "DEAD";
          else if (ageDays > 30) computed = "DORMANT";
          else computed = "ACTIVE";
        } else {
          const daysSince = (nowDate.getTime() - m.lastWornAt.getTime())/86_400_000;
          if (daysSince > 90) computed = "DEAD";
          else if (daysSince > 60) computed = "DORMANT";
          else computed = "ACTIVE";
        }
        if (computed !== m.status) {
          itemMetricsStore.set(`${m.userId}:${m.wardrobeItemId}`, { ...m, status: computed, updatedAt: now() });
        }
      }
      return [...itemMetricsStore.values()].filter(r=>r.userId===userId).sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime());
    },
    async findItemMetric(userId, wardrobeItemId) {
      return itemMetricsStore.get(`${userId}:${wardrobeItemId}`) ?? null;
    },
    async upsertItemMetric(input) {
      const key = `${input.userId}:${input.wardrobeItemId}`;
      const existing = itemMetricsStore.get(key);
      const rec: ItemMetricRecord = {
        id: existing?.id ?? randomUUID(),
        userId: input.userId,
        wardrobeItemId: input.wardrobeItemId,
        wearCount: input.wearCount,
        lastWornAt: input.lastWornAt,
        costPerWearMinor: input.costPerWearMinor,
        targetCpwMinor:
          input.targetCpwMinor !== undefined
            ? input.targetCpwMinor
            : (existing?.targetCpwMinor ?? null),
        status: input.status,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      };
      itemMetricsStore.set(key, rec);
      return rec;
    },
    async setItemCpwGoal(input) {
      const key = `${input.userId}:${input.wardrobeItemId}`;
      const existing = itemMetricsStore.get(key);
      const item = wardrobeItemsStore.get(input.wardrobeItemId);
      const costMinor = item?.costMinor ?? 0;
      const wearCount = existing?.wearCount ?? 0;
      const rec: ItemMetricRecord = {
        id: existing?.id ?? randomUUID(),
        userId: input.userId,
        wardrobeItemId: input.wardrobeItemId,
        wearCount,
        lastWornAt: existing?.lastWornAt ?? null,
        costPerWearMinor:
          existing?.costPerWearMinor ??
          (costMinor > 0 ? (wearCount > 0 ? Math.round(costMinor / wearCount) : costMinor) : null),
        targetCpwMinor: input.targetCpwMinor,
        status: existing?.status ?? "ACTIVE",
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      };
      itemMetricsStore.set(key, rec);
      return rec;
    },
    async createDispositionListing(input) {
      return (await this.openDispositionListing({ ...input, mode: input.mode as DispositionListingRecord["mode"] })).listing;
    },
    async openDispositionListing(input) {
      // #12 mirror of disposition_listings_active_item_uidx; checked and inserted synchronously.
      const active = [...dispositionStore.values()].find(
        (r) => r.wardrobeItemId === input.wardrobeItemId && r.status === "ACTIVE",
      );
      if (active) return { listing: active, created: false };
      const rec: DispositionListingRecord = {
        id: randomUUID(),
        userId: input.userId,
        wardrobeItemId: input.wardrobeItemId,
        mode: input.mode as DispositionListingRecord["mode"],
        priceMinor: input.priceMinor ?? null,
        status: "ACTIVE",
        sellerId: input.sellerId ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      dispositionStore.set(rec.id, rec);
      return { listing: rec, created: true };
    },
    async listDispositionListings(userId) {
      return [...dispositionStore.values()].filter(r=>r.userId===userId).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
    },
    async findDispositionListing(id, userId) {
      const r = dispositionStore.get(id);
      if (!r || r.userId !== userId) return null;
      return r;
    },
    async updateDispositionListing(id, patch, opts = {}) {
      const r = dispositionStore.get(id);
      if (!r) return null;
      if (opts.fromStatuses && !opts.fromStatuses.includes(r.status)) return null;
      const updated: DispositionListingRecord = { ...r, ...patch, updatedAt: now() } as DispositionListingRecord;
      dispositionStore.set(id, updated);
      return updated;
    },

    // N37 swap circle
    async createSwapCircle(input) {
      const rec: SwapCircleRecord = {
        id: randomUUID(),
        name: input.name,
        ownerId: input.ownerId,
        inviteCode: input.inviteCode,
        createdAt: now(),
        updatedAt: now(),
      };
      swapCirclesStore.set(rec.id, rec);
      return rec;
    },
    async findSwapCircleById(id) {
      return swapCirclesStore.get(id) ?? null;
    },
    async findSwapCircleByInviteCode(inviteCode) {
      const code = inviteCode.toUpperCase();
      return [...swapCirclesStore.values()].find((c) => c.inviteCode === code) ?? null;
    },
    async listSwapCirclesForUser(userId) {
      const circleIds = new Set(
        [...swapMembersStore.values()].filter((m) => m.userId === userId).map((m) => m.circleId),
      );
      return [...swapCirclesStore.values()]
        .filter((c) => circleIds.has(c.id))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async addSwapCircleMember(input) {
      const existing = [...swapMembersStore.values()].find(
        (m) => m.circleId === input.circleId && m.userId === input.userId,
      );
      if (existing) return existing;
      const rec: SwapCircleMemberRecord = {
        id: randomUUID(),
        circleId: input.circleId,
        userId: input.userId,
        role: input.role,
        createdAt: now(),
        updatedAt: now(),
      };
      swapMembersStore.set(rec.id, rec);
      return rec;
    },
    async findSwapCircleMember(circleId, userId) {
      return (
        [...swapMembersStore.values()].find(
          (m) => m.circleId === circleId && m.userId === userId,
        ) ?? null
      );
    },
    async listSwapCircleMembers(circleId) {
      return [...swapMembersStore.values()]
        .filter((m) => m.circleId === circleId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
    async createSwapListing(input) {
      const rec: SwapListingRecord = {
        id: randomUUID(),
        circleId: input.circleId,
        ownerUserId: input.ownerUserId,
        wardrobeItemId: input.wardrobeItemId,
        dispositionListingId: input.dispositionListingId ?? null,
        status: "LISTED",
        borrowerUserId: null,
        createdAt: now(),
        updatedAt: now(),
      };
      swapListingsStore.set(rec.id, rec);
      return rec;
    },
    async findSwapListing(id, circleId) {
      const r = swapListingsStore.get(id);
      if (!r || r.circleId !== circleId) return null;
      return r;
    },
    async listSwapListings(circleId) {
      return [...swapListingsStore.values()]
        .filter((l) => l.circleId === circleId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async updateSwapListing(id, patch, opts = {}) {
      const r = swapListingsStore.get(id);
      if (!r) return null;
      if (opts.fromStatuses && !opts.fromStatuses.includes(r.status)) return null;
      const disposition = r.dispositionListingId ? dispositionStore.get(r.dispositionListingId) : undefined;
      if (opts.dispositionStatus && disposition?.status === "ACTIVE") {
        dispositionStore.set(disposition.id, { ...disposition, status: opts.dispositionStatus, updatedAt: now() });
      }
      const updated: SwapListingRecord = {
        ...r,
        status: patch.status ?? r.status,
        borrowerUserId:
          patch.borrowerUserId !== undefined ? patch.borrowerUserId : r.borrowerUserId,
        dispositionListingId:
          patch.dispositionListingId !== undefined
            ? patch.dispositionListingId
            : r.dispositionListingId,
        updatedAt: now(),
      };
      swapListingsStore.set(id, updated);
      return updated;
    },

    async createHousehold(input) {
      const rec: HouseholdRecord = {
        id: randomUUID(),
        name: input.name,
        ownerId: input.ownerId,
        inviteCode: input.inviteCode,
        createdAt: now(),
        updatedAt: now(),
      };
      householdsStore.set(rec.id, rec);
      return rec;
    },
    async findHouseholdById(id) {
      return householdsStore.get(id) ?? null;
    },
    async findHouseholdByInviteCode(inviteCode) {
      const code = inviteCode.toUpperCase();
      return [...householdsStore.values()].find((c) => c.inviteCode === code) ?? null;
    },
    async listHouseholdsForUser(userId) {
      const ids = new Set(
        [...householdMembersStore.values()]
          .filter((m) => m.userId === userId)
          .map((m) => m.householdId),
      );
      return [...householdsStore.values()]
        .filter((h) => ids.has(h.id))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async addHouseholdMember(input) {
      const existing = [...householdMembersStore.values()].find(
        (m) => m.householdId === input.householdId && m.userId === input.userId,
      );
      if (existing) return existing;
      const rec: HouseholdMemberRecord = {
        id: randomUUID(),
        householdId: input.householdId,
        userId: input.userId,
        role: input.role,
        createdAt: now(),
        updatedAt: now(),
      };
      householdMembersStore.set(rec.id, rec);
      return rec;
    },
    async findHouseholdMember(householdId, userId) {
      return (
        [...householdMembersStore.values()].find(
          (m) => m.householdId === householdId && m.userId === userId,
        ) ?? null
      );
    },
    async listHouseholdMembers(householdId) {
      return [...householdMembersStore.values()]
        .filter((m) => m.householdId === householdId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
    async getHouseholdVaultSettings(householdId, userId) {
      const key = `${householdId}:${userId}`;
      const existing = householdVaultSettingsStore.get(key);
      if (existing) return existing;
      const defaults: HouseholdVaultSettingsRecord = {
        householdId,
        userId,
        vaultAccess: "VIEW",
        spendCapMinor: null,
        spentMinor: 0,
        updatedAt: now(),
      };
      return defaults;
    },
    async upsertHouseholdVaultSettings(input) {
      const key = `${input.householdId}:${input.userId}`;
      const prev = householdVaultSettingsStore.get(key);
      const next: HouseholdVaultSettingsRecord = {
        householdId: input.householdId,
        userId: input.userId,
        vaultAccess: input.vaultAccess ?? prev?.vaultAccess ?? "VIEW",
        spendCapMinor:
          input.spendCapMinor !== undefined
            ? input.spendCapMinor
            : (prev?.spendCapMinor ?? null),
        spentMinor:
          input.spentMinor !== undefined
            ? input.spentMinor
            : (prev?.spentMinor ?? 0),
        updatedAt: now(),
      };
      householdVaultSettingsStore.set(key, next);
      return next;
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
      return [...householdVaultSettingsStore.values()].filter(
        (s) => s.householdId === householdId,
      );
    },
    async tryReserveHouseholdVaultSpend(householdId, userId, amountMinor) {
      const key = `${householdId}:${userId}`;
      const prev = householdVaultSettingsStore.get(key);
      if (!prev || prev.vaultAccess !== "SPEND") return null;
      if (prev.spendCapMinor !== null && prev.spentMinor + amountMinor > prev.spendCapMinor) return null;
      const next = { ...prev, spentMinor: prev.spentMinor + amountMinor, updatedAt: now() };
      householdVaultSettingsStore.set(key, next);
      return next;
    },
    async releaseHouseholdVaultSpend(householdId, userId, amountMinor) {
      const key = `${householdId}:${userId}`;
      const prev = householdVaultSettingsStore.get(key);
      if (!prev) return;
      householdVaultSettingsStore.set(key, {
        ...prev,
        spentMinor: Math.max(prev.spentMinor - amountMinor, 0),
        updatedAt: now(),
      });
    },
    async startWearChallenge(userId, wardrobeItemId) {
      const key = `${userId}:${wardrobeItemId}`;
      if (wearChallengesStore.has(key)) return { created: false };
      wearChallengesStore.set(key, { userId, wardrobeItemId, startedAt: now() });
      return { created: true };
    },
    async listWearChallengeItemIds(userId) {
      return [...wearChallengesStore.values()]
        .filter((c) => c.userId === userId)
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(0, 500)
        .map((c) => c.wardrobeItemId);
    },
    async createInterviewKit(input) {
      const kit: InterviewKitRecord = { ...input, itemIds: [...input.itemIds], createdAt: now(), updatedAt: now() };
      interviewKitsStore.set(kit.id, kit);
      return kit;
    },
    async findInterviewKit(id, userId) {
      const kit = interviewKitsStore.get(id);
      return kit && kit.userId === userId ? kit : null;
    },
    async listInterviewKits(userId, limit) {
      return [...interviewKitsStore.values()]
        .filter((k) => k.userId === userId)
        .sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime() || a.id.localeCompare(b.id))
        .slice(0, Math.min(Math.max(limit, 1), 500));
    },
    async updateInterviewKit(id, userId, patch) {
      const kit = interviewKitsStore.get(id);
      if (!kit || kit.userId !== userId) return null;
      const next = { ...kit, ...patch, updatedAt: now() };
      interviewKitsStore.set(id, next);
      return next;
    },
    async deleteInterviewKit(id, userId) {
      const kit = interviewKitsStore.get(id);
      if (!kit || kit.userId !== userId) return false;
      interviewKitsStore.delete(id);
      return true;
    },
    async createSocialPoll(input) {
      for (const p of socialPollsStore.values()) {
        if (p.tokenHash === input.tokenHash) throw Object.assign(new Error("duplicate token"), { code: "23505" });
      }
      const poll: SocialPollRecord = { ...input, winnerAppliedAt: null, closedAt: null, createdAt: now() };
      socialPollsStore.set(poll.id, poll);
      return poll;
    },
    async findSocialPollById(id) {
      return socialPollsStore.get(id) ?? null;
    },
    async findSocialPollByTokenHash(tokenHash) {
      for (const p of socialPollsStore.values()) if (p.tokenHash === tokenHash) return p;
      return null;
    },
    async castSocialPollVote(pollId, voterHash, choice) {
      const votes = socialPollVotesStore.get(pollId) ?? new Map<string, string>();
      socialPollVotesStore.set(pollId, votes);
      const existing = votes.get(voterHash);
      if (existing !== undefined) return { inserted: false, choice: existing };
      votes.set(voterHash, choice);
      return { inserted: true, choice };
    },
    async countSocialPollVotes(pollId) {
      const counts: Record<string, number> = {};
      for (const choice of socialPollVotesStore.get(pollId)?.values() ?? []) {
        counts[choice] = (counts[choice] ?? 0) + 1;
      }
      return counts;
    },
    async markSocialPollWinnerApplied(pollId) {
      const poll = socialPollsStore.get(pollId);
      if (!poll || poll.winnerAppliedAt) return false;
      socialPollsStore.set(pollId, { ...poll, winnerAppliedAt: now() });
      return true;
    },
    async findWardrobeItemById(id) {
      return wardrobeItemsStore.get(id) ?? null;
    },
    async updateWardrobeItemById(id, patch) {
      const existing = wardrobeItemsStore.get(id);
      if (!existing) return null;
      const updated: WardrobeItemRecord = {
        ...existing,
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.colors !== undefined ? { colors: patch.colors } : {}),
        ...(patch.brand !== undefined ? { brand: patch.brand } : {}),
        ...(patch.costMinor !== undefined ? { costMinor: patch.costMinor } : {}),
        ...(patch.imageKeys !== undefined ? { imageKeys: patch.imageKeys } : {}),
        ...(patch.garmentImageKey !== undefined ? { garmentImageKey: patch.garmentImageKey } : {}),
        ...(patch.laundryStatus !== undefined ? { laundryStatus: patch.laundryStatus } : {}),
        ...(patch.closetStatus !== undefined ? { closetStatus: patch.closetStatus } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        ...(patch.careRules !== undefined ? { careRules: patch.careRules } : {}),
        ...(patch.dryCleanTicket !== undefined ? { dryCleanTicket: patch.dryCleanTicket } : {}),
        ...(patch.dryCleanPickupOn !== undefined ? { dryCleanPickupOn: patch.dryCleanPickupOn } : {}),
        ...(patch.lentTo !== undefined ? { lentTo: patch.lentTo } : {}),
        ...(patch.lentDueOn !== undefined ? { lentDueOn: patch.lentDueOn } : {}),
        ...(patch.profileId !== undefined ? { profileId: patch.profileId } : {}),
        updatedAt: now(),
      };
      wardrobeItemsStore.set(id, updated);
      return updated;
    },

    async createClosetProfile(input) {
      const rec: ClosetProfileRecord = {
        id: randomUUID(),
        ownerUserId: input.ownerUserId,
        householdId: input.householdId ?? null,
        name: input.name,
        kind: input.kind,
        createdAt: now(),
        updatedAt: now(),
      };
      closetProfilesStore.set(rec.id, rec);
      return rec;
    },
    async findClosetProfile(id) {
      return closetProfilesStore.get(id) ?? null;
    },
    async listClosetProfiles(ownerUserId) {
      return [...closetProfilesStore.values()]
        .filter((p) => p.ownerUserId === ownerUserId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
    async updateClosetProfile(id, ownerUserId, patch) {
      const existing = closetProfilesStore.get(id);
      if (!existing || existing.ownerUserId !== ownerUserId) return null;
      const updated: ClosetProfileRecord = {
        ...existing,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
        ...(patch.householdId !== undefined ? { householdId: patch.householdId } : {}),
        updatedAt: now(),
      };
      closetProfilesStore.set(id, updated);
      return updated;
    },
    async deleteClosetProfile(id, ownerUserId) {
      const existing = closetProfilesStore.get(id);
      if (!existing || existing.ownerUserId !== ownerUserId) return false;
      closetProfilesStore.delete(id);
      for (const [wid, w] of wardrobeItemsStore) {
        if (w.profileId === id) {
          wardrobeItemsStore.set(wid, { ...w, profileId: null, updatedAt: now() });
        }
      }
      return true;
    },

    async createBrandPriceWatch(input) {
      const rec: BrandPriceWatchRecord = {
        id: randomUUID(),
        userId: input.userId,
        brand: input.brand.trim(),
        watchedPriceMinor: input.watchedPriceMinor,
        thresholdPct: input.thresholdPct ?? 10,
        lastSeenPriceMinor: null,
        active: true,
        createdAt: now(),
        updatedAt: now(),
      };
      brandPriceWatchesStore.set(rec.id, rec);
      return rec;
    },
    async listBrandPriceWatches(userId) {
      return [...brandPriceWatchesStore.values()]
        .filter((w) => w.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async findBrandPriceWatch(id, userId) {
      const r = brandPriceWatchesStore.get(id);
      if (!r || r.userId !== userId) return null;
      return r;
    },
    async updateBrandPriceWatch(id, userId, patch) {
      const existing = brandPriceWatchesStore.get(id);
      if (!existing || existing.userId !== userId) return null;
      const updated: BrandPriceWatchRecord = {
        ...existing,
        ...patch,
        updatedAt: now(),
      };
      brandPriceWatchesStore.set(id, updated);
      return updated;
    },

    async createEmiPlan(input) {
      const rec: EmiPlanRecord = {
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
        createdAt: now(),
        updatedAt: now(),
      };
      emiPlansStore.set(rec.id, rec);
      return rec;
    },
    async listEmiPlans(userId, opts) {
      return [...emiPlansStore.values()]
        .filter((p) => p.userId === userId && (!opts?.status || p.status === opts.status))
        .sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn));
    },
    async findEmiPlan(id, userId) {
      const r = emiPlansStore.get(id);
      if (!r || r.userId !== userId) return null;
      return r;
    },
    async updateEmiPlan(id, userId, patch) {
      const existing = emiPlansStore.get(id);
      if (!existing || existing.userId !== userId) return null;
      const updated: EmiPlanRecord = {
        ...existing,
        ...patch,
        updatedAt: now(),
      };
      emiPlansStore.set(id, updated);
      return updated;
    },
    async payEmiPlan(id, userId, input) {
      const existing = emiPlansStore.get(id);
      if (!existing || existing.userId !== userId) return null;
      if (input.paymentKey && emiPaymentKeys.get(id) === input.paymentKey) {
        return { plan: existing, outcome: "REPLAY" as const };
      }
      const { from } = input;
      if (
        existing.remainingMinor !== from.remainingMinor ||
        existing.nextDueOn !== from.nextDueOn ||
        existing.status !== from.status
      ) {
        return { plan: existing, outcome: "CONFLICT" as const };
      }
      const updated: EmiPlanRecord = { ...existing, ...input.to, updatedAt: now() };
      emiPlansStore.set(id, updated);
      if (input.paymentKey) emiPaymentKeys.set(id, input.paymentKey);
      else emiPaymentKeys.delete(id);
      return { plan: updated, outcome: "APPLIED" as const };
    },

    async createCashbackClaim(input) {
      const rec: CashbackClaimRecord = {
        id: randomUUID(),
        userId: input.userId,
        source: input.source,
        merchant: input.merchant ?? null,
        amountMinor: input.amountMinor,
        currency: input.currency ?? "INR",
        expiresAt: input.expiresAt ?? null,
        status: "UNCLAIMED",
        notes: input.notes ?? null,
        claimedAt: null,
        createdAt: now(),
        updatedAt: now(),
      };
      cashbackClaimsStore.set(rec.id, rec);
      return rec;
    },
    async listCashbackClaims(userId, opts) {
      return [...cashbackClaimsStore.values()]
        .filter((c) => c.userId === userId && (!opts?.status || c.status === opts.status))
        .sort(compareCashbackClaimsByDeadline);
    },
    async findCashbackClaim(id, userId) {
      const r = cashbackClaimsStore.get(id);
      if (!r || r.userId !== userId) return null;
      return r;
    },
    async claimCashbackClaim(id, userId) {
      const existing = cashbackClaimsStore.get(id);
      if (!existing || existing.userId !== userId) return null;
      if (existing.status !== "UNCLAIMED") return existing;
      const updated: CashbackClaimRecord = {
        ...existing,
        status: "CLAIMED",
        claimedAt: now(),
        updatedAt: now(),
      };
      cashbackClaimsStore.set(id, updated);
      return updated;
    },

    async listBudgets(userId) {
      return [...budgetsStore.values()].filter(r=>r.userId===userId).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
    },
    async createBudget(input) {
      const rec: BudgetRecord = {
        id: randomUUID(),
        userId: input.userId,
        category: input.category,
        period: input.period,
        limitMinor: input.limitMinor,
        createdAt: now(),
        updatedAt: now(),
      };
      budgetsStore.set(rec.id, rec);
      return rec;
    },
    async findBudget(id, userId) {
      const r = budgetsStore.get(id);
      if (!r || r.userId !== userId) return null;
      return r;
    },
    async getSpendRollups(userId) {
      const seen = new Set<string>();
      const uniq: SpendRollupRecord[] = [];
      for (const r of spendRollupsStore.values()) {
        if (r.userId !== userId) continue;
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        uniq.push(r);
      }
      return uniq.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
    },
    async upsertSpendRollup(input) {
      const key = `${input.userId}:${input.period}:${input.category}`;
      const existing = spendRollupsStore.get(key);
      const rec: SpendRollupRecord = {
        id: existing?.id ?? randomUUID(),
        userId: input.userId,
        period: input.period,
        category: input.category,
        totalMinor: input.totalMinor,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      };
      // store only under composite key to avoid double-counting in getSpendRollups
      if (existing && existing.id !== key && spendRollupsStore.has(existing.id)) {
        spendRollupsStore.delete(existing.id);
      }
      spendRollupsStore.set(key, rec);
      return rec;
    },

    async listReturnRequests(userId) {
      return [...returnRequestsStore.values()].filter(r=>r.userId===userId).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
    },
    async findReturnRequest(id, userId) {
      const r = returnRequestsStore.get(id);
      if (!r || r.userId !== userId) return null;
      return r;
    },
    async createReturnRequest(input) {
      return (await this.openReturnRequest(input)).request;
    },
    async openReturnRequest(input) {
      const purchaseId = input.purchaseId ?? null;
      const purchaseItemId = input.purchaseItemId ?? null;
      const open = [...returnRequestsStore.values()].find(
        (r) =>
          r.userId === input.userId &&
          r.purchaseId === purchaseId &&
          r.purchaseItemId === purchaseItemId &&
          (OPEN_RETURN_STATES as string[]).includes(r.state),
      );
      if (open) return { request: open, created: false };
      const rec: ReturnRecord = {
        id: randomUUID(),
        userId: input.userId,
        purchaseId,
        purchaseItemId,
        windowDeadline: input.windowDeadline,
        exchangeDeadline: input.exchangeDeadline ?? null,
        state: input.state ?? "REQUESTED",
        refundMinor: null,
        method: input.method ?? null,
        tracking: null,
        pickupSlotAt: null,
        reason: input.reason ?? null,
        orderedSize: input.orderedSize ?? null,
        preferredSize: input.preferredSize ?? null,
        chaseSnoozeUntil: null,
        chaseEscalated: false,
        invoiceRequestedAt: null,
        invoiceReceiptId: null,
        labelImageKey: null,
        labelUsedAt: null,
        createdAt: now(),
        updatedAt: now(),
      };
      returnRequestsStore.set(rec.id, rec);
      const addEvent = (fromState: string | null, toState: string) => {
        const ev: ReturnEventRecord = { id: randomUUID(), returnRequestId: rec.id, fromState, toState, actor: "user", createdAt: now(), updatedAt: now() };
        const list = returnEventsStore.get(rec.id) ?? [];
        list.push(ev);
        returnEventsStore.set(rec.id, list);
        returnEventsById.set(ev.id, ev);
      };
      addEvent(null, "REQUESTED");
      if (rec.state === "INITIATED") addEvent("REQUESTED", "INITIATED");
      return { request: rec, created: true };
    },
    async expireOverdueReturnRequests(userId, at) {
      const expirable = returnStatesInto("EXPIRED") as string[];
      const expired: ReturnRecord[] = [];
      for (const r of returnRequestsStore.values()) {
        if (r.userId !== userId || !(r.windowDeadline < at) || !expirable.includes(r.state)) continue;
        expired.push((await this.updateReturnRequest(r.id, { state: "EXPIRED" }, { actor: "system.expire" }))!);
      }
      return expired;
    },
    async updateReturnRequest(id, patch, opts = {}) {
      const r = returnRequestsStore.get(id);
      if (!r || (opts.userId && r.userId !== opts.userId)) return null;
      if (opts.fromStates && !opts.fromStates.includes(r.state)) throw new ReturnStateConflictError(r.state);
      const prev = r.state;
      const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      const updated: ReturnRecord = { ...r, ...defined, updatedAt: now() };
      returnRequestsStore.set(id, updated);
      const changed = Boolean(patch.state && patch.state !== prev);
      if (changed || opts.noteActor) {
        const ev: ReturnEventRecord = {
          id: randomUUID(),
          returnRequestId: id,
          fromState: prev,
          toState: changed ? patch.state! : prev,
          actor: changed ? (opts.actor ?? "user") : opts.noteActor!,
          createdAt: now(),
          updatedAt: now(),
        };
        const list = returnEventsStore.get(id) ?? [];
        list.push(ev);
        returnEventsStore.set(id, list);
        returnEventsById.set(ev.id, ev);
      }
      return updated;
    },
    async listReturnEvents(returnRequestId) {
      return [...(returnEventsStore.get(returnRequestId) ?? [])].sort((a,b)=>a.createdAt.getTime()-b.createdAt.getTime());
    },
    async createReturnEvent(input) {
      const ev: ReturnEventRecord = { id: randomUUID(), returnRequestId: input.returnRequestId, fromState: input.fromState, toState: input.toState, actor: input.actor ?? null, createdAt: now(), updatedAt: now() };
      const list = returnEventsStore.get(input.returnRequestId) ?? [];
      list.push(ev);
      returnEventsStore.set(input.returnRequestId, list);
      returnEventsById.set(ev.id, ev);
      return ev;
    },
    async findMerchantPurchaseById(id) {
      return merchantPurchasesStore.get(id) ?? null;
    },
    async listMerchantPurchasesByIds(userId, ids) {
      return ids
        .map((id) => merchantPurchasesStore.get(id))
        .filter((p): p is MerchantPurchaseRecord => Boolean(p && p.userId === userId));
    },
    async listMerchantPurchaseItemsByIds(userId, ids) {
      return ids
        .map((id) => merchantPurchaseItemsStore.get(id))
        .filter((i): i is MerchantPurchaseItemRecord =>
          Boolean(i && merchantPurchasesStore.get(i.purchaseId)?.userId === userId),
        );
    },
    async findMerchantPurchaseItemById(id) {
      return merchantPurchaseItemsStore.get(id) ?? null;
    },
    async updateMerchantPurchaseDelivery(id, userId, patch) {
      const purchase = merchantPurchasesStore.get(id);
      if (!purchase || purchase.userId !== userId) return null;
      return this.updateMerchantPurchase(id, patch);
    },
    async updateMerchantPurchaseItemDuplicate(id, duplicateWardrobeItemId) {
      const item = merchantPurchaseItemsStore.get(id);
      if (!item) return null;
      const updated: MerchantPurchaseItemRecord = {
        ...item,
        duplicateWardrobeItemId,
        updatedAt: now(),
      };
      merchantPurchaseItemsStore.set(id, updated);
      return updated;
    },

    // P4 gift
    async listRecipients(userId) {
      return [...recipientsStore.values()].filter(r=>r.userId===userId).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
    },
    async findRecipient(id, userId) {
      const r = recipientsStore.get(id);
      if (!r || r.userId !== userId) return null;
      return r;
    },
    async createRecipient(input) {
      const rec: RecipientRecord = { id: randomUUID(), userId: input.userId, name: input.name, relationship: (input.relationship ?? "OTHER") as never, region: input.region ?? "IN", createdAt: now(), updatedAt: now() };
      recipientsStore.set(rec.id, rec);
      const prof: RecipientProfileRecord = {
        id: randomUUID(),
        recipientId: rec.id,
        sizes: input.profile?.sizes ?? {},
        tasteTags: input.profile?.tasteTags ?? [],
        wishlist: normalizeWishlist(input.profile?.wishlist ?? []),
        importantDates: input.profile?.importantDates ?? [],
        notes: input.profile?.notes ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      recipientProfilesStore.set(prof.id, prof);
      recipientProfileByRecipient.set(rec.id, prof.id);
      return rec;
    },
    async findRecipientProfile(recipientId) {
      const pid = recipientProfileByRecipient.get(recipientId);
      if (!pid) return null;
      return recipientProfilesStore.get(pid) ?? null;
    },
    async listRecipientProfiles(recipientIds) {
      return recipientIds.flatMap((rid) => {
        const pid = recipientProfileByRecipient.get(rid);
        const prof = pid ? recipientProfilesStore.get(pid) : undefined;
        return prof ? [prof] : [];
      });
    },
    async upsertRecipientProfile(input) {
      const pid = recipientProfileByRecipient.get(input.recipientId);
      if (pid) {
        const existing = recipientProfilesStore.get(pid)!;
        const updated: RecipientProfileRecord = {
          ...existing,
          sizes: input.sizes ?? existing.sizes,
          tasteTags: input.tasteTags ?? existing.tasteTags,
          wishlist: input.wishlist !== undefined ? normalizeWishlist(input.wishlist) : existing.wishlist,
          importantDates: input.importantDates ?? existing.importantDates,
          notes: input.notes !== undefined ? input.notes : existing.notes,
          updatedAt: now(),
        };
        recipientProfilesStore.set(pid, updated);
        return updated;
      }
      const prof: RecipientProfileRecord = {
        id: randomUUID(),
        recipientId: input.recipientId,
        sizes: input.sizes ?? {},
        tasteTags: input.tasteTags ?? [],
        wishlist: normalizeWishlist(input.wishlist ?? []),
        importantDates: input.importantDates ?? [],
        notes: input.notes ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      recipientProfilesStore.set(prof.id, prof);
      recipientProfileByRecipient.set(input.recipientId, prof.id);
      return prof;
    },
    async listGiftOrders(userId) {
      return [...giftOrdersStore.values()].filter(r=>r.userId===userId).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
    },
    async createGiftOrder(input) {
      const rec: GiftOrderRecord = {
        id: randomUUID(),
        userId: input.userId,
        recipientId: input.recipientId,
        listingId: input.listingId ?? null,
        occasion: (input.occasion ?? null) as never,
        status: "ORDERED",
        affiliateLink: input.affiliateLink ?? null,
        wrapMessage: input.wrapMessage ?? null,
        groupTargetMinor: input.groupTargetMinor ?? null,
        groupCurrency: input.groupTargetMinor != null ? (input.groupCurrency ?? "INR") : (input.groupCurrency ?? null),
        createdAt: now(),
        updatedAt: now(),
      };
      giftOrdersStore.set(rec.id, rec);
      return rec;
    },
    async findGiftOrder(id, userId) {
      const r = giftOrdersStore.get(id);
      if (!r || r.userId !== userId) return null;
      return r;
    },
    async findGiftOrderById(id) {
      return giftOrdersStore.get(id) ?? null;
    },
    async createGroupGiftContribution(input) {
      const keyRef = input.idempotencyKey ? `${input.giftOrderId}:${input.idempotencyKey}` : null;
      const existingId = keyRef ? groupGiftContributionKeys.get(keyRef) : undefined;
      const existing = existingId ? groupGiftContributionsStore.get(existingId) : undefined;
      if (existing) return { contribution: existing, created: false };
      const rec: GroupGiftContributionRecord = {
        id: randomUUID(),
        giftOrderId: input.giftOrderId,
        contributorUserId: input.contributorUserId ?? null,
        contributorName: input.contributorName ?? null,
        amountMinor: input.amountMinor,
        note: input.note ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      groupGiftContributionsStore.set(rec.id, rec);
      if (keyRef) groupGiftContributionKeys.set(keyRef, rec.id);
      return { contribution: rec, created: true };
    },
    async listGroupGiftContributions(giftOrderId) {
      return [...groupGiftContributionsStore.values()]
        .filter((c) => c.giftOrderId === giftOrderId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async sumGroupGiftContributions(giftOrderId) {
      return [...groupGiftContributionsStore.values()]
        .filter((c) => c.giftOrderId === giftOrderId)
        .reduce((sum, c) => sum + c.amountMinor, 0);
    },
    async sumGroupGiftContributionsByOrders(giftOrderIds) {
      const sums = new Map<string, number>(giftOrderIds.map((id) => [id, 0]));
      for (const c of groupGiftContributionsStore.values()) {
        const prev = sums.get(c.giftOrderId);
        if (prev !== undefined) sums.set(c.giftOrderId, prev + c.amountMinor);
      }
      return sums;
    },

    // P4 fit
    async listMeasurementProfiles(userId) {
      return [...measurementStore.values()].filter(r=>r.userId===userId).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
    },
    async findMeasurementProfile(id, userId) {
      const r = measurementStore.get(id);
      if (!r || r.userId !== userId) return null;
      return r;
    },
    async createMeasurementProfile(input) {
      const rec: MeasurementProfileRecord = {
        id: randomUUID(),
        userId: input.userId,
        region: input.region ?? "IN",
        unit: (input.unit ?? "CM") as never,
        points: input.points,
        changeNote: input.changeNote ?? null,
        previousId: input.previousId ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      measurementStore.set(rec.id, rec);
      return rec;
    },
    async listCustomizationTemplates(region) {
      ensureTemplates();
      const all = [...templateStore.values()];
      const filtered = region ? all.filter(t=>t.region===region) : all;
      return filtered.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
    },
    async findCustomizationTemplate(id) {
      ensureTemplates();
      return templateStore.get(id) ?? null;
    },
    async seedCustomizationTemplates() {
      ensureTemplates();
    },
    async createTailoringOrder(input) {
      let snapshot: Record<string, unknown> | null = (input.measurementSnapshot ?? null) as never;
      if (!snapshot && input.measurementProfileId) {
        const mp = measurementStore.get(input.measurementProfileId);
        if (mp) snapshot = mp.points as never;
      }
      const rec: TailoringOrderRecord = {
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
        expectedPickupOn: input.expectedPickupOn ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      tailoringOrdersStore.set(rec.id, rec);
      return rec;
    },
    async findTailoringOrder(id, userId) {
      const r = tailoringOrdersStore.get(id);
      if (!r || r.userId !== userId) return null;
      return r;
    },
    async listTailoringOrders(userId) {
      return [...tailoringOrdersStore.values()].filter(r=>r.userId===userId).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
    },
    async updateTailoringOrderState(id, state) {
      const r = tailoringOrdersStore.get(id);
      if (!r) return null;
      if (r.state !== state && (r.state === "DELIVERED" || r.state === "CANCELLED")) return null;
      const updated: TailoringOrderRecord = { ...r, state, updatedAt: now() };
      tailoringOrdersStore.set(id, updated);
      return updated;
    },
    async updateTailoringOrderFabric(id, userId, patch) {
      const r = tailoringOrdersStore.get(id);
      if (!r || r.userId !== userId) return null;
      const updated: TailoringOrderRecord = {
        ...r,
        fabricRef: patch.fabricRef !== undefined ? patch.fabricRef : r.fabricRef,
        fabricPhotoKeys: patch.fabricPhotoKeys ?? r.fabricPhotoKeys,
        updatedAt: now(),
      };
      tailoringOrdersStore.set(id, updated);
      return updated;
    },
    async createTailoringReview(input) {
      const rec: TailoringReviewRecord = {
        id: randomUUID(),
        sellerId: input.sellerId,
        userId: input.userId,
        orderId: input.orderId ?? null,
        rating: input.rating,
        comment: input.comment ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      tailoringReviewsStore.set(rec.id, rec);
      return rec;
    },
    async listTailoringReviews(sellerId) {
      return [...tailoringReviewsStore.values()]
        .filter((r) => r.sellerId === sellerId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    // --- Vault export helpers ---
    async listIngestionDocumentsByUser(userId, opts) {
      const purchaseIds = new Set(
        [...receiptsStore.values()].filter((r) => r.userId === userId && r.purchaseId).map((r) => r.purchaseId as string),
      );
      const docs: IngestionDocumentRecord[] = [];
      const seen = new Set<string>();
      for (const doc of ingestionDocuments.values()) {
        if ((doc.userId ?? ingestionDocumentUser.get(doc.id)) === userId && !seen.has(doc.id)) {
          seen.add(doc.id);
          docs.push(doc);
        }
      }
      // also include docs linked via purchaseIds via matchedPurchaseId
      for (const pid of purchaseIds) {
        for (const doc of ingestionDocuments.values()) {
          if (doc.matchedPurchaseId === pid && !seen.has(doc.id)) {
            seen.add(doc.id);
            docs.push(doc);
          }
        }
      }
      return docs
        .filter((d) => !opts?.kind || d.kind === opts.kind)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, Math.min(Math.max(opts?.limit ?? 5_000, 1), 5_000));
    },

    async findMerchantPurchasesByIds(ids) {
      return [...new Set(ids)]
        .map((id) => merchantPurchasesStore.get(id))
        .filter((p): p is MerchantPurchaseRecord => p !== undefined);
    },

    async listOrderItemsByUser(userId) {
      const orderIds = new Set(ordersByUser.get(userId) ?? []);
      if (orderIds.size === 0) return [];
      const rows: OrderItemRecord[] = [];
      for (const oid of orderIds) {
        const ids = orderItemsByOrder.get(oid) ?? [];
        for (const iid of ids) {
          const item = orderItems.get(iid);
          if (item) rows.push(item);
        }
      }
      return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async listCartsByUser(userId) {
      const cartId = cartsByUser.get(userId);
      if (!cartId) return [];
      const cart = carts.get(cartId);
      return cart ? [cart] : [];
    },

    async listCartItemsByUser(userId) {
      const cartId = cartsByUser.get(userId);
      if (!cartId) return [];
      const ids = cartItemsByCart.get(cartId) ?? [];
      return ids.map((id) => cartItems.get(id)!).filter(Boolean).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async listSellersByUser(userId) {
      const sid = sellersByUser.get(userId);
      if (!sid) return [];
      const s = sellers.get(sid);
      return s ? [s] : [];
    },

    async listListingsByUser(userId) {
      const sid = sellersByUser.get(userId);
      if (!sid) return [];
      return [...listings.values()].filter((l) => l.sellerId === sid).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async listListingVariantsByUser(userId) {
      const sid = sellersByUser.get(userId);
      if (!sid) return [];
      const listingIds = new Set([...listings.values()].filter((l) => l.sellerId === sid).map((l) => l.id));
      if (listingIds.size === 0) return [];
      return [...variants.values()].filter((v) => listingIds.has(v.listingId)).sort((a, b) => a.id.localeCompare(b.id));
    },

    async listAvatarsByUser(userId) {
      const aid = avatarsByUser.get(userId);
      if (!aid) return [];
      const a = avatars.get(aid);
      return a ? [a] : [];
    },

    async listRendersByUser(userId) {
      const orderIds = new Set(ordersByUser.get(userId) ?? []);
      if (orderIds.size === 0) return [];
      const itemIds = new Set<string>();
      for (const oid of orderIds) {
        const ids = orderItemsByOrder.get(oid) ?? [];
        for (const id of ids) itemIds.add(id);
      }
      if (itemIds.size === 0) return [];
      const rows: RenderRecord[] = [];
      for (const iid of itemIds) {
        const rIds = rendersByOrderItem.get(iid) ?? [];
        for (const rid of rIds) {
          const r = renders.get(rid);
          if (r) rows.push(r);
        }
      }
      return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },

    async listTryonPreviewsByUser(userId) {
      return [...tryonPreviews.values()].filter((t) => t.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async listCoinLedgerByUser(userId) {
      return ledger.filter((e) => e.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async listIapReceiptsByUser(userId) {
      const rows: Array<{ id: string; userId: string; productId: string; coinsGranted: number; createdAt: Date }> = [];
      for (const [eventId, rec] of iapReceiptsByEventId) {
        if (rec.userId === userId) {
          // need to fetch full row; memory stores only userId+coinsGranted, synthesize
          rows.push({ id: eventId, userId: rec.userId, productId: "unknown", coinsGranted: rec.coinsGranted, createdAt: new Date() });
        }
      }
      return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async listRecipientProfilesByUser(userId) {
      const recIds = new Set([...recipientsStore.values()].filter((r) => r.userId === userId).map((r) => r.id));
      if (recIds.size === 0) return [];
      const rows: RecipientProfileRecord[] = [];
      for (const recId of recIds) {
        const pid = recipientProfileByRecipient.get(recId);
        if (pid) {
          const p = recipientProfilesStore.get(pid);
          if (p) rows.push(p);
        }
      }
      return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async listReturnEventsByUser(userId) {
      const reqIds = new Set([...returnRequestsStore.values()].filter((r) => r.userId === userId).map((r) => r.id));
      if (reqIds.size === 0) return [];
      const rows: ReturnEventRecord[] = [];
      for (const rid of reqIds) {
        const evs = returnEventsStore.get(rid) ?? [];
        rows.push(...evs);
      }
      return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async createRepairLog(input) {
      const rec: RepairLogRecord = {
        id: randomUUID(),
        userId: input.userId,
        wardrobeItemId: input.wardrobeItemId,
        costMinor: input.costMinor,
        repairedOn: input.repairedOn,
        kind: input.kind ?? "REPAIR",
        note: input.note ?? null,
        tailorOrderId: input.tailorOrderId ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      repairLogsStore.set(rec.id, rec);
      return rec;
    },
    async listRepairLogs(userId) {
      return [...repairLogsStore.values()]
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listRepairLogsByItem(wardrobeItemId, userId) {
      return [...repairLogsStore.values()]
        .filter((r) => r.userId === userId && r.wardrobeItemId === wardrobeItemId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

  };
  return repos;
}
