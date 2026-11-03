import { describe, expect, it } from "vitest";
import { categorySlot } from "./outfit-goes-with.js";
import {
  ACCESSORY_CATEGORIES,
  attachAccessoriesToOutfit,
  createAccessoryCategory,
  isAccessoryCategory,
  normalizeAccessoryCategory,
  wearLogItemIds,
} from "./outfit-accessories.js";

describe("N30 accessories / jewelry vault category", () => {
  it("creates and recognizes accessory categories including jewelry", () => {
    expect(createAccessoryCategory("Gold Necklace")).toBe("necklace");
    expect(createAccessoryCategory("jewellery")).toBe("jewelry");
    expect(createAccessoryCategory("leather belt")).toBe("belt");
    expect(createAccessoryCategory("  ")).toBe("jewelry");
    expect(normalizeAccessoryCategory("pearl earrings")).toBe("earrings");
    expect(isAccessoryCategory("watch")).toBe(true);
    expect(isAccessoryCategory("oxford shirt")).toBe(false);
    expect(categorySlot("silver bracelet")).toBe("accessory");
    expect(ACCESSORY_CATEGORIES).toContain("jewelry");
  });
});

describe("attachAccessoriesToOutfit", () => {
  it("attaches a pairing accessory to a core outfit", () => {
    const core = [
      { id: "1", category: "oxford shirt", colors: ["white"] },
      { id: "2", category: "dark jeans", colors: ["blue"] },
      { id: "3", category: "sneakers", colors: ["white"] },
    ];
    const wardrobe = [
      ...core,
      { id: "a1", category: "leather belt", colors: ["brown"] },
      { id: "a2", category: "gold necklace", colors: ["gold"] },
      { id: "t2", category: "polo tee", colors: ["navy"] },
    ];
    const attached = attachAccessoriesToOutfit(core, wardrobe, { limit: 1 });
    expect(attached).toHaveLength(1);
    expect(isAccessoryCategory(attached[0]!.category)).toBe(true);
    expect(["a1", "a2"]).toContain(attached[0]!.id);
  });

  it("skips when outfit already has an accessory", () => {
    const selected = [
      { id: "1", category: "dress", colors: ["black"] },
      { id: "a1", category: "gold earrings", colors: ["gold"] },
    ];
    const attached = attachAccessoriesToOutfit(selected, [
      ...selected,
      { id: "a2", category: "belt", colors: ["black"] },
    ]);
    expect(attached).toEqual([]);
  });
});

describe("wear_log includes accessories via outfit itemIds", () => {
  it("expands outfit wear to accessory ids", () => {
    const ids = wearLogItemIds(
      { outfitId: "o1" },
      [{ id: "o1", itemIds: ["shirt", "jeans", "necklace"] }],
    );
    expect(ids).toEqual(["shirt", "jeans", "necklace"]);
    expect(ids).toContain("necklace");
  });

  it("matches accessory words whole and never turns a garment into an accessory (S6-18)", () => {
    for (const garment of ["Baggy jeans", "Capri pants", "Spring dress", "Belted dress", "Tie-dye top"]) {
      expect(normalizeAccessoryCategory(garment)).toBeNull();
      expect(isAccessoryCategory(garment)).toBe(false);
      expect(createAccessoryCategory(garment)).toBe(garment);
    }
    expect(normalizeAccessoryCategory("Leather bags")).toBe("bag");
    expect(normalizeAccessoryCategory("Brown belt")).toBe("belt");
    expect(normalizeAccessoryCategory("Silk tie")).toBe("tie");
    expect(normalizeAccessoryCategory("Gold ring")).toBe("ring");
  });
});
