import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockStorage, createR2Storage, hasR2Config } from "./r2.js";

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

  it("signs the same URL all hour, valid for the full window from any point in it", async () => {
    vi.useFakeTimers();
    const times = ["2026-10-25T10:00:00.000Z", "2026-10-25T10:23:45.678Z", "2026-10-25T10:59:59.999Z"];
    const urls: string[] = [];
    for (const time of times) {
      const url = await signAt(time);
      const { from, until } = validity(url);
      expect(from, time).toBeLessThanOrEqual(Date.parse(time));
      expect(until, time).toBeGreaterThanOrEqual(Date.parse(time) + 3600 * 1000);
      urls.push(url.href);
    }
    expect(new Set(urls).size).toBe(1);
    expect(new URL(urls[0]!).searchParams.get("X-Amz-Signature")).toBeTruthy();

    const nextHour = await signAt("2026-10-25T11:00:00.000Z");
    expect(nextHour.href).not.toBe(urls[0]);
    expect(validity(nextHour).from).toBe(Date.parse("2026-10-25T11:00:00.000Z"));
  });

  it("keeps long expiries within the SigV4 one-week limit", async () => {
    vi.useFakeTimers();
    const url = await signAt("2026-10-25T10:30:00.000Z", 7 * 24 * 3600);
    expect(url.searchParams.get("X-Amz-Expires")).toBe(String(7 * 24 * 3600));
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
