import { describe, expect, it, vi } from "vitest";
import {
  HostedVisionTagClient,
  MockVisionTagClient,
  createVisionTagClientFromEnv,
  needsAutoTag,
  tagImageWithDupes,
} from "./wardrobe-vision.js";

describe("WV04-AUTOTAG wardrobe-vision", () => {
  it("mock client tags from image key fixtures", async () => {
    const client = new MockVisionTagClient();
    const tag = await client.tag({ imageKey: "wardrobe/uniqlo-white-tshirt.jpg" });
    expect(tag.category).toBe("tshirt");
    expect(tag.colors).toContain("white");
    expect(tag.brand).toBe("Uniqlo");
  });

  it("needsAutoTag for placeholders / empty metadata", () => {
    expect(needsAutoTag({ category: "other" })).toBe(true);
    expect(needsAutoTag({ category: "shirt", colors: ["navy"], brand: "Zara" })).toBe(false);
    expect(needsAutoTag({ category: "shirt" })).toBe(true);
  });

  it("tagImageWithDupes warns near-duplicates", async () => {
    const result = await tagImageWithDupes(
      new MockVisionTagClient(),
      { imageKey: "wardrobe/zara-navy-shirt.jpg" },
      [{ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", title: "Zara navy shirt", brand: "Zara", category: "shirt" }],
    );
    expect(result.category).toBe("shirt");
    expect(result.duplicateWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("hosted client merges API labels then falls back", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ labels: ["olive", "jacket"], brand: "Mango", confidence: 0.88 }),
    })) as unknown as typeof fetch;
    const client = new HostedVisionTagClient({
      url: "https://vision.example/tag",
      fetchImpl,
    });
    const tag = await client.tag({ imageKey: "uploads/x.jpg" });
    expect(tag.category).toBe("jacket");
    expect(tag.colors).toContain("olive");
    expect(tag.brand).toBe("Mango");
    expect(tag.confidence).toBe(0.88);
  });

  it("createVisionTagClientFromEnv defaults to mock", () => {
    expect(createVisionTagClientFromEnv({})).toBeInstanceOf(MockVisionTagClient);
  });
});
