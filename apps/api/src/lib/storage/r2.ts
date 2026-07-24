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

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl?: string;
};

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

    async getSignedUrl(key, expiresInSeconds = 3600) {
      if (config.publicUrl) {
        return `${config.publicUrl.replace(/\/$/, "")}/${key}`;
      }

      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        }),
        { expiresIn: expiresInSeconds },
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
