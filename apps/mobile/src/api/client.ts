import Constants from 'expo-constants';
import type {
  AddCreditBody,
  AddCreditResponse,
  BalanceCheckResponse,
  BrandPriceWatch,
  BrandPriceWatchListResponse,
  CashbackClaim,
  CashbackClaimListResponse,
  ConfirmBalanceBody,
  ConfirmBalanceResponse,
  ConfirmReceiptBody,
  CpwGoal,
  CreateBrandPriceWatchBody,
  CreateCashbackClaimBody,
  CreditCaptureResponse,
  EmiPlan,
  EmiPlanListResponse,
  ExpiryHandledBody,
  ExpiryHandledResponse,
  MergeCreditsBody,
  MergeCreditsResponse,
  MoneyAccountsResponse,
  OrderState,
  PatchReceiptBody,
  PriceDropScanResponse,
  ReceiptListResponse,
  ReceiptParsed,
  ReceiptResponse,
  SizeMapBrandRow as SharedSizeMapBrandRow,
  SpendCreditBody,
  SpendCreditResponse,
  UndoSpendCreditBody,
  UndoSpendCreditResponse,
  VaultExport,
  WarrantyListResponse,
  ClaimWarrantyResponse,
  SnoozeWarrantyBody,
  SnoozeWarrantyResponse,
  Warranty,
} from '@worn/shared';

import { useSessionStore } from '@/src/stores/session';

const API_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_URL ??
  'http://localhost:3000';

export type ApiError = {
  error: string;
  message: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T | ApiError;
  if (!res.ok) {
    const err = data as ApiError;
    throw new ApiRequestError(res.status, err.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

let renewing: Promise<string | null> | null = null;

/**
 * Trades the refresh token for a new pair and returns the new access token, or null if the
 * session can't be renewed. Refresh tokens are single-use, so concurrent callers share one call.
 */
export function refreshSession(): Promise<string | null> {
  renewing ??= renewSession().finally(() => {
    renewing = null;
  });
  return renewing;
}

async function renewSession(): Promise<string | null> {
  const { refreshToken } = useSessionStore.getState();
  if (!refreshToken) return null;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Offline or unreachable: keep the session and let the original request fail.
    return null;
  }

  // Signed out (or in as someone else) while this was in flight.
  if (useSessionStore.getState().refreshToken !== refreshToken) return null;

  if (!res.ok) {
    // Only a rejected token ends the session; a server error might be temporary.
    if (res.status === 401) useSessionStore.getState().clear();
    return null;
  }
  const tokens = (await res.json()) as { accessToken: string; refreshToken: string };
  useSessionStore.getState().setTokens(tokens);
  return tokens.accessToken;
}

/** fetch for API calls: a signed-in request that comes back 401 renews the session once and retries. */
async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status !== 401) return res;

  const headers = new Headers(init.headers);
  const sent = headers.get('Authorization');
  if (!sent) return res;

  // Another request may already have renewed the token this one was sent with.
  const current = useSessionStore.getState().accessToken;
  const accessToken = current && `Bearer ${current}` !== sent ? current : await refreshSession();
  if (!accessToken) return res;

  headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(url, { ...init, headers });
}

export async function sendOtp(phone: string) {
  const res = await apiFetch(`${API_URL}/auth/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  return parseJson<{ message: string }>(res);
}

export async function verifyOtp(phone: string, otp: string) {
  const res = await apiFetch(`${API_URL}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp }),
  });
  return parseJson<{
    accessToken: string;
    refreshToken: string;
    isNewUser?: boolean;
    coinBalance?: number;
  }>(res);
}

export async function signInWithGoogle(idToken: string) {
  const res = await apiFetch(`${API_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  return parseJson<{
    accessToken: string;
    refreshToken: string;
    isNewUser?: boolean;
    coinBalance?: number;
  }>(res);
}

export async function getAvatar(accessToken: string) {
  const res = await apiFetch(`${API_URL}/avatar`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseJson<{ status: string; referencePreviewUrl: string | null }>(res);
}

export async function uploadAvatar(accessToken: string, imageUri: string, fileName = 'avatar.jpg') {
  const form = new FormData();
  form.append(
    'photo',
    {
      uri: imageUri,
      name: fileName,
      type: 'image/jpeg',
    } as unknown as Blob,
  );

  const res = await apiFetch(`${API_URL}/avatar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'multipart/form-data',
    },
    body: form,
  });
  return parseJson<{ status: string; jobId: string }>(res);
}

export { API_URL };

export type AffiliateLink = {
  url: string;
  label: string;
  platform: 'flipkart' | 'amazon' | 'myntra' | 'ajio' | 'nykaa' | 'other';
};

export type FeedPage = {
  items: Array<{
    id: string;
    title: string;
    category: string;
    coinPrice: number;
    realPrice?: string | null;
    houseModelImageUrl: string;
    sellerId?: string | null;
    sellerName?: string | null;
    affiliateUrl?: string | null;
    affiliateLinks?: AffiliateLink[] | null;
  }>;
  nextCursor: string | null;
};

export type ListingDetail = FeedPage['items'][number] & {
  tags: string[];
  variants: Array<{
    id: string;
    size: string;
    color: string;
    garmentImageUrl: string;
  }>;
};

export type CartResponse = {
  items: Array<{
    variantId: string;
    listingId: string;
    title: string;
    size: string;
    color: string;
    coinPriceSnapshot: number;
    quantity: number;
    imageUrl: string;
  }>;
  coinTotal: number;
  coolingOff?: {
    active: boolean;
    heldAt: string;
    releaseAt: string;
    category: string;
    projectedMinor: number;
    limitMinor: number;
    message: string;
  } | null;
};

export type TryonResponse = {
  status: 'READY' | 'PROCESSING';
  previewUrl: string | null;
};

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function fetchFeed(
  cursor?: string,
  limit = 20,
  sellerId?: string,
  options: { category?: string | null; accessToken?: string | null } = {},
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  if (sellerId) params.set('seller_id', sellerId);
  if (options.category) params.set('category', options.category);
  // Optional auth: signed-in shoppers who took the style quiz get matching pieces first.
  const res = await apiFetch(`${API_URL}/feed?${params.toString()}`, {
    headers: options.accessToken ? authHeaders(options.accessToken) : {},
  });
  return parseJson<FeedPage>(res);
}

export type FeedCategory = {
  category: string;
  count: number;
};

export async function fetchFeedCategories() {
  const res = await apiFetch(`${API_URL}/feed/categories`);
  return parseJson<{ categories: FeedCategory[] }>(res);
}

export async function fetchListing(id: string) {
  const res = await apiFetch(`${API_URL}/listings/${id}`);
  return parseJson<ListingDetail>(res);
}

export async function requestTryon(accessToken: string, listingId: string, variantId: string) {
  const res = await apiFetch(`${API_URL}/listings/${listingId}/tryon`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({ variantId }),
  });
  return parseJson<TryonResponse>(res);
}

export async function fetchCart(accessToken: string) {
  const res = await apiFetch(`${API_URL}/cart`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<CartResponse>(res);
}

export async function addToCart(accessToken: string, variantId: string, quantity = 1) {
  const res = await apiFetch(`${API_URL}/cart`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({ variantId, quantity }),
  });
  return parseJson<CartResponse>(res);
}

export async function removeFromCart(accessToken: string, variantId: string) {
  const res = await apiFetch(`${API_URL}/cart`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({ variantId }),
  });
  return parseJson<CartResponse>(res);
}

export type CoinBalanceResponse = {
  balance: number;
};

export type IapValidateResponse = {
  success: true;
  coinsGranted: number;
  balanceAfter: number;
};

export type GenerateRenderResponse = {
  renders: RenderCard[];
  coinsSpent: number;
  isCombine?: boolean;
};

export type CoinTransaction = {
  id: string;
  delta: number;
  type: string;
  balanceAfter: number;
  createdAt: string;
};

export type BudgetNudge = {
  exceeded: boolean;
  category: string;
  limitMinor: number;
  actualMinor: number;
  proposedMinor: number;
  projectedMinor: number;
  message: string;
};

export type OrderSummary = {
  id: string;
  tier: 'EXPRESS' | 'STANDARD' | 'SLOW_BURN';
  state: OrderState;
  coinTotal: number;
  placedAt: string;
  stateEta?: Partial<Record<OrderState, string>>;
  /** Whether paying rushCostCoins would get this order to you sooner. */
  rushAvailable: boolean;
  rushCostCoins: number;
  budgetNudge?: BudgetNudge | null;
  trackedInCloset?: boolean;
};

export type PrebuyFitResponse = {
  score: number;
  overlaps: Array<{
    candidateTitle: string;
    wardrobeItemId: string;
    wardrobeLabel: string;
    score: number;
    reason: 'TITLE' | 'CATEGORY_BRAND' | 'CATEGORY';
  }>;
  gaps: Array<{
    category: string;
    budgetCategory: string;
    ownedCount: number;
    message: string;
  }>;
  budgetNudges: BudgetNudge[];
  softBlock: boolean;
  summary: string;
  primaryBudgetNudge: BudgetNudge | null;
};

export type TrackPlayBuyResponse = {
  purchase: {
    id: string;
    source: string;
    merchant: string;
    orderRef: string | null;
    purchasedAt: string;
    currency: string;
    totalMinor: number;
    status: string;
    rawDocId: string | null;
  };
  items: Array<{
    id: string;
    purchaseId: string;
    title: string;
    category: string | null;
    priceMinor: number;
    imageKey: string | null;
    qty: number;
  }>;
  wardrobeItemIds: string[];
  created: boolean;
  purchaseId: string;
  itemCount: number;
};

export async function fetchCoinBalance(accessToken: string) {
  const res = await apiFetch(`${API_URL}/coins/balance`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<CoinBalanceResponse>(res);
}

export async function createOrder(
  accessToken: string,
  tier: OrderSummary['tier'],
  idempotencyKey?: string,
  coolingOffOverride?: boolean,
) {
  const res = await apiFetch(`${API_URL}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({
      tier,
      idempotencyKey,
      ...(coolingOffOverride ? { coolingOffOverride: true } : {}),
    }),
  });
  if (res.status === 423) {
    const data = (await res.json()) as ApiError & {
      coolingOff?: {
        heldAt: string;
        releaseAt: string;
        category: string;
        projectedMinor: number;
        limitMinor: number;
        cartFingerprint: string;
      } | null;
    };
    const err = new Error(data.message ?? 'Cooling-off hold active') as Error & {
      code: string;
      coolingOff: typeof data.coolingOff;
    };
    err.code = data.error ?? 'COOLING_OFF';
    err.coolingOff = data.coolingOff ?? null;
    throw err;
  }
  return parseJson<OrderSummary>(res);
}

export async function fetchPrebuyFit(accessToken: string, useCart = true) {
  const res = await apiFetch(`${API_URL}/prebuy/fit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({ useCart }),
  });
  return parseJson<PrebuyFitResponse>(res);
}

export async function checkPrebuyFit(
  accessToken: string,
  body:
    | { useCart: true }
    | { listingIds: string[] }
    | {
        candidates: Array<{
          title: string;
          category?: string | null;
          brand?: string | null;
          priceMinor: number;
          qty?: number;
          listingId?: string | null;
        }>;
      }
    | { items: Array<{ title: string; category?: string | null; brand?: string | null; priceMinor: number }> },
) {
  const res = await apiFetch(`${API_URL}/prebuy/fit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(body),
  });
  return parseJson<PrebuyFitResponse>(res);
}

export async function trackPlayBuyInCloset(
  accessToken: string,
  orderId: string,
  seedWardrobe = true,
) {
  const res = await apiFetch(`${API_URL}/orders/${orderId}/track-in-closet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({ seedWardrobe }),
  });
  return parseJson<TrackPlayBuyResponse>(res);
}

export async function fetchOrders(accessToken: string) {
  const res = await apiFetch(`${API_URL}/orders`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{ orders: OrderSummary[] }>(res);
}

export async function fetchOrder(accessToken: string, orderId: string) {
  const res = await apiFetch(`${API_URL}/orders/${orderId}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<OrderSummary>(res);
}

/** A refused request, with its HTTP status so callers can handle e.g. 402 specially. */
export class ApiRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

export type RushOrderResponse = {
  order: OrderSummary;
  balanceAfter: number;
};

export async function rushOrder(accessToken: string, orderId: string) {
  const res = await apiFetch(`${API_URL}/orders/${orderId}/rush`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(res.status, err?.message ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as RushOrderResponse;
}

export type RenderCard = {
  id: string;
  orderItemId: string;
  scenario: string;
  imageUrl: string | null;
  isFree: boolean;
  unlocked: boolean;
  status: string;
  unlockCostCoins?: number;
};

export type RevealResponse = {
  orderId: string;
  renders: RenderCard[];
};

export async function fetchReveal(accessToken: string, orderId: string) {
  const res = await apiFetch(`${API_URL}/orders/${orderId}/reveal`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<RevealResponse>(res);
}

export async function unlockRenders(
  accessToken: string,
  orderId: string,
  renderIds: string[],
  idempotencyKey?: string,
) {
  const res = await apiFetch(`${API_URL}/orders/${orderId}/reveal/unlock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({ renderIds, idempotencyKey }),
  });
  return parseJson<{ renders: RenderCard[]; coinsSpent: number }>(res);
}

export async function validateIap(
  accessToken: string,
  productId: string,
  receipt: string,
) {
  const res = await apiFetch(`${API_URL}/coins/iap/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({ productId, receipt }),
  });
  return parseJson<IapValidateResponse>(res);
}

export async function generateRenders(
  accessToken: string,
  orderId: string,
  orderItemIds: string[],
  scenario: string,
) {
  const res = await apiFetch(`${API_URL}/orders/${orderId}/reveal/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({ orderItemIds, scenario }),
  });
  return parseJson<GenerateRenderResponse>(res);
}

export async function submitRevealRating(
  accessToken: string,
  orderId: string,
  rating: 'loved' | 'ok' | 'meh',
) {
  const res = await apiFetch(`${API_URL}/orders/${orderId}/reveal/rating`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({ rating }),
  });
  return parseJson<{ orderId: string; rating: string; recorded: true }>(res);
}

export async function getMyReferral(accessToken: string) {
  const res = await apiFetch(`${API_URL}/referrals/me`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{ referralCode: string; referredCount: number; earnedCoins: number }>(res);
}

export async function applyReferral(accessToken: string, code: string) {
  const res = await apiFetch(`${API_URL}/referrals/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ referralCode: code }),
  });
  return parseJson<{ applied: true; referrerName: string | null }>(res);
}

/** N36 — log family-share deep-link attribution (optional; friends may hit GET /r/:code). */
export async function attributeReferral(
  referralCode: string,
  source: 'family_share' | 'deep_link' | 'other' = 'family_share',
) {
  const res = await apiFetch(`${API_URL}/referrals/attribute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ referralCode, source }),
  });
  return parseJson<{
    attributed: boolean;
    referralCode: string;
    deepLink: string | null;
    landing: {
      headline: string;
      body: string;
      installCta: string;
      installHint: string;
      referralCode: string;
    };
  }>(res);
}

export type ReturnPollDto = {
  id: string;
  kind: 'return';
  itemLabel: string;
  expiresAt: string;
  expired: boolean;
  tally: { keep: number; return: number; total: number; winner: 'KEEP' | 'RETURN' | null };
  shareText: string;
  deepLink: string;
};

export async function createReturnPoll(
  accessToken: string,
  body: { itemLabel: string; returnRequestId?: string },
) {
  const res = await apiFetch(`${API_URL}/polls/return`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<ReturnPollDto>(res);
}

export type AskFriendPollDto = {
  id: string;
  kind: 'outfit';
  options: Array<{ id: string; label: string; itemIds: string[]; occasion?: string | null }>;
  expiresAt: string;
  expired: boolean;
  plannedFor: string | null;
  tally: { counts: Record<string, number>; total: number; winnerId: string | null };
  winnerAppliedAt: string | null;
  shareText: string;
  deepLink: string;
};

export async function createAskFriendPoll(
  accessToken: string,
  body: {
    options: Array<{
      id?: string;
      label: string;
      itemIds: string[];
      occasion?: string | null;
    }>;
    plannedFor?: string;
  },
) {
  const res = await apiFetch(`${API_URL}/polls/outfit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<AskFriendPollDto>(res);
}

export async function applyAskFriendWinner(
  accessToken: string,
  pollId: string,
  plannedFor?: string,
) {
  const res = await apiFetch(`${API_URL}/polls/outfit/${pollId}/apply-winner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(plannedFor ? { plannedFor } : {}),
  });
  return parseJson<{
    applied: true;
    plannedFor: string;
    outfitId: string;
    winnerId: string;
    poll: AskFriendPollDto;
  }>(res);
}

export async function getStreak(accessToken: string) {
  const res = await apiFetch(`${API_URL}/streaks/me`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    currentStreak: number;
    lastClaimedAt: string | null;
    todayClaimed: boolean;
    nextRewardCoins: number;
    nextRewardDay: number;
  }>(res);
}

export async function claimStreak(accessToken: string) {
  const res = await apiFetch(`${API_URL}/streaks/claim`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    claimed: true;
    coinsGranted: number;
    currentStreak: number;
    balanceAfter: number;
  }>(res);
}

export async function registerPushToken(accessToken: string, token: string) {
  const res = await apiFetch(`${API_URL}/me/push-token`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ token }),
  });
  return parseJson<{ registered: boolean }>(res);
}

/** With `token`, the API only clears it while it's still this device's (not a newer one). */
export async function clearPushToken(accessToken: string, token?: string) {
  const res = await apiFetch(`${API_URL}/me/push-token`, {
    method: 'DELETE',
    headers: token
      ? { 'Content-Type': 'application/json', ...authHeaders(accessToken) }
      : authHeaders(accessToken),
    body: token ? JSON.stringify({ token }) : undefined,
  });
  return parseJson<{ registered: boolean }>(res);
}

export async function getStyleQuiz(accessToken: string) {
  const res = await apiFetch(`${API_URL}/style-quiz`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    questions: Array<{
      id: string;
      question: string;
      options: Array<{ id: string; label: string; tags?: string[] }>;
    }>;
  }>(res);
}

export async function submitStyleQuiz(
  accessToken: string,
  answers: Array<{ questionId: string; optionId: string }>,
) {
  const res = await apiFetch(`${API_URL}/style-quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ answers }),
  });
  return parseJson<{ saved: true; profileTags: string[] }>(res);
}

/** For endpoints that answer 204 No Content on success. */
async function expectNoContent(res: Response) {
  if (res.ok) return;
  const err = (await res.json().catch(() => null)) as ApiError | null;
  throw new Error(err?.message ?? `Request failed (${res.status})`);
}

export type LookbookItem = FeedPage['items'][number];

export async function fetchLookbook(accessToken: string) {
  const res = await apiFetch(`${API_URL}/lookbook`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{ items: LookbookItem[] }>(res);
}

export async function saveToLookbook(accessToken: string, listingId: string) {
  const res = await apiFetch(`${API_URL}/lookbook/${listingId}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
  });
  await expectNoContent(res);
}

export async function removeFromLookbook(accessToken: string, listingId: string) {
  const res = await apiFetch(`${API_URL}/lookbook/${listingId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  await expectNoContent(res);
}

/** Permanently deletes the user's uploaded photos and avatar. */
export async function deleteAvatar(accessToken: string) {
  const res = await apiFetch(`${API_URL}/avatar`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  await expectNoContent(res);
}

export async function getCashback(accessToken: string) {
  const res = await apiFetch(`${API_URL}/cashback/me`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    events: Array<{
      id: string;
      listingId: string | null;
      platform: string;
      coinsEarned: number;
      status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
      createdAt: string;
    }>;
    totalEarned: number;
  }>(res);
}

export async function recordAffiliateClick(
  accessToken: string,
  listingId: string,
  platform: string,
) {
  const clickId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await apiFetch(`${API_URL}/cashback/click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ listingId, platform, clickId, source: 'play_listing' }),
  });
  if (res.ok) return clickId;
  return null;
}

/** MON-AFFILIATE-CLOSET — record Closet CTA affiliate clicks into cashback_events. */
export async function recordClosetAffiliateClick(
  accessToken: string,
  body: {
    source:
      | 'vault_use_it_now'
      | 'use_this_weekend'
      | 'replace_twin'
      | 'missing_piece'
      | 'complete_look';
    platform: string;
    listingId?: string | null;
    url?: string;
    clickId?: string;
  },
) {
  const res = await apiFetch(`${API_URL}/cashback/click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return parseJson<{
    recorded: true;
    clickId: string;
    source: string;
    platform: string;
    listingId: string | null;
  }>(res);
}

export async function fetchCredits(
  accessToken: string,
  opts?: { kind?: AddCreditBody['kind'] },
) {
  const qs = opts?.kind ? `?kind=${encodeURIComponent(opts.kind)}` : '';
  const res = await apiFetch(`${API_URL}/credits${qs}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<MoneyAccountsResponse>(res);
}

export async function addCredit(accessToken: string, body: AddCreditBody) {
  const res = await apiFetch(`${API_URL}/credits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<AddCreditResponse>(res);
}

/** Prefill merchant + last4 from a scanned barcode string. */
export async function captureCreditBarcode(
  accessToken: string,
  barcode: string,
) {
  const res = await apiFetch(`${API_URL}/credits/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ barcode }),
  });
  return parseJson<CreditCaptureResponse>(res);
}

/** Prefill from a physical gift-card photo (optional barcode field). */
export async function captureCreditPhoto(
  accessToken: string,
  imageUri: string,
  opts?: { barcode?: string; fileName?: string },
) {
  const form = new FormData();
  form.append('file', {
    uri: imageUri,
    name: opts?.fileName ?? 'gift-card.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);
  if (opts?.barcode) form.append('barcode', opts.barcode);

  const res = await apiFetch(`${API_URL}/credits/capture/photo`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'multipart/form-data',
    },
    body: form,
  });
  return parseJson<CreditCaptureResponse>(res);
}

export async function spendCredit(
  accessToken: string,
  id: string,
  body: SpendCreditBody,
) {
  const res = await apiFetch(`${API_URL}/credits/${id}/spend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<SpendCreditResponse>(res);
}

/** U001 — undo a SPEND within the 60s grace window. */
export async function undoSpendCredit(
  accessToken: string,
  id: string,
  body: UndoSpendCreditBody,
) {
  const res = await apiFetch(`${API_URL}/credits/${id}/undo-spend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<UndoSpendCreditResponse>(res);
}

/** U002 — merge duplicate gift cards / store credits for one merchant. */
export async function mergeCredits(accessToken: string, body: MergeCreditsBody) {
  const res = await apiFetch(`${API_URL}/credits/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<MergeCreditsResponse>(res);
}

/** U003 — mark expiry checklist handled (snoozes push 7d). */
export async function markCreditExpiryHandled(
  accessToken: string,
  id: string,
  body: ExpiryHandledBody = {},
) {
  const res = await apiFetch(`${API_URL}/credits/${id}/expiry-handled`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<ExpiryHandledResponse>(res);
}

/** WV02-BALANCE-CHECK — refresh via merchant API or get manual re-check hint. */
export async function checkCreditBalance(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/credits/${id}/balance-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
  });
  return parseJson<BalanceCheckResponse>(res);
}

/** WV02-BALANCE-CHECK — confirm a manually verified merchant balance. */
export async function confirmCreditBalance(
  accessToken: string,
  id: string,
  body: ConfirmBalanceBody,
) {
  const res = await apiFetch(`${API_URL}/credits/${id}/confirm-balance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<ConfirmBalanceResponse>(res);
}

// --- Universe P1.2: receipts & warranties ---

export async function uploadReceipt(
  accessToken: string,
  imageUri: string,
  fileName = 'receipt.jpg',
) {
  const form = new FormData();
  form.append('file', {
    uri: imageUri,
    name: fileName,
    type: 'image/jpeg',
  } as unknown as Blob);

  const res = await apiFetch(`${API_URL}/receipts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'multipart/form-data',
    },
    body: form,
  });
  return parseJson<ReceiptParsed>(res);
}

export async function confirmReceipt(
  accessToken: string,
  id: string,
  body: ConfirmReceiptBody,
) {
  const res = await apiFetch(`${API_URL}/receipts/${id}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<ReceiptResponse>(res);
}

export async function patchReceipt(
  accessToken: string,
  id: string,
  body: PatchReceiptBody,
) {
  const res = await apiFetch(`${API_URL}/receipts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<ReceiptParsed>(res);
}

export async function fetchReceipts(
  accessToken: string,
  query?: { merchant?: string; from?: string; to?: string; gstin?: string },
) {
  const params = new URLSearchParams();
  if (query?.merchant) params.set('merchant', query.merchant);
  if (query?.from) params.set('from', query.from);
  if (query?.to) params.set('to', query.to);
  if (query?.gstin) params.set('gstin', query.gstin);
  const qs = params.toString();
  const res = await apiFetch(`${API_URL}/receipts${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<ReceiptListResponse>(res);
}

export async function exportReceipt(
  accessToken: string,
  id: string,
  format: 'image' | 'pdf' = 'image',
) {
  const res = await apiFetch(`${API_URL}/receipts/${id}/export?format=${format}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    id: string;
    format: 'image' | 'pdf';
    filename: string;
    contentType: string;
    downloadUrl: string;
    gstin: string | null;
    merchant: string;
  }>(res);
}

export async function fetchWarranties(accessToken: string) {
  const res = await apiFetch(`${API_URL}/warranties`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<WarrantyListResponse>(res);
}

export async function claimWarranty(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/warranties/${id}/claim`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseJson<ClaimWarrantyResponse>(res);
}

/** W028 — undo claim → ACTIVE. */
export async function unclaimWarranty(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/warranties/${id}/unclaim`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseJson<Warranty>(res);
}

/** N14 — manual card/bank cashback claim queue. */
export async function fetchCashbackClaims(
  accessToken: string,
  status?: 'UNCLAIMED' | 'CLAIMED' | 'EXPIRED',
) {
  const qs = status ? `?status=${status}` : '';
  const res = await apiFetch(`${API_URL}/cashback-claims${qs}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<CashbackClaimListResponse>(res);
}

export async function createCashbackClaim(
  accessToken: string,
  body: CreateCashbackClaimBody,
) {
  const res = await apiFetch(`${API_URL}/cashback-claims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<CashbackClaim>(res);
}

export async function markCashbackClaimed(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/cashback-claims/${id}/claim`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseJson<CashbackClaim>(res);
}

export async function snoozeWarranty(
  accessToken: string,
  id: string,
  body: SnoozeWarrantyBody = {},
) {
  const res = await apiFetch(`${API_URL}/warranties/${id}/snooze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<SnoozeWarrantyResponse>(res);
}

// --- Universe P2: wardrobe / outfits / waste ---
export type CareRules = {
  wash: string;
  bleach: string;
  dry: string;
  iron: string;
  dryClean: string;
  notes?: string[];
  rawText?: string;
  confidence?: number;
};

export type WardrobeItem = {
  id: string;
  userId: string;
  source: string;
  category: string;
  colors: string[];
  brand: string | null;
  costMinor: number;
  imageKeys: string[];
  garmentImageKey: string | null;
  purchaseItemId: string | null;
  laundryStatus: 'CLEAN' | 'DIRTY' | 'IN_LAUNDRY';
  closetStatus?: 'ACTIVE' | 'STORED';
  tags?: string[];
  careRules?: CareRules | null;
  dryCleanTicket?: string | null;
  dryCleanPickupOn?: string | null;
  lentTo?: string | null;
  lentDueOn?: string | null;
  profileId?: string | null;
  createdAt: string;
  updatedAt: string;
  imageUrls?: string[];
  garmentImageUrl?: string | null;
};

export async function fetchWardrobe(accessToken: string, profileId?: string | null) {
  const q = profileId ? `?profileId=${encodeURIComponent(profileId)}` : '';
  const res = await apiFetch(`${API_URL}/wardrobe${q}`, { headers: authHeaders(accessToken) });
  return parseJson<{ items: WardrobeItem[] }>(res);
}

export async function createWardrobeItem(accessToken: string, body: { category: string; colors?: string[]; brand?: string | null; costMinor?: number; imageKeys?: string[]; garmentImageKey?: string | null; laundryStatus?: WardrobeItem['laundryStatus']; profileId?: string | null }) {
  const res = await apiFetch(`${API_URL}/wardrobe`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) }, body: JSON.stringify(body) });
  return parseJson<WardrobeItem>(res);
}

export async function updateWardrobeItem(
  accessToken: string,
  id: string,
  body: {
    category?: string;
    colors?: string[];
    brand?: string | null;
    costMinor?: number;
    imageKeys?: string[];
    garmentImageKey?: string | null;
    laundryStatus?: WardrobeItem['laundryStatus'];
    closetStatus?: WardrobeItem['closetStatus'];
    tags?: string[];
    careRules?: CareRules | null;
    dryCleanTicket?: string | null;
    dryCleanPickupOn?: string | null;
    lentTo?: string | null;
    lentDueOn?: string | null;
    profileId?: string | null;
  },
) {
  const res = await apiFetch(`${API_URL}/wardrobe/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<WardrobeItem>(res);
}

export async function careOcrWardrobeItem(
  accessToken: string,
  id: string,
  body: { imageKey?: string; ocrText?: string },
) {
  const res = await apiFetch(`${API_URL}/wardrobe/${id}/care-ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    itemId: string;
    careRules: CareRules;
    confidence: number;
    rawText: string;
    item: WardrobeItem;
  }>(res);
}

/** Snap a wash/care tag photo → structured careRules on the item (N20). */
export async function careOcrWardrobePhoto(
  accessToken: string,
  id: string,
  imageUri: string,
  fileName = 'care-tag.jpg',
) {
  const form = new FormData();
  form.append('file', {
    uri: imageUri,
    name: fileName,
    type: 'image/jpeg',
  } as unknown as Blob);
  const res = await apiFetch(`${API_URL}/wardrobe/${id}/care-ocr/photo`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'multipart/form-data',
    },
    body: form,
  });
  return parseJson<{
    itemId: string;
    careRules: CareRules;
    confidence: number;
    rawText: string;
    item: WardrobeItem;
  }>(res);
}

export async function dryCleanDropOff(
  accessToken: string,
  id: string,
  body: { ticket: string; pickupOn: string },
) {
  const res = await apiFetch(`${API_URL}/wardrobe/${id}/dry-clean`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    item: WardrobeItem;
    phase: 'IDLE' | 'AT_CLEANER' | 'RETURNED';
    pushScheduled?: boolean;
  }>(res);
}

export async function dryCleanConfirm(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/wardrobe/${id}/dry-clean/confirm`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    item: WardrobeItem;
    phase: 'IDLE' | 'AT_CLEANER' | 'RETURNED';
  }>(res);
}

export async function seasonalSwapWardrobe(
  accessToken: string,
  body: { season: 'summer' | 'winter' | 'monsoon'; tagItemIds?: string[] },
) {
  const res = await apiFetch(`${API_URL}/wardrobe/seasonal-swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    season: string;
    updated: number;
    active: number;
    stored: number;
    items: WardrobeItem[];
  }>(res);
}

export async function deleteWardrobeItem(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/wardrobe/${id}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (res.status === 204) return;
  return parseJson<void>(res);
}

export async function uploadWardrobeItem(accessToken: string, imageUri: string, meta: { category: string; colors?: string[]; brand?: string | null; costMinor?: number }) {
  const form = new FormData();
  form.append('file', { uri: imageUri, name: 'wardrobe.jpg', type: 'image/jpeg' } as unknown as Blob);
  form.append('category', meta.category);
  if (meta.colors) form.append('colors', JSON.stringify(meta.colors));
  if (meta.brand) form.append('brand', meta.brand);
  if (meta.costMinor) form.append('costMinor', String(meta.costMinor));
  const res = await apiFetch(`${API_URL}/wardrobe/upload`, { method: 'POST', headers: { ...authHeaders(accessToken), 'Content-Type': 'multipart/form-data' }, body: form });
  return parseJson<WardrobeItem>(res);
}

export async function tryOnWardrobeItem(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/wardrobe/${id}/tryon`, { method: 'POST', headers: authHeaders(accessToken) });
  return parseJson<{ status: string; previewUrl: string | null; imageKey?: string | null }>(res);
}

export async function fetchTodayOutfit(accessToken: string, opts?: { alt?: number }) {
  const qs = opts?.alt != null && opts.alt > 0 ? `?alt=${opts.alt}` : '';
  const res = await apiFetch(`${API_URL}/outfits/today${qs}`, { headers: authHeaders(accessToken) });
  return parseJson<{
    outfit: {
      id: string;
      itemIds: string[];
      occasion: string | null;
      weatherCtx: Record<string, unknown> | null;
      whyThis?: string[];
      plannedFor?: string | null;
      generatedAt: string;
      items?: WardrobeItem[];
    } | null;
    generated: boolean;
    weatherRerolled?: boolean;
    altIndex?: number;
    hasMore?: boolean;
  }>(res);
}

export async function selectTodayOutfit(
  accessToken: string,
  body: { outfitId?: string; alt?: number },
) {
  const res = await apiFetch(`${API_URL}/outfits/today/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    outfit: {
      id: string;
      itemIds: string[];
      occasion: string | null;
      weatherCtx: Record<string, unknown> | null;
      whyThis?: string[];
      plannedFor?: string | null;
      generatedAt: string;
      items?: WardrobeItem[];
    } | null;
    altIndex: number;
  }>(res);
}

export async function bulkCreateWardrobe(
  accessToken: string,
  items: Array<{
    category: string;
    colors?: string[];
    brand?: string | null;
    costMinor?: number;
    imageKeys?: string[];
    garmentImageKey?: string | null;
    purchaseItemId?: string | null;
  }>,
) {
  const res = await apiFetch(`${API_URL}/wardrobe/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ items }),
  });
  return parseJson<{ items: WardrobeItem[]; created: number }>(res);
}

export async function wardrobeFromPurchases(accessToken: string, purchaseItemIds: string[]) {
  const res = await apiFetch(`${API_URL}/wardrobe/from-purchases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ purchaseItemIds }),
  });
  return parseJson<{ items: WardrobeItem[]; created: number }>(res);
}

export async function fetchImportablePurchases(accessToken: string) {
  const res = await apiFetch(`${API_URL}/wardrobe/importable-purchases`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    items: Array<{
      purchaseItemId: string;
      purchaseId: string;
      merchant: string;
      title: string;
      category: string | null;
      brand: string | null;
      priceMinor: number;
      imageKey: string | null;
      imageUrl?: string | null;
      alreadyInWardrobe: boolean;
    }>;
  }>(res);
}

export type BulkUploadProgress = {
  index: number;
  total: number;
  ok: boolean;
  error?: string;
  item?: WardrobeItem;
};

export async function uploadWardrobeItemsBulk(
  accessToken: string,
  imageUris: string[],
  meta: {
    category: string;
    colors?: string[];
    brand?: string | null;
    costMinor?: number;
  },
  opts?: {
    /** Per-item progress (W059). */
    onProgress?: (p: BulkUploadProgress) => void;
    /** When true, stop uploading further items. */
    shouldCancel?: () => boolean;
    /** Optional per-uri meta override (W060 autotag confirm). */
    perItemMeta?: Array<{
      category: string;
      colors?: string[];
      brand?: string | null;
      costMinor?: number;
    }>;
  },
) {
  const items: WardrobeItem[] = [];
  const errors: Array<{ index: number; message: string }> = [];
  const total = imageUris.length;
  for (let i = 0; i < imageUris.length; i++) {
    if (opts?.shouldCancel?.()) break;
    const uri = imageUris[i]!;
    const itemMeta = opts?.perItemMeta?.[i] ?? meta;
    try {
      const item = await uploadWardrobeItem(accessToken, uri, itemMeta);
      items.push(item);
      opts?.onProgress?.({ index: i, total, ok: true, item });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Upload failed';
      errors.push({ index: i, message });
      opts?.onProgress?.({ index: i, total, ok: false, error: message });
    }
  }
  return {
    items,
    created: items.length,
    errors,
    cancelled: Boolean(opts?.shouldCancel?.()),
  };
}

export type WeekOutfitDay = {
  date: string;
  weekday: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  isToday: boolean;
  outfit: {
    id: string;
    itemIds: string[];
    occasion: string | null;
    weatherCtx: Record<string, unknown> | null;
    whyThis?: string[];
    plannedFor?: string | null;
    generatedAt: string;
    items?: WardrobeItem[];
  } | null;
};

export async function fetchWeekOutfits(accessToken: string, weekStart?: string) {
  const qs = weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : '';
  const res = await apiFetch(`${API_URL}/outfits/week${qs}`, { headers: authHeaders(accessToken) });
  return parseJson<{ weekStart: string; days: WeekOutfitDay[] }>(res);
}

export async function generateWeekOutfit(
  accessToken: string,
  body: {
    date?: string;
    fillWeek?: boolean;
    preferCapsule?: boolean;
    replacePinned?: boolean;
  } = {},
) {
  const res = await apiFetch(`${API_URL}/outfits/week/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    days: Array<{
      date: string;
      outfit: WeekOutfitDay['outfit'];
      skippedPinned?: boolean;
      pinConflict?: string;
    }>;
  }>(res);
}

/** W046 / W066 / U033 — assign / update / pin a week-day outfit. */
export async function patchWeekDayOutfit(
  accessToken: string,
  date: string,
  body: { itemIds?: string[]; occasion?: string | null; pinned?: boolean },
) {
  const res = await apiFetch(`${API_URL}/outfits/week/${encodeURIComponent(date)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<NonNullable<WeekOutfitDay['outfit']>>(res);
}

export async function buildTravelPack(
  accessToken: string,
  body: { startDate: string; endDate: string; maxItems?: number },
) {
  const res = await apiFetch(`${API_URL}/outfits/travel-pack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    startDate: string;
    endDate: string;
    nights: number;
    items: Array<{ id: string; category: string; brand: string | null; slot: string; reason: string }>;
    checklist: string;
  }>(res);
}

export async function planWorkwearWeek(
  accessToken: string,
  body: { weekStart?: string; commit?: boolean; unique?: boolean } = {},
) {
  const res = await apiFetch(`${API_URL}/outfits/week/workwear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    weekStart: string;
    unique: boolean;
    days: Array<{ date: string; weekday: string; itemIds: string[]; occasion: 'WORK' }>;
  }>(res);
}

/** N03 — map device calendar events to occasion outfits. */
export async function outfitsFromCalendar(
  accessToken: string,
  body: {
    events: Array<{ id?: string; title?: string; startAt: string; endAt?: string }>;
    remindNightBefore?: boolean;
    commit?: boolean;
  },
) {
  const res = await apiFetch(`${API_URL}/outfits/from-calendar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    events: Array<{
      eventId: string | null;
      title: string;
      startAt: string;
      occasion: string;
      reason: string;
      plannedFor: string;
      remindAt: string | null;
      reminderScheduled: boolean;
      outfit: WeekOutfitDay['outfit'];
    }>;
  }>(res);
}

/** N39 — wedding / festival multi-day planner. */
export async function planWeddingFestival(
  accessToken: string,
  body: {
    startDate: string;
    endDate: string;
    kind: 'wedding' | 'festival';
    label?: string;
    budgetLimitMinor?: number;
    plannedSpendMinor?: number;
    commit?: boolean;
  },
) {
  const res = await apiFetch(`${API_URL}/outfits/wedding-festival`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    kind: 'wedding' | 'festival';
    label: string;
    startDate: string;
    endDate: string;
    dayCount: number;
    days: Array<{
      date: string;
      weekday: string;
      dayLabel: string;
      occasion: string;
      itemIds: string[];
    }>;
    envelope: {
      limitMinor: number;
      plannedSpendMinor: number;
      status: string;
      alertThresholdHit: boolean;
    } | null;
  }>(res);
}

/** N40 — save interview / ceremony kit (+ night-before reminder). */
export async function saveInterviewKit(
  accessToken: string,
  body: {
    name: string;
    kind?: 'interview' | 'ceremony';
    itemIds: string[];
    eventAt: string;
    remindNightBefore?: boolean;
    commit?: boolean;
  },
) {
  const res = await apiFetch(`${API_URL}/outfits/interview-kit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    kit: {
      id: string;
      name: string;
      kind: string;
      itemIds: string[];
      eventAt: string;
      remindAt: string | null;
      reminderScheduled: boolean;
      occasion: string;
    };
  }>(res);
}

/** W056 — edit event time or cancel night-before reminder. */
export async function patchInterviewKit(
  accessToken: string,
  id: string,
  body: { eventAt?: string; cancelReminder?: boolean; remindNightBefore?: boolean },
) {
  const res = await apiFetch(`${API_URL}/outfits/interview-kit/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    kit: {
      id: string;
      name: string;
      kind: string;
      itemIds: string[];
      eventAt: string;
      remindAt: string | null;
      reminderScheduled: boolean;
      occasion: string;
    };
  }>(res);
}

export async function fetchGoesWith(accessToken: string, id: string, limit = 12) {
  const res = await apiFetch(`${API_URL}/wardrobe/${id}/goes-with?limit=${limit}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    anchorId: string;
    matches: Array<
      WardrobeItem & { score: number; slot: string; reasons: string[] }
    >;
  }>(res);
}

/** N29 — shoe & bag rotation suggestions. */
export async function fetchShoeBagRotation(
  accessToken: string,
  opts?: { kind?: 'shoes' | 'bag' | 'all'; limit?: number },
) {
  const kind = opts?.kind ?? 'all';
  const limit = opts?.limit ?? 10;
  const res = await apiFetch(`${API_URL}/wardrobe/rotation?kind=${kind}&limit=${limit}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    suggestions: Array<{
      id: string;
      category: string;
      brand: string | null;
      colors: string[];
      kind: 'shoes' | 'bag';
      wearCount: number;
      lastWornAt: string | null;
      score: number;
      reason: string;
    }>;
  }>(res);
}

/** N55 / W070 — photo dump → auto-tagged wardrobe items for review. */
export async function runPhotoDump(
  accessToken: string,
  photos: Array<{ imageKey: string; labels?: string[]; text?: string; titleHint?: string }>,
  profileId?: string | null,
) {
  const res = await apiFetch(`${API_URL}/wardrobe/photo-dump`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ photos, profileId: profileId ?? undefined }),
  });
  return parseJson<{
    items: WardrobeItem[];
    created: number;
    tagged: number;
    duplicateWarnings?: unknown[];
  }>(res);
}

/** Upload local photos then run photo-dump tagging (W070). */
export async function runPhotoDumpFromUris(accessToken: string, imageUris: string[]) {
  const photos: Array<{ imageKey: string }> = [];
  for (const uri of imageUris) {
    const uploaded = await uploadWearPhoto(accessToken, uri);
    photos.push({ imageKey: uploaded.imageKey });
  }
  return runPhotoDump(accessToken, photos);
}

/** N31 — missing-piece shopping list with affiliate links. */
export async function fetchMissingPieces(accessToken: string, limit = 8) {
  const res = await apiFetch(`${API_URL}/wardrobe/missing-pieces?limit=${limit}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    gaps: Array<{
      missingSlot: string;
      suggestion: string;
      unlockedByCount: number;
      anchorSlot: string;
      colorHint: string | null;
      message: string;
      affiliateUrl: string;
      priority: number;
    }>;
    summary: string;
  }>(res);
}

/** N32 — capsule builder. */
export async function fetchCapsule(accessToken: string) {
  const res = await apiFetch(`${API_URL}/wardrobe/capsule`, { headers: authHeaders(accessToken) });
  return parseJson<{ itemIds: string[]; maxN: number; items?: WardrobeItem[] }>(res);
}

export async function saveCapsule(accessToken: string, itemIds: string[], maxN?: number) {
  const res = await apiFetch(`${API_URL}/wardrobe/capsule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ itemIds, maxN }),
  });
  return parseJson<{ itemIds: string[]; maxN: number; items?: WardrobeItem[] }>(res);
}

/** N51 — replace worn-out twin. */
export async function fetchReplaceTwins(accessToken: string, itemId: string, limit = 8) {
  const res = await apiFetch(`${API_URL}/waste/${itemId}/replace-twins?limit=${limit}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    wardrobeItemId: string;
    candidates: Array<{
      listingId: string;
      title: string;
      category: string;
      score: number;
      affiliateUrl: string | null;
      platform: string;
      reasons: string[];
    }>;
  }>(res);
}

export async function recordReplaceTwinClick(
  accessToken: string,
  itemId: string,
  body: { listingId: string; platform?: string; clickId?: string },
) {
  const res = await apiFetch(`${API_URL}/waste/${itemId}/replace-twins/click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{ recorded: true; clickId: string; listingId: string; wardrobeItemId: string }>(res);
}

/** N52 — complete-the-look. */
export async function fetchCompleteLook(accessToken: string, itemIds?: string[]) {
  const qs = itemIds?.length ? `?itemIds=${itemIds.join(',')}` : '';
  const res = await apiFetch(`${API_URL}/outfits/complete-look${qs}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    owned: Array<{ slot: string; item: { id: string; category: string } }>;
    missing: Array<{
      slot: string;
      listingId: string;
      title: string;
      affiliateUrl: string | null;
      platform: string;
      score: number;
    }>;
    gaps: Array<{ slot: string; message: string; ownedCompanions: number }>;
    summary: string;
  }>(res);
}

export async function uploadWearPhoto(accessToken: string, imageUri: string) {
  const form = new FormData();
  form.append('file', { uri: imageUri, name: 'wear.jpg', type: 'image/jpeg' } as unknown as Blob);
  const res = await apiFetch(`${API_URL}/wear/photo`, {
    method: 'POST',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'multipart/form-data' },
    body: form,
  });
  return parseJson<{ imageKey: string; imageUrl: string }>(res);
}

export async function logWear(
  accessToken: string,
  body: { wardrobeItemId?: string | null; outfitId?: string | null; wornOn?: string; imageKey?: string | null },
) {
  const res = await apiFetch(`${API_URL}/wear`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) }, body: JSON.stringify(body) });
  return parseJson<{
    id: string;
    wardrobeItemId: string | null;
    outfitId: string | null;
    wornOn: string;
    imageKey?: string | null;
    imageUrl?: string | null;
    undoUntil?: string;
  }>(res);
}

/** U031 — undo wear within 10m. */
export async function undoWearLog(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/wear/${id}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  return parseJson<{ ok: true; id: string }>(res);
}

export type CpwGoalPayload = CpwGoal;

export type WearChallengePayload = {
  eligible: boolean;
  progress: number;
  target: number;
  remaining: number;
  completed: boolean;
  label: string;
};

export type NeverWornShareCardPayload = {
  neverWornCostMinor: number;
  currency: string;
  itemCount: number;
  amountLabel: string;
  blurredMerchants: string[];
  watermark: string;
  headline: string;
  shareText: string;
};

export type DeclutterChallengePayload = {
  eligible: boolean;
  started: boolean;
  progress: number;
  target: number;
  remaining: number;
  completed: boolean;
  label: string;
};

export type DeclutterShareCardPayload = {
  progress: number;
  target: number;
  remaining: number;
  completed: boolean;
  watermark: string;
  headline: string;
  modeLine: string | null;
  shareText: string;
};

export type WasteMetricRow = {
  wardrobeItemId: string;
  wearCount: number;
  lastWornAt: string | null;
  costPerWearMinor: number | null;
  targetCpwMinor?: number | null;
  status: string;
  item?: WardrobeItem;
  wearChallenge?: WearChallengePayload;
  cpwGoal?: CpwGoalPayload;
};

export async function fetchWasteSummary(accessToken: string) {
  const res = await apiFetch(`${API_URL}/waste/summary`, { headers: authHeaders(accessToken) });
  return parseJson<{
    totalItems: number;
    active: number;
    dormant: number;
    dead: number;
    avgCostPerWearMinor: number | null;
    neverWornCostMinor?: number;
    shareCard?: NeverWornShareCardPayload;
    rewearStreak?: {
      currentStreak: number;
      longestStreak: number;
      todayLogged: boolean;
      lastWearOn: string | null;
      brokenByPurchase: boolean;
      label: string;
    };
    co2WaterSavings?: {
      rewearCount: number;
      streakDays: number;
      effectiveRewears: number;
      kgCo2Saved: number;
      litersWaterSaved: number;
      label: string;
    };
    declutterChallenge?: DeclutterChallengePayload;
    declutterShareCard?: DeclutterShareCardPayload;
    metrics: WasteMetricRow[];
  }>(res);
}

export async function fetchRewearStreak(
  accessToken: string,
  opts?: { breakOnPurchase?: boolean },
) {
  const q = opts?.breakOnPurchase ? '?breakOnPurchase=1' : '';
  const res = await apiFetch(`${API_URL}/waste/rewear-streak${q}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    currentStreak: number;
    longestStreak: number;
    todayLogged: boolean;
    lastWearOn: string | null;
    brokenByPurchase: boolean;
    label: string;
  }>(res);
}

export async function fetchWasteDead(accessToken: string) {
  const res = await apiFetch(`${API_URL}/waste/dead`, { headers: authHeaders(accessToken) });
  return parseJson<{ items: WasteMetricRow[] }>(res);
}

export async function disposeWasteItem(accessToken: string, itemId: string, body: { mode?: string; priceMinor?: number | null } = {}) {
  const res = await apiFetch(`${API_URL}/waste/${itemId}/dispose`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) }, body: JSON.stringify(body) });
  return parseJson<{ listingId: string; wardrobeItemId: string; mode: string; status: string }>(res);
}

export async function startWearChallenge(accessToken: string, itemId: string) {
  const res = await apiFetch(`${API_URL}/waste/${itemId}/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
  });
  return parseJson<{
    wardrobeItemId: string;
    wearChallenge: WearChallengePayload;
    pushQueued?: boolean;
  }>(res);
}

// --- Universe P3: accountant ---
export async function fetchAccountantSummary(accessToken: string) {
  const res = await apiFetch(`${API_URL}/accountant/summary`, { headers: authHeaders(accessToken) });
  return parseJson<{
    monthLabel: string;
    monthlySpendMinor: number;
    totalSpendMinor: number;
    spendByCategory: Array<{ period: string; category: string; totalMinor: number }>;
    costPerWearMinor: number | null;
    avgCostPerWearMinor: number | null;
    /** N21 / W069 — lifetime repair & alteration spend. */
    repairSpendMinor?: number;
    monthlyRepairSpendMinor?: number;
    budgets: Array<{
      category: string;
      period: string;
      limitMinor: number;
      actualMinor: number;
      exceeded: boolean;
      envelopeStatus?: string;
      alertThresholdHit?: boolean;
    }>;
    cpwGoals?: Array<{
      wardrobeItemId: string;
      brand?: string | null;
      category?: string;
      costMinor: number;
      cpwGoal: CpwGoalPayload;
    }>;
  }>(res);
}
export async function fetchAccountantSeasonRoi(accessToken: string, year?: number) {
  const q = year != null ? `?year=${year}` : '';
  const res = await apiFetch(`${API_URL}/accountant/roi/season${q}`, { headers: authHeaders(accessToken) });
  return parseJson<{
    year: number;
    seasons: Array<{
      season: string;
      label: string;
      start: string;
      end: string;
      wears: number;
      itemsWorn: number;
      costWornMinor: number;
      costIdleMinor: number;
      itemsIdle: number;
      costPerWearMinor: number | null;
    }>;
    totalWears: number;
    totalCostWornMinor: number;
    totalCostIdleMinor: number;
  }>(res);
}
export async function fetchAccountantLedger(accessToken: string) {
  const res = await apiFetch(`${API_URL}/accountant/ledger`, { headers: authHeaders(accessToken) });
  return parseJson<{ entries: Array<{ id: string; kind: string; description: string; amountMinor: number; createdAt: string; refId: string | null; refType?: string | null }> }>(res);
}
export async function fetchAccountantExportCsv(accessToken: string) {
  const res = await apiFetch(`${API_URL}/accountant/export.csv`, { headers: authHeaders(accessToken) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message ?? `Export failed (${res.status})`);
  }
  return res.text();
}
export async function fetchBudgets(accessToken: string) {
  const res = await apiFetch(`${API_URL}/budgets`, { headers: authHeaders(accessToken) });
  return parseJson<{ budgets: Array<{ id: string; userId: string; category: string; period: string; limitMinor: number; createdAt: string; updatedAt: string }> }>(res);
}
export async function createBudget(accessToken: string, body: { category: string; period: string; limitMinor: number }) {
  const res = await apiFetch(`${API_URL}/budgets`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) }, body: JSON.stringify(body) });
  return parseJson<{ id: string; userId: string; category: string; period: string; limitMinor: number; createdAt: string; updatedAt: string }>(res);
}

export async function fetchCpwGoals(accessToken: string) {
  const res = await apiFetch(`${API_URL}/accountant/cpw-goals`, { headers: authHeaders(accessToken) });
  return parseJson<{
    goals: Array<{
      wardrobeItemId: string;
      brand?: string | null;
      category?: string;
      costMinor: number;
      cpwGoal: CpwGoalPayload;
    }>;
  }>(res);
}

export async function setCpwGoal(accessToken: string, itemId: string, targetCpwMinor: number) {
  const res = await apiFetch(`${API_URL}/accountant/items/${itemId}/cpw-goal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ targetCpwMinor }),
  });
  return parseJson<{
    wardrobeItemId: string;
    targetCpwMinor: number;
    cpwGoal: CpwGoalPayload;
    pushQueued?: boolean;
  }>(res);
}

// --- Universe P3: returns ---
export type ClosetReturnRequest = {
  id: string;
  userId: string;
  purchaseId: string | null;
  purchaseItemId: string | null;
  windowDeadline: string;
  state: string;
  refundMinor: number | null;
  method: string | null;
  tracking: string | null;
  pickupSlotAt?: string | null;
  merchantReturnUrl?: string | null;
  reason?: string | null;
  orderedSize?: string | null;
  preferredSize?: string | null;
  chaseSnoozeUntil?: string | null;
  chaseEscalated?: boolean;
  merchant?: string | null;
  itemTitle?: string | null;
  orderRef?: string | null;
  invoiceRequestedAt?: string | null;
  invoiceReceiptId?: string | null;
  invoiceVaultHref?: string | null;
  labelImageKey?: string | null;
  labelImageUrl?: string | null;
  labelUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function fetchReturns(accessToken: string) {
  const res = await apiFetch(`${API_URL}/returns`, { headers: authHeaders(accessToken) });
  return parseJson<{ returns: ClosetReturnRequest[] }>(res);
}
export async function fetchReturnDetail(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/returns/${id}`, { headers: authHeaders(accessToken) });
  return parseJson<{
    request: ClosetReturnRequest;
    events: Array<{
      id: string;
      returnRequestId: string;
      fromState: string | null;
      toState: string;
      actor: string | null;
      createdAt: string;
    }>;
  }>(res);
}
export async function createReturn(
  accessToken: string,
  body: {
    purchaseId?: string;
    purchaseItemId?: string;
    method?: string;
    reason?: string;
    orderedSize?: string;
    preferredSize?: string;
  },
) {
  const res = await apiFetch(`${API_URL}/returns`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) }, body: JSON.stringify(body) });
  return parseJson<{ id: string; state: string; windowDeadline: string }>(res);
}
export async function initiateReturn(
  accessToken: string,
  id: string,
  body: {
    purchaseId?: string;
    purchaseItemId?: string;
    method?: string;
    reason?: string;
    orderedSize?: string;
    preferredSize?: string;
  } = {},
) {
  const res = await apiFetch(`${API_URL}/returns/${id}/initiate`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) }, body: JSON.stringify(body) });
  return parseJson<ClosetReturnRequest>(res);
}
export async function confirmReturn(accessToken: string, id: string, body: { tracking?: string } = {}) {
  const res = await apiFetch(`${API_URL}/returns/${id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) }, body: JSON.stringify(body) });
  return parseJson<{ id: string; state: string }>(res);
}
/** WV01 / W033 — INITIATED → PICKUP_SCHEDULED with slot. */
export async function bookReturnPickup(
  accessToken: string,
  id: string,
  body: { pickupSlotAt: string },
) {
  const res = await apiFetch(`${API_URL}/returns/${id}/pickup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<ClosetReturnRequest>(res);
}
/** U019 — reschedule pickup slot. */
export async function rescheduleReturnPickup(
  accessToken: string,
  id: string,
  body: { pickupSlotAt: string },
) {
  const res = await apiFetch(`${API_URL}/returns/${id}/pickup/reschedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<ClosetReturnRequest>(res);
}
/** U019 — cancel pickup → INITIATED. */
export async function cancelReturnPickup(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/returns/${id}/pickup/cancel`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseJson<ClosetReturnRequest>(res);
}
/** U026 — request missing GST invoice. */
export async function requestGstInvoice(
  accessToken: string,
  id: string,
  body: { contactOverride?: string } = {},
) {
  const res = await apiFetch(`${API_URL}/returns/${id}/request-invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    request: ClosetReturnRequest;
    packet: {
      subject: string;
      emailBody: string;
      requestUrl: string | null;
      shareText: string;
      contact: string;
    };
    invoiceRequestedAt: string;
  }>(res);
}
/** U029 — attach return label image key. */
export async function attachReturnLabel(
  accessToken: string,
  id: string,
  body: { imageKey: string },
) {
  const res = await apiFetch(`${API_URL}/returns/${id}/label`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<ClosetReturnRequest>(res);
}
/** U029 — mark return label used by pickup agent. */
export async function markReturnLabelUsed(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/returns/${id}/label/used`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseJson<ClosetReturnRequest>(res);
}
/** U020 — snooze refund chase. */
export async function snoozeRefundChase(
  accessToken: string,
  id: string,
  body: { days?: number } = {},
) {
  const res = await apiFetch(`${API_URL}/returns/${id}/chase/snooze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<ClosetReturnRequest>(res);
}
/** U020 — escalate overdue refund chase for ops. */
export async function escalateRefundChase(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/returns/${id}/chase/escalate`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseJson<ClosetReturnRequest>(res);
}
/** U025 — correct return window end date. */
export async function correctReturnWindow(
  accessToken: string,
  id: string,
  body: { windowDeadline: string; reason: string },
) {
  const res = await apiFetch(`${API_URL}/returns/${id}/window`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<ClosetReturnRequest>(res);
}
/** CONFIRMED → REFUNDED; posts REFUND to money_ledger (CASH / STORE_CREDIT). */
export async function markReturnRefunded(
  accessToken: string,
  id: string,
  body: {
    refundMinor?: number;
    destination: 'ORIGINAL_CARD' | 'STORE_CREDIT' | 'UPI';
  },
) {
  const res = await apiFetch(`${API_URL}/returns/${id}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    id: string;
    state: string;
    refundMinor: number | null;
    destination: 'ORIGINAL_CARD' | 'STORE_CREDIT' | 'UPI';
  }>(res);
}

export type HouseholdVaultResponse = {
  householdId: string;
  myAccess: 'VIEW' | 'SPEND';
  mySpendCapMinor: number | null;
  mySpentMinor: number;
  accounts: Array<{
    id: string;
    ownerUserId: string;
    merchant: string;
    kind: string;
    currency: string;
    balanceCacheMinor: number;
    expiresAt: string | null;
  }>;
  members?: Array<{
    userId: string;
    vaultAccess: 'VIEW' | 'SPEND';
    spendCapMinor: number | null;
    spentMinor: number;
  }>;
};

export async function fetchHouseholdVault(accessToken: string, householdId: string) {
  const res = await apiFetch(`${API_URL}/households/${householdId}/vault`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<HouseholdVaultResponse>(res);
}

export async function patchHouseholdVaultMember(
  accessToken: string,
  householdId: string,
  body: {
    userId: string;
    vaultAccess?: 'VIEW' | 'SPEND';
    spendCapMinor?: number | null;
  },
) {
  const res = await apiFetch(`${API_URL}/households/${householdId}/vault/members`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    userId: string;
    vaultAccess: 'VIEW' | 'SPEND';
    spendCapMinor: number | null;
    spentMinor: number;
  }>(res);
}

export async function spendHouseholdVault(
  accessToken: string,
  householdId: string,
  body: { accountId: string; amountMinor: number; idempotencyKey: string },
) {
  const res = await apiFetch(`${API_URL}/households/${householdId}/vault/spend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    balanceMinor: number;
    spentMinor: number;
    remainingCapMinor: number | null;
  }>(res);
}

/** N16 — Refund ETA board until money_ledger credit. */
export type RefundEtaBoardRow = {
  returnId: string;
  merchant: string | null;
  itemTitle: string | null;
  tracking: string | null;
  state: string;
  pipeline: Array<{ id: string; label: string; state: 'done' | 'current' | 'todo' }>;
  etaAt: string | null;
  daysLeft: number | null;
  refundMinor: number | null;
  ledgerCredited: boolean;
  ledgerAmountMinor: number | null;
  ledgerCreditedAt: string | null;
};

export async function fetchRefundEtaBoard(accessToken: string, opts?: { all?: boolean }) {
  const q = opts?.all ? '?all=1' : '';
  const res = await apiFetch(`${API_URL}/returns/refund-eta${q}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{ board: RefundEtaBoardRow[] }>(res);
}

/** N17 / W036 — per-brand size map (the API's SizeMapBrandRowSchema). */
export type SizeMapBrandRow = SharedSizeMapBrandRow;

export async function fetchSizeMap(accessToken: string) {
  const res = await apiFetch(`${API_URL}/returns/size-map`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{ brands: SizeMapBrandRow[] }>(res);
}

// --- N09 / N10: packages + exchange windows ---
export type ClosetPackage = {
  id: string;
  merchant: string;
  orderRef: string | null;
  purchasedAt: string;
  currency: string;
  totalMinor: number;
  deliveryStatus: string;
  etaAt: string | null;
  trackingCode: string | null;
  carrier?: string | null;
  deliveredAt: string | null;
  returnWindowDeadline: string | null;
  exchangeWindowDeadline: string | null;
  deliveryAddressNote?: string | null;
  deliveryProofKeys?: string[];
  itemTitles?: string[];
  suggestWardrobeAdd?: boolean;
  coolingOff?: {
    active: boolean;
    releaseAt: string;
    remainingMs: number;
    cancelUrl: string | null;
    checklist: Array<{ id: string; label: string }>;
    message: string;
  } | null;
  assigneeUserId?: string | null;
  assigneeLabel?: string | null;
};

export async function fetchPackages(accessToken: string, all = false) {
  const qs = all ? '?all=1' : '';
  const res = await apiFetch(`${API_URL}/packages${qs}`, { headers: authHeaders(accessToken) });
  return parseJson<{ packages: ClosetPackage[] }>(res);
}

/** U018 — save tracking / carrier / manual status. */
export async function updatePackage(
  accessToken: string,
  id: string,
  body: {
    deliveryStatus?: string;
    etaAt?: string | null;
    trackingCode?: string | null;
    carrier?: string | null;
    deliveryAddressNote?: string | null;
    deliveryProofKeys?: string[];
  },
) {
  const res = await apiFetch(`${API_URL}/packages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<ClosetPackage>(res);
}

/** U023 — RTO address note + reattempt. */
export async function fixRtoAddress(
  accessToken: string,
  purchaseId: string,
  body: { deliveryAddressNote: string; reattempt?: boolean },
) {
  const res = await apiFetch(`${API_URL}/packages/${purchaseId}/rto/address-fix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<ClosetPackage>(res);
}

/** U024 — attach delivery/damage proof key. */
export async function attachDeliveryProof(
  accessToken: string,
  purchaseId: string,
  body: { imageKey: string },
) {
  const res = await apiFetch(`${API_URL}/packages/${purchaseId}/delivery-proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    purchaseId: string;
    deliveryProofKeys: string[];
    claimPacket: {
      merchant: string;
      orderRef: string | null;
      trackingCode: string | null;
      deliveryAddressNote: string | null;
      proofKeys: string[];
    };
  }>(res);
}

/** U027 — confirm merchant cancel after cooling-off CTA. */
export async function markPackageCancelled(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/packages/${id}/mark-cancelled`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseJson<ClosetPackage>(res);
}

/** U028 — broken item return vs warranty router. */
export async function fetchBrokenItemRouter(accessToken: string, purchaseId: string) {
  const res = await apiFetch(`${API_URL}/packages/${purchaseId}/broken-router`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    path: 'RETURN' | 'WARRANTY' | 'NEITHER';
    reason: string;
    primary: { kind: string; label: string };
    secondaryHint?: string | null;
    purchaseId: string;
    returnWindowDeadline: string | null;
    warrantyId: string | null;
    warrantyCoverageUntil: string | null;
  }>(res);
}

/** U030 — assign package to household member. */
export async function assignPackage(
  accessToken: string,
  id: string,
  body: { assigneeUserId: string | null; householdId?: string },
) {
  const res = await apiFetch(`${API_URL}/packages/${id}/assign`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<ClosetPackage>(res);
}

export async function markPackageDelivered(
  accessToken: string,
  id: string,
  body: { addToWardrobe?: boolean } = {},
) {
  const res = await apiFetch(`${API_URL}/packages/${id}/delivered`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<ClosetPackage & { wardrobeHint?: string | null }>(res);
}

export type ExchangeWindowRow = {
  purchaseId: string;
  merchant: string;
  orderRef: string | null;
  purchasedAt: string;
  returnWindowDeadline: string | null;
  exchangeWindowDeadline: string | null;
  windowsDiffer: boolean;
  daysLeftExchange: number | null;
  daysLeftReturn: number | null;
  itemTitles?: string[];
};

export async function fetchExchanges(accessToken: string) {
  const res = await apiFetch(`${API_URL}/exchanges`, { headers: authHeaders(accessToken) });
  return parseJson<{ exchanges: ExchangeWindowRow[] }>(res);
}

/** N15 / W037 — RTO recovery board */
export type RtoChecklistStep = {
  id: 'CONTACT_MERCHANT' | 'OPEN_REFUND' | 'TRACK_REFUND' | 'CANCEL_OR_RESHIP';
  label: string;
  state: 'done' | 'current' | 'todo';
};

export type RtoRecoveryBoardRow = {
  purchaseId: string;
  merchant: string;
  orderRef: string | null;
  totalMinor: number;
  currency: string;
  deliveryStatus: string;
  trackingCode: string | null;
  deliveryAddressNote?: string | null;
  deliveryProofKeys?: string[];
  failedAt: string | null;
  checklist: RtoChecklistStep[];
  returnId: string | null;
  refundTrack: RefundEtaBoardRow | null;
};

export async function fetchRtoRecovery(accessToken: string, all = false) {
  const qs = all ? '?all=1' : '';
  const res = await apiFetch(`${API_URL}/packages/rto-recovery${qs}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{ board: RtoRecoveryBoardRow[] }>(res);
}

export async function startRtoRefund(
  accessToken: string,
  purchaseId: string,
  body: { method?: string } = {},
) {
  const res = await apiFetch(`${API_URL}/packages/${purchaseId}/rto/start-refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<RtoRecoveryBoardRow>(res);
}

// --- Universe P4: gift ---
export async function fetchRecipients(accessToken: string) {
  const res = await apiFetch(`${API_URL}/recipients`, { headers: authHeaders(accessToken) });
  return parseJson<{ recipients: Array<{ id: string; name: string; relationship: string; region: string; nextOccasionDate?: string | null; nextOccasionLabel?: string | null; daysUntil?: number | null; profile: { sizes: Record<string,string>; tasteTags: string[]; wishlist: string[]; importantDates: Array<{ occasion: string; date: string; label?: string }>; notes: string | null } | null }> }>(res);
}
export async function createRecipient(accessToken: string, body: { name: string; relationship?: string; region?: string; profile?: { tasteTags?: string[]; sizes?: Record<string,string>; wishlist?: string[]; importantDates?: Array<{occasion:string; date:string}>; notes?: string } }) {
  const res = await apiFetch(`${API_URL}/recipients`, { method: 'POST', headers: { 'Content-Type':'application/json', ...authHeaders(accessToken) }, body: JSON.stringify(body) });
  return parseJson<{ id: string; name: string; relationship: string }>(res);
}
export async function fetchRecipientIdeas(accessToken: string, id: string, opts?: { budgetCap?: number }) {
  const q = opts?.budgetCap != null ? `?budgetCap=${opts.budgetCap}` : '';
  const res = await apiFetch(`${API_URL}/recipients/${id}/ideas${q}`, { headers: authHeaders(accessToken) });
  return parseJson<{ recipientId: string; budgetCap?: number | null; ideas: Array<{ id: string; title: string; category: string; coinPrice: number; affiliateUrl: string | null; reason: string; score?: number }> }>(res);
}
export async function createGiftOrder(accessToken: string, body: { recipientId: string; listingId?: string; occasion?: string; affiliateLink?: string }) {
  const res = await apiFetch(`${API_URL}/gifts`, { method: 'POST', headers: { 'Content-Type':'application/json', ...authHeaders(accessToken) }, body: JSON.stringify(body) });
  return parseJson<{ id: string; recipientId: string; listingId: string | null; affiliateLink: string | null }>(res);
}
export async function fetchGifts(accessToken: string) {
  const res = await apiFetch(`${API_URL}/gifts`, { headers: authHeaders(accessToken) });
  return parseJson<{ gifts: Array<{ id:string; recipientId:string; listingId: string | null }> }>(res);
}

// --- Universe P4: fit ---
export async function fetchMeasurements(accessToken: string) {
  const res = await apiFetch(`${API_URL}/fit/measurements`, { headers: authHeaders(accessToken) });
  return parseJson<{ measurements: Array<{ id:string; region:string; unit:string; points: Record<string,number> }> }>(res);
}
export async function createMeasurement(accessToken: string, body: { region?: string; unit?: string; points: Record<string,number> }) {
  const res = await apiFetch(`${API_URL}/fit/measurements`, { method:'POST', headers:{ 'Content-Type':'application/json', ...authHeaders(accessToken)}, body: JSON.stringify(body)});
  return parseJson<{ id:string; points: Record<string,number>}>(res);
}
export async function fetchTemplates(accessToken: string, region?: string) {
  const q = region ? `?region=${encodeURIComponent(region)}` : '';
  const res = await apiFetch(`${API_URL}/fit/templates${q}`, { headers: authHeaders(accessToken) });
  return parseJson<{ templates: Array<{ id:string; region:string; garmentType:string; name:string; optionsSchema: Record<string,unknown> }> }>(res);
}
export async function createTailoringOrder(accessToken: string, body: { templateId: string; measurementProfileId?: string | null; selections?: Record<string,string>; fabricRef?: string; fabricPhotoKeys?: string[]; tailorSellerId?: string | null }) {
  const res = await apiFetch(`${API_URL}/fit/orders`, { method:'POST', headers:{ 'Content-Type':'application/json', ...authHeaders(accessToken)}, body: JSON.stringify(body)});
  return parseJson<{ id:string; state:string; tailorSellerId: string | null; fabricPhotoKeys: string[] }>(res);
}
export async function reorderTailoringOrder(accessToken: string, orderId: string) {
  const res = await apiFetch(`${API_URL}/fit/orders/${orderId}/reorder`, { method:'POST', headers: authHeaders(accessToken) });
  return parseJson<{ id:string; state:string; templateId: string | null; selections: Record<string,string>; fabricPhotoKeys: string[] }>(res);
}
export async function fetchTailoringOrder(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/fit/orders/${id}`, { headers: authHeaders(accessToken)});
  return parseJson<{ id:string; state:string; selections: Record<string,string>; tailorSellerId: string | null }>(res);
}
export async function fetchTailoringOrders(accessToken: string) {
  const res = await apiFetch(`${API_URL}/fit/orders`, { headers: authHeaders(accessToken)});
  return parseJson<{ orders: Array<{ id:string; state:string; templateId: string | null; tailorSellerId?: string | null }> }>(res);
}
export async function fetchFitTailors(accessToken: string) {
  const res = await apiFetch(`${API_URL}/fit/tailors`, { headers: authHeaders(accessToken) });
  return parseJson<{ tailors: Array<{ id: string; shopName: string; sellerType: 'TAILOR'; ratingAvg: number | null; reviewCount: number }> }>(res);
}
export async function previewFitCustomization(accessToken: string, body: { templateId: string; selections?: Record<string, string> }) {
  const res = await apiFetch(`${API_URL}/fit/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{ status: string; previewUrl: string | null; imageKey: string | null; selections: Record<string, string>; summary: string }>(res);
}
export async function createTailorReview(accessToken: string, sellerId: string, body: { orderId?: string | null; rating: number; comment?: string | null }) {
  const res = await apiFetch(`${API_URL}/fit/tailors/${sellerId}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{ id: string; rating: number }>(res);
}

// --- Universe P4: disposition ---
export async function fetchDisposition(accessToken: string) {
  const res = await apiFetch(`${API_URL}/disposition`, { headers: authHeaders(accessToken)});
  return parseJson<{
    listings: Array<{ id:string; wardrobeItemId:string; mode:string; priceMinor:number|null; status:string }>;
    declutterChallenge?: DeclutterChallengePayload;
    declutterShareCard?: DeclutterShareCardPayload;
  }>(res);
}
export async function createDisposition(accessToken: string, body:{ wardrobeItemId:string; mode?:string; priceMinor?:number|null }) {
  const res = await apiFetch(`${API_URL}/disposition`, { method:'POST', headers:{ 'Content-Type':'application/json', ...authHeaders(accessToken)}, body: JSON.stringify(body)});
  return parseJson<{ id:string; mode:string; status:string }>(res);
}

export async function startDeclutterChallenge(accessToken: string, body: { target?: number } = {}) {
  const res = await apiFetch(`${API_URL}/disposition/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    declutterChallenge: DeclutterChallengePayload;
    declutterShareCard: DeclutterShareCardPayload;
    pushQueued?: boolean;
  }>(res);
}

// --- N37: invite-only swap circle ---
export type SwapCircleRow = {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type SwapListingRow = {
  id: string;
  circleId: string;
  ownerUserId: string;
  wardrobeItemId: string;
  dispositionListingId: string | null;
  status: string;
  borrowerUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function fetchSwapCircles(accessToken: string) {
  const res = await apiFetch(`${API_URL}/swap-circles`, { headers: authHeaders(accessToken) });
  return parseJson<{ circles: SwapCircleRow[] }>(res);
}

export async function createSwapCircle(accessToken: string, name: string) {
  const res = await apiFetch(`${API_URL}/swap-circles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ name }),
  });
  return parseJson<SwapCircleRow>(res);
}

export async function joinSwapCircle(accessToken: string, inviteCode: string) {
  const res = await apiFetch(`${API_URL}/swap-circles/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ inviteCode }),
  });
  return parseJson<{
    circle: SwapCircleRow;
    members: Array<{ id: string; userId: string; role: string }>;
    role: string;
  }>(res);
}

export async function fetchSwapInvite(accessToken: string, circleId: string) {
  const res = await apiFetch(`${API_URL}/swap-circles/${circleId}/invite`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{ inviteCode: string; inviteUrl: string; deepLink: string }>(res);
}

export async function fetchSwapListings(accessToken: string, circleId: string) {
  const res = await apiFetch(`${API_URL}/swap-circles/${circleId}/listings`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{ listings: SwapListingRow[] }>(res);
}

export async function createSwapListing(
  accessToken: string,
  circleId: string,
  wardrobeItemId: string,
) {
  const res = await apiFetch(`${API_URL}/swap-circles/${circleId}/listings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ wardrobeItemId }),
  });
  return parseJson<SwapListingRow>(res);
}

export async function borrowSwapListing(
  accessToken: string,
  circleId: string,
  listingId: string,
) {
  const res = await apiFetch(
    `${API_URL}/swap-circles/${circleId}/listings/${listingId}/borrow`,
    { method: 'POST', headers: authHeaders(accessToken) },
  );
  return parseJson<SwapListingRow>(res);
}

export async function returnSwapListing(
  accessToken: string,
  circleId: string,
  listingId: string,
) {
  const res = await apiFetch(
    `${API_URL}/swap-circles/${circleId}/listings/${listingId}/return`,
    { method: 'POST', headers: authHeaders(accessToken) },
  );
  return parseJson<SwapListingRow>(res);
}

// --- N25: borrow / lent ---
export async function lendWardrobeItem(
  accessToken: string,
  id: string,
  body: { lentTo: string; dueOn: string },
) {
  const res = await apiFetch(`${API_URL}/wardrobe/${id}/lend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{ item: WardrobeItem; overdue: boolean; pushScheduled?: boolean }>(res);
}

export async function returnLentWardrobeItem(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/wardrobe/${id}/lend/return`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseJson<{ item: WardrobeItem; overdue: boolean }>(res);
}

export async function fetchLentWardrobe(
  accessToken: string,
  opts?: { due?: 'all' | 'due' | 'overdue'; asOf?: string },
) {
  const params = new URLSearchParams();
  if (opts?.due) params.set('due', opts.due);
  if (opts?.asOf) params.set('asOf', opts.asOf);
  const q = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`${API_URL}/wardrobe/lent${q}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{ asOf: string; filter: string; items: WardrobeItem[] }>(res);
}

// --- N26: household ---
export type HouseholdRow = {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
};

export async function fetchHouseholds(accessToken: string) {
  const res = await apiFetch(`${API_URL}/households`, { headers: authHeaders(accessToken) });
  return parseJson<{ households: HouseholdRow[] }>(res);
}

export async function createHousehold(accessToken: string, name: string) {
  const res = await apiFetch(`${API_URL}/households`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ name }),
  });
  return parseJson<HouseholdRow>(res);
}

export async function joinHousehold(accessToken: string, inviteCode: string) {
  const res = await apiFetch(`${API_URL}/households/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ inviteCode }),
  });
  return parseJson<{
    household: HouseholdRow;
    members: Array<{ id: string; userId: string; role: string }>;
    role: string;
  }>(res);
}

export async function fetchHouseholdWardrobe(accessToken: string, householdId: string) {
  const res = await apiFetch(`${API_URL}/households/${householdId}/wardrobe`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{ householdId: string; items: WardrobeItem[] }>(res);
}

export async function fetchHouseholdInvite(accessToken: string, householdId: string) {
  const res = await apiFetch(`${API_URL}/households/${householdId}/invite`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{ inviteCode: string; inviteUrl: string; deepLink: string }>(res);
}

// --- N27: closet profiles ---
export type ClosetProfileRow = {
  id: string;
  ownerUserId: string;
  householdId: string | null;
  name: string;
  kind: 'SELF' | 'PARTNER' | 'KID' | 'OTHER';
  createdAt: string;
  updatedAt: string;
};

export async function fetchClosetProfiles(accessToken: string) {
  const res = await apiFetch(`${API_URL}/closet-profiles`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{ profiles: ClosetProfileRow[]; activeProfileId?: string | null }>(res);
}

export async function createClosetProfile(
  accessToken: string,
  body: { name: string; kind?: ClosetProfileRow['kind']; householdId?: string | null },
) {
  const res = await apiFetch(`${API_URL}/closet-profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<ClosetProfileRow>(res);
}

/** W065 — delete kids/partner profile (SELF blocked server-side). */
export async function deleteClosetProfile(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/closet-profiles/${id}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (res.status === 204) return { deleted: true as const };
  return parseJson<{ deleted: true }>(res);
}

// --- Universe P0: ingestion (sources + metrics dashboard) ---
export type IngestionSource = {
  id: string;
  kind: string;
  provider: string;
  consentGrantId: string;
  status: string;
  cursor: string | null;
  lastSyncAt: string | null;
  meta?: { mutedMerchants?: string[]; lastError?: string; errorCode?: string } | Record<string, unknown> | null;
  error?: string | null;
  hasToken?: boolean;
  health?: {
    tone: string;
    label: string;
    status: string;
    lastSyncAt: string | null;
    error: string | null;
    needsReconnect: boolean;
    hasToken: boolean;
  };
};

export type IngestionMetrics = {
  totalMessages: number;
  specificHits: number;
  genericHits: number;
  misses: number;
  coverage: number;
  byStatus: Record<string, number>;
  byKind: Record<string, number>;
  byMerchant: Record<string, number>;
  costEstimate: { perMessageMinor: number; estimatedTotalMinor: number; currency: string };
  note: string;
};

export async function fetchIngestionSources(accessToken: string) {
  const res = await apiFetch(`${API_URL}/ingestion/sources`, { headers: authHeaders(accessToken) });
  return parseJson<{ sources: IngestionSource[] }>(res);
}

export type CreateIngestionSourceBody = {
  kind?: 'EMAIL' | 'SMS' | 'RECEIPT';
  provider: string;
};

export type CreateIngestionSourceResponse = {
  source: IngestionSource;
  oauthUrl: string;
};

export async function createIngestionSource(
  accessToken: string,
  body: CreateIngestionSourceBody,
) {
  const res = await apiFetch(`${API_URL}/ingestion/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ kind: body.kind ?? 'EMAIL', provider: body.provider }),
  });
  return parseJson<CreateIngestionSourceResponse>(res);
}

export async function fetchIngestionMetrics(accessToken: string) {
  const res = await apiFetch(`${API_URL}/ingestion/metrics`, { headers: authHeaders(accessToken) });
  return parseJson<IngestionMetrics>(res);
}

export type IngestionActivityItem = {
  id: string;
  kind: string;
  merchant: string | null;
  status: string;
  matchedPurchaseId: string | null;
  subject: string | null;
  snippet: string | null;
  totalMinor: number | null;
  currency: string | null;
  createdAt: string;
};

export type CorrectIngestionDocumentBody = {
  merchant?: string;
  totalMinor?: number;
  currency?: string;
  items?: Array<{ title: string; priceMinor: number; qty?: number; category?: string | null }>;
};

export async function fetchIngestionActivity(accessToken: string, limit = 50) {
  const res = await apiFetch(`${API_URL}/ingestion/activity?limit=${limit}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{ items: IngestionActivityItem[] }>(res);
}

export async function correctIngestionDocument(
  accessToken: string,
  documentId: string,
  body: CorrectIngestionDocumentBody,
) {
  const res = await apiFetch(`${API_URL}/ingestion/documents/${documentId}/correct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    id: string;
    status: string;
    matchedPurchaseId: string | null;
    merchant: string | null;
    totalMinor: number | null;
    currency: string | null;
  }>(res);
}

export async function patchIngestionSource(
  accessToken: string,
  sourceId: string,
  body: { status?: 'PAUSED' | 'IDLE'; mutedMerchants?: string[] },
) {
  const res = await apiFetch(`${API_URL}/ingestion/sources/${sourceId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{ source: IngestionSource & { meta?: Record<string, unknown> | null } }>(res);
}

/** N48 — purchases with line items (excludes DUPLICATE). */
export type ClosetPurchaseItem = {
  id: string;
  purchaseId: string;
  title: string;
  category: string | null;
  brand?: string | null;
  priceMinor: number;
  imageKey: string | null;
  qty: number;
};

export type ClosetPurchase = {
  id: string;
  source: string;
  merchant: string;
  orderRef: string | null;
  purchasedAt: string;
  currency: string;
  totalMinor: number;
  status: string;
  rawDocId: string | null;
};

export type ClosetPurchaseWithItems = {
  purchase: ClosetPurchase;
  items: ClosetPurchaseItem[];
};

export async function fetchPurchases(accessToken: string) {
  const res = await apiFetch(`${API_URL}/purchases`, { headers: authHeaders(accessToken) });
  return parseJson<{ purchases: ClosetPurchaseWithItems[] }>(res);
}

export async function mergePurchases(
  accessToken: string,
  body: { targetPurchaseId: string; sourcePurchaseId: string },
) {
  const res = await apiFetch(`${API_URL}/purchases/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    purchase: ClosetPurchase;
    items: ClosetPurchaseItem[];
    mergedFromId: string;
  }>(res);
}

export async function splitPurchase(
  accessToken: string,
  body: { purchaseId: string; itemIds: string[]; merchant?: string },
) {
  const res = await apiFetch(`${API_URL}/purchases/split`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    original: ClosetPurchaseWithItems;
    split: ClosetPurchaseWithItems;
  }>(res);
}

/** Consent-center disconnect — DELETE /ingestion/sources/:id (204). */
export async function disconnectIngestionSource(accessToken: string, sourceId: string) {
  const res = await apiFetch(`${API_URL}/ingestion/sources/${sourceId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as ApiError;
    throw new Error(err.message ?? `Disconnect failed (${res.status})`);
  }
}

export type ConsentGrant = {
  id: string;
  userId: string;
  scope: string;
  grantedAt: string;
  revokedAt: string | null;
  source: string;
  meta: Record<string, unknown> | null;
};

export async function fetchConsents(accessToken: string) {
  const res = await apiFetch(`${API_URL}/vault/consent`, { headers: authHeaders(accessToken) });
  return parseJson<{ grants: ConsentGrant[] }>(res);
}

export async function grantConsent(accessToken: string, scope: string, source = 'mobile') {
  // The server expects { userId, scope, source } but userId is inferred from JWT;
  // we send a placeholder UUID and the server ignores it in favor of the token's sub.
  const res = await apiFetch(`${API_URL}/vault/consent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ userId: '00000000-0000-0000-0000-000000000000', scope, source }),
  });
  return parseJson<ConsentGrant>(res);
}

export async function revokeConsent(accessToken: string, scope: string) {
  const res = await apiFetch(`${API_URL}/vault/consent/${scope}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as ApiError;
    throw new Error(err.message ?? `Revoke failed (${res.status})`);
  }
}

export async function fetchVaultAudit(accessToken: string, limit = 50) {
  const res = await apiFetch(`${API_URL}/vault/audit?limit=${limit}`, { headers: authHeaders(accessToken) });
  return parseJson<{ records: Array<{ id: string; event: string; userId?: string; timestamp: string; payload: Record<string, unknown> }> }>(res);
}

/** GDPR/DPDP self-service dump — JSON from GET /vault/export. */
export async function exportVaultData(accessToken: string) {
  const res = await apiFetch(`${API_URL}/vault/export`, { headers: authHeaders(accessToken) });
  return parseJson<VaultExport>(res);
}

/** Hard-delete all user vault data — DELETE /vault (204). */
export async function deleteVault(accessToken: string) {
  const res = await apiFetch(`${API_URL}/vault`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as ApiError;
    throw new Error(err.message ?? `Delete failed (${res.status})`);
  }
}

export type NotificationPreferences = {
  quietHoursStart: string;
  quietHoursEnd: string;
  categories: {
    returns: boolean;
    warranty: boolean;
    credits: boolean;
    outfits: boolean;
    digest: boolean;
  };
  frequencyCaps?: {
    returns: number;
    warranty: number;
    credits: number;
    outfits: number;
    digest: number;
  };
};

export async function fetchNotificationPreferences(accessToken: string) {
  const res = await apiFetch(`${API_URL}/vault/notification-preferences`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<NotificationPreferences>(res);
}

export async function updateNotificationPreferences(
  accessToken: string,
  body: Partial<Omit<NotificationPreferences, 'categories'>> & {
    categories?: Partial<NotificationPreferences['categories']>;
  },
) {
  const res = await apiFetch(`${API_URL}/vault/notification-preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<NotificationPreferences>(res);
}

export async function ingestSms(accessToken: string, body: { from: string; body: string; receivedAt?: string }) {
  const res = await apiFetch(`${API_URL}/ingestion/sms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{ id: string; status: string }>(res);
}

// --- MON-REVENUECAT / MON-UPI-REGIONAL (scaffold — no store secrets) ---
export type PaywallOfferings = {
  offerings: Array<{
    productId: string;
    label: string;
    entitlementIds: Array<'accountant' | 'outfits'>;
    trialDays: number;
    priceLabel: string | null;
    currency: string | null;
  }>;
  gatesEnabled: boolean;
  provider: 'revenuecat' | 'upi' | 'none';
};

export async function fetchEntitlementOfferings(
  accessToken: string,
  region?: 'IN' | 'US' | 'GLOBAL',
) {
  const q = region ? `?region=${region}` : '';
  const res = await apiFetch(`${API_URL}/entitlements/offerings${q}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<PaywallOfferings>(res);
}

export async function fetchEntitlementSnapshot(accessToken: string) {
  const res = await apiFetch(`${API_URL}/entitlements`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    userId: string;
    grants: Array<{
      entitlementId: 'accountant' | 'outfits';
      productId: string;
      expiresAt: string | null;
      isTrial: boolean;
      source: 'revenuecat' | 'upi' | 'dev';
    }>;
    asOf: string;
  }>(res);
}

/** Simulated trial start — never sends a real App Store / Play receipt. */
export async function syncEntitlementTrial(
  accessToken: string,
  productId: string,
) {
  const res = await apiFetch(`${API_URL}/entitlements/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({
      productId,
      startTrial: true,
      receiptOrToken: 'simulated-dev-token',
    }),
  });
  return parseJson<{ snapshot: Awaited<ReturnType<typeof fetchEntitlementSnapshot>> }>(res);
}

export async function createUpiPaymentIntent(
  accessToken: string,
  body: { productId: string; region?: 'IN' | 'US' | 'GLOBAL'; method?: 'upi' | 'iap' | 'card' },
) {
  const res = await apiFetch(`${API_URL}/payments/intents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    id: string;
    provider: string;
    productId: string;
    amountMinor: number;
    currency: string;
    upiIntentUrl: string | null;
    status: string;
    publicKeyHint: string | null;
  }>(res);
}

export async function confirmUpiPayment(
  accessToken: string,
  intentId: string,
) {
  const res = await apiFetch(`${API_URL}/payments/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ intentId }),
  });
  return parseJson<{
    intent: { id: string; status: string; upiIntentUrl: string | null };
    entitlementsGranted: string[];
  }>(res);
}

/** N12 / W029 — brand price watches + scan hits. */
export async function fetchPriceWatches(accessToken: string) {
  const res = await apiFetch(`${API_URL}/price-watches`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<BrandPriceWatchListResponse>(res);
}

export async function createBrandPriceWatch(
  accessToken: string,
  body: CreateBrandPriceWatchBody,
) {
  const res = await apiFetch(`${API_URL}/price-watches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<BrandPriceWatch>(res);
}

export async function scanPriceDrops(accessToken: string) {
  const res = await apiFetch(`${API_URL}/price-watches/scan`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseJson<PriceDropScanResponse>(res);
}

/** N13 / W030 — EMI plans. */
export async function fetchEmiPlans(
  accessToken: string,
  status?: 'ACTIVE' | 'PAID' | 'DEFAULTED',
) {
  const qs = status ? `?status=${status}` : '';
  const res = await apiFetch(`${API_URL}/emi${qs}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<EmiPlanListResponse>(res);
}

export async function payEmiPlan(
  accessToken: string,
  id: string,
  body: { amountMinor?: number } = {},
) {
  const res = await apiFetch(`${API_URL}/emi/${id}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<EmiPlan>(res);
}

/** U007 — paste EMI due SMS → create schedule plan. */
export async function createEmiFromSms(
  accessToken: string,
  body: { body: string; from?: string; subject?: string },
) {
  const res = await apiFetch(`${API_URL}/emi/from-sms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<EmiPlan>(res);
}

/** U039 — overdue lent enforce actions. */
export async function lentOverdueAction(
  accessToken: string,
  id: string,
  action: 'nudge' | 'returned' | 'lost',
) {
  const res = await apiFetch(`${API_URL}/wardrobe/${id}/lend/overdue-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ action }),
  });
  return parseJson<{
    action: 'nudge' | 'returned' | 'lost';
    item?: WardrobeItem;
    message?: string;
    wasteNote?: string | null;
  }>(res);
}

/** U040 — photo-dump triage. */
export async function triagePhotoDumpItem(
  accessToken: string,
  id: string,
  decision: 'keep' | 'wardrobe' | 'discard',
) {
  const res = await apiFetch(`${API_URL}/wardrobe/${id}/photo-dump/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ decision }),
  });
  return parseJson<{
    decision: string;
    item: WardrobeItem | null;
    deleted: boolean;
    undoUntil: string | null;
  }>(res);
}

export async function undoPhotoDumpTriage(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/wardrobe/${id}/photo-dump/triage/undo`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseJson<{ ok: true; item: WardrobeItem }>(res);
}

/** U035 — dispose decision tree. */
export async function decideDisposition(
  accessToken: string,
  body: {
    wardrobeItemId: string;
    stillWear?: boolean;
    hasValue?: boolean;
    willingEffort?: boolean;
    preferBarter?: boolean;
    priceMinor?: number | null;
  },
) {
  const res = await apiFetch(`${API_URL}/disposition/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    mode: string;
    nextAction: string;
    reason: string;
    listingId: string | null;
    snoozeUntil: string | null;
  }>(res);
}

/** U037 — update measurement with change note. */
export async function updateMeasurement(
  accessToken: string,
  id: string,
  body: { points: Record<string, number>; changeNote?: string | null },
) {
  const res = await apiFetch(`${API_URL}/fit/measurements/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{
    id: string;
    points: Record<string, number>;
    changeNote?: string | null;
  }>(res);
}

/** U038 — mark tailor received. */
export async function markTailorReceived(accessToken: string, id: string) {
  const res = await apiFetch(`${API_URL}/fit/orders/${id}/received`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseJson<{ id: string; state: string; timeline?: unknown[] }>(res);
}

/** U032 — laundry rules + batch clean. */
export async function fetchLaundryRules(accessToken: string) {
  const res = await apiFetch(`${API_URL}/wardrobe/laundry-rules`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{ dirtyAfterWears: number | null; dirtyOnSweatTag: boolean }>(res);
}

export async function updateLaundryRules(
  accessToken: string,
  body: { dirtyAfterWears?: number | null; dirtyOnSweatTag?: boolean },
) {
  const res = await apiFetch(`${API_URL}/wardrobe/laundry-rules`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(body),
  });
  return parseJson<{ dirtyAfterWears: number | null; dirtyOnSweatTag: boolean }>(res);
}

export async function batchCleanLaundry(accessToken: string, itemIds?: string[]) {
  const res = await apiFetch(`${API_URL}/wardrobe/laundry/batch-clean`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(itemIds ? { itemIds } : {}),
  });
  return parseJson<{ cleaned: number; itemIds: string[] }>(res);
}

/** U034 — missing layer shop. */
export async function fetchMissingLayers(
  accessToken: string,
  opts?: { tempC?: number; condition?: string; occasion?: string },
) {
  const params = new URLSearchParams();
  if (opts?.tempC != null) params.set('tempC', String(opts.tempC));
  if (opts?.condition) params.set('condition', opts.condition);
  if (opts?.occasion) params.set('occasion', opts.occasion);
  const q = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`${API_URL}/wardrobe/missing-layers${q}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    gaps: Array<{
      id: string;
      gapReason: string;
      suggestion: string;
      slot: string;
      affiliateUrl: string;
    }>;
  }>(res);
}

export async function dismissMissingLayer(accessToken: string, gapId: string) {
  const res = await apiFetch(
    `${API_URL}/wardrobe/missing-layers/${encodeURIComponent(gapId)}/dismiss`,
    { method: 'POST', headers: authHeaders(accessToken) },
  );
  return parseJson<{ dismissedIds: string[] }>(res);
}

/** U036 — CPW threshold. */
export async function fetchCpwThreshold(accessToken: string) {
  const res = await apiFetch(`${API_URL}/accountant/cpw-threshold`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{
    maxCpwMinor: number | null;
    alerts: Array<{
      wardrobeItemId: string;
      headline: string;
      body: string;
      disposeDeepLink: string;
      wearChallengeDeepLink: string;
    }>;
  }>(res);
}

export async function updateCpwThreshold(
  accessToken: string,
  maxCpwMinor: number | null,
) {
  const res = await apiFetch(`${API_URL}/accountant/cpw-threshold`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ maxCpwMinor }),
  });
  return parseJson<{ maxCpwMinor: number | null }>(res);
}
