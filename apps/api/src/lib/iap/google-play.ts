/**
 * Google Play Developer API client for purchase checks, with no Google SDK: a service-account JWT
 * (RS256, node:crypto) is exchanged for an access token, which is cached until shortly before it
 * expires.
 */

import { sign } from "node:crypto";

const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const DEFAULT_API_BASE_URL = "https://androidpublisher.googleapis.com";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const TIMEOUT_MS = 8_000;
/** Renew this long before Google's expiry. */
const TOKEN_EARLY_RENEW_MS = 60_000;

export type PlayServiceAccount = {
  client_email: string;
  private_key: string;
  private_key_id?: string;
  token_uri?: string;
};

/** `status` is Google's HTTP status, or null when Google couldn't be reached. */
export class PlayApiError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** ProductPurchase (purchases.products.get). */
export type PlayProductPurchase = {
  purchaseState?: number;
  consumptionState?: number;
  acknowledgementState?: number;
  orderId?: string;
  productId?: string;
  purchaseType?: number;
  purchaseTimeMillis?: string;
  quantity?: number;
  obfuscatedExternalAccountId?: string;
  regionCode?: string;
};

/** SubscriptionPurchaseV2 (purchases.subscriptionsv2.get). */
export type PlaySubscriptionPurchase = {
  subscriptionState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  testPurchase?: Record<string, unknown>;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    offerPhase?: { freeTrial?: Record<string, unknown> };
  }>;
};

export type PlayVoidedPurchase = {
  purchaseToken?: string;
  orderId?: string;
  voidedTimeMillis?: string;
  voidedSource?: number;
  voidedReason?: number;
  refundType?: number;
};

export interface PlayClient {
  getProductPurchase(packageName: string, productId: string, token: string): Promise<PlayProductPurchase>;
  getSubscription(packageName: string, token: string): Promise<PlaySubscriptionPurchase>;
  listVoidedPurchases(
    packageName: string,
    opts: { startTimeMs: number; pageToken?: string },
  ): Promise<{ voidedPurchases: PlayVoidedPurchase[]; nextPageToken: string | null }>;
}

export function parseServiceAccount(json: string): PlayServiceAccount | null {
  try {
    const parsed = JSON.parse(json) as Partial<PlayServiceAccount>;
    if (typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string") return null;
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
      private_key_id: typeof parsed.private_key_id === "string" ? parsed.private_key_id : undefined,
      token_uri: typeof parsed.token_uri === "string" ? parsed.token_uri : undefined,
    };
  } catch {
    return null;
  }
}

export function createPlayClient(opts: {
  serviceAccount: PlayServiceAccount;
  /** Outside production only: the token endpoint and API host can point at a local fake. */
  allowEndpointOverrides: boolean;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): PlayClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const tokenUri = (opts.allowEndpointOverrides && opts.serviceAccount.token_uri) || DEFAULT_TOKEN_URI;
  const apiBaseUrl = (opts.allowEndpointOverrides && opts.apiBaseUrl) || DEFAULT_API_BASE_URL;
  let cached: { token: string; expiresAt: number } | null = null;
  let inflight: Promise<string> | null = null;

  async function call(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      throw new PlayApiError(null, "Google Play request failed", { cause: error });
    }
  }

  async function fetchToken(): Promise<string> {
    const iat = Math.floor(now() / 1000);
    const header = { alg: "RS256", typ: "JWT", ...(opts.serviceAccount.private_key_id ? { kid: opts.serviceAccount.private_key_id } : {}) };
    const claims = { iss: opts.serviceAccount.client_email, scope: SCOPE, aud: tokenUri, iat, exp: iat + 3600 };
    const unsigned = `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
    let signature: string;
    try {
      signature = sign("sha256", Buffer.from(unsigned), opts.serviceAccount.private_key).toString("base64url");
    } catch (error) {
      throw new PlayApiError(null, "Google Play service account key is unusable", { cause: error });
    }
    const res = await call(tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${signature}`,
      }).toString(),
    });
    if (!res.ok) throw new PlayApiError(res.status, `Google token endpoint responded ${res.status}`);
    const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string") throw new PlayApiError(null, "Google token response had no token");
    const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
    cached = { token: body.access_token, expiresAt: now() + expiresIn * 1000 - TOKEN_EARLY_RENEW_MS };
    return body.access_token;
  }

  async function accessToken(): Promise<string> {
    if (cached && cached.expiresAt > now()) return cached.token;
    inflight ??= fetchToken().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function get<T>(path: string): Promise<T> {
    const token = await accessToken();
    const res = await call(`${apiBaseUrl}/androidpublisher/v3/applications/${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status === 401) cached = null;
    if (!res.ok) throw new PlayApiError(res.status, `Google Play responded ${res.status}`);
    return (await res.json()) as T;
  }

  const enc = encodeURIComponent;
  return {
    getProductPurchase: (packageName, productId, token) =>
      get(`${enc(packageName)}/purchases/products/${enc(productId)}/tokens/${enc(token)}`),
    getSubscription: (packageName, token) =>
      get(`${enc(packageName)}/purchases/subscriptionsv2/tokens/${enc(token)}`),
    async listVoidedPurchases(packageName, { startTimeMs, pageToken }) {
      const query = new URLSearchParams({ startTime: String(startTimeMs), type: "1", maxResults: "1000" });
      if (pageToken) query.set("token", pageToken);
      const body = await get<{
        voidedPurchases?: PlayVoidedPurchase[];
        tokenPagination?: { nextPageToken?: string };
      }>(`${enc(packageName)}/purchases/voidedpurchases?${query}`);
      return {
        voidedPurchases: body.voidedPurchases ?? [],
        nextPageToken: body.tokenPagination?.nextPageToken ?? null,
      };
    },
  };
}

/** Google said the token or purchase doesn't exist (as opposed to an outage or an auth problem). */
export function isPlayNotFound(error: unknown): boolean {
  return error instanceof PlayApiError && (error.status === 400 || error.status === 404 || error.status === 410);
}
