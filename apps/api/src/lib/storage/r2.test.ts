import { describe, expect, it } from "vitest";
import { createMockStorage, hasR2Config } from "./r2.js";

describe("createMockStorage", () => {
  it("stores and signs objects", async () => {
    const storage = createMockStorage();
    await storage.put({
      key: "uploads/test.jpg",
      body: Buffer.from("img"),
      contentType: "image/jpeg",
    });
    const url = await storage.getSignedUrl("uploads/test.jpg");
    expect(url).toContain("uploads/test.jpg");
  });

  it("deletes objects", async () => {
    const storage = createMockStorage();
    await storage.put({ key: "a", body: Buffer.from("x"), contentType: "image/jpeg" });
    await storage.delete("a");
    await expect(storage.getSignedUrl("a")).rejects.toThrow();
  });

  it("deletes many objects", async () => {
    const storage = createMockStorage();
    await storage.put({ key: "a", body: Buffer.from("x"), contentType: "image/jpeg" });
    await storage.put({ key: "b", body: Buffer.from("y"), contentType: "image/jpeg" });
    await storage.deleteMany(["a", "b"]);
    await expect(storage.getSignedUrl("a")).rejects.toThrow();
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
