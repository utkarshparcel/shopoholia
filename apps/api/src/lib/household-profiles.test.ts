import { describe, expect, it } from "vitest";
import {
  denyUnlessCanAccessHouseholdWardrobe,
  denyUnlessHouseholdMember,
  filterByClosetProfile,
  householdMemberUserIds,
} from "@worn/shared";

describe("N26 household authz", () => {
  const members = [
    { userId: "owner", role: "OWNER" },
    { userId: "partner", role: "MEMBER" },
  ];

  it("denies outsider on membership gate", () => {
    expect(denyUnlessHouseholdMember(members, "outsider")).toBe("NOT_MEMBER");
    expect(denyUnlessHouseholdMember(members, "partner")).toBeNull();
  });

  it("denies outsider on shared wardrobe ACL", () => {
    expect(denyUnlessCanAccessHouseholdWardrobe(members, "owner", "outsider")).toBe(
      "NOT_MEMBER",
    );
    expect(denyUnlessCanAccessHouseholdWardrobe(members, "owner", "partner")).toBeNull();
  });

  it("lists member user ids", () => {
    expect(householdMemberUserIds(members)).toEqual(["owner", "partner"]);
  });
});

describe("N27 profile scope", () => {
  it("filters wardrobe by profileId", () => {
    const items = [
      { id: "a", profileId: "p1" },
      { id: "b", profileId: "p2" },
      { id: "c", profileId: null },
    ];
    expect(filterByClosetProfile(items, "p1").map((i) => i.id)).toEqual(["a"]);
    expect(filterByClosetProfile(items, undefined)).toHaveLength(3);
  });
});
