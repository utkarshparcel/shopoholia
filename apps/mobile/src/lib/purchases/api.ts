import type { EntitlementSnapshot } from '@worn/shared';

import { API_URL, refreshSession } from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';

import { premiumProductIdFor } from './products';
import type { PurchaseStore, StoreTransaction } from './types';

/** A coin pack as the server sells it. The server, not the app, decides how many coins a pack grants. */
export type CoinPackOffer = {
  id: string;
  storeProductId: string;
  coins: number;
  label?: string;
  popular?: boolean;
  bestValue?: boolean;
};

/**
 * GET /coins/packs. `stores[store]: false`: the server can't verify that store's purchases now.
 * An older server sends only `purchasesAvailable`.
 */
export type CoinPacksOffer = {
  purchasesAvailable: boolean;
  stores: Record<PurchaseStore, boolean> | null;
  packs: CoinPackOffer[];
};

/** Whether the server can credit a purchase from `store` now. */
export function storeAvailable(
  offer: { purchasesAvailable: boolean; stores?: Record<PurchaseStore, boolean> | null },
  store: PurchaseStore,
): boolean {
  return offer.stores ? offer.stores[store] === true : offer.purchasesAvailable;
}

export const entitlementKeys = {
  snapshot: (userId: string | null) => ['entitlements', userId] as const,
};

export type CoinsConfirmed = {
  /** The transaction's original grant; a repeat returns the same number. */
  coinsGranted: number;
  /** The user's balance now. */
  balanceAfter: number;
  /** Credited before (another call, another device, the store's notification): still a success. */
  alreadyGranted: boolean;
  /** The store refunded it and the server took its coins back. */
  refunded: boolean;
};

/**
 * Why the server didn't confirm a purchase (iap-contract.md, section 4, "Finishing the transaction"):
 * - conflict: 409, it belongs to another Worn account. Finish it; never retry.
 * - refunded: 402 purchase_refunded, refunded before it was credited. Finish it; nothing was added.
 * - rejected: 400 or another 402 verdict (purchase_not_found, product_mismatch, invalid_proof,
 *   subscription_inactive). Finish it, drop it and report it.
 * - pending: 402 purchase_pending. Not finished; the store's listener re-delivers it once paid.
 * - unavailable: 503 or another 5xx. Keep it; back off and retry.
 * - retry: offline, timeout, 401, 429 (after `retry-after`) and any other status. Keep it; retry.
 */
export type PurchaseApiFailure = 'conflict' | 'refunded' | 'rejected' | 'pending' | 'unavailable' | 'retry';

export class PurchaseApiError extends Error {
  readonly failure: PurchaseApiFailure;
  readonly status: number | null;
  /** The body's `error` code, e.g. "purchase_not_found". */
  readonly code: string | null;
  /** 429: how long the server asked to wait. */
  readonly retryAfterMs: number | null;

  constructor(
    failure: PurchaseApiFailure,
    status: number | null,
    code: string | null = null,
    retryAfterMs: number | null = null,
  ) {
    super(`purchase request failed: ${failure}${status === null ? '' : ` (${status}${code ? ` ${code}` : ''})`}`);
    this.name = 'PurchaseApiError';
    this.failure = failure;
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

export function failureFor(status: number, code: string | null = null): PurchaseApiFailure {
  if (status === 409) return 'conflict';
  if (status === 402) {
    if (code === 'purchase_refunded') return 'refunded';
    if (code === 'purchase_pending') return 'pending';
    return 'rejected';
  }
  if (status === 400) return 'rejected';
  if (status >= 500) return 'unavailable';
  return 'retry';
}

/** `retry-after` in seconds; an HTTP date or garbage gives null. */
function retryAfterMsOf(res: Response): number | null {
  const seconds = Number(res.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/** The store's proof under the field the server reads for that store. */
function proofFields(transaction: StoreTransaction): { jws?: string; purchaseToken?: string } {
  if (!transaction.proof) return {};
  return transaction.store === 'app_store' ? { jws: transaction.proof } : { purchaseToken: transaction.proof };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** A signed-in request; a 401 renews the session once. Network errors become `retry`. */
async function authedRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string) =>
    fetchWithTimeout(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
      },
    });

  const token = useSessionStore.getState().accessToken;
  if (!token) throw new PurchaseApiError('retry', null);
  try {
    const res = await send(token);
    if (res.status !== 401) return res;
    const renewed = await refreshSession();
    return renewed ? await send(renewed) : res;
  } catch (error) {
    if (error instanceof PurchaseApiError) throw error;
    throw new PurchaseApiError('retry', null);
  }
}

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let code: string | null = null;
    try {
      const body = (await res.json()) as { error?: unknown } | null;
      code = typeof body?.error === 'string' ? body.error : null;
    } catch {
      code = null;
    }
    throw new PurchaseApiError(failureFor(res.status, code), res.status, code, retryAfterMsOf(res));
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new PurchaseApiError('retry', res.status);
  }
}

/** POST /coins/iap/validate. The same transaction twice returns the same 200, credited once. */
export async function validateCoinPurchase(transaction: StoreTransaction): Promise<CoinsConfirmed> {
  const res = await authedRequest('/coins/iap/validate', {
    method: 'POST',
    body: JSON.stringify({
      productId: transaction.productId,
      store: transaction.store,
      transactionId: transaction.transactionId,
      ...proofFields(transaction),
    }),
  });
  const body = await readJson<{
    coinsGranted?: unknown;
    balanceAfter?: unknown;
    alreadyGranted?: unknown;
    refunded?: unknown;
  }>(res);
  if (typeof body.coinsGranted !== 'number' || typeof body.balanceAfter !== 'number') {
    throw new PurchaseApiError('retry', res.status);
  }
  return {
    coinsGranted: body.coinsGranted,
    balanceAfter: body.balanceAfter,
    alreadyGranted: body.alreadyGranted === true,
    refunded: body.refunded === true,
  };
}

/**
 * POST /entitlements/sync with a store subscription transaction; the server verifies it. It takes
 * the Closet product id (`closet_premium_monthly`), not the store's.
 */
export async function syncSubscriptionPurchase(
  transaction: StoreTransaction,
): Promise<EntitlementSnapshot> {
  const res = await authedRequest('/entitlements/sync', {
    method: 'POST',
    body: JSON.stringify({
      productId: premiumProductIdFor(transaction.productId) ?? transaction.productId,
      store: transaction.store,
      ...proofFields(transaction),
    }),
  });
  const body = await readJson<{ snapshot?: EntitlementSnapshot }>(res);
  if (!body.snapshot || !Array.isArray(body.snapshot.grants)) {
    throw new PurchaseApiError('retry', res.status);
  }
  return body.snapshot;
}

/** GET /entitlements: the server's verified entitlements. */
export async function fetchEntitlements(): Promise<EntitlementSnapshot> {
  const res = await authedRequest('/entitlements');
  return readJson<EntitlementSnapshot>(res);
}

function isOffer(value: unknown): value is CoinPackOffer {
  const v = value as Partial<CoinPackOffer> | null;
  return (
    typeof v?.id === 'string' &&
    typeof v.storeProductId === 'string' &&
    typeof v.coins === 'number' &&
    v.coins > 0
  );
}

/** GET /coins/packs (no sign-in needed). Throws PurchaseApiError. */
export async function fetchCoinPacks(): Promise<CoinPacksOffer> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_URL}/coins/packs`, {});
  } catch {
    throw new PurchaseApiError('retry', null);
  }
  const body = await readJson<{ purchasesAvailable?: unknown; stores?: unknown; packs?: unknown } | null>(res);
  if (!body || !Array.isArray(body.packs)) throw new PurchaseApiError('retry', res.status);
  const stores = body.stores as Partial<Record<PurchaseStore, unknown>> | null | undefined;
  return {
    purchasesAvailable: body.purchasesAvailable === true,
    stores:
      stores && typeof stores === 'object'
        ? { app_store: stores.app_store === true, play_store: stores.play_store === true }
        : null,
    packs: body.packs.filter(isOffer),
  };
}
