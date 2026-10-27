import { describe, expect, it } from "vitest";
import { PHOTO_DUMP_TARGET_BATCH } from "@worn/shared";
import { createMemoryRepositories } from "./repositories/memory.js";
import { runPhotoDump } from "./photo-dump.js";
import { MockVisionTagClient } from "./wardrobe-vision.js";

describe("N55 runPhotoDump", () => {
  it("creates tagged wardrobe items for a 20+ batch", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919900001111");
    const photos = Array.from({ length: PHOTO_DUMP_TARGET_BATCH }, (_, i) => ({
      imageKey:
        i % 2 === 0
          ? `wardrobe/nike-black-sneakers-${i}.jpg`
          : `wardrobe/zara-navy-shirt-${i}.jpg`,
    }));

    const result = await runPhotoDump(repos, {
      userId: user.id,
      photos,
      vision: new MockVisionTagClient(),
    });

    expect(result.records).toHaveLength(PHOTO_DUMP_TARGET_BATCH);
    expect(result.tagged).toBe(PHOTO_DUMP_TARGET_BATCH);
    expect(result.records.every((r) => r.tags.includes("photo-dump"))).toBe(true);
    expect(result.records[0]!.category).toBe("sneakers");
    expect(result.records[1]!.category).toBe("shirt");

    const listed = await repos.listWardrobeItems(user.id);
    expect(listed).toHaveLength(PHOTO_DUMP_TARGET_BATCH);
  });

  it("returns empty result for empty photos", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919900001112");
    const result = await runPhotoDump(repos, {
      userId: user.id,
      photos: [],
      vision: new MockVisionTagClient(),
    });
    expect(result.records).toEqual([]);
    expect(result.tagged).toBe(0);
    expect(result.duplicateWarnings).toEqual([]);
  });

  it("applies profileId and extraTags to created items", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919900001113");
    const profileId = "11111111-1111-4111-8111-111111111111";
    const result = await runPhotoDump(repos, {
      userId: user.id,
      photos: [{ imageKey: "wardrobe/nike-black-sneakers-0.jpg" }],
      profileId,
      extraTags: ["wedding", "guest"],
      vision: new MockVisionTagClient(),
    });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.profileId).toBe(profileId);
    expect(result.records[0]!.tags).toEqual(
      expect.arrayContaining(["photo-dump", "wedding", "guest"]),
    );
  });

  it("surfaces duplicate warnings against existing wardrobe", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919900001114");
    await repos.createWardrobeItem({
      userId: user.id,
      source: "MANUAL",
      category: "sneakers",
      colors: ["black"],
      brand: "Nike",
      costMinor: 0,
      imageKeys: ["existing.jpg"],
      garmentImageKey: "existing.jpg",
      purchaseItemId: null,
      tags: [],
    });

    const result = await runPhotoDump(repos, {
      userId: user.id,
      photos: [{ imageKey: "wardrobe/nike-black-sneakers-99.jpg" }],
      vision: new MockVisionTagClient(),
    });

    expect(result.records).toHaveLength(1);
    expect(result.duplicateWarnings.length).toBeGreaterThan(0);
  });

  it("flags near-dupes within the same dump batch", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919900001115");
    const result = await runPhotoDump(repos, {
      userId: user.id,
      photos: [
        { imageKey: "wardrobe/nike-black-sneakers-a.jpg" },
        { imageKey: "wardrobe/nike-black-sneakers-b.jpg" },
      ],
      vision: new MockVisionTagClient(),
    });
    expect(result.records).toHaveLength(2);
    expect(result.duplicateWarnings.length).toBeGreaterThan(0);
  });
});
