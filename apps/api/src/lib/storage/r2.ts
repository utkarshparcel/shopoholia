import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StorageObject = {
  key: string;
  body: Buffer;
  contentType: string;
};

export interface StorageClient {
  put(object: StorageObject): Promise<{ key: string }>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
}

// S3 and R2 cap object keys at 1024 bytes.
const MAX_KEY_BYTES = 1024;

/** One path segment: not empty, ".", or "..", and no "/", "\" or control characters. */
function isKeyPart(part: string): boolean {
  return part !== "" && part !== "." && part !== ".." && !/[\p{Cc}/\\]/u.test(part);
}

/**
 * Key for a new object that holds a user's data: `u/{userId}/{area}/{name}`.
 * Throws RangeError when a part is not a single safe segment (so `name` can't nest or escape).
 */
export function userObjectKey(userId: string, area: string, name: string): string {
  for (const part of [userId, area, name]) {
    if (!isKeyPart(part)) throw new RangeError(`unsafe storage key part: ${JSON.stringify(part)}`);
  }
  const key = `u/${userId}/${area}/${name}`;
  if (Buffer.byteLength(key) > MAX_KEY_BYTES) throw new RangeError("storage key is too long");
  return key;
}

/** True only for a key `userObjectKey` could have made for `userId`. Check client-sent keys with it. */
export function isUserObjectKey(key: string, userId: string): boolean {
  const parts = key.split("/");
  return (
    parts.length === 4 &&
    parts[0] === "u" &&
    parts[1] === userId &&
    parts.slice(1).every(isKeyPart) &&
    Buffer.byteLength(key) <= MAX_KEY_BYTES
  );
}

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl?: string;
};

const HOUR_SECONDS = 60 * 60;
// SigV4 rejects presigned URLs that expire more than a week out.
const MAX_PRESIGNED_SECONDS = 7 * 24 * HOUR_SECONDS;
/** Default life of a signed URL: minutes, not hours. Callers that need longer pass it. */
export const SIGNED_URL_SECONDS = 15 * 60;
// URLs are signed as of the start of the current window, so one URL is reused (and cached) for it.
const SIGNING_WINDOW_SECONDS = SIGNED_URL_SECONDS;

export function hasR2Config(
  env: Record<string, string | undefined>,
): env is R2Config & Record<string, string | undefined> {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET_NAME,
  );
}

export function r2ConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): R2Config {
  if (!hasR2Config(env)) {
    throw new Error(
      "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME are required",
    );
  }

  return {
    accountId: env.R2_ACCOUNT_ID as string,
    accessKeyId: env.R2_ACCESS_KEY_ID as string,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
    bucketName: env.R2_BUCKET_NAME as string,
    publicUrl: env.R2_PUBLIC_URL,
  };
}

/**
 * Encryption-at-rest & retention:
 * - R2 encrypts every object at rest (AES-256) and can't be told otherwise: its S3 API rejects the
 *   `x-amz-server-side-encryption` header, and SSE-C would stop presigned GETs from working (the
 *   reader must send the key). So no encryption header is sent. Tokens are separately AES-256-GCM-encrypted
 *   via services/worker-ingest/src/crypto.ts (OAUTH_TOKEN_SECRET) before
 *   being stored in `ingestion_sources.encrypted_token`.
 * - Raw ingestion_documents use a per-kind retention schedule (EMAIL 7d /
 *   SMS 14d / RECEIPT 30d by default; see apps/api/src/lib/retention.ts).
 *   After the kind TTL the raw R2 object at `rawKey` is deleted and the DB
 *   row keeps its parse status with `rawKey` cleared (no EXPIRED/PURGED
 *   enum value) — see `purgeExpiredIngestionDocuments`.
 * - All object access is via scoped, time-limited presigned URLs from
 *   `getSignedUrl`; raw keys are never exposed to clients.
 */
export function createR2Storage(config: R2Config): StorageClient {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async put(object) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: object.key,
          Body: object.body,
          ContentType: object.contentType,
        }),
      );
      return { key: object.key };
    },

    async getSignedUrl(key, expiresInSeconds = SIGNED_URL_SECONDS) {
      // A user's objects are never served from the public bucket URL.
      if (config.publicUrl && !key.startsWith("u/")) {
        return `${config.publicUrl.replace(/\/$/, "")}/${key}`;
      }

      // Sign as of the start of the window so the URL stays the same, and cacheable, all window.
      // The extra window keeps it valid for at least expiresInSeconds from now.
      const windowMs = SIGNING_WINDOW_SECONDS * 1000;
      const signingDate = new Date(Math.floor(Date.now() / windowMs) * windowMs);
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        }),
        {
          signingDate,
          expiresIn: Math.min(expiresInSeconds + SIGNING_WINDOW_SECONDS, MAX_PRESIGNED_SECONDS),
        },
      );
    },

    async delete(key) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        }),
      );
    },

    async deleteMany(keys) {
      if (keys.length === 0) return;

      await client.send(
        new DeleteObjectsCommand({
          Bucket: config.bucketName,
          Delete: {
            Objects: keys.map((key) => ({ Key: key })),
          },
        }),
      );
    },
  };
}

export function createStorageFromEnv(
  env: Record<string, string | undefined> = process.env,
): StorageClient {
  if (hasR2Config(env)) {
    return createR2Storage(r2ConfigFromEnv(env));
  }
  // Placeholder images in production would hide lost uploads.
  if (env.NODE_ENV === "production") {
    throw new Error("Storage is not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME");
  }
  return createMockStorage();
}

export function createMockStorage(baseUrl = "https://picsum.photos"): StorageClient {
  const objects = new Map<string, StorageObject>();

  return {
    async put(object) {
      objects.set(object.key, object);
      return { key: object.key };
    },
    async getSignedUrl(key) {
      // Local/dev: return a deterministic public placeholder so the app isn't blank
      // without real R2. Seed includes the storage key for stable per-listing images.
      const seed = key.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "worn";
      return `${baseUrl}/seed/${seed}/720/960`;
    },
    async delete(key) {
      objects.delete(key);
    },
    async deleteMany(keys) {
      for (const key of keys) objects.delete(key);
    },
  };
}
