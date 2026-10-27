import { describe, expect, it } from "vitest";
import {
  autoTagWithDuplicateCheck,
  inferWardrobeAutoTag,
  labelsFromImageKey,
} from "./wardrobe-autotag.js";

describe("WV04-AUTOTAG inferWardrobeAutoTag", () => {
  it("parses category/color/brand from image key fixtures", () => {
    const tag = inferWardrobeAutoTag({
      imageKey: "wardrobe/zara-navy-shirt.jpg",
    });
    expect(tag.category).toBe("shirt");
    expect(tag.colors).toContain("navy");
    expect(tag.brand).toBe("Zara");
    expect(tag.confidence).toBeGreaterThan(0.5);
    expect(labelsFromImageKey("wardrobe/zara-navy-shirt.jpg")).toEqual(
      expect.arrayContaining(["zara", "navy", "shirt"]),
    );
  });

  it("prefers explicit vision labels over filename", () => {
    const tag = inferWardrobeAutoTag({
      imageKey: "uploads/img001.jpg",
      labels: ["red", "kurta", "FabIndia"],
    });
    expect(tag.category).toBe("kurta");
    expect(tag.colors).toContain("red");
    expect(tag.brand).toBe("Fabindia");
  });

  it("warns on near-duplicate against owned closet", () => {
    const result = autoTagWithDuplicateCheck(
      { imageKey: "wardrobe/nike-black-sneakers.jpg" },
      [
        {
          id: "w1",
          title: "Nike black sneakers",
          brand: "Nike",
          category: "sneakers",
        },
      ],
      0.4,
    );
    expect(result.category).toBe("sneakers");
    expect(result.brand).toBe("Nike");
    expect(result.duplicateWarnings.length).toBeGreaterThanOrEqual(1);
    expect(result.duplicateWarnings[0]?.matches[0]?.wardrobeItemId).toBe("w1");
  });

  it("infers unknown brand token from labels when no hint matches", () => {
    const tag = inferWardrobeAutoTag({
      imageKey: "uploads/photo.jpg",
      labels: ["acme", "blue", "other"],
    });
    expect(tag.brand).toBe("Acme");
    expect(tag.colors).toContain("blue");
  });
});
