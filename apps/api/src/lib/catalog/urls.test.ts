import { describe, expect, it } from "vitest";
import { createMockStorage } from "../storage/r2.js";
import { resolveImageUrl } from "./urls.js";

describe("resolveImageUrl", () => {
  it("returns external URLs without calling storage", async () => {
    const storage = createMockStorage();
    const url = "https://img.example.com/dress.jpg";
    await expect(resolveImageUrl(url, storage)).resolves.toBe(url);
  });

  it("signs R2 keys via storage", async () => {
    const storage = createMockStorage();
    await storage.put({
      key: "house-models/1.jpg",
      body: Buffer.from("img"),
      contentType: "image/jpeg",
    });
    const signed = await resolveImageUrl("house-models/1.jpg", storage);
    expect(signed).toContain("house-models-1-jpg");
    expect(signed).toContain("picsum.photos");
  });
});
