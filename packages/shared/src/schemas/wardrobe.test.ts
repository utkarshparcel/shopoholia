import { describe, expect, it } from "vitest";
import { BulkUpdateWardrobeItemsBodySchema, WardrobeListResponseSchema } from "./wardrobe.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("BulkUpdateWardrobeItemsBodySchema", () => {
  it("accepts 1 to 200 unique ids with a non-empty patch", () => {
    expect(
      BulkUpdateWardrobeItemsBodySchema.parse({ ids: [uuid(1)], patch: { laundryStatus: "DIRTY" } }),
    ).toEqual({ ids: [uuid(1)], patch: { laundryStatus: "DIRTY" } });
    const ids = Array.from({ length: 200 }, (_, i) => uuid(i));
    expect(BulkUpdateWardrobeItemsBodySchema.safeParse({ ids, patch: { tags: [] } }).success).toBe(true);
  });

  it("rejects no ids, too many, duplicates, non-uuids and an empty patch", () => {
    const bad = [
      { ids: [], patch: { tags: [] } },
      { ids: Array.from({ length: 201 }, (_, i) => uuid(i)), patch: { tags: [] } },
      { ids: [uuid(1), uuid(1)], patch: { tags: [] } },
      { ids: ["not-a-uuid"], patch: { tags: [] } },
      { ids: [uuid(1)], patch: {} },
    ];
    for (const body of bad) {
      expect(BulkUpdateWardrobeItemsBodySchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("WardrobeListResponseSchema", () => {
  it("takes an optional nextCursor", () => {
    expect(WardrobeListResponseSchema.parse({ items: [] })).toEqual({ items: [] });
    expect(WardrobeListResponseSchema.parse({ items: [], nextCursor: null }).nextCursor).toBeNull();
    expect(WardrobeListResponseSchema.parse({ items: [], nextCursor: "c" }).nextCursor).toBe("c");
  });
});
