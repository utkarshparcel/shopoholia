import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SIGNED_URL_SECONDS,
  createMockStorage,
  createR2Storage,
  createStorageFromEnv,
  hasR2Config,
  isUserObjectKey,
  userObjectKey,
} from "./r2.js";

describe("userObjectKey", () => {
  const userId = "2f0c4e1a-8a1b-4c35-9d7e-5b1a2c3d4e5f";

  it("builds u/{userId}/{area}/{name}, which isUserObjectKey accepts for that user only", () => {
    const key = userObjectKey(userId, "wardrobe", "item-1.jpg");
    expect(key).toBe(`u/${userId}/wardrobe/item-1.jpg`);
    expect(isUserObjectKey(key, userId)).toBe(true);
    expect(isUserObjectKey(key, "someone-else")).toBe(false);
  });

  it("refuses parts that are empty, dot segments, or contain separators or control chars", () => {
    for (const bad of ["", ".", "..", "a/b", "a\\b", "a\nb", "a\u0000b"]) {
      expect(() => userObjectKey(userId, "wardrobe", bad)).toThrow(RangeError);
      expect(() => userObjectKey(userId, bad, "x.jpg")).toThrow(RangeError);
      expect(() => userObjectKey(bad, "wardrobe", "x.jpg")).toThrow(RangeError);
    }
    expect(() => userObjectKey(userId, "wardrobe", "x".repeat(1024))).toThrow(RangeError);
    // Dots inside a name are ordinary characters.
    expect(userObjectKey(userId, "receipts", "a..b.pdf")).toBe(`u/${userId}/receipts/a..b.pdf`);
  });

  it("rejects keys outside the user's prefix, traversal, a leading slash and empty parts", () => {
    for (const key of [
      `/u/${userId}/wardrobe/x.jpg`,
      `u/${userId}/../other/x.jpg`,
      `u/${userId}/wardrobe/..`,
      `u/${userId}/./x.jpg`,
      `u/${userId}//x.jpg`,
      `u/${userId}/wardrobe/`,
      `u/${userId}/wardrobe`,
      `u/${userId}/wardrobe/a/b.jpg`,
      `u//wardrobe/x.jpg`,
      `uploads/${userId}/x.jpg`,
      `U/${userId}/wardrobe/x.jpg`,
      `u/${userId}/wardrobe/x.jpg\n`,
      "",
    ]) {
      expect(isUserObjectKey(key, userId), key).toBe(false);
    }
    expect(isUserObjectKey("u//wardrobe/x.jpg", "")).toBe(false);
  });
});

describe("createMockStorage", () => {
  it("stores and signs objects with a working placeholder URL", async () => {
    const storage = createMockStorage();
    await storage.put({
      key: "uploads/test.jpg",
      body: Buffer.from("img"),
      contentType: "image/jpeg",
    });
    const url = await storage.getSignedUrl("uploads/test.jpg");
    expect(url).toContain("uploads-test-jpg");
    expect(url).toContain("picsum.photos");
  });

  it("returns placeholders even for unknown keys", async () => {
    const storage = createMockStorage();
    const url = await storage.getSignedUrl("house-models/missing.jpg");
    expect(url).toContain("house-models-missing-jpg");
  });

  it("deletes objects", async () => {
    const storage = createMockStorage();
    await storage.put({ key: "a", body: Buffer.from("x"), contentType: "image/jpeg" });
    await storage.delete("a");
    // Mock still serves placeholders so the client never shows broken DNS hosts
    await expect(storage.getSignedUrl("a")).resolves.toContain("picsum.photos");
  });

  it("deletes many objects", async () => {
    const storage = createMockStorage();
    await storage.put({ key: "a", body: Buffer.from("x"), contentType: "image/jpeg" });
    await storage.put({ key: "b", body: Buffer.from("y"), contentType: "image/jpeg" });
    await storage.deleteMany(["a", "b"]);
    await expect(storage.getSignedUrl("a")).resolves.toContain("picsum.photos");
  });
});

describe("createR2Storage", () => {
  const storage = createR2Storage({
    accountId: "acc",
    accessKeyId: "key",
    secretAccessKey: "secret",
    bucketName: "bucket",
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function signAt(time: string, expiresInSeconds?: number) {
    vi.setSystemTime(new Date(time));
    return new URL(await storage.getSignedUrl("reveal/beach/look.jpg", expiresInSeconds));
  }

  /** When the presigned URL starts and stops working, in epoch ms. */
  function validity(url: URL) {
    const amzDate = url.searchParams.get("X-Amz-Date")!;
    const from = Date.parse(
      amzDate.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/, "$1-$2-$3T$4:$5:$6Z"),
    );
    return { from, until: from + Number(url.searchParams.get("X-Amz-Expires")) * 1000 };
  }

  it("signs the same URL for 15 minutes, valid for 15 minutes from any point in that window", async () => {
    vi.useFakeTimers();
    const times = ["2026-10-25T10:15:00.000Z", "2026-10-25T10:23:45.678Z", "2026-10-25T10:29:59.999Z"];
    const urls: string[] = [];
    for (const time of times) {
      const url = await signAt(time);
      const { from, until } = validity(url);
      expect(from, time).toBeLessThanOrEqual(Date.parse(time));
      expect(until, time).toBeGreaterThanOrEqual(Date.parse(time) + SIGNED_URL_SECONDS * 1000);
      // Minutes, not hours.
      expect(until - Date.parse(time), time).toBeLessThanOrEqual(30 * 60 * 1000);
      urls.push(url.href);
    }
    expect(new Set(urls).size).toBe(1);
    expect(new URL(urls[0]!).searchParams.get("X-Amz-Signature")).toBeTruthy();

    const nextWindow = await signAt("2026-10-25T10:30:00.000Z");
    expect(nextWindow.href).not.toBe(urls[0]);
    expect(validity(nextWindow).from).toBe(Date.parse("2026-10-25T10:30:00.000Z"));
  });

  it("serves only non-user objects from a public bucket URL", async () => {
    const pub = createR2Storage({
      accountId: "acc",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucketName: "bucket",
      publicUrl: "https://cdn.example.test/",
    });
    expect(await pub.getSignedUrl("garments/v1.jpg")).toBe("https://cdn.example.test/garments/v1.jpg");
    const userUrl = new URL(await pub.getSignedUrl("u/user-1/receipts/r.jpg"));
    expect(userUrl.host).toBe("bucket.acc.r2.cloudflarestorage.com");
    expect(userUrl.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });

  it("keeps long expiries within the SigV4 one-week limit", async () => {
    vi.useFakeTimers();
    const url = await signAt("2026-10-25T10:30:00.000Z", 7 * 24 * 3600);
    expect(url.searchParams.get("X-Amz-Expires")).toBe(String(7 * 24 * 3600));
  });
});

describe("createStorageFromEnv", () => {
  it("uses placeholder storage only outside production", async () => {
    await expect(createStorageFromEnv({ NODE_ENV: "development" }).getSignedUrl("a")).resolves.toContain(
      "picsum.photos",
    );
    expect(() => createStorageFromEnv({ NODE_ENV: "production" })).toThrow(/Storage is not configured/);
  });
});

describe("hasR2Config", () => {
  it("requires all R2 env vars", () => {
    expect(hasR2Config({})).toBe(false);
    expect(
      hasR2Config({
        R2_ACCOUNT_ID: "acc",
        R2_ACCESS_KEY_ID: "key",
        R2_SECRET_ACCESS_KEY: "secret",
        R2_BUCKET_NAME: "bucket",
      }),
    ).toBe(true);
  });
});
