import Constants from 'expo-constants';
import type { OrderState } from '@worn/shared';

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
    throw new Error(err.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export async function sendOtp(phone: string) {
  const res = await fetch(`${API_URL}/auth/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  return parseJson<{ message: string }>(res);
}

export async function verifyOtp(phone: string, otp: string) {
  const res = await fetch(`${API_URL}/auth/verify`, {
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

export async function getAvatar(accessToken: string) {
  const res = await fetch(`${API_URL}/avatar`, {
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

  const res = await fetch(`${API_URL}/avatar`, {
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

export type FeedPage = {
  items: Array<{
    id: string;
    title: string;
    category: string;
    coinPrice: number;
    houseModelImageUrl: string;
    sellerId?: string | null;
    sellerName?: string | null;
    affiliateUrl?: string | null;
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
};

export type TryonResponse = {
  status: 'READY' | 'PROCESSING';
  previewUrl: string | null;
};

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function fetchFeed(cursor?: string, limit = 20, sellerId?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  if (sellerId) params.set('seller_id', sellerId);
  const res = await fetch(`${API_URL}/feed?${params.toString()}`);
  return parseJson<FeedPage>(res);
}

export async function fetchListing(id: string) {
  const res = await fetch(`${API_URL}/listings/${id}`);
  return parseJson<ListingDetail>(res);
}

export async function requestTryon(accessToken: string, listingId: string, variantId: string) {
  const res = await fetch(`${API_URL}/listings/${listingId}/tryon`, {
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
  const res = await fetch(`${API_URL}/cart`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<CartResponse>(res);
}

export async function addToCart(accessToken: string, variantId: string, quantity = 1) {
  const res = await fetch(`${API_URL}/cart`, {
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
  const res = await fetch(`${API_URL}/cart`, {
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

export type CoinTransaction = {
  id: string;
  delta: number;
  type: string;
  balanceAfter: number;
  createdAt: string;
};

export type OrderSummary = {
  id: string;
  tier: 'EXPRESS' | 'STANDARD' | 'SLOW_BURN';
  state: OrderState;
  coinTotal: number;
  placedAt: string;
  stateEta?: Partial<Record<OrderState, string>>;
};

export async function fetchCoinBalance(accessToken: string) {
  const res = await fetch(`${API_URL}/coins/balance`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<CoinBalanceResponse>(res);
}

export async function createOrder(
  accessToken: string,
  tier: OrderSummary['tier'],
  idempotencyKey?: string,
) {
  const res = await fetch(`${API_URL}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({ tier, idempotencyKey }),
  });
  return parseJson<OrderSummary>(res);
}

export async function fetchOrders(accessToken: string) {
  const res = await fetch(`${API_URL}/orders`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<{ orders: OrderSummary[] }>(res);
}

export async function fetchOrder(accessToken: string, orderId: string) {
  const res = await fetch(`${API_URL}/orders/${orderId}`, {
    headers: authHeaders(accessToken),
  });
  return parseJson<OrderSummary>(res);
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
  const res = await fetch(`${API_URL}/orders/${orderId}/reveal`, {
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
  const res = await fetch(`${API_URL}/orders/${orderId}/reveal/unlock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({ renderIds, idempotencyKey }),
  });
  return parseJson<{ renders: RenderCard[]; coinsSpent: number }>(res);
}

export async function submitRevealRating(
  accessToken: string,
  orderId: string,
  rating: 'loved' | 'ok' | 'meh',
) {
  const res = await fetch(`${API_URL}/orders/${orderId}/reveal/rating`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({ rating }),
  });
  return parseJson<{ orderId: string; rating: string; recorded: true }>(res);
}
