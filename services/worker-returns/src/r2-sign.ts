import { createHash, createHmac } from "node:crypto";

/**
 * Presigned GET URLs for R2 (S3 SigV4 query signing), so a deadline push signs the item image when
 * it is sent rather than when it was scheduled days earlier. Mirrors the API's storage client:
 * short-lived URLs, R2_* env.
 */

export type PresignInput = {
  host: string;
  /** Path starting with "/", not yet encoded. */
  path: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSeconds: number;
  now?: Date;
};

/** RFC 3986 encoding, as SigV4 requires (`encodeURIComponent` leaves !'()* alone). */
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

export function presignGetUrl(input: PresignInput): string {
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${input.region}/s3/aws4_request`;
  const canonicalUri = input.path
    .split("/")
    .map((segment) => rfc3986(segment))
    .join("/");
  const params: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${input.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(input.expiresSeconds)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const canonicalQuery = params
    .map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`)
    .sort()
    .join("&");
  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQuery,
    `host:${input.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    createHash("sha256").update(canonicalRequest, "utf8").digest("hex"),
  ].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  return `https://${input.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/** Long enough for the device to fetch the image after the push lands. */
export const PUSH_IMAGE_URL_SECONDS = 24 * 60 * 60;

/** A signer for storage keys from R2_* env, or null when R2 isn't configured. */
export function r2ImageSignerFromEnv(
  env: Record<string, string | undefined> = process.env,
): ((key: string) => string) | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) return null;
  return (key: string) =>
    presignGetUrl({
      host: `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      path: `/${R2_BUCKET_NAME}/${key}`,
      region: "auto",
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      expiresSeconds: PUSH_IMAGE_URL_SECONDS,
    });
}
