/**
 * App Store purchases (StoreKit 2), verified locally. A signed transaction or notification is a JWS
 * (ES256) whose `x5c` header carries leaf, intermediate and root certificates. It's trusted when the
 * root is Apple Root CA - G3, each certificate is issued and signed by the next, each is valid when the
 * App Store signed the data, the intermediate and leaf carry Apple's marker OIDs, and the leaf's key
 * verifies the signature. No Apple API key is needed for this.
 */

import { X509Certificate, verify as verifySignature } from "node:crypto";

/**
 * Apple Root CA - G3, from the macOS system root keychain
 * (`security find-certificate -c "Apple Root CA - G3" -p /System/Library/Keychains/SystemRootCertificates.keychain`).
 * Valid 2014-04-30 to 2039-04-30. Its SHA-256 (APPLE_ROOT_CA_G3_SHA256) matches Apple's published
 * root list (support.apple.com/en-us/126047).
 */
export const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----
`;

export const APPLE_ROOT_CA_G3_SHA256 =
  "63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179";

/** Apple Worldwide Developer Relations intermediate marker. */
const APPLE_INTERMEDIATE_MARKER_OID = "1.2.840.113635.100.6.2.1";
/** App Store receipt-signing leaf marker. */
const APPLE_LEAF_MARKER_OID = "1.2.840.113635.100.6.11.1";
/** Tolerated clock skew for a `signedDate` in the future. */
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

export class AppleJwsError extends Error {}

export type AppleJwsTrust = {
  /** Trusted roots (DER compared byte for byte). Production: Apple Root CA - G3 only. */
  roots: X509Certificate[];
  /** StoreKit Testing in Xcode signing certificate, accepted as a single-certificate chain. */
  xcodeCert?: X509Certificate | null;
  now?: () => Date;
};

export function appleRootCertificates(): X509Certificate[] {
  const root = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
  if (root.fingerprint256.replaceAll(":", "") !== APPLE_ROOT_CA_G3_SHA256) {
    throw new Error("Apple Root CA - G3 constant doesn't match its fingerprint");
  }
  return [root];
}

function base64UrlJson(part: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AppleJwsError("JWS part is not a JSON object");
  }
  return parsed as Record<string, unknown>;
}

type Tlv = { tag: number; start: number; end: number };

function readTlv(der: Buffer, offset: number): Tlv {
  const tag = der[offset];
  let length = der[offset + 1];
  if (tag === undefined || length === undefined) throw new AppleJwsError("Truncated certificate");
  let start = offset + 2;
  if (length & 0x80) {
    const bytes = length & 0x7f;
    if (bytes === 0 || bytes > 4) throw new AppleJwsError("Bad certificate length");
    length = 0;
    for (let i = 0; i < bytes; i++) length = length * 256 + (der[start + i] ?? 0);
    start += bytes;
  }
  const end = start + length;
  if (end > der.length) throw new AppleJwsError("Truncated certificate");
  return { tag, start, end };
}

function children(der: Buffer, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  for (let at = parent.start; at < parent.end; ) {
    const tlv = readTlv(der, at);
    out.push(tlv);
    at = tlv.end;
  }
  return out;
}

function decodeOid(bytes: Buffer): string {
  const first = bytes[0] ?? 0;
  const parts = [Math.floor(first / 40), first % 40];
  let value = 0;
  for (const byte of bytes.subarray(1)) {
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}

/** The extension OIDs of an X.509 certificate (tbsCertificate [3] extensions). */
export function certificateExtensionOids(cert: X509Certificate): string[] {
  const der = cert.raw;
  const certificate = readTlv(der, 0);
  const tbs = children(der, certificate)[0];
  if (!tbs) throw new AppleJwsError("Certificate has no tbsCertificate");
  const extensions = children(der, tbs).find((tlv) => tlv.tag === 0xa3);
  if (!extensions) return [];
  const list = children(der, extensions)[0];
  if (!list) return [];
  return children(der, list).flatMap((extension) => {
    const oid = children(der, extension)[0];
    return oid && oid.tag === 0x06 ? [decodeOid(der.subarray(oid.start, oid.end))] : [];
  });
}

function validAt(cert: X509Certificate, at: Date): boolean {
  return new Date(cert.validFrom) <= at && at <= new Date(cert.validTo);
}

/**
 * Verifies a StoreKit / App Store Server JWS and returns its payload. `xcode` is true when it was signed
 * by the configured Xcode test certificate instead of Apple's chain. Throws AppleJwsError otherwise.
 */
export function verifyAppleJws(
  jws: string,
  trust: AppleJwsTrust,
): { payload: Record<string, unknown>; xcode: boolean } {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new AppleJwsError("Not a compact JWS");
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = base64UrlJson(encodedHeader);
    payload = base64UrlJson(encodedPayload);
  } catch (error) {
    if (error instanceof AppleJwsError) throw error;
    throw new AppleJwsError("JWS is not valid base64url JSON");
  }
  if (header.alg !== "ES256") throw new AppleJwsError("JWS alg must be ES256");
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length === 0 || !x5c.every((c) => typeof c === "string")) {
    throw new AppleJwsError("JWS has no x5c chain");
  }

  let chain: X509Certificate[];
  try {
    chain = (x5c as string[]).map((c) => new X509Certificate(Buffer.from(c, "base64")));
  } catch {
    throw new AppleJwsError("JWS x5c has an unreadable certificate");
  }

  const now = trust.now?.() ?? new Date();
  const signedDate = typeof payload.signedDate === "number" ? new Date(payload.signedDate) : now;
  if (signedDate.getTime() > now.getTime() + MAX_FUTURE_SKEW_MS) {
    throw new AppleJwsError("JWS signedDate is in the future");
  }

  const leaf = chain[0]!;
  let xcode = false;
  if (trust.xcodeCert && chain.length === 1 && leaf.raw.equals(trust.xcodeCert.raw)) {
    xcode = true;
    if (!validAt(leaf, signedDate)) throw new AppleJwsError("Xcode certificate is not valid");
  } else {
    if (chain.length !== 3) throw new AppleJwsError("JWS x5c must hold leaf, intermediate and root");
    const [, intermediate, root] = chain as [X509Certificate, X509Certificate, X509Certificate];
    if (!trust.roots.some((trusted) => trusted.raw.equals(root.raw))) {
      throw new AppleJwsError("JWS chain doesn't end at a trusted root");
    }
    if (!root.ca || !intermediate.ca || leaf.ca) throw new AppleJwsError("JWS chain has wrong CA flags");
    if (!intermediate.checkIssued(root) || !intermediate.verify(root.publicKey)) {
      throw new AppleJwsError("Intermediate certificate isn't signed by the root");
    }
    if (!leaf.checkIssued(intermediate) || !leaf.verify(intermediate.publicKey)) {
      throw new AppleJwsError("Leaf certificate isn't signed by the intermediate");
    }
    for (const cert of chain) {
      if (!validAt(cert, signedDate)) throw new AppleJwsError("A JWS certificate was not valid when signed");
    }
    if (!certificateExtensionOids(intermediate).includes(APPLE_INTERMEDIATE_MARKER_OID)) {
      throw new AppleJwsError("Intermediate certificate lacks Apple's marker");
    }
    if (!certificateExtensionOids(leaf).includes(APPLE_LEAF_MARKER_OID)) {
      throw new AppleJwsError("Leaf certificate lacks Apple's marker");
    }
  }

  const signature = Buffer.from(encodedSignature, "base64url");
  const valid =
    signature.length === 64 &&
    verifySignature(
      "sha256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      { key: leaf.publicKey, dsaEncoding: "ieee-p1363" },
      signature,
    );
  if (!valid) throw new AppleJwsError("JWS signature is invalid");
  return { payload, xcode };
}

/** JWSTransactionDecodedPayload fields the server reads. */
export type AppleTransaction = {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  type: string;
  environment: string;
  appAccountToken?: string;
  revocationDate?: number;
  expiresDate?: number;
  purchaseDate?: number;
  signedDate?: number;
  quantity?: number;
  offerType?: number;
  offerDiscountType?: string;
  isUpgraded?: boolean;
};

/** JWSRenewalInfoDecodedPayload fields the server reads. */
export type AppleRenewalInfo = {
  originalTransactionId?: string;
  productId?: string;
  gracePeriodExpiresDate?: number;
};

export function toAppleTransaction(payload: Record<string, unknown>): AppleTransaction {
  const str = (key: string) => (typeof payload[key] === "string" ? (payload[key] as string) : undefined);
  const num = (key: string) => (typeof payload[key] === "number" ? (payload[key] as number) : undefined);
  const transactionId = str("transactionId");
  const bundleId = str("bundleId");
  const productId = str("productId");
  const type = str("type");
  const environment = str("environment");
  if (!transactionId || !bundleId || !productId || !type || !environment) {
    throw new AppleJwsError("Transaction payload is missing required fields");
  }
  return {
    transactionId,
    originalTransactionId: str("originalTransactionId") ?? transactionId,
    bundleId,
    productId,
    type,
    environment,
    appAccountToken: str("appAccountToken")?.toLowerCase(),
    revocationDate: num("revocationDate"),
    expiresDate: num("expiresDate"),
    purchaseDate: num("purchaseDate"),
    signedDate: num("signedDate"),
    quantity: num("quantity"),
    offerType: num("offerType"),
    offerDiscountType: str("offerDiscountType"),
    isUpgraded: payload.isUpgraded === true,
  };
}

/** A transaction environment the server accepts: Production only in production. */
export function appleEnvironment(
  environment: string,
  xcode: boolean,
  production: boolean,
): "production" | "sandbox" | "xcode" | null {
  if (xcode) return environment === "Xcode" && !production ? "xcode" : null;
  if (environment === "Production") return "production";
  if (environment === "Sandbox" && !production) return "sandbox";
  return null;
}

export type AppStoreNotification = {
  notificationType: string;
  subtype: string | null;
  notificationUUID: string;
  environment: "production" | "sandbox" | "xcode";
  transaction: AppleTransaction | null;
  renewal: AppleRenewalInfo | null;
};

/**
 * Verifies an App Store Server Notification V2 `signedPayload` and the signed transaction and renewal
 * info inside it. Returns null for a notification for another app or an environment this server
 * doesn't accept (it's acknowledged, not applied).
 */
export function decodeAppStoreNotification(
  signedPayload: string,
  opts: { bundleId: string; production: boolean; trust: AppleJwsTrust },
): AppStoreNotification | null {
  const { payload, xcode } = verifyAppleJws(signedPayload, opts.trust);
  const notificationType = payload.notificationType;
  const notificationUUID = payload.notificationUUID;
  if (typeof notificationType !== "string" || typeof notificationUUID !== "string") {
    throw new AppleJwsError("Notification is missing its type or id");
  }
  const data = (payload.data ?? payload.summary ?? {}) as Record<string, unknown>;
  if (data.bundleId !== opts.bundleId) return null;
  const environment = appleEnvironment(String(data.environment ?? ""), xcode, opts.production);
  if (!environment) return null;

  let transaction: AppleTransaction | null = null;
  if (typeof data.signedTransactionInfo === "string") {
    transaction = toAppleTransaction(verifyAppleJws(data.signedTransactionInfo, opts.trust).payload);
    if (transaction.bundleId !== opts.bundleId) return null;
  }
  let renewal: AppleRenewalInfo | null = null;
  if (typeof data.signedRenewalInfo === "string") {
    const info = verifyAppleJws(data.signedRenewalInfo, opts.trust).payload;
    renewal = {
      originalTransactionId:
        typeof info.originalTransactionId === "string" ? info.originalTransactionId : undefined,
      productId: typeof info.productId === "string" ? info.productId : undefined,
      gracePeriodExpiresDate:
        typeof info.gracePeriodExpiresDate === "number" ? info.gracePeriodExpiresDate : undefined,
    };
  }
  return {
    notificationType,
    subtype: typeof payload.subtype === "string" ? payload.subtype : null,
    notificationUUID,
    environment,
    transaction,
    renewal,
  };
}
