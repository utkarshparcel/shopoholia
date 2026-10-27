/**
 * Tests only: signed App Store data from the self-signed chain in test-fixtures/iap (a test root CA
 * standing in for Apple's, made by FIX/platform/work/make-apple-test-chain.sh), and a fake Google Play
 * (token endpoint plus Play Developer API) behind a fetch function.
 */

import {
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  X509Certificate,
  createPrivateKey,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AppleJwsTrust } from "./apple.js";
import type {
  PlayProductPurchase,
  PlayServiceAccount,
  PlaySubscriptionPurchase,
  PlayVoidedPurchase,
} from "./google-play.js";

const FIXTURES = fileURLToPath(new URL("../../../test-fixtures/iap/", import.meta.url));

export const TEST_BUNDLE_ID = "com.shopoholia.worn";
export const TEST_PACKAGE_NAME = "com.shopoholia.worn";

export function fixturePem(name: string): string {
  return readFileSync(`${FIXTURES}${name}`, "utf8");
}

export function fixtureCert(name: string): X509Certificate {
  return new X509Certificate(fixturePem(name));
}

/** Trusts the test root (and the test Xcode certificate when `xcode`). */
export function testAppleTrust(opts: { xcode?: boolean; now?: () => Date } = {}): AppleJwsTrust {
  return {
    roots: [fixtureCert("root.pem")],
    xcodeCert: opts.xcode ? fixtureCert("xcode.pem") : null,
    ...(opts.now ? { now: opts.now } : {}),
  };
}

const LEAF_CHAIN = ["leaf.pem", "intermediate.pem", "root.pem"];

/** A compact ES256 JWS like StoreKit's, signed by the test leaf (or the test Xcode certificate). */
export function signAppleJws(
  payload: Record<string, unknown>,
  opts: { chain?: string[]; key?: string; alg?: string } = {},
): string {
  const chain = opts.chain ?? LEAF_CHAIN;
  const header = {
    alg: opts.alg ?? "ES256",
    x5c: chain.map((name) => fixtureCert(name).raw.toString("base64")),
  };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: createPrivateKey(fixturePem(opts.key ?? "leaf-key.pem")),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}

/** An Xcode StoreKit Testing transaction: a single self-signed certificate, environment "Xcode". */
export function signXcodeJws(payload: Record<string, unknown>): string {
  return signAppleJws({ ...payload, environment: "Xcode" }, { chain: ["xcode.pem"], key: "xcode-key.pem" });
}

let transactionSeq = 2_000_000_000_000_000;

/** JWSTransactionDecodedPayload for a coin pack (override any field). */
export function appleTransaction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Date.now();
  const transactionId = String(transactionSeq++);
  return {
    transactionId,
    originalTransactionId: transactionId,
    bundleId: TEST_BUNDLE_ID,
    productId: "worn.coins.100",
    type: "Consumable",
    environment: "Sandbox",
    purchaseDate: now,
    signedDate: now,
    quantity: 1,
    storefront: "IND",
    ...overrides,
  };
}

/** A signed App Store Server Notification V2 body (`signedPayload`). */
export function appStoreNotification(opts: {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  environment?: string;
  bundleId?: string;
  transaction?: Record<string, unknown>;
  renewal?: Record<string, unknown>;
}): string {
  return signAppleJws({
    notificationType: opts.notificationType,
    ...(opts.subtype ? { subtype: opts.subtype } : {}),
    notificationUUID: opts.notificationUUID,
    version: "2.0",
    signedDate: Date.now(),
    data: {
      bundleId: opts.bundleId ?? TEST_BUNDLE_ID,
      environment: opts.environment ?? "Sandbox",
      ...(opts.transaction ? { signedTransactionInfo: signAppleJws(opts.transaction) } : {}),
      ...(opts.renewal ? { signedRenewalInfo: signAppleJws(opts.renewal) } : {}),
    },
  });
}

export type FakePlay = {
  serviceAccount: PlayServiceAccount;
  serviceAccountJson: string;
  tokenUri: string;
  apiBaseUrl: string;
  /** Keyed by purchase token. */
  products: Map<string, PlayProductPurchase>;
  subscriptions: Map<string, PlaySubscriptionPurchase>;
  voided: PlayVoidedPurchase[];
  /** Answer every API call with this status instead (an outage, for example). */
  failWith: number | null;
  tokenRequests: number;
  apiRequests: string[];
  fetch: typeof fetch;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/**
 * A fake Google: the token endpoint checks the service-account JWT (RS256, claims) and issues access
 * tokens; the API answers from `products`, `subscriptions` and `voided` and rejects other tokens (401).
 */
export function createFakePlay(opts: { base?: string } = {}): FakePlay {
  const base = opts.base ?? "https://play.fake.test";
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const serviceAccount: PlayServiceAccount = {
    client_email: "worn-play@worn-test.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    private_key_id: "test-key-1",
    token_uri: `${base}/token`,
  };
  const issued = new Set<string>();

  const fake: FakePlay = {
    serviceAccount,
    serviceAccountJson: JSON.stringify({ type: "service_account", ...serviceAccount }),
    tokenUri: `${base}/token`,
    apiBaseUrl: base,
    products: new Map(),
    subscriptions: new Map(),
    voided: [],
    failWith: null,
    tokenRequests: 0,
    apiRequests: [],
    fetch: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (`${url.origin}${url.pathname}` === fake.tokenUri) {
        fake.tokenRequests += 1;
        const form = new URLSearchParams(String(init?.body ?? ""));
        const [header, claims, signature] = (form.get("assertion") ?? "").split(".");
        if (form.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer" || !signature) {
          return json(400, { error: "invalid_grant" });
        }
        const ok = verify(
          "sha256",
          Buffer.from(`${header}.${claims}`),
          createPublicKey(publicKey.export({ type: "spki", format: "pem" })),
          Buffer.from(signature, "base64url"),
        );
        const body = JSON.parse(Buffer.from(claims!, "base64url").toString("utf8")) as Record<string, unknown>;
        if (!ok || body.iss !== serviceAccount.client_email || body.aud !== fake.tokenUri) {
          return json(400, { error: "invalid_grant" });
        }
        const token = `fake-access-${fake.tokenRequests}`;
        issued.add(token);
        return json(200, { access_token: token, expires_in: 3600, token_type: "Bearer" });
      }

      fake.apiRequests.push(url.pathname + url.search);
      const auth = new Headers(init?.headers).get("authorization") ?? "";
      if (!issued.has(auth.replace(/^Bearer /, ""))) return json(401, { error: { code: 401 } });
      if (fake.failWith) return json(fake.failWith, { error: { code: fake.failWith } });

      const prefix = `/androidpublisher/v3/applications/${encodeURIComponent(TEST_PACKAGE_NAME)}/purchases/`;
      if (!url.pathname.startsWith(prefix)) return json(404, { error: { code: 404 } });
      const rest = url.pathname.slice(prefix.length).split("/").map(decodeURIComponent);
      if (rest[0] === "products" && rest[2] === "tokens") {
        const purchase = fake.products.get(rest[3]!);
        return purchase && (purchase.productId ?? rest[1]) === rest[1]
          ? json(200, { kind: "androidpublisher#productPurchase", ...purchase })
          : json(400, { error: { code: 400, message: "Invalid Value" } });
      }
      if (rest[0] === "subscriptionsv2" && rest[1] === "tokens") {
        const sub = fake.subscriptions.get(rest[2]!);
        return sub ? json(200, sub) : json(404, { error: { code: 404 } });
      }
      if (rest[0] === "voidedpurchases") {
        const start = Number(url.searchParams.get("startTime") ?? 0);
        const all = fake.voided.filter((v) => Number(v.voidedTimeMillis ?? 0) >= start);
        // Pages of one, so callers have to follow nextPageToken.
        const at = Number(url.searchParams.get("token") ?? 0);
        const page = all.slice(at, at + 1);
        return json(200, {
          voidedPurchases: page,
          ...(at + 1 < all.length ? { tokenPagination: { nextPageToken: String(at + 1) } } : {}),
        });
      }
      return json(404, { error: { code: 404 } });
    },
  };
  return fake;
}
