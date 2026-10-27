import { describe, expect, it } from "vitest";
import {
  defaultSelfProfileName,
  denyUnlessOwnsProfile,
  filterByClosetProfile,
} from "./closet-profile.js";

describe("closet-profile", () => {
  it("filters wardrobe/outfit pool by profileId", () => {
    const items = [
      { id: "a", profileId: "p1" },
      { id: "b", profileId: "p2" },
      { id: "c", profileId: null },
      { id: "d" },
    ];
    expect(filterByClosetProfile(items, null)).toEqual(items);
    expect(filterByClosetProfile(items, undefined)).toEqual(items);
    expect(filterByClosetProfile(items, "p1").map((i) => i.id)).toEqual(["a"]);
  });

  it("denyUnlessOwnsProfile returns NOT_FOUND / FORBIDDEN / null", () => {
    expect(denyUnlessOwnsProfile(null, "u1")).toBe("NOT_FOUND");
    expect(denyUnlessOwnsProfile(undefined, "u1")).toBe("NOT_FOUND");
    expect(
      denyUnlessOwnsProfile(
        { id: "p1", ownerUserId: "other", name: "Kid", kind: "KID" },
        "u1",
      ),
    ).toBe("FORBIDDEN");
    expect(
      denyUnlessOwnsProfile(
        { id: "p1", ownerUserId: "u1", name: "Me", kind: "SELF" },
        "u1",
      ),
    ).toBeNull();
  });

  it("defaultSelfProfileName is Me", () => {
    expect(defaultSelfProfileName()).toBe("Me");
  });
});
