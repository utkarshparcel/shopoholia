import { describe, expect, it } from "vitest";
import {
  PHOTO_DUMP_TARGET_BATCH,
  photoDumpTags,
  summarizePhotoDumpBatch,
  toPhotoDumpCreatePayload,
} from "./photo-dump.js";

describe("N55 photo-dump helpers", () => {
  it("builds tagged create payloads from vision tags", () => {
    const payload = toPhotoDumpCreatePayload({
      imageKey: "wardrobe/nike-black-sneakers.jpg",
      tag: {
        category: "sneakers",
        colors: ["black"],
        brand: "Nike",
        confidence: 0.9,
        sourceLabels: ["nike", "black", "sneakers"],
      },
      duplicateWarnings: [],
    });
    expect(payload.category).toBe("sneakers");
    expect(payload.colors).toEqual(["black"]);
    expect(payload.brand).toBe("Nike");
    expect(payload.imageKeys).toEqual(["wardrobe/nike-black-sneakers.jpg"]);
    expect(payload.garmentImageKey).toBe("wardrobe/nike-black-sneakers.jpg");
    expect(payload.tags).toContain("photo-dump");
  });

  it("summarizes 20+ batch as meeting target", () => {
    expect(PHOTO_DUMP_TARGET_BATCH).toBe(20);
    expect(summarizePhotoDumpBatch(20, 20).meetsTargetBatch).toBe(true);
    expect(summarizePhotoDumpBatch(19, 19).meetsTargetBatch).toBe(false);
  });

  it("dedupes photo-dump tag", () => {
    expect(photoDumpTags(["photo-dump", "concierge"])).toEqual(["photo-dump", "concierge"]);
  });
});
